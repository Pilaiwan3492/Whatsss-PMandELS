import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { acquireAccountRowLocks, lockAccounts } from './accountLock.service.js';
import {
  calculateMinimumRepayment,
  MIN_CASH_RESERVE,
  validateDescription,
  validateTransactionDate
} from './repayment.service.js';
import { computeLockedCashAccountBalance } from './transfer.service.js';

export class FavoriteDuplicateError extends Error {
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
    this.name = 'FavoriteDuplicateError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface DuplicateTransactionInput {
  transaction_date?: unknown;
  description?: unknown;
}

/**
 * Computes authoritative outstanding debt on a LOAN_TAKEN account under row lock.
 * Debt = opening_balance + charges (PAYMENT_CHARGE where primary=account)
 *        + borrowings (RECEIVE_MONEY on CASH targeting account)
 *        - repayments (PAYMENT_CHARGE on CASH targeting account)
 */
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

/**
 * Computes authoritative outstanding receivable on a LOAN_GIVEN account under row lock.
 * Receivable = opening_balance + disbursements (PAYMENT_CHARGE on CASH targeting account)
 *              - recoveries (RECEIVE_MONEY on CASH targeting account)
 */
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

function formatDateOnly(val: Date | string): string {
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
}

/**
 * Toggles is_favorite flag on a user-owned transaction (F-14, FR-16, AC-14-1, BR-01).
 */
export async function toggleTransactionFavorite(
  userId: string,
  transactionId: string,
  input: { is_favorite?: unknown },
  prismaClient = defaultPrisma
) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new FavoriteDuplicateError('User authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!input || typeof input !== 'object' || typeof input.is_favorite !== 'boolean') {
    throw new FavoriteDuplicateError(
      'Field is_favorite must be a boolean (true or false).',
      400,
      'INVALID_FAVORITE_FLAG'
    );
  }

  const existing = await prismaClient.transaction.findFirst({
    where: { id: transactionId, user_id: userId }
  });

  if (!existing) {
    throw new FavoriteDuplicateError(
      `Transaction [${transactionId}] was not found or does not belong to the current user.`,
      404,
      'NOT_FOUND'
    );
  }

  const updated: any = await prismaClient.transaction.update({
    where: { id: existing.id },
    data: { is_favorite: input.is_favorite },
    include: {
      primary_account: {
        select: { id: true, name: true, type: true, subtype: true }
      },
      allocation_lines: {
        include: {
          target_account: {
            select: { id: true, name: true, type: true, subtype: true }
          }
        },
        orderBy: { id: 'asc' }
      }
    }
  });

  return {
    transaction: {
      id: updated.id,
      user_id: updated.user_id,
      primary_account_id: updated.primary_account_id,
      primary_account: updated.primary_account,
      form: updated.form,
      total_amount: new Prisma.Decimal(updated.total_amount.toString()).toFixed(2),
      transaction_date: formatDateOnly(updated.transaction_date),
      description: updated.description,
      is_favorite: Boolean(updated.is_favorite),
      created_at:
        updated.created_at instanceof Date ? updated.created_at.toISOString() : String(updated.created_at),
      updated_at:
        updated.updated_at instanceof Date ? updated.updated_at.toISOString() : String(updated.updated_at),
      allocation_lines: (updated.allocation_lines || []).map((line: any) => ({
        id: line.id,
        transaction_id: line.transaction_id,
        target_account_id: line.target_account_id,
        target_account: line.target_account,
        amount: new Prisma.Decimal(line.amount.toString()).toFixed(2),
        notes: line.notes
      }))
    }
  };
}

/**
 * Duplicates an existing user-owned transaction with full live domain re-validation (F-14, FR-17, AC-14-2, AC-14-3).
 * - Freshly generates Transaction.id, AllocationLine.ids, created_at, updated_at, is_favorite=false, 0 audit logs.
 *
 * CONCURRENCY & LOCKING ORDER CONTRACT (F-14 Duplicate <-> F-16 Transaction Correction):
 * Both F-14 (duplicateTransaction) and F-16 (correctTransaction) MUST acquire locks in the
 * exact same canonical order inside prisma.$transaction to prevent deadlocks and stale-read races:
 *   1. Acquire a row-level lock on the source Transaction row first:
 *      SELECT id FROM "transactions" WHERE id = $transactionId AND user_id = $userId FOR UPDATE
 *   2. Read/re-read the source Transaction and its AllocationLines AFTER the lock is held.
 *   3. Acquire pessimistic row locks on all referenced Account rows in canonical ascending UUID
 *      order via acquireAccountRowLocks(tx, allAccountIds, userId).
 * Because F-16 acquires the same Transaction FOR UPDATE lock before updating Transaction/AllocationLines
 * and locking Account rows, a concurrent F-14 duplicate blocks until F-16 commits (or rolls back)
 * and always reads the latest committed source data (zero stale-read duplication).
 */
export async function duplicateTransaction(
  userId: string,
  transactionId: string,
  input: DuplicateTransactionInput = {},
  prismaClient = defaultPrisma
) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new FavoriteDuplicateError('User authentication required.', 401, 'UNAUTHORIZED');
  }

  let overrideDateObj: Date | undefined;
  let overrideDateStr: string | undefined;
  let hasDescriptionOverride = false;
  let overrideDescription: string | null = null;

  if (input && typeof input === 'object') {
    if (input.transaction_date !== undefined) {
      try {
        const parsed = validateTransactionDate(input.transaction_date);
        overrideDateObj = parsed.dateObj;
        overrideDateStr = parsed.dateStr;
      } catch (err: any) {
        throw new FavoriteDuplicateError(
          err.message,
          err.statusCode || 400,
          err.code || 'INVALID_TRANSACTION_DATE'
        );
      }
    }

    if (input.description !== undefined) {
      hasDescriptionOverride = true;
      try {
        overrideDescription = validateDescription(input.description);
      } catch (err: any) {
        throw new FavoriteDuplicateError(
          err.message,
          err.statusCode || 400,
          err.code || 'INVALID_DESCRIPTION'
        );
      }
    }
  }

  return await prismaClient.$transaction(async (tx) => {
    // 1. Acquire pessimistic row-level lock on the source Transaction row FIRST (prevents stale-read race with F-16)
    if (typeof (tx as any).$queryRaw === 'function') {
      const lockedTxRows: any[] = await (tx as any).$queryRaw`
        SELECT id FROM "transactions"
        WHERE id = ${transactionId}
          AND user_id = ${userId}
        FOR UPDATE
      `;
      if (Array.isArray(lockedTxRows) && lockedTxRows.length === 0) {
        throw new FavoriteDuplicateError(
          `Transaction [${transactionId}] was not found or does not belong to the current user.`,
          404,
          'NOT_FOUND'
        );
      }
    }

    // 2. Read/re-read source transaction and its allocation lines AFTER acquiring the row lock (BR-01)
    const source: any = await tx.transaction.findFirst({
      where: { id: transactionId, user_id: userId },
      include: {
        allocation_lines: {
          orderBy: { id: 'asc' }
        }
      }
    });

    if (!source) {
      throw new FavoriteDuplicateError(
        `Transaction [${transactionId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const sourceLines: any[] = source.allocation_lines || [];
    if (sourceLines.length === 0) {
      throw new FavoriteDuplicateError(
        'Cannot duplicate a transaction with no allocation lines.',
        422,
        'ALLOCATION_SUM_MISMATCH'
      );
    }

    const totalDecimal = new Prisma.Decimal(source.total_amount.toString());
    const linesSum = sourceLines.reduce(
      (acc, l) => acc.add(new Prisma.Decimal(l.amount.toString())),
      new Prisma.Decimal('0.00')
    );
    if (!linesSum.equals(totalDecimal)) {
      throw new FavoriteDuplicateError(
        `Allocation lines sum (${linesSum.toFixed(2)}) does not equal total amount (${totalDecimal.toFixed(2)}).`,
        422,
        'ALLOCATION_SUM_MISMATCH'
      );
    }

    // 3. Collect and acquire canonical sorted row locks on all referenced accounts
    const allAccountIds = Array.from(
      new Set<string>([
        source.primary_account_id,
        ...sourceLines.map((l: any) => l.target_account_id as string)
      ])
    );
    await acquireAccountRowLocks(tx, allAccountIds, userId);

    // 3. Re-verify ownership and Archived Account Guard under row lock
    const accounts = await tx.account.findMany({
      where: { id: { in: allAccountIds }, user_id: userId }
    });
    if (accounts.length !== allAccountIds.length) {
      throw new FavoriteDuplicateError(
        'One or more referenced accounts were not found or do not belong to the current user.',
        404,
        'NOT_FOUND'
      );
    }

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const primaryAccount = accountMap.get(source.primary_account_id)!;

    if ((primaryAccount as any).is_archived) {
      throw new FavoriteDuplicateError(
        'Cannot duplicate transaction referencing an archived primary account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    for (const line of sourceLines) {
      const targetAccount = accountMap.get(line.target_account_id)!;
      if ((targetAccount as any).is_archived) {
        throw new FavoriteDuplicateError(
          `Cannot duplicate transaction referencing archived account [${targetAccount.name}].`,
          422,
          'ACCOUNT_ARCHIVED'
        );
      }
    }

    // 4. Live domain re-validation against current locked database state
    const zero = new Prisma.Decimal('0.00');

    // Helper: validate explicit LOAN_TAKEN subtype (never silently treat DEFAULT/undefined/unknown as CREDIT_CARD)
    const assertExplicitLoanTakenSubtype = (acc: any): 'CREDIT_CARD' | 'GENERAL_LOAN' => {
      const subtype = acc?.subtype;
      if (subtype === 'CREDIT_CARD' || subtype === 'GENERAL_LOAN') {
        return subtype;
      }
      throw new FavoriteDuplicateError(
        `Unsupported or ambiguous LOAN_TAKEN subtype "${String(subtype)}" on account [${acc?.name || acc?.id}]. Expected CREDIT_CARD or GENERAL_LOAN.`,
        400,
        'INVALID_ACCOUNT_SUBTYPE'
      );
    };

    // Group allocation amounts by target account (order-independent)
    const groupedAmountsByTarget = new Map<string, Prisma.Decimal>();
    for (const line of sourceLines) {
      const lineAmt = new Prisma.Decimal(line.amount.toString());
      const prev = groupedAmountsByTarget.get(line.target_account_id) ?? zero;
      groupedAmountsByTarget.set(line.target_account_id, prev.add(lineAmt));
    }

    const distinctTargetTypes = new Set(
      sourceLines.map((l: any) => accountMap.get(l.target_account_id)!.type)
    );

    if (source.form === 'PAYMENT_CHARGE') {
      if (primaryAccount.type === 'CASH') {
        const currentCashBalance = await computeLockedCashAccountBalance(
          tx,
          primaryAccount.id,
          primaryAccount.opening_balance,
          userId
        );

        // Reject unsupported mixed target types (e.g., mixing EXPENSE with LOAN_TAKEN) or INCOME under PAYMENT_CHARGE
        if (distinctTargetTypes.size !== 1 || distinctTargetTypes.has('INCOME')) {
          throw new FavoriteDuplicateError(
            'Unsupported target account combination for PAYMENT_CHARGE from CASH account.',
            400,
            'INVALID_ACCOUNT_TYPE'
          );
        }

        const [onlyTargetType] = Array.from(distinctTargetTypes);

        if (onlyTargetType === 'LOAN_TAKEN') {
          // Validate explicit LOAN_TAKEN subtypes first and reject mixed CREDIT_CARD + GENERAL_LOAN allocations
          const loanSubtypes = new Set(
            Array.from(groupedAmountsByTarget.keys()).map((accId) =>
              assertExplicitLoanTakenSubtype(accountMap.get(accId)!)
            )
          );
          if (loanSubtypes.size !== 1) {
            throw new FavoriteDuplicateError(
              'Cannot mix CREDIT_CARD and GENERAL_LOAN repayment allocations in a single transaction.',
              400,
              'INVALID_ACCOUNT_TYPE'
            );
          }

          const [repaymentSubtype] = Array.from(loanSubtypes);

          // First pass: validate each target LOAN_TAKEN account debt & grouped repayment amount
          const debtByTarget = new Map<string, Prisma.Decimal>();
          for (const [targetAccId, groupedAmt] of groupedAmountsByTarget.entries()) {
            const targetAcc = accountMap.get(targetAccId)!;
            const currentDebt = await computeLockedLoanTakenDebt(
              tx,
              targetAcc.id,
              targetAcc.opening_balance,
              userId
            );

            if (currentDebt.lessThanOrEqualTo(zero)) {
              throw new FavoriteDuplicateError(
                'Outstanding repayment debt is 0.00; no repayment is required.',
                422,
                'ZERO_OUTSTANDING_DEBT'
              );
            }

            if (groupedAmt.greaterThan(currentDebt)) {
              throw new FavoriteDuplicateError(
                `Repayment amount of ${groupedAmt.toFixed(2)} exceeds outstanding debt of ${currentDebt.toFixed(2)}.`,
                422,
                'REPAYMENT_EXCEEDS_DEBT'
              );
            }

            debtByTarget.set(targetAccId, currentDebt);
          }

          // Check cash balance sufficiency across the total repayment
          if (totalDecimal.greaterThan(currentCashBalance)) {
            throw new FavoriteDuplicateError(
              `Insufficient funds in source cash account. Available: ${currentCashBalance.toFixed(2)}, requested: ${totalDecimal.toFixed(2)}.`,
              422,
              'INSUFFICIENT_FUNDS'
            );
          }

          // Enforce BR-07 v1.1 strictly for CREDIT_CARD repayments (explicitly not GENERAL_LOAN)
          if (repaymentSubtype === 'CREDIT_CARD') {
            for (const [targetAccId, groupedAmt] of groupedAmountsByTarget.entries()) {
              const currentDebt = debtByTarget.get(targetAccId)!;
              const minRepayment = calculateMinimumRepayment(currentDebt);
              if (groupedAmt.lessThan(minRepayment)) {
                throw new FavoriteDuplicateError(
                  `Repayment amount of ${groupedAmt.toFixed(2)} is below the minimum required repayment of ${minRepayment.toFixed(2)}.`,
                  422,
                  'MIN_REPAYMENT_NOT_MET'
                );
              }

              const isFullSettlement = groupedAmt.equals(currentDebt);
              if (!isFullSettlement && currentCashBalance.sub(totalDecimal).lessThan(MIN_CASH_RESERVE)) {
                throw new FavoriteDuplicateError(
                  `Partial repayment must leave at least ${MIN_CASH_RESERVE.toFixed(2)} in the source cash account.`,
                  422,
                  'MINIMUM_CASH_RESERVE_VIOLATION'
                );
              }
            }
          }
        } else {
          // EXPENSE, CASH (transfer), or LOAN_GIVEN (disbursement)
          if (onlyTargetType === 'CASH') {
            for (const targetAccId of groupedAmountsByTarget.keys()) {
              if (targetAccId === primaryAccount.id) {
                throw new FavoriteDuplicateError(
                  'Cannot duplicate a transfer to the same source cash account.',
                  400,
                  'SAME_ACCOUNT_TRANSFER'
                );
              }
            }
          }
          if (totalDecimal.greaterThan(currentCashBalance)) {
            throw new FavoriteDuplicateError(
              `Insufficient funds in source cash account. Available: ${currentCashBalance.toFixed(2)}, requested: ${totalDecimal.toFixed(2)}.`,
              422,
              'INSUFFICIENT_FUNDS'
            );
          }
        }
      } else if (primaryAccount.type === 'LOAN_TAKEN') {
        const primarySubtype = assertExplicitLoanTakenSubtype(primaryAccount);
        if (primarySubtype !== 'CREDIT_CARD') {
          throw new FavoriteDuplicateError(
            'Only CREDIT_CARD LOAN_TAKEN accounts can be used as the primary account for PAYMENT_CHARGE expenses.',
            400,
            'INVALID_ACCOUNT_SUBTYPE'
          );
        }
        if (distinctTargetTypes.size !== 1 || !distinctTargetTypes.has('EXPENSE')) {
          throw new FavoriteDuplicateError(
            'Credit card PAYMENT_CHARGE transactions may only allocate to EXPENSE accounts.',
            400,
            'INVALID_ACCOUNT_TYPE'
          );
        }
      } else {
        throw new FavoriteDuplicateError(
          `Unsupported primary account type [${primaryAccount.type}] for PAYMENT_CHARGE.`,
          400,
          'INVALID_ACCOUNT_TYPE'
        );
      }
    } else if (source.form === 'RECEIVE_MONEY') {
      if (primaryAccount.type !== 'CASH') {
        throw new FavoriteDuplicateError(
          `Unsupported primary account type [${primaryAccount.type}] for RECEIVE_MONEY.`,
          400,
          'INVALID_ACCOUNT_TYPE'
        );
      }

      if (
        distinctTargetTypes.size !== 1 ||
        distinctTargetTypes.has('EXPENSE') ||
        distinctTargetTypes.has('CASH')
      ) {
        throw new FavoriteDuplicateError(
          'Unsupported target account combination for RECEIVE_MONEY.',
          400,
          'INVALID_ACCOUNT_TYPE'
        );
      }

      const [onlyTargetType] = Array.from(distinctTargetTypes);

      if (onlyTargetType === 'LOAN_TAKEN') {
        for (const targetAccId of groupedAmountsByTarget.keys()) {
          const subtype = assertExplicitLoanTakenSubtype(accountMap.get(targetAccId)!);
          if (subtype !== 'GENERAL_LOAN') {
            throw new FavoriteDuplicateError(
              'RECEIVE_MONEY from LOAN_TAKEN is only supported for GENERAL_LOAN borrowing.',
              400,
              'INVALID_ACCOUNT_SUBTYPE'
            );
          }
        }
      } else if (onlyTargetType === 'LOAN_GIVEN') {
        // Group recovery amounts by target LOAN_GIVEN account (order-independent)
        for (const [targetAccId, groupedAmt] of groupedAmountsByTarget.entries()) {
          const targetAccount = accountMap.get(targetAccId)!;
          const currentReceivable = await computeLockedLoanGivenReceivable(
            tx,
            targetAccount.id,
            targetAccount.opening_balance,
            userId
          );
          if (currentReceivable.lessThanOrEqualTo(zero)) {
            throw new FavoriteDuplicateError(
              'Outstanding loan receivable is 0.00; no recovery is possible.',
              422,
              'ZERO_OUTSTANDING_RECEIVABLE'
            );
          }
          if (groupedAmt.greaterThan(currentReceivable)) {
            throw new FavoriteDuplicateError(
              `Recovery amount of ${groupedAmt.toFixed(2)} exceeds outstanding receivable of ${currentReceivable.toFixed(2)}.`,
              422,
              'RECOVERY_EXCEEDS_RECEIVABLE'
            );
          }
        }
      }
    } else {
      throw new FavoriteDuplicateError(
        `Unsupported transaction form [${String(source.form)}].`,
        400,
        'INVALID_TRANSACTION_FORM'
      );
    }

    // 5. Lock opening balances on all referenced accounts
    await lockAccounts(tx, allAccountIds, userId);

    // 6. Determine final date and description
    const finalDateStr = overrideDateStr ?? formatDateOnly(source.transaction_date);
    const finalDateObj =
      overrideDateObj ??
      (source.transaction_date instanceof Date
        ? source.transaction_date
        : validateTransactionDate(finalDateStr).dateObj);
    const finalDescription = hasDescriptionOverride ? overrideDescription : source.description ?? null;

    // 7. Create brand-new Transaction (is_favorite = false, fresh timestamps, 0 audit logs)
    const createdTx: any = await tx.transaction.create({
      data: {
        user_id: userId,
        primary_account_id: source.primary_account_id,
        form: source.form,
        total_amount: totalDecimal,
        transaction_date: finalDateObj,
        description: finalDescription,
        is_favorite: false
      }
    });

    // 8. Clone AllocationLines with brand-new UUIDs
    const createdAllocations = [];
    for (const line of sourceLines) {
      const lineAmt = new Prisma.Decimal(line.amount.toString());
      const createdLine = await tx.allocationLine.create({
        data: {
          transaction_id: createdTx.id,
          target_account_id: line.target_account_id,
          amount: lineAmt,
          notes: line.notes ?? null
        }
      });
      createdAllocations.push({
        id: createdLine.id,
        target_account_id: createdLine.target_account_id,
        amount: lineAmt.toFixed(2),
        notes: createdLine.notes ?? null
      });
    }

    return {
      transaction: {
        id: createdTx.id,
        primary_account_id: createdTx.primary_account_id,
        form: createdTx.form,
        total_amount: totalDecimal.toFixed(2),
        transaction_date: finalDateStr,
        description: createdTx.description ?? null,
        is_favorite: false,
        created_at:
          createdTx.created_at instanceof Date
            ? createdTx.created_at.toISOString()
            : String(createdTx.created_at),
        updated_at:
          createdTx.updated_at instanceof Date
            ? createdTx.updated_at.toISOString()
            : String(createdTx.updated_at),
        allocations: createdAllocations
      }
    };
  });
}
