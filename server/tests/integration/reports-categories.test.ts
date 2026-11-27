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

function seedGoldenTransactions() {
  // Income 20000 (excluded from expense report)
  mockTransactions.push({
    id: 'tx-income-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-checking',
    form: 'RECEIVE_MONEY',
    total_amount: new Prisma.Decimal('20000.00'),
    transaction_date: new Date('2026-11-02'),
    description: 'Salary deposit',
    created_at: new Date('2026-11-02T10:00:00Z')
  });
  mockAllocationLines.push({
    id: 'line-income-1',
    transaction_id: 'tx-income-1',
    target_account_id: 'acc-demo-salary',
    amount: new Prisma.Decimal('20000.00'),
    notes: null
  });

  // Expense: Credit Card purchase split Dining 1000 + Grocery 2000
  mockTransactions.push({
    id: 'tx-expense-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-cc',
    form: 'PAYMENT_CHARGE',
    total_amount: new Prisma.Decimal('3000.00'),
    transaction_date: new Date('2026-11-03'),
    description: 'Dinner and groceries',
    created_at: new Date('2026-11-03T12:00:00Z')
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

  // Repayment: Checking Bank -> Visa Credit Card 3000 (excluded from expense report per BR-08)
  mockTransactions.push({
    id: 'tx-repay-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-checking',
    form: 'PAYMENT_CHARGE',
    total_amount: new Prisma.Decimal('3000.00'),
    transaction_date: new Date('2026-11-04'),
    description: 'CC Repayment',
    created_at: new Date('2026-11-04T15:00:00Z')
  });
  mockAllocationLines.push({
    id: 'line-repay-1',
    transaction_id: 'tx-repay-1',
    target_account_id: 'acc-demo-cc',
    amount: new Prisma.Decimal('3000.00'),
    notes: null
  });
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
    seedGoldenTransactions();
  });

  it('TEST-REP-CAT-01: computes accurate period category spending excluding opening balances, income, transfers, repayments, and loans', async () => {
    const res = await request(app)
      .get('/api/reports/categories?startDate=2026-11-01&endDate=2026-11-30')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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
  });

  it('TEST-REP-CAT-02: rejects malformed or inverted date ranges with 400 INVALID_DATE_RANGE', async () => {
    const inverted = await request(app)
      .get('/api/reports/categories?startDate=2026-12-01&endDate=2026-11-01')
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

  it('TEST-REP-CAT-03: applies ROUND_HALF_UP percentage shares and deterministic ordering (total_amount DESC, category_name ASC)', async () => {
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

    const res = await request(app)
      .get('/api/reports/categories?startDate=2026-11-01&endDate=2026-11-30')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.total_expense).toBe('4000.00');
    expect(res.body.data.categories.map((c: any) => c.category_name)).toEqual([
      'Grocery',
      'Coffee',
      'Dining'
    ]);
    expect(res.body.data.categories[0].percentage).toBe('50.00');
    expect(res.body.data.categories[1].percentage).toBe('25.00');
    expect(res.body.data.categories[2].percentage).toBe('25.00');
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
});
