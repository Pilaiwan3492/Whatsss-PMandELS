import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { lockAccounts, acquireAccountRowLocks } from './accountLock.service.js';

export const MAX_TRANSACTION_AMOUNT = new Prisma.Decimal('9999999999.99');

export class IncomeError extends Error {
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
    this.name = 'IncomeError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates a monetary amount for transactions.
 * In accordance with F-04, FR-06, and NFR-DATA-01:
 * - Must be a valid number or string representing a decimal.
 * - Must be strictly positive (> 0.00).
 * - Maximum precision allowed is 2 decimal places (no silent rounding).
 * - Maximum value is 9,999,999,999.99.
 * - Rejects non-numeric, exponent notation (e.g. "1e3"), NaN, Infinity, negative values.
 */
export function validateTransactionAmount(val: unknown): Prisma.Decimal {
  if (val === undefined || val === null || val === '') {
    throw new IncomeError(
      'Transaction amount is required.',
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  let str: string;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw new IncomeError(
        'Transaction amount must be a finite number.',
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }
    str = val.toString();
  } else if (typeof val === 'string') {
    str = val.trim();
  } else {
    throw new IncomeError(
      'Transaction amount must be a number or decimal string.',
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  // Reject exponent notation (e.g., "1e3", "1E-2")
  if (/[eE]/.test(str)) {
    throw new IncomeError(
      'Exponent notation is not allowed for transaction amounts.',
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  // Must be valid number string
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new IncomeError(
      'Transaction amount must be a valid positive decimal.',
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  try {
    const decimal = new Prisma.Decimal(str);

    if (decimal.isNegative() || decimal.isZero()) {
      throw new IncomeError(
        'Transaction amount must be strictly greater than 0.00.',
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }

    if (decimal.decimalPlaces() > 2) {
      throw new IncomeError(
        'Transaction amount allows at most 2 decimal places.',
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }

    if (decimal.greaterThan(MAX_TRANSACTION_AMOUNT)) {
      throw new IncomeError(
        'Transaction amount exceeds maximum allowed limit (9,999,999,999.99).',
        400,
        'INVALID_TRANSACTION_AMOUNT'
      );
    }

    return decimal;
  } catch (err) {
    if (err instanceof IncomeError) throw err;
    throw new IncomeError(
      'Invalid decimal transaction amount.',
      400,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }
}

/**
 * Validates a transaction date string strictly in YYYY-MM-DD format.
 * In accordance with F-04, FR-06:
 * - Must be a canonical YYYY-MM-DD calendar date string (exactly 10 characters).
 * - Whitespace Contract: Leading, trailing, and internal whitespace are strictly rejected with 400 INVALID_TRANSACTION_DATE.
 * - Entire string must match (rejects trailing text, extra characters, timestamps).
 * - Real calendar dates only: rejects impossible days (e.g. 2026-02-30) and invalid leap-year dates (e.g. 2026-02-29).
 * - Evaluated in UTC to ensure deterministic calendar date representation without timezone day shifts.
 */
export function validateTransactionDate(val: unknown): { dateObj: Date; dateStr: string } {
  if (typeof val !== 'string' || val.length === 0) {
    throw new IncomeError(
      'Transaction date is required and must be a non-empty string.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  // Whitespace contract: reject any leading or trailing whitespace
  if (val !== val.trim()) {
    throw new IncomeError(
      'Transaction date must not contain leading or trailing whitespace.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  // Strictly anchored: must be exactly YYYY-MM-DD with no extra characters
  const dateMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    throw new IncomeError(
      'Transaction date must be in YYYY-MM-DD format.',
      400,
      'INVALID_TRANSACTION_DATE'
    );
  }

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new IncomeError(
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
    throw new IncomeError(
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
    throw new IncomeError(
      'Transaction description must be a string.',
      400,
      'INVALID_DESCRIPTION'
    );
  }
  if (val.length > 255) {
    throw new IncomeError(
      'Transaction description cannot exceed 255 characters.',
      400,
      'INVALID_DESCRIPTION'
    );
  }
  return val.trim();
}

/**
 * Account ID format validation.
 * In accordance with Phase 2.4 and NFR-DATA-01:
 * - Production validation strictly accepts canonical UUID identifiers (8-4-4-4-12 hex).
 * - Whitespace Contract: Surrounding whitespace (leading or trailing) is strictly rejected rather than silently normalized.
 * - No fixture-specific IDs or environment-dependent bypasses in production code.
 * - Rejects malformed identifiers and fixture-style IDs upfront with 400 INVALID_ACCOUNT_ID.
 * - Distinguishes malformed IDs (400) from well-formed IDs that do not exist (404).
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidAccountId(val: unknown): val is string {
  if (typeof val !== 'string' || val.length === 0) return false;
  // Whitespace Contract: reject leading or trailing whitespace
  if (val !== val.trim()) return false;
  return UUID_REGEX.test(val);
}

/**
 * Concurrency retry configuration for opening balance lock races and database write conflicts.
 * In accordance with Phase 3.2:
 * - Only safe concurrency conflicts (ACCOUNT_LOCK_CONCURRENCY_CONFLICT, PostgreSQL serialization/deadlock) are retried.
 * - Keeps retries bounded (maximum 3 attempts).
 * - Avoids duplicate records by running every retry within a fresh Prisma transaction callback.
 * - Validation, tenancy, and business rule errors are never retried.
 */
const MAX_CONCURRENCY_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 25;

function isConcurrencyConflict(err: any): boolean {
  if (err?.name === 'AccountLockError' && err?.code === 'ACCOUNT_LOCK_CONCURRENCY_CONFLICT') {
    return true;
  }
  if (err?.code === 'P2034') {
    // Prisma transaction conflict / deadlock
    return true;
  }
  if (err?.code === '40001' || err?.code === '40P01') {
    // PostgreSQL serialization failure or deadlock detected
    return true;
  }
  return false;
}

export interface RecordIncomeInput {
  primary_account_id: unknown;
  income_account_id: unknown;
  total_amount: unknown;
  transaction_date: unknown;
  description?: unknown;
}

export interface RecordIncomeResult {
  transaction: {
    id: string;
    primary_account_id: string;
    form: 'RECEIVE_MONEY';
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
  updated_balance: {
    account_id: string;
    current_balance: string;
  };
}

/**
 * Income Processing Service
 * Executes atomic income transaction creation inside a single Prisma interactive transaction:
 * 1. Validates ownership and type constraints (primary must be CASH, target must be INCOME).
 * 2. Locks the primary cash account's opening balance atomically (AC-03-3).
 * 3. Creates the Transaction record (Transaction 1 of Sprint 1 Golden Journey, form = RECEIVE_MONEY).
 * 4. Creates exactly 1 AllocationLine record targeting the income account.
 * 5. Dynamically derives updated cash balance using exact Decimal arithmetic.
 * 6. Handles concurrency-safe idempotency via bounded retries for lock races without partial writes.
 */
export async function recordIncome(
  userId: string,
  input: RecordIncomeInput,
  prismaClient = defaultPrisma
): Promise<RecordIncomeResult> {
  if (!userId) {
    throw new IncomeError('Authentication required', 401, 'UNAUTHORIZED');
  }

  // 1. Syntactic validation of primary and income account identifiers (Phase 2.4)
  if (!isValidAccountId(input.primary_account_id)) {
    throw new IncomeError(
      'Primary account ID is malformed or invalid.',
      400,
      'INVALID_ACCOUNT_ID'
    );
  }
  if (!isValidAccountId(input.income_account_id)) {
    throw new IncomeError(
      'Income account ID is malformed or invalid.',
      400,
      'INVALID_ACCOUNT_ID'
    );
  }

  const primaryId = input.primary_account_id;
  const incomeId = input.income_account_id;

  // 2. Validate amount, date, description
  const amountDecimal = validateTransactionAmount(input.total_amount);
  const { dateObj, dateStr } = validateTransactionDate(input.transaction_date);
  const desc = validateDescription(input.description);

  // 3. Execute everything inside a single Prisma transaction with bounded concurrency retry
  let lastError: any = null;
  for (let attempt = 1; attempt <= MAX_CONCURRENCY_RETRIES; attempt++) {
    try {
      return await prismaClient.$transaction(async (tx) => {
        // A. Query primary account and income account owned strictly by userId
        const primaryAccount = await tx.account.findFirst({
          where: {
            id: primaryId,
            user_id: userId
          }
        });

        if (!primaryAccount) {
          throw new IncomeError('Primary account not found.', 404, 'NOT_FOUND');
        }

        if (primaryAccount.type !== 'CASH') {
          throw new IncomeError(
            'Primary account for income transaction must be of type CASH.',
            400,
            'INVALID_PRIMARY_ACCOUNT'
          );
        }

        const incomeAccount = await tx.account.findFirst({
          where: {
            id: incomeId,
            user_id: userId
          }
        });

        if (!incomeAccount) {
          throw new IncomeError('Income account not found.', 404, 'NOT_FOUND');
        }

        if (incomeAccount.type !== 'INCOME') {
          throw new IncomeError(
            'Target category for income transaction must be of type INCOME.',
            400,
            'INVALID_INCOME_ACCOUNT'
          );
        }

        // B. Atomically lock opening balance of the primary CASH account (AC-03-3)
        // lockAccounts handles idempotency safely: if already locked, it does not re-write or fail.
        await acquireAccountRowLocks(tx, [primaryAccount.id, incomeAccount.id], userId);
        await lockAccounts(tx, [primaryAccount.id], userId);

        // C. Create Transaction header
        const transaction = await tx.transaction.create({
          data: {
            user_id: userId,
            primary_account_id: primaryAccount.id,
            form: 'RECEIVE_MONEY',
            total_amount: amountDecimal,
            transaction_date: dateObj,
            description: desc
          }
        });

        // D. Create exactly 1 AllocationLine targeting the income account
        const allocation = await tx.allocationLine.create({
          data: {
            transaction_id: transaction.id,
            target_account_id: incomeAccount.id,
            amount: amountDecimal,
            notes: desc
          }
        });

        // E. Calculate dynamically updated cash balance:
        // Cash Balance = opening_balance + sum(RECEIVE_MONEY) - sum(PAYMENT_CHARGE)
        const receiveAgg = await tx.transaction.aggregate({
          where: {
            primary_account_id: primaryAccount.id,
            user_id: userId,
            form: 'RECEIVE_MONEY'
          },
          _sum: { total_amount: true }
        });

        const paymentAgg = await tx.transaction.aggregate({
          where: {
            primary_account_id: primaryAccount.id,
            user_id: userId,
            form: 'PAYMENT_CHARGE'
          },
          _sum: { total_amount: true }
        });

        const zero = new Prisma.Decimal('0.00');
        const totalReceive = receiveAgg._sum?.total_amount
          ? new Prisma.Decimal(receiveAgg._sum.total_amount.toString())
          : zero;
        const totalPayment = paymentAgg._sum?.total_amount
          ? new Prisma.Decimal(paymentAgg._sum.total_amount.toString())
          : zero;
        const openingBal = new Prisma.Decimal(primaryAccount.opening_balance.toString());

        const currentBalance = openingBal.add(totalReceive).sub(totalPayment);

        return {
          transaction: {
            id: transaction.id,
            primary_account_id: transaction.primary_account_id,
            form: 'RECEIVE_MONEY' as const,
            total_amount: amountDecimal.toFixed(2),
            transaction_date: dateStr,
            description: transaction.description,
            allocations: [
              {
                id: allocation.id,
                target_account_id: allocation.target_account_id,
                amount: amountDecimal.toFixed(2),
                notes: allocation.notes
              }
            ]
          },
          updated_balance: {
            account_id: primaryAccount.id,
            current_balance: currentBalance.toFixed(2)
          }
        };
      });
    } catch (err: any) {
      // Business logic or input validation errors are never retried
      if (err instanceof IncomeError) {
        throw err;
      }
      // Retry safe concurrency lock races with exponential/jitter backoff
      if (isConcurrencyConflict(err) && attempt < MAX_CONCURRENCY_RETRIES) {
        lastError = err;
        const delay = BASE_RETRY_DELAY_MS * attempt + Math.floor(Math.random() * 15);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
