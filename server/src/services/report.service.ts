import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma.js';

export interface AccountData {
  id: string;
  name: string;
  type: 'CASH' | 'LOAN_TAKEN' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE';
  opening_balance: Prisma.Decimal | number | string;
}

export interface AllocationLineData {
  id?: string;
  target_account_id: string;
  target_account?: {
    id: string;
    name: string;
    type: string;
  };
  amount: Prisma.Decimal | number | string;
  notes?: string | null;
}

export interface TransactionData {
  id?: string;
  primary_account_id: string;
  primary_account?: {
    id: string;
    name: string;
    type: string;
  };
  form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
  total_amount: Prisma.Decimal | number | string;
  transaction_date?: Date | string;
  description?: string | null;
  created_at?: Date | string;
  allocation_lines?: AllocationLineData[];
}

export interface FinancialSummaryResult {
  bank_balance: number;
  credit_debt: number;
  total_income: number;
  total_expense: number;
  category_breakdown: Record<string, number>;
  categories: Array<{ name: string; amount: number }>;
}

export interface TransactionHistoryRecord {
  id: string;
  user_id: string;
  primary_account_id: string;
  primary_account: {
    id: string;
    name: string;
    type: string;
    subtype?: string;
  };
  form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
  total_amount: number;
  transaction_date: string;
  description: string | null;
  is_favorite?: boolean;
  created_at: string;
  allocation_lines: Array<{
    id: string;
    transaction_id: string;
    target_account_id: string;
    target_account: {
      id: string;
      name: string;
      type: string;
      subtype?: string;
    };
    amount: number;
    notes: string | null;
  }>;
}

/**
 * Pure calculation function for financial balances and summaries.
 * Implements:
 * - BR-01: Tenancy Scoping (operates on tenant-filtered data)
 * - BR-02: Opening Balance Exclusion (opening balances are strictly excluded from income/expense summaries)
 * - BR-03: Income increases cash balance & income summary
 * - BR-04: Credit card purchase increases debt & expense summary
 * - BR-07: Debt repayment decreases cash & credit debt
 * - BR-08: Debt repayment excluded from expense summary
 * - NFR-DATA-01: Arbitrary-precision decimal arithmetic preservation via Prisma.Decimal
 */
export function computeFinancialBalances(input: {
  accounts: AccountData[];
  transactions: TransactionData[];
}): FinancialSummaryResult {
  const zero = new Prisma.Decimal('0.00');

  const cashAccounts = input.accounts.filter((a) => a.type === 'CASH');
  const cashAccountIds = new Set(cashAccounts.map((a) => a.id));

  const loanTakenAccounts = input.accounts.filter((a) => a.type === 'LOAN_TAKEN');
  const loanTakenAccountIds = new Set(loanTakenAccounts.map((a) => a.id));

  // 1. Initial Opening Balances
  let bankBalanceDecimal = cashAccounts.reduce(
    (sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())),
    zero
  );

  let creditDebtDecimal = loanTakenAccounts.reduce(
    (sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())),
    zero
  );

  let totalIncomeDecimal = zero;
  let totalExpenseDecimal = zero;
  const categoryTotals: Record<string, Prisma.Decimal> = {};

  // 2. Iterate transactions and their allocation lines
  for (const tx of input.transactions) {
    const txTotal = new Prisma.Decimal(tx.total_amount.toString());

    // Cash Account Inflows & Outflows
    if (cashAccountIds.has(tx.primary_account_id)) {
      if (tx.form === 'RECEIVE_MONEY') {
        bankBalanceDecimal = bankBalanceDecimal.add(txTotal);
      } else if (tx.form === 'PAYMENT_CHARGE') {
        bankBalanceDecimal = bankBalanceDecimal.sub(txTotal);
      }
    }

    // Credit Card (LOAN_TAKEN) Charges
    if (loanTakenAccountIds.has(tx.primary_account_id)) {
      if (tx.form === 'PAYMENT_CHARGE') {
        creditDebtDecimal = creditDebtDecimal.add(txTotal);
      }
    }

    // Process allocation lines
    if (Array.isArray(tx.allocation_lines)) {
      for (const line of tx.allocation_lines) {
        const lineAmount = new Prisma.Decimal(line.amount.toString());
        const targetType = line.target_account?.type;
        const targetName = line.target_account?.name;

        // Income: Allocation lines of RECEIVE_MONEY targeting INCOME accounts (BR-02, BR-03)
        if (tx.form === 'RECEIVE_MONEY' && targetType === 'INCOME') {
          totalIncomeDecimal = totalIncomeDecimal.add(lineAmount);
        }

        // Expense: Allocation lines of PAYMENT_CHARGE targeting EXPENSE accounts (BR-04, BR-08)
        if (tx.form === 'PAYMENT_CHARGE' && targetType === 'EXPENSE') {
          totalExpenseDecimal = totalExpenseDecimal.add(lineAmount);
          if (targetName) {
            const currentCat = categoryTotals[targetName] || zero;
            categoryTotals[targetName] = currentCat.add(lineAmount);
          }
        }

        // Repayment: PAYMENT_CHARGE from CASH targeting LOAN_TAKEN decreases debt (BR-07, BR-08)
        if (
          tx.form === 'PAYMENT_CHARGE' &&
          cashAccountIds.has(tx.primary_account_id) &&
          (targetType === 'LOAN_TAKEN' || loanTakenAccountIds.has(line.target_account_id))
        ) {
          creditDebtDecimal = creditDebtDecimal.sub(lineAmount);
        }

        // General Loan Borrowing: RECEIVE_MONEY on CASH targeting LOAN_TAKEN increases debt (F-13, BR-08)
        if (
          tx.form === 'RECEIVE_MONEY' &&
          cashAccountIds.has(tx.primary_account_id) &&
          (targetType === 'LOAN_TAKEN' || loanTakenAccountIds.has(line.target_account_id))
        ) {
          creditDebtDecimal = creditDebtDecimal.add(lineAmount);
        }

        // Internal Cash Transfer: PAYMENT_CHARGE from CASH targeting CASH increases destination CASH balance (F-11, BR-02)
        if (
          tx.form === 'PAYMENT_CHARGE' &&
          cashAccountIds.has(tx.primary_account_id) &&
          (targetType === 'CASH' || cashAccountIds.has(line.target_account_id))
        ) {
          bankBalanceDecimal = bankBalanceDecimal.add(lineAmount);
        }
      }
    }
  }

  const categoryBreakdown: Record<string, number> = {};
  const categories: Array<{ name: string; amount: number }> = [];

  for (const [name, amountDec] of Object.entries(categoryTotals)) {
    const formattedAmount = Number(amountDec.toFixed(2));
    categoryBreakdown[name] = formattedAmount;
    categories.push({ name, amount: formattedAmount });
  }

  // Sort categories alphabetically for deterministic contract responses
  categories.sort((a, b) => a.name.localeCompare(b.name));

  return {
    bank_balance: Number(bankBalanceDecimal.toFixed(2)),
    credit_debt: Number(creditDebtDecimal.toFixed(2)),
    total_income: Number(totalIncomeDecimal.toFixed(2)),
    total_expense: Number(totalExpenseDecimal.toFixed(2)),
    category_breakdown: categoryBreakdown,
    categories
  };
}

/**
 * Service function: Retrieves real-time financial summary for authenticated tenant.
 */
export async function getFinancialSummary(
  userId: string,
  prismaClient: PrismaClient = defaultPrisma
): Promise<FinancialSummaryResult> {
  const zero = new Prisma.Decimal('0.00');

  // Query tenant accounts
  const accounts = await prismaClient.account.findMany({
    where: { user_id: userId }
  });

  const cashAccounts = accounts.filter((a) => a.type === 'CASH');
  const bankOpeningDecimal = cashAccounts.reduce(
    (sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())),
    zero
  );

  const loanTakenAccounts = accounts.filter((a) => a.type === 'LOAN_TAKEN');
  let creditDebtDecimal = loanTakenAccounts.reduce(
    (sum, a) => sum.add(new Prisma.Decimal(a.opening_balance.toString())),
    zero
  );

  // Compute dynamic Cash transactions (Inflows and Outflows)
  let bankReceiveTotal = zero;
  let bankIncomingTransferTotal = zero;
  let bankPaymentTotal = zero;
  if (typeof prismaClient.transaction?.aggregate === 'function' && cashAccounts.length > 0) {
    const cashIds = cashAccounts.map((a) => a.id);
    const receiveAgg = await prismaClient.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: { in: cashIds },
        form: 'RECEIVE_MONEY'
      },
      _sum: { total_amount: true }
    });
    if (receiveAgg._sum?.total_amount) {
      bankReceiveTotal = new Prisma.Decimal(receiveAgg._sum.total_amount.toString());
    }

    const paymentAgg = await prismaClient.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: { in: cashIds },
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (paymentAgg._sum?.total_amount) {
      bankPaymentTotal = new Prisma.Decimal(paymentAgg._sum.total_amount.toString());
    }
  }

  // Incoming internal cash transfers (PAYMENT_CHARGE from CASH targeting CASH) restore destination cash (F-11, BR-02)
  if (typeof prismaClient.allocationLine?.aggregate === 'function' && cashAccounts.length > 0) {
    const cashIds = cashAccounts.map((a) => a.id);
    const transferAgg = await prismaClient.allocationLine.aggregate({
      where: {
        target_account_id: { in: cashIds },
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
      bankIncomingTransferTotal = new Prisma.Decimal(transferAgg._sum.amount.toString());
    }
  }

  const finalBankBalance = bankOpeningDecimal
    .add(bankReceiveTotal)
    .add(bankIncomingTransferTotal)
    .sub(bankPaymentTotal);

  // Compute dynamic Credit Card Debt (Charges on LOAN_TAKEN accounts minus repayments) (BR-04, BR-07)
  if (typeof prismaClient.transaction?.aggregate === 'function' && loanTakenAccounts.length > 0) {
    const loanTakenIds = loanTakenAccounts.map((a) => a.id);
    const chargeAgg = await prismaClient.transaction.aggregate({
      where: {
        user_id: userId,
        primary_account_id: { in: loanTakenIds },
        form: 'PAYMENT_CHARGE'
      },
      _sum: { total_amount: true }
    });
    if (chargeAgg._sum?.total_amount) {
      creditDebtDecimal = creditDebtDecimal.add(new Prisma.Decimal(chargeAgg._sum.total_amount.toString()));
    }
  }

  // Settlements/repayments targeting LOAN_TAKEN accounts decrease debt (BR-07, WP-05, F-13)
  if (typeof prismaClient.allocationLine?.aggregate === 'function' && loanTakenAccounts.length > 0) {
    const loanTakenIds = loanTakenAccounts.map((a) => a.id);
    const settlementAgg = await prismaClient.allocationLine.aggregate({
      where: {
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE',
          primary_account: {
            type: 'CASH',
            user_id: userId
          }
        },
        target_account_id: { in: loanTakenIds },
        target_account: {
          type: 'LOAN_TAKEN',
          user_id: userId
        }
      },
      _sum: { amount: true }
    });
    if (settlementAgg._sum?.amount) {
      creditDebtDecimal = creditDebtDecimal.sub(new Prisma.Decimal(settlementAgg._sum.amount.toString()));
    }

    // General Loan Borrowings (RECEIVE_MONEY on CASH targeting LOAN_TAKEN) increase liability debt (F-13, BR-08)
    const borrowingAgg = await prismaClient.allocationLine.aggregate({
      where: {
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY',
          primary_account: {
            type: 'CASH',
            user_id: userId
          }
        },
        target_account_id: { in: loanTakenIds },
        target_account: {
          type: 'LOAN_TAKEN',
          user_id: userId
        }
      },
      _sum: { amount: true }
    });
    if (borrowingAgg._sum?.amount) {
      creditDebtDecimal = creditDebtDecimal.add(new Prisma.Decimal(borrowingAgg._sum.amount.toString()));
    }
  }

  // Compute total_income strictly from allocation lines belonging to RECEIVE_MONEY transactions
  // targeting INCOME accounts owned by the authenticated tenant (BR-02, BR-03)
  let totalIncomeDecimal = zero;
  if (typeof prismaClient.allocationLine?.aggregate === 'function') {
    const incomeAgg = await prismaClient.allocationLine.aggregate({
      where: {
        transaction: {
          user_id: userId,
          form: 'RECEIVE_MONEY'
        },
        target_account: { type: 'INCOME', user_id: userId }
      },
      _sum: { amount: true }
    });
    if (incomeAgg._sum?.amount) {
      totalIncomeDecimal = new Prisma.Decimal(incomeAgg._sum.amount.toString());
    }
  }

  // Compute total_expense strictly from allocation lines belonging to PAYMENT_CHARGE transactions
  // targeting EXPENSE accounts owned by the authenticated tenant (BR-04, BR-08)
  let totalExpenseDecimal = zero;
  if (typeof prismaClient.allocationLine?.aggregate === 'function') {
    const expenseAgg = await prismaClient.allocationLine.aggregate({
      where: {
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE'
        },
        target_account: { type: 'EXPENSE', user_id: userId }
      },
      _sum: { amount: true }
    });
    if (expenseAgg._sum?.amount) {
      totalExpenseDecimal = new Prisma.Decimal(expenseAgg._sum.amount.toString());
    }
  }

  // Compute Category Breakdown (Issue #7 requirement)
  const categoryBreakdown: Record<string, number> = {};
  const categories: Array<{ name: string; amount: number }> = [];

  if (typeof prismaClient.allocationLine?.findMany === 'function') {
    const expenseLines = await prismaClient.allocationLine.findMany({
      where: {
        transaction: {
          user_id: userId,
          form: 'PAYMENT_CHARGE'
        },
        target_account: {
          type: 'EXPENSE',
          user_id: userId
        }
      },
      include: {
        target_account: {
          select: { name: true }
        }
      }
    });

    const categoryMap = new Map<string, Prisma.Decimal>();
    for (const line of expenseLines) {
      const catName = line.target_account?.name || 'Uncategorized';
      const current = categoryMap.get(catName) || zero;
      categoryMap.set(catName, current.add(new Prisma.Decimal(line.amount.toString())));
    }

    for (const [name, amountDec] of categoryMap.entries()) {
      const formatted = Number(amountDec.toFixed(2));
      categoryBreakdown[name] = formatted;
      categories.push({ name, amount: formatted });
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    bank_balance: Number(finalBankBalance.toFixed(2)),
    credit_debt: Number(creditDebtDecimal.toFixed(2)),
    total_income: Number(totalIncomeDecimal.toFixed(2)),
    total_expense: Number(totalExpenseDecimal.toFixed(2)),
    category_breakdown: categoryBreakdown,
    categories
  };
}

/**
 * Service function: Retrieves chronological transaction history for authenticated tenant.
 * Ordered by transaction_date DESC, created_at DESC (AC-09-1, FR-11).
 */
export async function getTransactionHistory(
  userId: string,
  prismaClient: PrismaClient = defaultPrisma
): Promise<TransactionHistoryRecord[]> {
  const transactions = await prismaClient.transaction.findMany({
    where: { user_id: userId },
    include: {
      primary_account: {
        select: {
          id: true,
          name: true,
          type: true
        }
      },
      allocation_lines: {
        include: {
          target_account: {
            select: {
              id: true,
              name: true,
              type: true
            }
          }
        },
        orderBy: {
          id: 'asc'
        }
      }
    },
    orderBy: [
      { transaction_date: 'desc' },
      { created_at: 'desc' }
    ]
  });

  return transactions.map((t) => {
    let dateStr = '';
    if (t.transaction_date instanceof Date) {
      dateStr = t.transaction_date.toISOString().split('T')[0];
    } else if (typeof t.transaction_date === 'string') {
      dateStr = (t.transaction_date as string).split('T')[0];
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
        type: t.primary_account.type
      },
      form: t.form as 'PAYMENT_CHARGE' | 'RECEIVE_MONEY',
      total_amount: Number(new Prisma.Decimal(t.total_amount.toString()).toFixed(2)),
      transaction_date: dateStr,
      description: t.description,
      created_at: createdAtStr,
      allocation_lines: (t.allocation_lines || []).map((line) => ({
        id: line.id,
        transaction_id: line.transaction_id,
        target_account_id: line.target_account_id,
        target_account: {
          id: line.target_account.id,
          name: line.target_account.name,
          type: line.target_account.type
        },
        amount: Number(new Prisma.Decimal(line.amount.toString()).toFixed(2)),
        notes: line.notes
      }))
    };
  });
}

export class ReportError extends Error {
  statusCode: number;
  code: string;
  details: any[];

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = 'INVALID_DATE_RANGE',
    details: any[] = []
  ) {
    super(message);
    this.name = 'ReportError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface CategorySpendingItem {
  category_id: string;
  category_name: string;
  total_amount: string;
  percentage: string;
  transaction_count: number;
}

export interface CategorySpendingReportResult {
  total_expense: string;
  categories: CategorySpendingItem[];
}

export interface CategorySpendingQuery {
  startDate?: unknown;
  endDate?: unknown;
}

function parseReportCalendarDate(raw: unknown, fieldName: string): Date {
  if (typeof raw !== 'string') {
    throw new ReportError(`${fieldName} must be a valid YYYY-MM-DD calendar date.`, 400, 'INVALID_DATE_RANGE');
  }
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ReportError(`${fieldName} must be in YYYY-MM-DD format.`, 400, 'INVALID_DATE_RANGE');
  }
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new ReportError(`${fieldName} is not a valid calendar date.`, 400, 'INVALID_DATE_RANGE');
  }
  return utc;
}

/**
 * Computes category-wise EXPENSE spending summaries for a tenant within an optional date range (F-17, FR-20).
 * Strictly excludes opening balances (BR-02), internal cash transfers (F-11, BR-02),
 * credit card repayments (F-07, BR-08), and loan principal flows (F-12, F-13, BR-08).
 */
export async function getCategorySpendingReport(
  userId: string,
  query: CategorySpendingQuery = {},
  prismaClient: PrismaClient = defaultPrisma
): Promise<CategorySpendingReportResult> {
  const startDateRaw = query.startDate !== undefined && query.startDate !== '' ? query.startDate : undefined;
  const endDateRaw = query.endDate !== undefined && query.endDate !== '' ? query.endDate : undefined;

  let startDateObj: Date | undefined;
  let endDateObj: Date | undefined;

  if (startDateRaw !== undefined) {
    startDateObj = parseReportCalendarDate(startDateRaw, 'startDate');
  }
  if (endDateRaw !== undefined) {
    endDateObj = parseReportCalendarDate(endDateRaw, 'endDate');
  }
  if (startDateObj && endDateObj && startDateObj.getTime() > endDateObj.getTime()) {
    throw new ReportError('startDate must be less than or equal to endDate.', 400, 'INVALID_DATE_RANGE');
  }

  const transactionDateFilter =
    startDateObj || endDateObj
      ? {
          ...(startDateObj ? { gte: startDateObj } : {}),
          ...(endDateObj ? { lte: endDateObj } : {})
        }
      : undefined;

  const lines = await prismaClient.allocationLine.findMany({
    where: {
      target_account: {
        type: 'EXPENSE',
        user_id: userId
      },
      transaction: {
        user_id: userId,
        form: 'PAYMENT_CHARGE',
        ...(transactionDateFilter ? { transaction_date: transactionDateFilter } : {})
      }
    },
    select: {
      transaction_id: true,
      target_account_id: true,
      amount: true,
      target_account: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  const zero = new Prisma.Decimal('0.00');
  const categoryMap = new Map<
    string,
    {
      category_id: string;
      category_name: string;
      totalDecimal: Prisma.Decimal;
      transactionIds: Set<string>;
    }
  >();

  let totalExpenseDecimal = zero;

  for (const line of lines) {
    const amountDecimal = new Prisma.Decimal(line.amount.toString());
    totalExpenseDecimal = totalExpenseDecimal.add(amountDecimal);

    const categoryId = line.target_account?.id ?? line.target_account_id;
    const categoryName = line.target_account?.name ?? 'Unknown Category';
    const existing = categoryMap.get(categoryId);
    if (existing) {
      existing.totalDecimal = existing.totalDecimal.add(amountDecimal);
      existing.transactionIds.add(line.transaction_id);
    } else {
      categoryMap.set(categoryId, {
        category_id: categoryId,
        category_name: categoryName,
        totalDecimal: amountDecimal,
        transactionIds: new Set([line.transaction_id])
      });
    }
  }

  const sortedEntries = Array.from(categoryMap.values()).sort((a, b) => {
    const cmp = b.totalDecimal.comparedTo(a.totalDecimal);
    if (cmp !== 0) return cmp;
    return a.category_name.localeCompare(b.category_name);
  });

  const categories: CategorySpendingItem[] = sortedEntries.map((entry) => {
    const percentageDecimal = totalExpenseDecimal.gt(zero)
      ? entry.totalDecimal.mul(100).div(totalExpenseDecimal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : zero;
    return {
      category_id: entry.category_id,
      category_name: entry.category_name,
      total_amount: entry.totalDecimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
      percentage: percentageDecimal.toFixed(2),
      transaction_count: entry.transactionIds.size
    };
  });

  return {
    total_expense: totalExpenseDecimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2),
    categories
  };
}
