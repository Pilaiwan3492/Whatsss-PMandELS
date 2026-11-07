import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { lockAccounts, acquireAccountRowLocks } from './accountLock.service.js';

export const MAX_TRANSACTION_AMOUNT = new Prisma.Decimal('9999999999.99');

export class ExpenseError extends Error {
  statusCode: number;
  code: string;
  details: any[];

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = 'BAD_REQUEST',
    details: any[] = []
  ) {
    super(message);
    this.name = 'ExpenseError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates a monetary amount for transactions.
 * In accordance with F-05, FR-07, and NFR-DATA-01:
 * - Must be a valid number or string representing a decimal.
 * - Must be strictly positive (> 0.00).
 * - Maximum precision allowed is 2 decimal places (no silent rounding).
 * - Maximum value is 9,999,999,999.99.
 * - Rejects non-numeric, exponent notation (e.g. "1e3"), NaN, Infinity, negative values.
 */
export function validateTransactionAmount(val: unknown, fieldName = 'Transaction amount'): Prisma.Decimal {
  if (val === undefined || val === null || val === '') {
    throw new ExpenseError(
      `${fieldName} is required.`,
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  let str: string;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new ExpenseError(
        `${fieldName} must be a finite number.`,
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }
    str = val.toString();
  } else if (typeof val === 'string') {
    str = val.trim();
  } else {
    throw new ExpenseError(
      `${fieldName} must be a number or decimal string.`,
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  // Reject exponent notation (e.g., "1e3", "1E-2")
  if (/[eE]/.test(str)) {
    throw new ExpenseError(
      `Exponent notation is not allowed for ${fieldName.toLowerCase()}.`,
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  // Must be valid number string
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new ExpenseError(
      `${fieldName} must be a valid positive decimal.`,
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  try {
    const decimal = new Prisma.Decimal(str);

    if (decimal.isNegative() || decimal.isZero()) {
      throw new ExpenseError(
        `${fieldName} must be strictly greater than 0.00.`,
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }

    if (decimal.decimalPlaces() > 2) {
      throw new ExpenseError(
        `${fieldName} allows at most 2 decimal places.`,
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }

    if (decimal.greaterThan(MAX_TRANSACTION_AMOUNT)) {
      throw new ExpenseError(
        `${fieldName} exceeds maximum allowed limit (9,999,999,999.99).`,
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }

    return decimal;
  } catch (err) {
    if (err instanceof ExpenseError) throw err;
    throw new ExpenseError(
      `Invalid decimal ${fieldName.toLowerCase()}.`,
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }
}

/**
 * Validates a transaction date string strictly in YYYY-MM-DD format.
 */
export function validateTransactionDate(val: unknown): { dateObj: Date; dateStr: string } {
  if (typeof val !== 'string' || val.length === 0) {
    throw new ExpenseError(
      'Transaction date is required and must be a non-empty string.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  // Whitespace contract: reject any leading or trailing whitespace
  if (val !== val.trim()) {
    throw new ExpenseError(
      'Transaction date must not contain leading or trailing whitespace.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  // Strictly anchored: must be exactly YYYY-MM-DD with no extra characters
  const dateMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    throw new ExpenseError(
      'Transaction date must be in YYYY-MM-DD format.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new ExpenseError(
      'Transaction date contains an invalid month or day.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  // Verify real calendar date using UTC to avoid timezone day shifts
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new ExpenseError(
      `Transaction date ${val} is not a valid calendar date.`,
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { dateObj: utcDate, dateStr };
}

/**
 * Validates description field.
 */
export function validateDescription(val: unknown): string | null {
  if (val === undefined || val === null || val === '') {
    return null;
  }
  if (typeof val !== 'string') {
    throw new ExpenseError(
      'Transaction description must be a string.',
      400,
      'INVALID_DESCRIPTION'
    );
  }
  if (val.length > 255) {
    throw new ExpenseError(
      'Transaction description cannot exceed 255 characters.',
      400,
      'INVALID_DESCRIPTION'
    );
  }
  return val.trim();
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidAccountId(val: unknown): val is string {
  if (typeof val !== 'string' || val.length === 0) return false;
  if (val !== val.trim()) return false;
  return UUID_REGEX.test(val);
}

export interface ValidatedAllocationLine {
  target_account_id: string;
  amountDecimal: Prisma.Decimal;
  notes: string | null;
}

/**
 * Validates allocation lines and verifies the split sum integrity against total amount.
 * In accordance with F-06, FR-08, BR-05, BR-06:
 * - Allocations must be a non-empty array of objects.
 * - Each line must specify a valid target_account_id UUID.
 * - Each line must specify a positive numeric amount with at most 2 decimal places.
 * - Notes must not exceed 255 characters.
 * - Split Sum Integrity (BR-06): Sum of all allocation amounts must strictly equal total_amount.
 * - Throws HTTP 422 ALLOCATION_SUM_MISMATCH if the allocation sum does not equal total_amount.
 */
export function validateAllocationLines(
  val: unknown,
  totalAmountDecimal: Prisma.Decimal
): ValidatedAllocationLine[] {
  if (val === undefined || val === null) {
    throw new ExpenseError('Allocations are required.', 400, 'EMPTY_ALLOCATIONS');
  }

  if (!Array.isArray(val)) {
    throw new ExpenseError('Allocations must be an array.', 400, 'INVALID_ALLOCATIONS');
  }

  if (val.length === 0) {
    throw new ExpenseError('Allocations array cannot be empty.', 400, 'EMPTY_ALLOCATIONS');
  }

  const validated: ValidatedAllocationLine[] = [];
  const seenTargetAccountIds = new Set<string>();
  const zero = new Prisma.Decimal('0.00');
  let runningSum = zero;

  for (let i = 0; i < val.length; i++) {
    const item = val[i];
    if (typeof item !== 'object' || item === null) {
      throw new ExpenseError(
        `Allocation line at index ${i} must be an object.`,
        400,
        'INVALID_ALLOCATIONS'
      );
    }

    if (!isValidAccountId(item.target_account_id)) {
      throw new ExpenseError(
        `Target account ID in allocation line ${i + 1} is malformed or invalid.`,
        400,
        'INVALID_ACCOUNT_ID'
      );
    }

    if (seenTargetAccountIds.has(item.target_account_id)) {
      throw new ExpenseError(
        'Each allocation line must use a distinct expense category.',
        400,
        'DUPLICATE_ALLOCATION_ACCOUNT'
      );
    }
    seenTargetAccountIds.add(item.target_account_id);

    let lineAmountDecimal: Prisma.Decimal;
    try {
      lineAmountDecimal = validateTransactionAmount(item.amount, `Allocation amount for line ${i + 1}`);
    } catch (err: any) {
      throw new ExpenseError(
        err.message,
        400,
        'INVALID_ALLOCATION_AMOUNT'
      );
    }

    let notes: string | null = null;
    if (item.notes !== undefined && item.notes !== null && item.notes !== '') {
      if (typeof item.notes !== 'string') {
        throw new ExpenseError(
          `Notes for allocation line ${i + 1} must be a string.`,
          400,
          'INVALID_NOTES'
        );
      }
      if (item.notes.length > 255) {
        throw new ExpenseError(
          `Notes for allocation line ${i + 1} cannot exceed 255 characters.`,
          400,
          'INVALID_NOTES'
        );
      }
      notes = item.notes.trim();
    }

    validated.push({
      target_account_id: item.target_account_id,
      amountDecimal: lineAmountDecimal,
      notes
    });

    runningSum = runningSum.add(lineAmountDecimal);
  }

  // Enforce Allocation Balance Integrity (BR-06)
  if (!runningSum.equals(totalAmountDecimal)) {
    throw new ExpenseError(
      `Total amount must equal the sum of all allocation lines. Total: ${totalAmountDecimal.toFixed(2)}, Allocations Sum: ${runningSum.toFixed(2)}`,
      422,
      'ALLOCATION_SUM_MISMATCH',
      [
        {
          field: 'allocations',
          total_amount: totalAmountDecimal.toFixed(2),
          allocations_sum: runningSum.toFixed(2),
          difference: totalAmountDecimal.sub(runningSum).toFixed(2)
        }
      ]
    );
  }

  return validated;
}

export interface RecordExpenseInput {
  primary_account_id: unknown;
  total_amount: unknown;
  transaction_date: unknown;
  description?: unknown;
  allocations: unknown;
}

export interface RecordExpenseResult {
  transaction: {
    id: string;
    primary_account_id: string;
    form: 'PAYMENT_CHARGE';
    total_amount: string;
    transaction_date: string;
    description: string | null;
    allocations: Array<{
      id: string;
      target_account_id: string;
      amount: string;
      notes: string | null;
    }>;
  };
  updated_debt: {
    account_id: string;
    current_debt: string;
  };
}

const MAX_CONCURRENCY_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 25;

function isConcurrencyConflict(err: any): boolean {
  if (err?.name === 'AccountLockError' && err?.code === 'ACCOUNT_LOCK_CONCURRENCY_CONFLICT') {
    return true;
  }
  if (err?.code === 'P2034') {
    return true;
  }
  if (err?.code === '40001' || err?.code === '40P01') {
    return true;
  }
  return false;
}

/**
 * Expense & Split Allocation Processing Service
 * Executes atomic credit card purchase transaction creation inside a single Prisma interactive transaction:
 * 1. Validates ownership and type constraints (primary must be LOAN_TAKEN, all allocation targets must be EXPENSE).
 * 2. Enforces Split Sum Integrity: sum(allocations) === total_amount (BR-05, BR-06).
 * 3. Locks opening balances of primary LOAN_TAKEN and all target EXPENSE accounts atomically (AC-03-3).
 * 4. Creates the Transaction record (form = PAYMENT_CHARGE, Transaction 2 of Golden Journey).
 * 5. Creates child AllocationLine records.
 * 6. Dynamically computes updated credit card debt balance using arbitrary-precision Decimal arithmetic (BR-04).
 */
export async function recordExpense(
  userId: string,
  input: RecordExpenseInput,
  prismaClient = defaultPrisma
): Promise<RecordExpenseResult> {
  if (!userId) {
    throw new ExpenseError('Authentication required', 401, 'UNAUTHORIZED');
  }

  // 1. Syntactic validation of primary account identifier
  if (!isValidAccountId(input.primary_account_id)) {
    throw new ExpenseError(
      'Primary account ID is malformed or invalid.',
      400,
      'INVALID_ACCOUNT_ID'
    );
  }

  const primaryId = input.primary_account_id;

  // 2. Validate total amount, date, description
  const amountDecimal = validateTransactionAmount(input.total_amount);
  const { dateObj, dateStr } = validateTransactionDate(input.transaction_date);
  const desc = validateDescription(input.description);

  // 3. Validate allocation lines and split balance integrity (BR-05, BR-06)
  const validAllocations = validateAllocationLines(input.allocations, amountDecimal);

  // 4. Execute everything inside a single Prisma transaction with bounded concurrency retry
  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_CONCURRENCY_RETRIES; attempt++) {
    try {
      return await prismaClient.$transaction(async (tx) => {
        // A. Query primary account strictly scoped to userId
        const primaryAccount = await tx.account.findFirst({
          where: {
            id: primaryId,
            user_id: userId
          }
        });

        if (!primaryAccount) {
          throw new ExpenseError('Primary account not found.', 404, 'NOT_FOUND');
        }

        if (primaryAccount.type !== 'LOAN_TAKEN') {
          throw new ExpenseError(
            'Primary account for credit purchase must be of type LOAN_TAKEN.',
            400,
            'INVALID_PRIMARY_ACCOUNT'
          );
        }

        // B. Query target allocation accounts strictly scoped to userId
        const uniqueTargetIds = Array.from(new Set(validAllocations.map((a) => a.target_account_id)));
        const targetAccounts = await tx.account.findMany({
          where: {
            id: { in: uniqueTargetIds },
            user_id: userId
          }
        });

        for (const alloc of validAllocations) {
          const targetAcc = targetAccounts.find((a) => a.id === alloc.target_account_id);
          if (!targetAcc) {
            throw new ExpenseError('Target allocation account not found.', 404, 'NOT_FOUND');
          }
          if (targetAcc.type !== 'EXPENSE') {
            throw new ExpenseError(
              'Target allocation category must be of type EXPENSE.',
              400,
              'INVALID_EXPENSE_ACCOUNT'
            );
          }
        }

        // C. Atomically lock opening balances of all involved accounts (AC-03-3)
        await acquireAccountRowLocks(tx, [primaryAccount.id, ...uniqueTargetIds], userId);
        await lockAccounts(tx, [primaryAccount.id, ...uniqueTargetIds], userId);

        // D. Create Transaction header (form: PAYMENT_CHARGE)
        const transaction = await tx.transaction.create({
          data: {
            user_id: userId,
            primary_account_id: primaryAccount.id,
            form: 'PAYMENT_CHARGE',
            total_amount: amountDecimal,
            transaction_date: dateObj,
            description: desc
          }
        });

        // E. Create AllocationLine records
        const createdAllocations: Array<{
          id: string;
          target_account_id: string;
          amount: Prisma.Decimal;
          notes: string | null;
        }> = [];

        for (const alloc of validAllocations) {
          const line = await tx.allocationLine.create({
            data: {
              transaction_id: transaction.id,
              target_account_id: alloc.target_account_id,
              amount: alloc.amountDecimal,
              notes: alloc.notes
            }
          });
          createdAllocations.push({
            id: line.id,
            target_account_id: line.target_account_id,
            amount: new Prisma.Decimal(line.amount.toString()),
            notes: line.notes
          });
        }

        // F. Compute updated credit card debt balance (BR-04, NFR-DATA-01)
        const chargeAgg = await tx.transaction.aggregate({
          where: {
            user_id: userId,
            primary_account_id: primaryAccount.id,
            form: 'PAYMENT_CHARGE'
          },
          _sum: { total_amount: true }
        });

        const chargeTotal = chargeAgg._sum?.total_amount
          ? new Prisma.Decimal(chargeAgg._sum.total_amount.toString())
          : new Prisma.Decimal('0.00');

        let debtTotal = new Prisma.Decimal(primaryAccount.opening_balance.toString()).add(chargeTotal);

        // Subtract any debt repayment settlements targeting this credit card account (BR-07, WP-05)
        // Repayments are explicitly PAYMENT_CHARGE transactions originating from a CASH account targeting a LOAN_TAKEN account
        const repaymentAgg = await tx.allocationLine.aggregate({
          where: {
            transaction: {
              user_id: userId,
              form: 'PAYMENT_CHARGE',
              primary_account: {
                type: 'CASH',
                user_id: userId
              }
            },
            target_account_id: primaryAccount.id,
            target_account: {
              type: 'LOAN_TAKEN',
              user_id: userId
            }
          },
          _sum: { amount: true }
        });

        if (repaymentAgg._sum?.amount) {
          debtTotal = debtTotal.sub(new Prisma.Decimal(repaymentAgg._sum.amount.toString()));
        }

        return {
          transaction: {
            id: transaction.id,
            primary_account_id: primaryAccount.id,
            form: 'PAYMENT_CHARGE' as const,
            total_amount: amountDecimal.toFixed(2),
            transaction_date: dateStr,
            description: desc,
            allocations: createdAllocations.map((al) => ({
              id: al.id,
              target_account_id: al.target_account_id,
              amount: al.amount.toFixed(2),
              notes: al.notes
            }))
          },
          updated_debt: {
            account_id: primaryAccount.id,
            current_debt: debtTotal.toFixed(2)
          }
        };
      });
    } catch (err: any) {
      if (err instanceof ExpenseError) throw err;
      if (isConcurrencyConflict(err) && attempt < MAX_CONCURRENCY_RETRIES) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, BASE_RETRY_DELAY_MS * attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new ExpenseError('Failed to record expense after retries.', 500, 'INTERNAL_SERVER_ERROR');
}
