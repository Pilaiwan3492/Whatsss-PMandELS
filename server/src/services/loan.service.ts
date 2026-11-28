import { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';
import { lockAccounts, acquireAccountRowLocks } from './accountLock.service.js';
import {
  validateRepaymentAmount,
  validateTransactionDate,
  validateDescription
} from './repayment.service.js';
import { computeLockedCashAccountBalance } from './transfer.service.js';

export class LoanError extends Error {
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
    this.name = 'LoanError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface RecordLoanFlowInput {
  from_account_id: string;
  to_account_id: string;
  amount: number | string;
  transaction_date: string;
  description?: string | null;
}

export interface LoanGivenResult {
  transaction: {
    id: string;
    primary_account_id: string;
    form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
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
  updated_receivable: string;
}

export interface GeneralLoanResult {
  transaction: {
    id: string;
    primary_account_id: string;
    form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
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

function validateAndParseLoanInput(
  userId: string,
  input: RecordLoanFlowInput,
  amountLabel: string
): {
  fromAccountId: string;
  toAccountId: string;
  amountDecimal: Prisma.Decimal;
  dateObj: Date;
  dateStr: string;
  desc: string | null;
} {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new LoanError('User authentication required.', 401, 'UNAUTHORIZED');
  }

  if (!input || typeof input !== 'object') {
    throw new LoanError('Invalid request payload.', 400, 'INVALID_PAYLOAD');
  }

  if (
    !input.from_account_id ||
    typeof input.from_account_id !== 'string' ||
    input.from_account_id.trim() === ''
  ) {
    throw new LoanError('Source account (from_account_id) is required.', 400, 'INVALID_ACCOUNT_ID');
  }

  if (
    !input.to_account_id ||
    typeof input.to_account_id !== 'string' ||
    input.to_account_id.trim() === ''
  ) {
    throw new LoanError('Target account (to_account_id) is required.', 400, 'INVALID_ACCOUNT_ID');
  }

  const fromAccountId = input.from_account_id.trim();
  const toAccountId = input.to_account_id.trim();

  let amountDecimal: Prisma.Decimal;
  let dateObj: Date;
  let dateStr: string;
  let desc: string | null;

  try {
    amountDecimal = validateRepaymentAmount(input.amount, amountLabel);
    const dateVal = validateTransactionDate(input.transaction_date);
    dateObj = dateVal.dateObj;
    dateStr = dateVal.dateStr;
    desc = validateDescription(input.description);
  } catch (err: any) {
    throw new LoanError(
      err.message,
      err.statusCode || 400,
      err.code || 'BAD_REQUEST',
      err.details || []
    );
  }

  return {
    fromAccountId,
    toAccountId,
    amountDecimal,
    dateObj,
    dateStr,
    desc
  };
}

/**
 * Computes the authoritative receivable balance of a LOAN_GIVEN account under row lock (F-12, BR-08):
 * Receivable = opening_balance + sum(Disbursements: PAYMENT_CHARGE from CASH to LOAN_GIVEN)
 *              - sum(Recoveries: RECEIVE_MONEY on CASH targeting LOAN_GIVEN)
 */
export async function computeLockedLoanGivenReceivable(
  tx: Prisma.TransactionClient,
  loanGivenAccountId: string,
  openingBalance: Prisma.Decimal | number | string,
  userId: string
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  const openingDecimal = new Prisma.Decimal(openingBalance.toString());
  let disbursed = zero;
  let recovered = zero;

  if (typeof tx.allocationLine?.aggregate === 'function') {
    const disburseAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: loanGivenAccountId,
        target_account: {
          type: 'LOAN_GIVEN',
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
    if (disburseAgg._sum?.amount) {
      disbursed = new Prisma.Decimal(disburseAgg._sum.amount.toString());
    }

    const recoverAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: loanGivenAccountId,
        target_account: {
          type: 'LOAN_GIVEN',
          user_id: userId
        },
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY',
          primary_account: {
            type: 'CASH',
            user_id: userId
          }
        }
      },
      _sum: { amount: true }
    });
    if (recoverAgg._sum?.amount) {
      recovered = new Prisma.Decimal(recoverAgg._sum.amount.toString());
    }
  }

  return openingDecimal.add(disbursed).sub(recovered);
}

/**
 * Computes the authoritative liability balance of a general LOAN_TAKEN account under row lock (F-13, BR-08):
 * Debt = opening_balance + sum(Borrowings: RECEIVE_MONEY on CASH targeting LOAN_TAKEN)
 *        + sum(Direct Charges: PAYMENT_CHARGE on LOAN_TAKEN)
 *        - sum(Repayments: PAYMENT_CHARGE from CASH targeting LOAN_TAKEN)
 */
export async function computeLockedGeneralLoanDebt(
  tx: Prisma.TransactionClient,
  loanTakenAccountId: string,
  openingBalance: Prisma.Decimal | number | string,
  userId: string
): Promise<Prisma.Decimal> {
  const zero = new Prisma.Decimal('0.00');
  const openingDecimal = new Prisma.Decimal(openingBalance.toString());
  let directCharges = zero;
  let borrowings = zero;
  let repayments = zero;

  if (typeof tx.transaction?.aggregate === 'function') {
    const chargeAgg = await tx.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: loanTakenAccountId,
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (chargeAgg._sum?.total_amount) {
      directCharges = new Prisma.Decimal(chargeAgg._sum.total_amount.toString());
    }
  }

  if (typeof tx.allocationLine?.aggregate === 'function') {
    const borrowAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: loanTakenAccountId,
        target_account: {
          type: 'LOAN_TAKEN',
          user_id: userId
        },
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY',
          primary_account: {
            type: 'CASH',
            user_id: userId
          }
        }
      },
      _sum: { amount: true }
    });
    if (borrowAgg._sum?.amount) {
      borrowings = new Prisma.Decimal(borrowAgg._sum.amount.toString());
    }

    const repayAgg = await tx.allocationLine.aggregate({
      where: {
        target_account_id: loanTakenAccountId,
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
      repayments = new Prisma.Decimal(repayAgg._sum.amount.toString());
    }
  }

  return openingDecimal.add(directCharges).add(borrowings).sub(repayments);
}

/**
 * POST /api/transactions/loan-given (F-12, FR-14, BR-08)
 * Disburses funds from a source CASH account (`from_account_id`) to a target LOAN_GIVEN account (`to_account_id`).
 * Decreases CASH balance and increases LOAN_GIVEN receivable balance without increasing total_expense (BR-08).
 */
export async function recordLoanGiven(
  userId: string,
  input: RecordLoanFlowInput,
  prismaClient = defaultPrisma
): Promise<LoanGivenResult> {
  const { fromAccountId, toAccountId, amountDecimal, dateObj, dateStr, desc } =
    validateAndParseLoanInput(userId, input, 'Loan disbursement amount');

  return await prismaClient.$transaction(async (tx) => {
    await acquireAccountRowLocks(tx, [fromAccountId, toAccountId], userId);

    const fromAccount = await tx.account.findFirst({
      where: { id: fromAccountId, user_id: userId }
    });
    if (!fromAccount) {
      throw new LoanError(
        `Source account [${fromAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const toAccount = await tx.account.findFirst({
      where: { id: toAccountId, user_id: userId }
    });
    if (!toAccount) {
      throw new LoanError(
        `Target account [${toAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    if (fromAccount.type !== 'CASH') {
      throw new LoanError(
        `Source account for loan given must be of type CASH, received: ${fromAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }
    if (toAccount.type !== 'LOAN_GIVEN') {
      throw new LoanError(
        `Target account for loan given must be of type LOAN_GIVEN, received: ${toAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    if ((fromAccount as any).is_archived || (toAccount as any).is_archived) {
      throw new LoanError(
        'Cannot record loan given involving an archived account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    const currentCashBalance = await computeLockedCashAccountBalance(
      tx,
      fromAccountId,
      fromAccount.opening_balance,
      userId
    );
    const currentReceivable = await computeLockedLoanGivenReceivable(
      tx,
      toAccountId,
      toAccount.opening_balance,
      userId
    );

    if (amountDecimal.greaterThan(currentCashBalance)) {
      throw new LoanError(
        `Insufficient funds in source cash account. Available: ${currentCashBalance.toFixed(2)}, requested: ${amountDecimal.toFixed(2)}.`,
        422,
        'INSUFFICIENT_FUNDS'
      );
    }

    await lockAccounts(tx, [fromAccountId, toAccountId], userId);

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

    const allocation = await tx.allocationLine.create({
      data: {
        transaction_id: transaction.id,
        target_account_id: toAccountId,
        amount: amountDecimal,
        notes: desc ?? 'Loan given disbursement'
      }
    });

    const newCashBalance = currentCashBalance.sub(amountDecimal);
    const newReceivable = currentReceivable.add(amountDecimal);

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
      updated_receivable: newReceivable.toFixed(2)
    };
  });
}

/**
 * POST /api/transactions/loan-recovery (F-12, FR-14, BR-08)
 * Recovers principal from a LOAN_GIVEN account (`from_account_id`) into a destination CASH account (`to_account_id`).
 * Increases CASH balance and decreases LOAN_GIVEN receivable balance without increasing total_income (BR-08).
 */
export async function recordLoanRecovery(
  userId: string,
  input: RecordLoanFlowInput,
  prismaClient = defaultPrisma
): Promise<LoanGivenResult> {
  const { fromAccountId, toAccountId, amountDecimal, dateObj, dateStr, desc } =
    validateAndParseLoanInput(userId, input, 'Loan recovery amount');

  const zero = new Prisma.Decimal('0.00');

  return await prismaClient.$transaction(async (tx) => {
    await acquireAccountRowLocks(tx, [fromAccountId, toAccountId], userId);

    const fromAccount = await tx.account.findFirst({
      where: { id: fromAccountId, user_id: userId }
    });
    if (!fromAccount) {
      throw new LoanError(
        `Source loan given account [${fromAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const toAccount = await tx.account.findFirst({
      where: { id: toAccountId, user_id: userId }
    });
    if (!toAccount) {
      throw new LoanError(
        `Destination cash account [${toAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    if (fromAccount.type !== 'LOAN_GIVEN') {
      throw new LoanError(
        `Source account for loan recovery must be of type LOAN_GIVEN, received: ${fromAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }
    if (toAccount.type !== 'CASH') {
      throw new LoanError(
        `Destination account for loan recovery must be of type CASH, received: ${toAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    if ((fromAccount as any).is_archived || (toAccount as any).is_archived) {
      throw new LoanError(
        'Cannot record loan recovery involving an archived account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    const currentReceivable = await computeLockedLoanGivenReceivable(
      tx,
      fromAccountId,
      fromAccount.opening_balance,
      userId
    );
    const currentCashBalance = await computeLockedCashAccountBalance(
      tx,
      toAccountId,
      toAccount.opening_balance,
      userId
    );

    if (currentReceivable.lessThanOrEqualTo(zero)) {
      throw new LoanError(
        'Outstanding loan receivable is 0.00; no recovery can be recorded.',
        422,
        'ZERO_OUTSTANDING_RECEIVABLE'
      );
    }

    if (amountDecimal.greaterThan(currentReceivable)) {
      throw new LoanError(
        `Recovery amount of ${amountDecimal.toFixed(2)} exceeds outstanding receivable of ${currentReceivable.toFixed(2)}.`,
        422,
        'RECOVERY_EXCEEDS_RECEIVABLE'
      );
    }

    await lockAccounts(tx, [fromAccountId, toAccountId], userId);

    const transaction = await tx.transaction.create({
      data: {
        user_id: userId,
        primary_account_id: toAccountId,
        form: 'RECEIVE_MONEY',
        total_amount: amountDecimal,
        transaction_date: dateObj,
        description: desc
      }
    });

    const allocation = await tx.allocationLine.create({
      data: {
        transaction_id: transaction.id,
        target_account_id: fromAccountId,
        amount: amountDecimal,
        notes: desc ?? 'Loan given recovery'
      }
    });

    const newCashBalance = currentCashBalance.add(amountDecimal);
    const newReceivable = currentReceivable.sub(amountDecimal);

    return {
      transaction: {
        id: transaction.id,
        primary_account_id: toAccountId,
        form: 'RECEIVE_MONEY' as const,
        total_amount: amountDecimal.toFixed(2),
        transaction_date: dateStr,
        description: desc,
        allocations: [
          {
            id: allocation.id,
            target_account_id: fromAccountId,
            amount: amountDecimal.toFixed(2),
            notes: allocation.notes
          }
        ]
      },
      updated_cash_balance: newCashBalance.toFixed(2),
      updated_receivable: newReceivable.toFixed(2)
    };
  });
}

/**
 * POST /api/transactions/loan-borrowing (F-13, FR-15, BR-08, BR-07 v1.1 Separation)
 * Records money borrowed from a general LOAN_TAKEN account (`from_account_id`, subtype === 'GENERAL_LOAN')
 * into a destination CASH account (`to_account_id`).
 * Increases CASH balance and increases general LOAN_TAKEN liability without increasing total_income (BR-08).
 */
export async function recordLoanBorrowing(
  userId: string,
  input: RecordLoanFlowInput,
  prismaClient = defaultPrisma
): Promise<GeneralLoanResult> {
  const { fromAccountId, toAccountId, amountDecimal, dateObj, dateStr, desc } =
    validateAndParseLoanInput(userId, input, 'Loan borrowing amount');

  return await prismaClient.$transaction(async (tx) => {
    await acquireAccountRowLocks(tx, [fromAccountId, toAccountId], userId);

    const fromAccount = await tx.account.findFirst({
      where: { id: fromAccountId, user_id: userId }
    });
    if (!fromAccount) {
      throw new LoanError(
        `Source loan account [${fromAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const toAccount = await tx.account.findFirst({
      where: { id: toAccountId, user_id: userId }
    });
    if (!toAccount) {
      throw new LoanError(
        `Destination cash account [${toAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const fromSubtype = (fromAccount as any).subtype;
    if (fromAccount.type !== 'LOAN_TAKEN' || fromSubtype !== 'GENERAL_LOAN') {
      throw new LoanError(
        `Source account for general loan borrowing must be LOAN_TAKEN with subtype GENERAL_LOAN, received: ${fromAccount.type} (${fromSubtype || 'DEFAULT'}).`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }
    if (toAccount.type !== 'CASH') {
      throw new LoanError(
        `Destination account for general loan borrowing must be of type CASH, received: ${toAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    if ((fromAccount as any).is_archived || (toAccount as any).is_archived) {
      throw new LoanError(
        'Cannot record loan borrowing involving an archived account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    const currentDebt = await computeLockedGeneralLoanDebt(
      tx,
      fromAccountId,
      fromAccount.opening_balance,
      userId
    );
    const currentCashBalance = await computeLockedCashAccountBalance(
      tx,
      toAccountId,
      toAccount.opening_balance,
      userId
    );

    await lockAccounts(tx, [fromAccountId, toAccountId], userId);

    const transaction = await tx.transaction.create({
      data: {
        user_id: userId,
        primary_account_id: toAccountId,
        form: 'RECEIVE_MONEY',
        total_amount: amountDecimal,
        transaction_date: dateObj,
        description: desc
      }
    });

    const allocation = await tx.allocationLine.create({
      data: {
        transaction_id: transaction.id,
        target_account_id: fromAccountId,
        amount: amountDecimal,
        notes: desc ?? 'General loan borrowing'
      }
    });

    const newCashBalance = currentCashBalance.add(amountDecimal);
    const newDebt = currentDebt.add(amountDecimal);

    return {
      transaction: {
        id: transaction.id,
        primary_account_id: toAccountId,
        form: 'RECEIVE_MONEY' as const,
        total_amount: amountDecimal.toFixed(2),
        transaction_date: dateStr,
        description: desc,
        allocations: [
          {
            id: allocation.id,
            target_account_id: fromAccountId,
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

/**
 * POST /api/transactions/loan-repayment (F-13, FR-15, BR-08, BR-07 v1.1 Separation)
 * Repays general loan principal from a source CASH account (`from_account_id`) to a general LOAN_TAKEN
 * account (`to_account_id`, subtype === 'GENERAL_LOAN').
 * Exempt from credit-card BR-07 v1.1 minimum repayment floor (500 THB / 10%) and 100 THB cash reserve buffer.
 * Decreases CASH balance and decreases general LOAN_TAKEN liability without increasing total_expense (BR-08).
 */
export async function recordLoanRepayment(
  userId: string,
  input: RecordLoanFlowInput,
  prismaClient = defaultPrisma
): Promise<GeneralLoanResult> {
  const { fromAccountId, toAccountId, amountDecimal, dateObj, dateStr, desc } =
    validateAndParseLoanInput(userId, input, 'General loan repayment amount');

  const zero = new Prisma.Decimal('0.00');

  return await prismaClient.$transaction(async (tx) => {
    await acquireAccountRowLocks(tx, [fromAccountId, toAccountId], userId);

    const fromAccount = await tx.account.findFirst({
      where: { id: fromAccountId, user_id: userId }
    });
    if (!fromAccount) {
      throw new LoanError(
        `Source cash account [${fromAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    const toAccount = await tx.account.findFirst({
      where: { id: toAccountId, user_id: userId }
    });
    if (!toAccount) {
      throw new LoanError(
        `Target loan account [${toAccountId}] was not found or does not belong to the current user.`,
        404,
        'NOT_FOUND'
      );
    }

    if (fromAccount.type !== 'CASH') {
      throw new LoanError(
        `Source account for general loan repayment must be of type CASH, received: ${fromAccount.type}.`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    const toSubtype = (toAccount as any).subtype;
    if (toAccount.type !== 'LOAN_TAKEN' || toSubtype !== 'GENERAL_LOAN') {
      throw new LoanError(
        `Target account for general loan repayment must be LOAN_TAKEN with subtype GENERAL_LOAN, received: ${toAccount.type} (${toSubtype || 'DEFAULT'}).`,
        400,
        'INVALID_ACCOUNT_TYPE'
      );
    }

    if ((fromAccount as any).is_archived || (toAccount as any).is_archived) {
      throw new LoanError(
        'Cannot record general loan repayment involving an archived account.',
        422,
        'ACCOUNT_ARCHIVED'
      );
    }

    const currentCashBalance = await computeLockedCashAccountBalance(
      tx,
      fromAccountId,
      fromAccount.opening_balance,
      userId
    );
    const currentDebt = await computeLockedGeneralLoanDebt(
      tx,
      toAccountId,
      toAccount.opening_balance,
      userId
    );

    if (currentDebt.lessThanOrEqualTo(zero)) {
      throw new LoanError(
        'Outstanding general loan debt is 0.00; no repayment is required.',
        422,
        'ZERO_OUTSTANDING_DEBT'
      );
    }

    if (amountDecimal.greaterThan(currentDebt)) {
      throw new LoanError(
        `Repayment amount of ${amountDecimal.toFixed(2)} exceeds outstanding general loan debt of ${currentDebt.toFixed(2)}.`,
        422,
        'REPAYMENT_EXCEEDS_DEBT'
      );
    }

    if (amountDecimal.greaterThan(currentCashBalance)) {
      throw new LoanError(
        `Insufficient funds in source cash account. Available: ${currentCashBalance.toFixed(2)}, requested: ${amountDecimal.toFixed(2)}.`,
        422,
        'INSUFFICIENT_FUNDS'
      );
    }

    await lockAccounts(tx, [fromAccountId, toAccountId], userId);

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

    const allocation = await tx.allocationLine.create({
      data: {
        transaction_id: transaction.id,
        target_account_id: toAccountId,
        amount: amountDecimal,
        notes: desc ?? 'General loan principal repayment'
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
