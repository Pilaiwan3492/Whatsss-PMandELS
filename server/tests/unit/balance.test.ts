import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  computeFinancialBalances,
  AccountData,
  TransactionData
} from '../../src/services/report.service.js';

/**
 * Unit Test: Financial Balance & Summary Engine (WP-06, Features F-08, F-09)
 * Target: TEST-BAL-01, AC-08-1, FR-10, BR-02, BR-03, BR-04, BR-07, BR-08, NFR-DATA-01
 */
describe('Unit Test: Financial Balance Calculator Service (TEST-BAL-01, AC-08-1, F-08)', () => {
  const zero = new Prisma.Decimal('0.00');

  // Baseline standard user accounts as defined in seed.ts & test-data.md
  const mockAccounts: AccountData[] = [
    { id: 'acc-checking', name: 'Checking Bank', type: 'CASH', opening_balance: new Prisma.Decimal('10000.00') },
    { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN', opening_balance: new Prisma.Decimal('0.00') },
    { id: 'acc-salary', name: 'Salary', type: 'INCOME', opening_balance: new Prisma.Decimal('0.00') },
    { id: 'acc-dining', name: 'Dining', type: 'EXPENSE', opening_balance: new Prisma.Decimal('0.00') },
    { id: 'acc-grocery', name: 'Grocery', type: 'EXPENSE', opening_balance: new Prisma.Decimal('0.00') }
  ];

  it('TEST-BAL-01 (Baseline): computes opening balance correctly before any transactions occur (BR-02)', () => {
    const summary = computeFinancialBalances({
      accounts: mockAccounts,
      transactions: []
    });

    expect(summary.bank_balance).toBe(10000.00);
    expect(summary.credit_debt).toBe(0.00);
    // BR-02: Opening balances are strictly excluded from income and expense summaries
    expect(summary.total_income).toBe(0.00);
    expect(summary.total_expense).toBe(0.00);
    expect(summary.category_breakdown).toEqual({});
    expect(summary.categories).toEqual([]);
  });

  it('TEST-BAL-01 (Step 2 - Income): salary inflow increases cash balance and income summary (BR-03, AC-04-1)', () => {
    const salaryTx: TransactionData = {
      id: 'tx-salary',
      primary_account_id: 'acc-checking',
      primary_account: { id: 'acc-checking', name: 'Checking Bank', type: 'CASH' },
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      allocation_lines: [
        {
          id: 'line-salary',
          target_account_id: 'acc-salary',
          target_account: { id: 'acc-salary', name: 'Salary', type: 'INCOME' },
          amount: new Prisma.Decimal('20000.00')
        }
      ]
    };

    const summary = computeFinancialBalances({
      accounts: mockAccounts,
      transactions: [salaryTx]
    });

    // 10,000 opening + 20,000 salary = 30,000 bank balance
    expect(summary.bank_balance).toBe(30000.00);
    expect(summary.credit_debt).toBe(0.00);
    expect(summary.total_income).toBe(20000.00);
    expect(summary.total_expense).toBe(0.00);
  });

  it('TEST-BAL-01 (Step 3 - Split Expense): credit card purchase increases credit debt and expense summary (BR-04, AC-05-1, AC-06-1)', () => {
    const salaryTx: TransactionData = {
      id: 'tx-salary',
      primary_account_id: 'acc-checking',
      primary_account: { id: 'acc-checking', name: 'Checking Bank', type: 'CASH' },
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      allocation_lines: [
        {
          id: 'line-salary',
          target_account_id: 'acc-salary',
          target_account: { id: 'acc-salary', name: 'Salary', type: 'INCOME' },
          amount: new Prisma.Decimal('20000.00')
        }
      ]
    };

    const purchaseTx: TransactionData = {
      id: 'tx-purchase',
      primary_account_id: 'acc-cc',
      primary_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN' },
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      allocation_lines: [
        {
          id: 'line-dining',
          target_account_id: 'acc-dining',
          target_account: { id: 'acc-dining', name: 'Dining', type: 'EXPENSE' },
          amount: new Prisma.Decimal('1000.00')
        },
        {
          id: 'line-grocery',
          target_account_id: 'acc-grocery',
          target_account: { id: 'acc-grocery', name: 'Grocery', type: 'EXPENSE' },
          amount: new Prisma.Decimal('2000.00')
        }
      ]
    };

    const summary = computeFinancialBalances({
      accounts: mockAccounts,
      transactions: [salaryTx, purchaseTx]
    });

    expect(summary.bank_balance).toBe(30000.00);
    expect(summary.credit_debt).toBe(3000.00);
    expect(summary.total_income).toBe(20000.00);
    expect(summary.total_expense).toBe(3000.00);
    expect(summary.category_breakdown).toEqual({
      Dining: 1000.00,
      Grocery: 2000.00
    });
  });

  it('TEST-BAL-01 (Golden Journey Complete): verifies exact final figures matching AC-08-1 (Bank 27k, Debt 0, Income 20k, Expense 3k)', () => {
    // 1. Step 2: Salary 20k
    const salaryTx: TransactionData = {
      id: 'tx-salary',
      primary_account_id: 'acc-checking',
      primary_account: { id: 'acc-checking', name: 'Checking Bank', type: 'CASH' },
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      allocation_lines: [
        {
          id: 'line-salary',
          target_account_id: 'acc-salary',
          target_account: { id: 'acc-salary', name: 'Salary', type: 'INCOME' },
          amount: new Prisma.Decimal('20000.00')
        }
      ]
    };

    // 2. Step 3: CC Purchase 3k split Dining 1k + Grocery 2k
    const purchaseTx: TransactionData = {
      id: 'tx-purchase',
      primary_account_id: 'acc-cc',
      primary_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN' },
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      allocation_lines: [
        {
          id: 'line-dining',
          target_account_id: 'acc-dining',
          target_account: { id: 'acc-dining', name: 'Dining', type: 'EXPENSE' },
          amount: new Prisma.Decimal('1000.00')
        },
        {
          id: 'line-grocery',
          target_account_id: 'acc-grocery',
          target_account: { id: 'acc-grocery', name: 'Grocery', type: 'EXPENSE' },
          amount: new Prisma.Decimal('2000.00')
        }
      ]
    };

    // 3. Step 4: CC Repayment 3k from Checking Bank to Visa CC (BR-07, BR-08)
    const repaymentTx: TransactionData = {
      id: 'tx-repayment',
      primary_account_id: 'acc-checking',
      primary_account: { id: 'acc-checking', name: 'Checking Bank', type: 'CASH' },
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      allocation_lines: [
        {
          id: 'line-repay',
          target_account_id: 'acc-cc',
          target_account: { id: 'acc-cc', name: 'Visa Credit Card', type: 'LOAN_TAKEN' },
          amount: new Prisma.Decimal('3000.00')
        }
      ]
    };

    const summary = computeFinancialBalances({
      accounts: mockAccounts,
      transactions: [salaryTx, purchaseTx, repaymentTx]
    });

    // Invariants per AC-08-1:
    // Bank = 10,000 + 20,000 - 3,000 = 27,000.00
    // CC Debt = 0 + 3,000 - 3,000 = 0.00
    // Total Income = 20,000.00 (Salary)
    // Total Expense = 3,000.00 (Dining 1,000 + Grocery 2,000; Repayment strictly excluded per BR-08)
    expect(summary.bank_balance).toBe(27000.00);
    expect(summary.credit_debt).toBe(0.00);
    expect(summary.total_income).toBe(20000.00);
    expect(summary.total_expense).toBe(3000.00);

    // Category breakdown per Issue #7
    expect(summary.category_breakdown['Dining']).toBe(1000.00);
    expect(summary.category_breakdown['Grocery']).toBe(2000.00);
    expect(summary.categories).toEqual([
      { name: 'Dining', amount: 1000.00 },
      { name: 'Grocery', amount: 2000.00 }
    ]);
  });

  it('TEST-BAL-01 (Precision / NFR-DATA-01): preserves exact fractional cents without floating-point IEEE-754 drift', () => {
    const fractionAccounts: AccountData[] = [
      { id: 'acc-c', name: 'Bank', type: 'CASH', opening_balance: new Prisma.Decimal('0.10') },
      { id: 'acc-l', name: 'Card', type: 'LOAN_TAKEN', opening_balance: new Prisma.Decimal('0.00') }
    ];

    const tx1: TransactionData = {
      primary_account_id: 'acc-c',
      primary_account: { id: 'acc-c', name: 'Bank', type: 'CASH' },
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('0.20'),
      allocation_lines: [
        {
          target_account_id: 'acc-inc',
          target_account: { id: 'acc-inc', name: 'Bonus', type: 'INCOME' },
          amount: new Prisma.Decimal('0.20')
        }
      ]
    };

    const summary = computeFinancialBalances({
      accounts: fractionAccounts,
      transactions: [tx1]
    });

    // 0.10 + 0.20 in IEEE-754 is 0.30000000000000004, but Decimal must produce exactly 0.30
    expect(summary.bank_balance).toBe(0.30);
    expect(summary.total_income).toBe(0.20);
  });
});
