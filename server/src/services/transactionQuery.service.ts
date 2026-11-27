import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { TransactionHistoryRecord } from './report.service.js';

export class TransactionQueryError extends Error {
  statusCode: number;
  code: string;
  details: any[];

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = 'INVALID_FILTER_PARAM',
    details: any[] = []
  ) {
    super(message);
    this.name = 'TransactionQueryError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface TransactionFilterQuery {
  startDate?: unknown;
  endDate?: unknown;
  accountId?: unknown;
  categoryId?: unknown;
  form?: unknown;
  type?: unknown;
  favorite?: unknown;
  q?: unknown;
}

const ALLOWED_FORMS = new Set(['PAYMENT_CHARGE', 'RECEIVE_MONEY']);
const ALLOWED_TYPES = new Set(['INCOME', 'EXPENSE', 'REPAYMENT', 'TRANSFER', 'LOAN']);

function parseCalendarDate(raw: unknown, fieldName: string): Date {
  if (typeof raw !== 'string') {
    throw new TransactionQueryError(
      `${fieldName} must be a valid YYYY-MM-DD calendar date.`,
      400,
      'INVALID_DATE_RANGE'
    );
  }
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new TransactionQueryError(
      `${fieldName} must be in YYYY-MM-DD format.`,
      400,
      'INVALID_DATE_RANGE'
    );
  }
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new TransactionQueryError(
      `${fieldName} is not a valid calendar date.`,
      400,
      'INVALID_DATE_RANGE'
    );
  }
  return utc;
}

function getOptionalString(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Queries transactions for the authenticated tenant with optional combinable filters (F-15, FR-18, BR-01).
 * Always scoped by user_id = userId and ordered by transaction_date DESC, created_at DESC.
 */
export async function queryTransactions(
  userId: string,
  query: TransactionFilterQuery = {},
  prismaClient: PrismaClient = defaultPrisma
): Promise<TransactionHistoryRecord[]> {
  const andConditions: Prisma.TransactionWhereInput[] = [];

  // 1. Date Range Validation & Filtering
  const startDateRaw = query.startDate !== undefined && query.startDate !== '' ? query.startDate : undefined;
  const endDateRaw = query.endDate !== undefined && query.endDate !== '' ? query.endDate : undefined;

  let startDateObj: Date | undefined;
  let endDateObj: Date | undefined;

  if (startDateRaw !== undefined) {
    startDateObj = parseCalendarDate(startDateRaw, 'startDate');
  }
  if (endDateRaw !== undefined) {
    endDateObj = parseCalendarDate(endDateRaw, 'endDate');
  }
  if (startDateObj && endDateObj && startDateObj.getTime() > endDateObj.getTime()) {
    throw new TransactionQueryError(
      'startDate must be less than or equal to endDate.',
      400,
      'INVALID_DATE_RANGE'
    );
  }
  if (startDateObj || endDateObj) {
    andConditions.push({
      transaction_date: {
        ...(startDateObj ? { gte: startDateObj } : {}),
        ...(endDateObj ? { lte: endDateObj } : {})
      }
    });
  }

  // 2. Account ID filter (matches primary_account_id OR any allocation target_account_id)
  const accountId = getOptionalString(query.accountId);
  if (accountId) {
    andConditions.push({
      OR: [
        { primary_account_id: accountId },
        { allocation_lines: { some: { target_account_id: accountId } } }
      ]
    });
  }

  // 3. Category ID filter (matches allocation target_account_id)
  const categoryId = getOptionalString(query.categoryId);
  if (categoryId) {
    andConditions.push({
      allocation_lines: {
        some: { target_account_id: categoryId }
      }
    });
  }

  // 4. Form filter
  if (query.form !== undefined && query.form !== '') {
    const formStr = typeof query.form === 'string' ? query.form.trim() : '';
    if (!ALLOWED_FORMS.has(formStr)) {
      throw new TransactionQueryError(
        `Unsupported form filter: ${String(query.form)}. Allowed: PAYMENT_CHARGE, RECEIVE_MONEY.`,
        400,
        'INVALID_FILTER_PARAM'
      );
    }
    andConditions.push({ form: formStr as 'PAYMENT_CHARGE' | 'RECEIVE_MONEY' });
  }

  // 5. Semantic Type filter
  if (query.type !== undefined && query.type !== '') {
    const typeStr = typeof query.type === 'string' ? query.type.trim() : '';
    if (!ALLOWED_TYPES.has(typeStr)) {
      throw new TransactionQueryError(
        `Unsupported type filter: ${String(query.type)}. Allowed: INCOME, EXPENSE, REPAYMENT, TRANSFER, LOAN.`,
        400,
        'INVALID_FILTER_PARAM'
      );
    }

    switch (typeStr) {
      case 'INCOME':
        andConditions.push({
          form: 'RECEIVE_MONEY',
          allocation_lines: {
            some: { target_account: { type: 'INCOME' } }
          }
        });
        break;
      case 'EXPENSE':
        andConditions.push({
          form: 'PAYMENT_CHARGE',
          allocation_lines: {
            some: { target_account: { type: 'EXPENSE' } }
          }
        });
        break;
      case 'REPAYMENT':
        andConditions.push({
          form: 'PAYMENT_CHARGE',
          primary_account: { type: 'CASH' },
          allocation_lines: {
            some: {
              target_account: {
                type: 'LOAN_TAKEN',
                subtype: 'CREDIT_CARD'
              }
            }
          }
        });
        break;
      case 'TRANSFER':
        andConditions.push({
          form: 'PAYMENT_CHARGE',
          primary_account: { type: 'CASH' },
          allocation_lines: {
            some: {
              target_account: { type: 'CASH' }
            }
          }
        });
        break;
      case 'LOAN':
        andConditions.push({
          allocation_lines: {
            some: {
              target_account: {
                OR: [
                  { type: 'LOAN_GIVEN' },
                  { type: 'LOAN_TAKEN', subtype: 'GENERAL_LOAN' }
                ]
              }
            }
          }
        });
        break;
    }
  }

  // 6. Favorite filter
  if (query.favorite !== undefined && query.favorite !== '') {
    const favStr = typeof query.favorite === 'string' ? query.favorite.trim().toLowerCase() : '';
    if (favStr !== 'true' && favStr !== 'false') {
      throw new TransactionQueryError(
        `Unsupported favorite filter: ${String(query.favorite)}. Allowed: true, false.`,
        400,
        'INVALID_FILTER_PARAM'
      );
    }
    andConditions.push({ is_favorite: favStr === 'true' });
  }

  // 7. Keyword search q (<= 100 chars, case-insensitive across description, allocation notes, account names)
  if (query.q !== undefined && query.q !== '') {
    if (typeof query.q !== 'string') {
      throw new TransactionQueryError('Search query q must be a string.', 400, 'INVALID_FILTER_PARAM');
    }
    const trimmedQ = query.q.trim();
    if (trimmedQ.length > 100) {
      throw new TransactionQueryError(
        'Search query q cannot exceed 100 characters.',
        400,
        'INVALID_FILTER_PARAM'
      );
    }
    if (trimmedQ.length > 0) {
      andConditions.push({
        OR: [
          { description: { contains: trimmedQ, mode: 'insensitive' } },
          { primary_account: { name: { contains: trimmedQ, mode: 'insensitive' } } },
          { allocation_lines: { some: { notes: { contains: trimmedQ, mode: 'insensitive' } } } },
          {
            allocation_lines: {
              some: { target_account: { name: { contains: trimmedQ, mode: 'insensitive' } } }
            }
          }
        ]
      });
    }
  }

  const whereClause: Prisma.TransactionWhereInput = {
    user_id: userId,
    ...(andConditions.length > 0 ? { AND: andConditions } : {})
  };

  const transactions = await prismaClient.transaction.findMany({
    where: whereClause,
    include: {
      primary_account: {
        select: {
          id: true,
          name: true,
          type: true,
          subtype: true
        }
      },
      allocation_lines: {
        include: {
          target_account: {
            select: {
              id: true,
              name: true,
              type: true,
              subtype: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    },
    orderBy: [{ transaction_date: 'desc' }, { created_at: 'desc' }]
  });

  return transactions.map((t: any) => {
    let dateStr = '';
    if (t.transaction_date instanceof Date) {
      dateStr = t.transaction_date.toISOString().split('T')[0];
    } else if (typeof t.transaction_date === 'string') {
      dateStr = t.transaction_date.split('T')[0];
    }

    let createdAtStr = '';
    if (t.created_at instanceof Date) {
      createdAtStr = t.created_at.toISOString();
    } else if (typeof t.created_at === 'string') {
      createdAtStr = t.created_at;
    }

    return {
      id: t.id,
      user_id: t.user_id,
      primary_account_id: t.primary_account_id,
      primary_account: {
        id: t.primary_account.id,
        name: t.primary_account.name,
        type: t.primary_account.type,
        ...(t.primary_account.subtype ? { subtype: t.primary_account.subtype } : {})
      },
      form: t.form as 'PAYMENT_CHARGE' | 'RECEIVE_MONEY',
      total_amount: Number(new Prisma.Decimal(t.total_amount.toString()).toFixed(2)),
      transaction_date: dateStr,
      description: t.description,
      is_favorite: Boolean(t.is_favorite),
      created_at: createdAtStr,
      allocation_lines: (t.allocation_lines || []).map((line: any) => ({
        id: line.id,
        transaction_id: line.transaction_id,
        target_account_id: line.target_account_id,
        target_account: {
          id: line.target_account.id,
          name: line.target_account.name,
          type: line.target_account.type,
          ...(line.target_account.subtype ? { subtype: line.target_account.subtype } : {})
        },
        amount: Number(new Prisma.Decimal(line.amount.toString()).toFixed(2)),
        notes: line.notes
      }))
    };
  });
}
