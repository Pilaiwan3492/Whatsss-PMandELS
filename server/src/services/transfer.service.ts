import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { lockAccounts, acquireAccountRowLocks } from './accountLock.service.js';
import {
  validateRepaymentAmount,
  validateTransactionDate,
  validateDescription
} from './repayment.service.js';

export class TransferError extends Error {
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
    this.name = 'TransferError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface RecordTransferInput {
  from_account_id: string;
  to_account_id: string;
  amount: number | string;
  transaction_date: string;
  description?: string | null;
}

export interface TransferResult {
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
  updated_from_cash_balance: string;
  updated_to_cash_balance: string;
}

/**
 * Helper to compute the authoritative balance of a CASH account under row lock:
 * Cash Balance = opening_balance + sum(RECEIVE_MONEY) + sum(incoming CASH -> CASH transfer allocations) - sum(PAYMENT_CHARGE)
 */
export async function computeLockedCashAccountBalance(
  tx: Prisma.TransactionClient,
  accountId: string,
  openingBalance: Prisma.Decimal | number | string,
  userId: string
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  const openingDecimal = new Prisma.Decimal(openingBalance.toString());
  let received = zero;
  let incomingTransfers = zero;
  let paid = zero;

  if (typeof tx.transaction?.aggregate === 'function') {
    const receiveAgg = await tx.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: accountId,
        form: 'RECEIVE_MONEY'
      },
      _sum: { total_amount: true }
    });
    if (receiveAgg._sum?.total_amount) {
      received = new Prisma.Decimal(receiveAgg._sum.total_amount.toString());
    }

    const payAgg = await tx.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: accountId,
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (payAgg._sum?.total_amount) {
      paid = new Prisma.Decimal(payAgg._sum.total_amount.toString());
    }
  }

  if (typeof tx.allocationLine?.aggregate === 'function') {
    const transferAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: {
          type: 'CASH',
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
    if (transferAgg._sum?.amount) {
      incomingTransfers = new Prisma.Decimal(transferAgg._sum.amount.toString());
    }
  }

  return openingDecimal.add(received).add(incomingTransfers).sub(paid);
}

/**
 * Records an Internal Cash Transfer between two CASH accounts owned by the authenticated user (F-11, FR-13, BR-02).
 * Atomically decreases source CASH balance and increases destination CASH balance inside prisma.$transaction
 * under sorted SELECT ... FOR UPDATE row locks while keeping total_income and total_expense unchanged (BR-02).
 */
export async function recordTransfer(
  userId: string,
  input: RecordTransferInput,
  prismaClient = defaultPrisma
): Promise<TransferResult> {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new TransferError('User authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!input || typeof input !== 'object') {
    throw new TransferError('Invalid request payload.', 400, 'INVALID_PAYLOAD');
  }

  // 1. Pre-transaction fast-fail checks
  if (
    !input.from_account_id ||
    typeof input.from_account_id !== 'string' ||
    input.from_account_id.trim() === ''
  ) {
    throw new TransferError('Source account (from_account_id) is required.', 400, 'INVALID_ACCOUNT_ID');
  }
  if (
    !input.to_account_id ||
    typeof input.to_account_id !== 'string' ||
    input.to_account_id.trim() === ''
  ) {
    throw new TransferError('Destination account (to_account_id) is required.', 400, 'INVALID_ACCOUNT_ID');
  }

  const fromAccountId = input.from_account_id.trim();
  const toAccountId = input.to_account_id.trim();

  if (fromAccountId === toAccountId) {
    throw new TransferError(
      'Source and destination cash accounts must be distinct.',
      400,
      'SAME_ACCOUNT_TRANSFER'
    );
  }

  let amountDecimal: Prisma.Decimal;
  let dateObj: Date;
  let dateStr: string;
  let desc: string | null;

  try {
    amountDecimal = validateRepaymentAmount(input.amount, 'Transfer amount');
    const dateVal = validateTransactionDate(input.transaction_date);
    dateObj = dateVal.dateObj;
    dateStr = dateVal.dateStr;
    desc = validateDescription(input.description);
  } catch (err: any) {
    throw new TransferError(
      err.message,
      err.statusCode || 400,
      err.code || 'BAD_REQUEST',
      err.details || []
    );
  }

  // 2. Execute atomic transfer under sorted row locks
  return await prismaClient.$transaction(async (tx) => {
    // A. Acquire pessimistic row locks in ascending ID order to prevent deadlocks
    await acquireAccountRowLocks(tx, [fromAccountId, toAccountId], userId);

    // B. Verify ownership and existence (BR-01)
    const fromAccount = await tx.account.findFirst({
      where: { id: fromAccountId, user_id: userId }
    });
    if (!fromAccount) {
      throw new TransferError(
        `Source account [${fromAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const toAccount = await tx.account.findFirst({
      where: { id: toAccountId, user_id: userId }
    });
    if (!toAccount) {
      throw new TransferError(
        `Destination account [${toAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    // C. Verify both accounts are CASH accounts
    if (fromAccount.type !== 'CASH') {
      throw new TransferError(
        `Source account must be of type CASH, received: ${fromAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }
    if (toAccount.type !== 'CASH') {
      throw new TransferError(
        `Destination account must be of type CASH, received: ${toAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    // D. System Archived Account Guard (Section 1.2 of Sprint 2 Contracts)
    if ((fromAccount as any).is_archived || (toAccount as any).is_archived) {
      throw new TransferError(
        'Cannot transfer funds involving an archived account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    // E. Compute authoritative current cash balances under row lock
    const currentFromBalance = await computeLockedCashAccountBalance(
      tx,
      fromAccountId,
      fromAccount.opening_balance,
      userId
    );
    const currentToBalance = await computeLockedCashAccountBalance(
      tx,
      toAccountId,
      toAccount.opening_balance,
      userId
    );

    if (amountDecimal.greaterThan(currentFromBalance)) {
      throw new TransferError(
        `Insufficient funds in source cash account. Available: ${currentFromBalance.toFixed(2)}, requested: ${amountDecimal.toFixed(2)}.`,
        422,
        'INSUFFICIENT_FUNDS'
      );
    }

    // F. Atomically lock opening balances on both accounts (F-03, AC-11-1)
    await lockAccounts(tx, [fromAccountId, toAccountId], userId);

    // G. Create Transaction (PAYMENT_CHARGE on source CASH account)
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

    // H. Create 1 AllocationLine targeting destination CASH account (BR-02)
    const allocation = await tx.allocationLine.create({
      data: {
        transaction_id: transaction.id,
        target_account_id: toAccountId,
        amount: amountDecimal,
        notes: desc ?? 'Internal cash transfer'
      }
    });

    const newFromBalance = currentFromBalance.sub(amountDecimal);
    const newToBalance = currentToBalance.add(amountDecimal);

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
      updated_from_cash_balance: newFromBalance.toFixed(2),
      updated_to_cash_balance: newToBalance.toFixed(2)
    };
  });
}
