import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockAccounts,
  mockAllocationLines,
  mockTransactions,
  resetMockAccounts,
  resetMockTransactions
} from '../fixtures/mockPrisma.js';

vi.mock('../../src/prisma.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }) => findMockUser(where))
      },
      allocationLine: {
        findMany: vi.fn(async ({ where }: any) => {
          return mockAllocationLines
            .filter((line) => {
              const tx = mockTransactions.find((t) => t.id === line.transaction_id);
              const target = mockAccounts.find((a) => a.id === line.target_account_id);
              if (!tx || !target) return false;
              if (where?.target_account?.type && target.type !== where.target_account.type) return false;
              if (where?.target_account?.user_id && target.user_id !== where.target_account.user_id) return false;
              if (where?.transaction?.user_id && tx.user_id !== where.transaction.user_id) return false;
              if (where?.transaction?.form && tx.form !== where.transaction.form) return false;
              if (where?.transaction?.transaction_date) {
                const txTime =
                  tx.transaction_date instanceof Date
                    ? tx.transaction_date.getTime()
                    : new Date(tx.transaction_date).getTime();
                if (where.transaction.transaction_date.gte && txTime < where.transaction.transaction_date.gte.getTime()) {
                  return false;
                }
                if (where.transaction.transaction_date.lte && txTime > where.transaction.transaction_date.lte.getTime()) {
                  return false;
                }
              }
              return true;
            })
            .map((line) => {
              const target = mockAccounts.find((a) => a.id === line.target_account_id)!;
              return {
                ...line,
                target_account: {
                  id: target.id,
                  name: target.name,
                  type: target.type
                }
              };
            });
        })
      }
    }
  };
});

import { app } from '../../src/app.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

function makeAuthCookie(user: { id: string; username: string; role: string }) {
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
  return `token=${token}`;
}

function seedGoldenExpenses() {
  mockTransactions.push({
    id: 'tx-expense-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-cc',
    form: 'PAYMENT_CHARGE',
    total_amount: new Prisma.Decimal('3000.00'),
    transaction_date: new Date('2026-11-05'),
    description: 'Dinner and groceries',
    created_at: new Date('2026-11-05T12:00:00Z')
  });
  mockAllocationLines.push(
    {
      id: 'line-exp-dining',
      transaction_id: 'tx-expense-1',
      target_account_id: 'acc-demo-dining',
      amount: new Prisma.Decimal('1000.00'),
      notes: null
    },
    {
      id: 'line-exp-grocery',
      transaction_id: 'tx-expense-1',
      target_account_id: 'acc-demo-grocery',
      amount: new Prisma.Decimal('2000.00'),
      notes: null
    }
  );
}

describe('Integration Test: Category Spending Reports (F-17, TEST-REP-CAT-01..04)', () => {
  const userDemoCookie = makeAuthCookie({
    id: 'user-a-uuid',
    username: 'user_demo',
    role: 'USER'
  });
  const otherUserCookie = makeAuthCookie({
    id: 'user-b-uuid',
    username: 'user_other',
    role: 'USER'
  });
  const adminCookie = makeAuthCookie({
    id: 'admin-uuid',
    username: 'admin_demo',
    role: 'ADMIN'
  });

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();
    seedGoldenExpenses();
  });

  it('TEST-REP-CAT-01: computes accurate category totals, counts, ROUND_HALF_UP percentages, and deterministic ordering', async () => {
    // 1. Golden Journey totals: Grocery 2000 (66.67%), Dining 1000 (33.33%), total 3000.00
    const res = await request(app)
      .get('/api/reports/categories')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.period).toEqual({ start_date: null, end_date: null });
    expect(res.body.data.total_expense).toBe('3000.00');
    expect(res.body.data.categories).toEqual([
      {
        category_id: 'acc-demo-grocery',
        category_name: 'Grocery',
        total_amount: '2000.00',
        percentage: '66.67',
        transaction_count: 1
      },
      {
        category_id: 'acc-demo-dining',
        category_name: 'Dining',
        total_amount: '1000.00',
        percentage: '33.33',
        transaction_count: 1
      }
    ]);

    // 2. Add Coffee (1000.00) -> ties with Dining on 1000.00 (25.00%), Coffee sorts before Dining alphabetically
    // Also add 0.005 rounding check via Utilities 0.05 on 2000? Keep exact 4000.00 tie-break: Grocery 2000 (50.00%), Coffee 1000 (25.00%), Dining 1000 (25.00%)
    mockAccounts.push({
      id: 'acc-coffee-1',
      user_id: 'user-a-uuid',
      name: 'Coffee',
      normalized_name: 'coffee',
      type: 'EXPENSE',
      subtype: 'DEFAULT',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date('2026-11-01T00:00:00Z'),
      updated_at: new Date('2026-11-01T00:00:00Z')
    });
    mockTransactions.push({
      id: 'tx-coffee-1',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-06'),
      description: 'Coffee beans',
      created_at: new Date('2026-11-06T09:00:00Z')
    });
    mockAllocationLines.push({
      id: 'line-coffee-1',
      transaction_id: 'tx-coffee-1',
      target_account_id: 'acc-coffee-1',
      amount: new Prisma.Decimal('1000.00'),
      notes: null
    });

    const tieRes = await request(app)
      .get('/api/reports/categories')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(tieRes.status).toBe(200);
    expect(tieRes.body.data.total_expense).toBe('4000.00');
    expect(tieRes.body.data.categories.map((c: any) => c.category_name)).toEqual([
      'Grocery',
      'Coffee',
      'Dining'
    ]);
    expect(tieRes.body.data.categories.map((c: any) => c.percentage)).toEqual(['50.00', '25.00', '25.00']);
  });

  it('TEST-REP-CAT-02: strictly excludes opening balances, income, internal transfers, CC repayments, and loan flows', async () => {
    // Non-zero opening balances on CASH / LOAN_TAKEN / LOAN_GIVEN
    mockAccounts.find((a) => a.id === 'acc-demo-checking')!.opening_balance = new Prisma.Decimal('50000.00');
    mockAccounts.push(
      {
        id: 'acc-demo-savings',
        user_id: 'user-a-uuid',
        name: 'Savings Bank',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('10000.00'),
        is_opening_locked: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-demo-loan-given',
        user_id: 'user-a-uuid',
        name: 'Friend Loan',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('1000.00'),
        is_opening_locked: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-demo-gen-loan',
        user_id: 'user-a-uuid',
        name: 'Bank Personal Loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('2000.00'),
        is_opening_locked: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    // 1. Income (F-04)
    mockTransactions.push({
      id: 'tx-inc',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      transaction_date: new Date('2026-11-02'),
      description: 'Salary',
      created_at: new Date()
    });
    mockAllocationLines.push({
      id: 'l-inc',
      transaction_id: 'tx-inc',
      target_account_id: 'acc-demo-salary',
      amount: new Prisma.Decimal('20000.00'),
      notes: null
    });

    // 2. Internal cash transfer (F-11)
    mockTransactions.push({
      id: 'tx-xfer',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('5000.00'),
      transaction_date: new Date('2026-11-03'),
      description: 'Transfer to Savings',
      created_at: new Date()
    });
    mockAllocationLines.push({
      id: 'l-xfer',
      transaction_id: 'tx-xfer',
      target_account_id: 'acc-demo-savings',
      amount: new Prisma.Decimal('5000.00'),
      notes: null
    });

    // 3. CC Repayment (F-07)
    mockTransactions.push({
      id: 'tx-repay',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      transaction_date: new Date('2026-11-04'),
      description: 'CC Repayment',
      created_at: new Date()
    });
    mockAllocationLines.push({
      id: 'l-repay',
      transaction_id: 'tx-repay',
      target_account_id: 'acc-demo-cc',
      amount: new Prisma.Decimal('3000.00'),
      notes: null
    });

    // 4. Loan Given Disbursement & Recovery (F-12)
    mockTransactions.push(
      {
        id: 'tx-lg-out',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1500.00'),
        transaction_date: new Date('2026-11-05'),
        description: 'Lend to friend',
        created_at: new Date()
      },
      {
        id: 'tx-lg-in',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('500.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Loan recovery',
        created_at: new Date()
      }
    );
    mockAllocationLines.push(
      { id: 'l-lg-out', transaction_id: 'tx-lg-out', target_account_id: 'acc-demo-loan-given', amount: new Prisma.Decimal('1500.00'), notes: null },
      { id: 'l-lg-in', transaction_id: 'tx-lg-in', target_account_id: 'acc-demo-loan-given', amount: new Prisma.Decimal('500.00'), notes: null }
    );

    // 5. General Loan Borrowing & Repayment (F-13)
    mockTransactions.push(
      {
        id: 'tx-gl-in',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('4000.00'),
        transaction_date: new Date('2026-11-07'),
        description: 'Borrow general loan',
        created_at: new Date()
      },
      {
        id: 'tx-gl-out',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-08'),
        description: 'Repay general loan',
        created_at: new Date()
      }
    );
    mockAllocationLines.push(
      { id: 'l-gl-in', transaction_id: 'tx-gl-in', target_account_id: 'acc-demo-gen-loan', amount: new Prisma.Decimal('4000.00'), notes: null },
      { id: 'l-gl-out', transaction_id: 'tx-gl-out', target_account_id: 'acc-demo-gen-loan', amount: new Prisma.Decimal('1000.00'), notes: null }
    );

    const res = await request(app)
      .get('/api/reports/categories')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(res.status).toBe(200);
    // Still strictly 3000.00 (only Dining 1000 + Grocery 2000)
    expect(res.body.data.total_expense).toBe('3000.00');
    expect(res.body.data.categories).toHaveLength(2);
  });

  it('TEST-REP-CAT-03: filters accurately by inclusive date boundaries and rejects invalid date ranges with 400 INVALID_DATE_RANGE', async () => {
    // Add late-November expense outside [2026-11-01, 2026-11-10]
    mockTransactions.push({
      id: 'tx-late-nov',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('500.00'),
      transaction_date: new Date('2026-11-25'),
      description: 'Late dinner',
      created_at: new Date('2026-11-25T18:00:00Z')
    });
    mockAllocationLines.push({
      id: 'line-late-nov',
      transaction_id: 'tx-late-nov',
      target_account_id: 'acc-demo-dining',
      amount: new Prisma.Decimal('500.00'),
      notes: null
    });

    // Inclusive boundary check: [2026-11-05, 2026-11-05] matches tx-expense-1 (2026-11-05), excludes 2026-11-25
    const filtered = await request(app)
      .get('/api/reports/categories?startDate=2026-11-05&endDate=2026-11-05')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.period).toEqual({
      start_date: '2026-11-05',
      end_date: '2026-11-05'
    });
    expect(filtered.body.data.total_expense).toBe('3000.00');

    const inverted = await request(app)
      .get('/api/reports/categories?startDate=2026-11-20&endDate=2026-11-01')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(inverted.status).toBe(400);
    expect(inverted.body.error.code).toBe('INVALID_DATE_RANGE');

    const malformed = await request(app)
      .get('/api/reports/categories?startDate=2026-02-30&endDate=2026-03-01')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('TEST-REP-CAT-04: enforces tenant isolation (BR-01) and blocks ADMIN access with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN (BR-10)', async () => {
    const otherRes = await request(app)
      .get('/api/reports/categories')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', otherUserCookie);

    expect(otherRes.status).toBe(200);
    expect(otherRes.body.data.total_expense).toBe('0.00');
    expect(otherRes.body.data.categories).toEqual([]);

    const adminRes = await request(app)
      .get('/api/reports/categories')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', adminCookie);

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
  });

  it('TEST-REP-CAT-01B: applies exact Decimal ROUND_HALF_UP for half-cent percentage ties (1/32 = 3.125% -> 3.13, 31/32 = 96.875% -> 96.88)', async () => {
    resetMockTransactions();
    mockTransactions.push({
      id: 'tx-half-up',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('32.00'),
      transaction_date: new Date('2026-11-10'),
      description: 'Exact half-up tie check',
      created_at: new Date('2026-11-10T10:00:00Z')
    });
    mockAllocationLines.push(
      {
        id: 'line-half-up-major',
        transaction_id: 'tx-half-up',
        target_account_id: 'acc-demo-grocery',
        amount: new Prisma.Decimal('31.00'),
        notes: null
      },
      {
        id: 'line-half-up-minor',
        transaction_id: 'tx-half-up',
        target_account_id: 'acc-demo-dining',
        amount: new Prisma.Decimal('1.00'),
        notes: null
      }
    );

    const res = await request(app)
      .get('/api/reports/categories')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.total_expense).toBe('32.00');
    expect(res.body.data.categories).toEqual([
      {
        category_id: 'acc-demo-grocery',
        category_name: 'Grocery',
        total_amount: '31.00',
        percentage: '96.88',
        transaction_count: 1
      },
      {
        category_id: 'acc-demo-dining',
        category_name: 'Dining',
        total_amount: '1.00',
        percentage: '3.13',
        transaction_count: 1
      }
    ]);
  });
});
