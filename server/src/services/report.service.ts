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
  };
  form: 'PAYMENT_CHARGE' | 'RECEIVE_MONEY';
  total_amount: number;
  transaction_date: string;
  description: string | null;
  created_at: string;
  allocation_lines: Array<{
    id: string;
    transaction_id: string;
    target_account_id: string;
    target_account: {
      id: string;
      name: string;
      type: string;
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

  const finalBankBalance = bankOpeningDecimal.add(bankReceiveTotal).sub(bankPaymentTotal);

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

  // Settlements/repayments targeting LOAN_TAKEN accounts decrease debt (BR-07, WP-05)
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
