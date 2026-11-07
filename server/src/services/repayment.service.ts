import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { lockAccounts } from './accountLock.service.js';

export const MAX_REPAYMENT_AMOUNT = new Prisma.Decimal('9999999999.99');

export class RepaymentError extends Error {
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
    this.name = 'RepaymentError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates a monetary amount for repayment.
 * In accordance with F-07, AC-07-6, and NFR-DATA-01:
 * - Must be a valid number or string representing a decimal.
 * - Must be strictly positive (> 0.00).
 * - Maximum precision allowed is 2 decimal places (no silent rounding).
 * - Maximum value is 9,999,999,999.99.
 * - Rejects non-numeric, exponent notation (e.g. "1e3"), NaN, Infinity, negative values.
 */
export function validateRepaymentAmount(val: unknown, fieldName = 'Repayment amount'): Prisma.Decimal {
  if (val === undefined || val === null || val === '') {
    throw new RepaymentError(
      `${fieldName} is required.`,
      400,
      'INVALID_AMOUNT'
    );
  }

  let str: string;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new RepaymentError(
        `${fieldName} must be a finite number.`,
        400,
        'INVALID_AMOUNT'
      );
    }
    str = val.toString();
  } else if (typeof val === 'string') {
    str = val.trim();
  } else {
    throw new RepaymentError(
      `${fieldName} must be a number or decimal string.`,
      400,
      'INVALID_AMOUNT'
    );
  }

  // Reject exponent notation (e.g., "1e3", "1E-2")
  if (/[eE]/.test(str)) {
    throw new RepaymentError(
      `Exponent notation is not allowed for ${fieldName.toLowerCase()}.`,
      400,
      'INVALID_AMOUNT'
    );
  }

  // Must be valid number string
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new RepaymentError(
      `${fieldName} must be a valid positive decimal.`,
      400,
      'INVALID_AMOUNT'
    );
  }

  try {
    const decimal = new Prisma.Decimal(str);

    if (decimal.isNegative() || decimal.isZero()) {
      throw new RepaymentError(
        `${fieldName} must be strictly greater than 0.00.`,
        400,
        'INVALID_AMOUNT'
      );
    }

    if (decimal.decimalPlaces() > 2) {
      throw new RepaymentError(
        `${fieldName} allows at most 2 decimal places.`,
        400,
        'INVALID_AMOUNT'
      );
    }

    if (decimal.greaterThan(MAX_REPAYMENT_AMOUNT)) {
      throw new RepaymentError(
        `${fieldName} exceeds maximum allowable transaction limit of 9,999,999,999.99.`,
        400,
        'INVALID_AMOUNT'
      );
    }

    return decimal;
  } catch (err: any) {
    if (err instanceof RepaymentError) throw err;
    throw new RepaymentError(
      `${fieldName} must be a valid positive decimal.`,
      400,
      'INVALID_AMOUNT'
    );
  }
}

/**
 * Validates ISO-8601 date string (YYYY-MM-DD).
 */
export function validateTransactionDate(val: unknown): { dateObj: Date; dateStr: string } {
  if (val === undefined || val === null || val === '') {
    throw new RepaymentError(
      'Transaction date is required.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  if (typeof val !== 'string') {
    throw new RepaymentError(
      'Transaction date must be an ISO-8601 date string (YYYY-MM-DD).',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  const trimmed = val.trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(trimmed)) {
    throw new RepaymentError(
      'Transaction date must be in YYYY-MM-DD format.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 2000 || year > 2100) {
    throw new RepaymentError(
      'Transaction year must be between 2000 and 2100.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new RepaymentError(
      'Transaction date is not a valid calendar date.',
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
    throw new RepaymentError(
      'Transaction description must be a string.',
      400,
      'INVALID_DESCRIPTION'
    );
  }
  if (val.length > 255) {
    throw new RepaymentError(
      'Transaction description cannot exceed 255 characters.',
      400,
      'INVALID_DESCRIPTION'
    );
  }
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface RecordRepaymentInput {
  from_account_id: string;
  to_account_id: string;
  amount: number | string;
  transaction_date: string;
  description?: string | null;
}

export interface RepaymentResult {
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
  updated_cash_balance: string;
  updated_debt: string;
}

/**
 * Records a Credit Card Repayment transaction (Transaction 3 of Golden Journey, WP-05, F-07).
 * Atomically decreases Cash balance and Credit Card debt balance while strictly excluding
 * repayment transaction from Expense summaries (BR-07, BR-08).
 */
export async function recordRepayment(
  userId: string,
  input: RecordRepaymentInput,
  prismaClient = defaultPrisma
): Promise<RepaymentResult> {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new RepaymentError('User authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!input || typeof input !== 'object') {
    throw new RepaymentError('Invalid request payload.', 400, 'INVALID_PAYLOAD');
  }

  // 1. Validate Account IDs presence
  if (!input.from_account_id || typeof input.from_account_id !== 'string' || input.from_account_id.trim() === '') {
    throw new RepaymentError('Source account (from_account_id) is required.', 400, 'INVALID_ACCOUNT_ID');
  }
  if (!input.to_account_id || typeof input.to_account_id !== 'string' || input.to_account_id.trim() === '') {
    throw new RepaymentError('Target account (to_account_id) is required.', 400, 'INVALID_ACCOUNT_ID');
  }

  const fromAccountId = input.from_account_id.trim();
  const toAccountId = input.to_account_id.trim();

  // 2. Validate Amount & Date & Description
  const amountDecimal = validateRepaymentAmount(input.amount, 'Repayment amount');
  const { dateObj, dateStr } = validateTransactionDate(input.transaction_date);
  const desc = validateDescription(input.description);

  // 3. Verify Account Ownership & Types
  const fromAccount = await prismaClient.account.findFirst({
    where: { id: fromAccountId, user_id: userId }
  });
  if (!fromAccount) {
    throw new RepaymentError(
      `Source account [${fromAccountId}] was not found or does not belong to the current user.`,
      404,
      'NOT_FOUND'
    );
  }

  const toAccount = await prismaClient.account.findFirst({
    where: { id: toAccountId, user_id: userId }
  });
  if (!toAccount) {
    throw new RepaymentError(
      `Target account [${toAccountId}] was not found or does not belong to the current user.`,
      404,
      'NOT_FOUND'
    );
  }

  if (fromAccount.type !== 'CASH') {
    throw new RepaymentError(
      `Source account must be of type CASH, received: ${fromAccount.type}.`,
      400,
      'INVALID_ACCOUNT_TYPE'
    );
  }

  if (toAccount.type !== 'LOAN_TAKEN') {
    throw new RepaymentError(
      `Target account must be of type LOAN_TAKEN, received: ${toAccount.type}.`,
      400,
      'INVALID_ACCOUNT_TYPE'
    );
  }

  const zero = new Prisma.Decimal('0.00');

  // 4. Compute Current Cash Balance of Source Account
  const fromOpening = new Prisma.Decimal(fromAccount.opening_balance.toString());
  let fromReceived = zero;
  let fromPaid = zero;

  if (typeof prismaClient.transaction?.aggregate === 'function') {
    const receiveAgg = await prismaClient.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: fromAccountId,
        form: 'RECEIVE_MONEY'
      },
      _sum: { total_amount: true }
    });
    if (receiveAgg._sum?.total_amount) {
      fromReceived = new Prisma.Decimal(receiveAgg._sum.total_amount.toString());
    }

    const payAgg = await prismaClient.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: fromAccountId,
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (payAgg._sum?.total_amount) {
      fromPaid = new Prisma.Decimal(payAgg._sum.total_amount.toString());
    }
  }

  const currentCashBalance = fromOpening.add(fromReceived).sub(fromPaid);

  // 5. Compute Current Debt of Target Credit Card Account
  const toOpening = new Prisma.Decimal(toAccount.opening_balance.toString());
  let toCharges = zero;
  let toRepayments = zero;

  if (typeof prismaClient.transaction?.aggregate === 'function') {
    const chargeAgg = await prismaClient.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: toAccountId,
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (chargeAgg._sum?.total_amount) {
      toCharges = new Prisma.Decimal(chargeAgg._sum.total_amount.toString());
    }
  }

  if (typeof prismaClient.allocationLine?.aggregate === 'function') {
    const repayAgg = await prismaClient.allocationLine.aggregate({
      where: {
        target_account_id: toAccountId,
        target_account: {
          type: 'LOAN_TAKEN',
          user_id: userId
        },
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE',
          primary_account: {
            type: 'CASH',
            user_id: userId
          }
        }
      },
      _sum: { amount: true }
    });
    if (repayAgg._sum?.amount) {
      toRepayments = new Prisma.Decimal(repayAgg._sum.amount.toString());
    }
  }

  const currentDebt = toOpening.add(toCharges).sub(toRepayments);

  // 6. Repayment Boundary Checks (AC-07-4, AC-07-5)
  if (amountDecimal.greaterThan(currentDebt)) {
    throw new RepaymentError(
      `Repayment amount of ${amountDecimal.toFixed(2)} exceeds outstanding debt of ${currentDebt.toFixed(2)}.`,
      422,
      'REPAYMENT_EXCEEDS_DEBT'
    );
  }

  if (amountDecimal.greaterThan(currentCashBalance)) {
    throw new RepaymentError(
      `Insufficient funds in source account. Available: ${currentCashBalance.toFixed(2)}, requested: ${amountDecimal.toFixed(2)}.`,
      422,
      'INSUFFICIENT_FUNDS'
    );
  }

  // 7. Atomic Transaction Execution
  return await prismaClient.$transaction(async (tx) => {
    // Atomically lock opening balances for both accounts (BR-01, FR-05)
    await lockAccounts(tx, [fromAccountId, toAccountId], userId);

    // Create Transaction (form = 'PAYMENT_CHARGE' originating from CASH account)
    const transaction = await tx.transaction.create({
      data: {
        user_id: userId,
        primary_account_id: fromAccountId,
        form: 'PAYMENT_CHARGE',
        total_amount: amountDecimal,
        transaction_date: dateObj,
        description: desc
      }
    });

    // Create exactly 1 AllocationLine targeting the LOAN_TAKEN account (BR-07, BR-08)
    const allocation = await tx.allocationLine.create({
      data: {
        transaction_id: transaction.id,
        target_account_id: toAccountId,
        amount: amountDecimal,
        notes: desc ?? 'Credit card debt settlement'
      }
    });

    const newCashBalance = currentCashBalance.sub(amountDecimal);
    const newDebt = currentDebt.sub(amountDecimal);

    return {
      transaction: {
        id: transaction.id,
        primary_account_id: fromAccountId,
        form: 'PAYMENT_CHARGE' as const,
        total_amount: amountDecimal.toFixed(2),
        transaction_date: dateStr,
        description: desc,
        allocations: [
          {
            id: allocation.id,
            target_account_id: toAccountId,
            amount: amountDecimal.toFixed(2),
            notes: allocation.notes
          }
        ]
      },
      updated_cash_balance: newCashBalance.toFixed(2),
      updated_debt: newDebt.toFixed(2)
    };
  });
}
