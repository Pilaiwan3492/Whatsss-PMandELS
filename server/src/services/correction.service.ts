import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { acquireAccountRowLocks, lockAccounts } from './accountLock.service.js';
import {
  calculateMinimumRepayment,
  MIN_CASH_RESERVE,
  validateDescription,
  validateRepaymentAmount,
  validateTransactionDate
} from './repayment.service.js';
import { computeLockedCashAccountBalance } from './transfer.service.js';

export class CorrectionError extends Error {
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
    this.name = 'CorrectionError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface CorrectionAllocationInput {
  target_account_id: string;
  amount: number | string;
  notes?: string | null;
}

export interface CorrectTransactionInput {
  total_amount: number | string;
  transaction_date: string;
  description?: string | null;
  allocations: CorrectionAllocationInput[];
}

function formatDateOnly(val: Date | string): string {
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
}

async function computeLockedLoanTakenDebt(
  tx: Prisma.TransactionClient,
  accountId: string,
  openingBalance: Prisma.Decimal | number | string,
  userId: string
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  const opening = new Prisma.Decimal(openingBalance.toString());
  let charges = zero;
  let borrowings = zero;
  let repayments = zero;

  if (typeof tx.transaction?.aggregate === 'function') {
    const chargeAgg = await tx.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: accountId,
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (chargeAgg._sum?.total_amount) {
      charges = new Prisma.Decimal(chargeAgg._sum.total_amount.toString());
    }
  }

  if (typeof tx.allocationLine?.aggregate === 'function') {
    const borrowAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: { type: 'LOAN_TAKEN', user_id: userId },
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY',
          primary_account: { type: 'CASH', user_id: userId }
        }
      },
      _sum: { amount: true }
    });
    if (borrowAgg._sum?.amount) {
      borrowings = new Prisma.Decimal(borrowAgg._sum.amount.toString());
    }

    const repayAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: { type: 'LOAN_TAKEN', user_id: userId },
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE',
          primary_account: { type: 'CASH', user_id: userId }
        }
      },
      _sum: { amount: true }
    });
    if (repayAgg._sum?.amount) {
      repayments = new Prisma.Decimal(repayAgg._sum.amount.toString());
    }
  }

  return opening.add(charges).add(borrowings).sub(repayments);
}

async function computeLockedLoanGivenReceivable(
  tx: Prisma.TransactionClient,
  accountId: string,
  openingBalance: Prisma.Decimal | number | string,
  userId: string
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  const opening = new Prisma.Decimal(openingBalance.toString());
  let disbursed = zero;
  let recovered = zero;

  if (typeof tx.allocationLine?.aggregate === 'function') {
    const disburseAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: { type: 'LOAN_GIVEN', user_id: userId },
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE',
          primary_account: { type: 'CASH', user_id: userId }
        }
      },
      _sum: { amount: true }
    });
    if (disburseAgg._sum?.amount) {
      disbursed = new Prisma.Decimal(disburseAgg._sum.amount.toString());
    }

    const recoverAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: accountId,
        target_account: { type: 'LOAN_GIVEN', user_id: userId },
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY',
          primary_account: { type: 'CASH', user_id: userId }
        }
      },
      _sum: { amount: true }
    });
    if (recoverAgg._sum?.amount) {
      recovered = new Prisma.Decimal(recoverAgg._sum.amount.toString());
    }
  }

  return opening.add(disbursed).sub(recovered);
}

/**
 * Atomically corrects an existing user-owned transaction and records an immutable
 * TransactionAuditLog snapshot inside a single prisma.$transaction (F-16, FR-19, AC-16-1..4).
 */
export async function correctTransaction(
  userId: string,
  transactionId: string,
  input: CorrectTransactionInput,
  prismaClient = defaultPrisma
) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new CorrectionError('User authentication required.', 401, 'UNAUTHORIZED');
  }

  // 0. Fast-fail tenancy concealment check (BR-01): nonexistent or foreign transaction IDs
  //    always return 404 NOT_FOUND before disclosing payload validation errors.
  if (typeof prismaClient.transaction?.findFirst === 'function') {
    const ownedCheck = await prismaClient.transaction.findFirst({
      where: { id: transactionId, user_id: userId },
      select: { id: true }
    });
    if (!ownedCheck) {
      throw new CorrectionError(
        `Transaction [${transactionId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }
  } else {
    throw new CorrectionError(
      `Transaction [${transactionId}] was not found or does not belong to the current user.`,
      404,
      'NOT_FOUND'
    );
  }

  if (!input || typeof input !== 'object') {
    throw new CorrectionError('Invalid request payload.', 400, 'INVALID_PAYLOAD');
  }

  // 1. Pre-transaction fast-fail validation (zero DB writes)
  let totalDecimal: Prisma.Decimal;
  let dateObj: Date;
  let dateStr: string;
  let description: string | null;

  try {
    totalDecimal = validateRepaymentAmount(input.total_amount, 'Total amount');
    const parsedDate = validateTransactionDate(input.transaction_date);
    dateObj = parsedDate.dateObj;
    dateStr = parsedDate.dateStr;
    description = validateDescription(input.description);
  } catch (err: any) {
    throw new CorrectionError(
      err.message,
      err.statusCode || 400,
      err.code || 'BAD_REQUEST',
      err.details || []
    );
  }

  if (!Array.isArray(input.allocations) || input.allocations.length === 0) {
    throw new CorrectionError(
      'At least one allocation line is required.',
      400,
      'INVALID_ALLOCATIONS'
    );
  }

  const seenTargets = new Set<string>();
  const validatedAllocations: Array<{
    target_account_id: string;
    amount: Prisma.Decimal;
    notes: string | null;
  }> = [];

  for (const item of input.allocations) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.target_account_id !== 'string' ||
      item.target_account_id.trim() === ''
    ) {
      throw new CorrectionError(
        'Each allocation line must specify a valid target_account_id.',
        400,
        'INVALID_ACCOUNT_ID'
      );
    }

    const targetId = item.target_account_id.trim();
    if (seenTargets.has(targetId)) {
      throw new CorrectionError(
        `Duplicate target_account_id [${targetId}] in allocations.`,
        400,
        'DUPLICATE_ALLOCATION_ACCOUNT'
      );
    }
    seenTargets.add(targetId);

    let lineAmount: Prisma.Decimal;
    let lineNotes: string | null;
    try {
      lineAmount = validateRepaymentAmount(item.amount, 'Allocation amount');
      lineNotes = validateDescription(item.notes);
    } catch (err: any) {
      throw new CorrectionError(err.message, err.statusCode || 400, err.code || 'INVALID_AMOUNT');
    }

    validatedAllocations.push({
      target_account_id: targetId,
      amount: lineAmount,
      notes: lineNotes
    });
  }

  // Enforce BR-06: sum(allocations.amount) === total_amount
  const allocSum = validatedAllocations.reduce(
    (acc, line) => acc.add(line.amount),
    new Prisma.Decimal('0.00')
  );
  if (!allocSum.equals(totalDecimal)) {
    throw new CorrectionError(
      `Sum of allocation lines (${allocSum.toFixed(2)}) does not equal total amount (${totalDecimal.toFixed(2)}).`,
      422,
      'ALLOCATION_SUM_MISMATCH'
    );
  }

  // 2. Atomic execution under row locks
  return await prismaClient.$transaction(async (tx) => {
    // A. Acquire pessimistic row lock on the Transaction row itself (prevents lost updates)
    if (typeof (tx as any).$queryRaw === 'function') {
      const lockedRows: any[] = await (tx as any).$queryRaw`
        SELECT id FROM "transactions"
        WHERE id = ${transactionId}
          AND user_id = ${userId}
        FOR UPDATE
      `;
      if (Array.isArray(lockedRows) && lockedRows.length === 0) {
        throw new CorrectionError(
          `Transaction [${transactionId}] was not found or does not belong to the current user.`,
          404,
          'NOT_FOUND'
        );
      }
    }

    // B. Load locked transaction & existing allocations (ordered deterministically by id ASC)
    const existing: any = await tx.transaction.findFirst({
      where: { id: transactionId, user_id: userId },
      include: {
        primary_account: true,
        allocation_lines: {
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!existing) {
      throw new CorrectionError(
        `Transaction [${transactionId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const previousSnapshot = {
      total_amount: new Prisma.Decimal(existing.total_amount.toString()).toFixed(2),
      transaction_date: formatDateOnly(existing.transaction_date),
      description: existing.description ?? null,
      allocations: (existing.allocation_lines || []).map((l: any) => ({
        target_account_id: l.target_account_id,
        amount: new Prisma.Decimal(l.amount.toString()).toFixed(2),
        notes: l.notes ?? null
      }))
    };

    // C. Lock all affected accounts (primary + existing targets + new targets) in ascending UUID order
    const allAccountIds = Array.from(
      new Set<string>([
        existing.primary_account_id,
        ...(existing.allocation_lines || []).map((l: any) => l.target_account_id as string),
        ...validatedAllocations.map((a) => a.target_account_id)
      ])
    );
    await acquireAccountRowLocks(tx, allAccountIds, userId);

    // D. Verify ownership, allowed types, and Archived Account Guard (§1.2)
    const accounts = await tx.account.findMany({
      where: { id: { in: allAccountIds }, user_id: userId }
    });
    if (accounts.length !== allAccountIds.length) {
      throw new CorrectionError(
        'One or more referenced accounts were not found or do not belong to the current user.',
        404,
        'NOT_FOUND'
      );
    }

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const primaryAccount = accountMap.get(existing.primary_account_id)!;

    if ((primaryAccount as any).is_archived) {
      throw new CorrectionError(
        'Cannot correct a transaction referencing an archived primary account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    for (const accId of allAccountIds) {
      const acc = accountMap.get(accId)!;
      if ((acc as any).is_archived) {
        throw new CorrectionError(
          `Cannot correct transaction referencing archived account [${acc.name}].`,
          422,
          'ACCOUNT_ARCHIVED'
        );
      }
    }

    // Verify target account types are valid for this transaction's form and primary account type
    const creditCardRepaymentTargets: string[] = [];
    for (const line of validatedAllocations) {
      const targetAcc = accountMap.get(line.target_account_id)!;
      if (existing.form === 'RECEIVE_MONEY') {
        if (!['INCOME', 'LOAN_GIVEN', 'LOAN_TAKEN', 'CASH'].includes(targetAcc.type)) {
          throw new CorrectionError(
            `Target account type ${targetAcc.type} is not allowed for RECEIVE_MONEY transactions.`,
            400,
            'INVALID_ACCOUNT_TYPE'
          );
        }
      } else if (existing.form === 'PAYMENT_CHARGE') {
        if (primaryAccount.type === 'LOAN_TAKEN' && targetAcc.type !== 'EXPENSE') {
          throw new CorrectionError(
            `Credit card / loan charge allocations must target EXPENSE accounts, received: ${targetAcc.type}.`,
            400,
            'INVALID_ACCOUNT_TYPE'
          );
        }
        if (primaryAccount.type === 'CASH') {
          if (!['EXPENSE', 'LOAN_TAKEN', 'LOAN_GIVEN', 'CASH'].includes(targetAcc.type)) {
            throw new CorrectionError(
              `Target account type ${targetAcc.type} is not allowed for CASH payment transactions.`,
              400,
              'INVALID_ACCOUNT_TYPE'
            );
          }
          if (targetAcc.id === primaryAccount.id) {
            throw new CorrectionError(
              'Source and destination cash accounts must be distinct.',
              400,
              'SAME_ACCOUNT_TRANSFER'
            );
          }
          if (targetAcc.type === 'LOAN_TAKEN' && (targetAcc as any).subtype !== 'GENERAL_LOAN') {
            creditCardRepaymentTargets.push(targetAcc.id);
          }
        }
      }
    }

    // Prevent BR-07 v1.1 bypass: Credit Card Debt Repayment (F-07) cannot be mixed with other
    // allocation lines in a multi-allocation PAYMENT_CHARGE from CASH.
    if (
      existing.form === 'PAYMENT_CHARGE' &&
      primaryAccount.type === 'CASH' &&
      creditCardRepaymentTargets.length > 0 &&
      validatedAllocations.length > 1
    ) {
      throw new CorrectionError(
        'Credit card debt repayments cannot be combined with other allocation lines in a single transaction.',
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    // E. Apply Update & Replace Allocation Lines
    await tx.transaction.update({
      where: { id: existing.id },
      data: {
        total_amount: totalDecimal,
        transaction_date: dateObj,
        description,
        updated_at: new Date()
      }
    });

    await tx.allocationLine.deleteMany({
      where: { transaction_id: existing.id }
    });

    const createdAllocations = [];
    for (const line of validatedAllocations) {
      const created = await tx.allocationLine.create({
        data: {
          transaction_id: existing.id,
          target_account_id: line.target_account_id,
          amount: line.amount,
          notes: line.notes
        }
      });
      createdAllocations.push({
        id: created.id,
        target_account_id: created.target_account_id,
        amount: line.amount.toFixed(2),
        notes: created.notes ?? null
      });
    }

    // F. Re-validate resulting account balances / debts / receivables under lock
    const zero = new Prisma.Decimal('0.00');
    const resultingCashMap = new Map<string, Prisma.Decimal>();
    const resultingDebtMap = new Map<string, Prisma.Decimal>();

    for (const acc of accounts) {
      if (acc.type === 'CASH') {
        const cashBal = await computeLockedCashAccountBalance(
          tx,
          acc.id,
          acc.opening_balance,
          userId
        );
        resultingCashMap.set(acc.id, cashBal);
      } else if (acc.type === 'LOAN_TAKEN') {
        const debtBal = await computeLockedLoanTakenDebt(tx, acc.id, acc.opening_balance, userId);
        resultingDebtMap.set(acc.id, debtBal);
      } else if (acc.type === 'LOAN_GIVEN') {
        const recvBal = await computeLockedLoanGivenReceivable(
          tx,
          acc.id,
          acc.opening_balance,
          userId
        );
        if (recvBal.lessThan(zero)) {
          throw new CorrectionError(
            `Correction would result in negative receivable on [${acc.name}] (${recvBal.toFixed(2)}).`,
            422,
            'RECOVERY_EXCEEDS_RECEIVABLE'
          );
        }
      }
    }

    // G. Enforce BR-07 v1.1 strictly for Credit Card Repayments (exact precedence:
    //    ZERO_OUTSTANDING_DEBT -> REPAYMENT_EXCEEDS_DEBT -> INSUFFICIENT_FUNDS -> MIN_REPAYMENT_NOT_MET -> MINIMUM_CASH_RESERVE_VIOLATION)
    const isCreditCardRepayment =
      existing.form === 'PAYMENT_CHARGE' &&
      primaryAccount.type === 'CASH' &&
      creditCardRepaymentTargets.length === 1 &&
      validatedAllocations.length === 1;

    if (isCreditCardRepayment) {
      const ccTargetId = creditCardRepaymentTargets[0];
      const resultingDebt = resultingDebtMap.get(ccTargetId)!;
      const resultingCash = resultingCashMap.get(primaryAccount.id)!;
      const preRepaymentDebt = resultingDebt.add(totalDecimal);

      if (preRepaymentDebt.lessThanOrEqualTo(zero)) {
        throw new CorrectionError(
          'Outstanding repayment debt is 0.00; no repayment is required.',
          422,
          'ZERO_OUTSTANDING_DEBT'
        );
      }

      if (totalDecimal.greaterThan(preRepaymentDebt)) {
        throw new CorrectionError(
          `Corrected repayment amount of ${totalDecimal.toFixed(2)} exceeds outstanding debt of ${preRepaymentDebt.toFixed(2)}.`,
          422,
          'REPAYMENT_EXCEEDS_DEBT'
        );
      }

      if (resultingCash.lessThan(zero)) {
        throw new CorrectionError(
          `Correction would leave cash account [${primaryAccount.name}] with a negative balance (${resultingCash.toFixed(2)}).`,
          422,
          'INSUFFICIENT_FUNDS'
        );
      }

      const minRepayment = calculateMinimumRepayment(preRepaymentDebt);
      if (totalDecimal.lessThan(minRepayment)) {
        throw new CorrectionError(
          `Corrected repayment amount of ${totalDecimal.toFixed(2)} is below the minimum required repayment of ${minRepayment.toFixed(2)}.`,
          422,
          'MIN_REPAYMENT_NOT_MET'
        );
      }

      const isFullSettlement = totalDecimal.equals(preRepaymentDebt);
      if (!isFullSettlement && resultingCash.lessThan(MIN_CASH_RESERVE)) {
        throw new CorrectionError(
          `Partial repayment must leave at least ${MIN_CASH_RESERVE.toFixed(2)} in the source cash account.`,
          422,
          'MINIMUM_CASH_RESERVE_VIOLATION'
        );
      }
    }

    // Verify all affected CASH and LOAN_TAKEN accounts remain non-negative
    for (const [accId, cashBal] of resultingCashMap.entries()) {
      if (cashBal.lessThan(zero)) {
        const acc = accountMap.get(accId)!;
        throw new CorrectionError(
          `Correction would leave cash account [${acc.name}] with a negative balance (${cashBal.toFixed(2)}).`,
          422,
          'INSUFFICIENT_FUNDS'
        );
      }
    }
    for (const [accId, debtBal] of resultingDebtMap.entries()) {
      if (debtBal.lessThan(zero)) {
        const acc = accountMap.get(accId)!;
        throw new CorrectionError(
          `Correction would result in negative debt on [${acc.name}] (${debtBal.toFixed(2)}).`,
          422,
          'REPAYMENT_EXCEEDS_DEBT'
        );
      }
    }

    // H. Atomically lock opening balances on all accounts referenced by the corrected transaction (F-03 / Task 1)
    const referencedAfterCorrection = Array.from(
      new Set<string>([
        existing.primary_account_id,
        ...validatedAllocations.map((a) => a.target_account_id)
      ])
    );
    await lockAccounts(tx, referencedAfterCorrection, userId);

    // I. Atomic TransactionAuditLog insertion (mutual all-or-nothing atomicity)
    const newSnapshot = {
      total_amount: totalDecimal.toFixed(2),
      transaction_date: dateStr,
      description,
      allocations: validatedAllocations.map((a) => ({
        target_account_id: a.target_account_id,
        amount: a.amount.toFixed(2),
        notes: a.notes
      }))
    };

    await tx.transactionAuditLog.create({
      data: {
        transaction_id: existing.id,
        user_id: userId,
        action: 'CORRECTED',
        previous_snapshot: previousSnapshot,
        new_snapshot: newSnapshot
      }
    });

    return {
      transaction: {
        id: existing.id,
        primary_account_id: existing.primary_account_id,
        form: existing.form,
        total_amount: totalDecimal.toFixed(2),
        transaction_date: dateStr,
        description,
        allocations: createdAllocations
      }
    };
  });
}
