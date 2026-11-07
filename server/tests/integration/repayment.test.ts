import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockAccounts,
  resetMockAccounts,
  mockTransactions,
  mockAllocationLines,
  resetMockTransactions,
  MockTransactionRecord,
  MockAllocationLineRecord,
  MOCK_UUIDS,
  useMockUuidAccounts
} from '../fixtures/mockPrisma.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign(
    { userId, username, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

// Setup Mock Prisma for repayment integration tests
vi.mock('../../src/prisma.js', () => {
  const txClient = {
    $queryRaw: vi.fn(async () => []),
    account: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          mockAccounts.find((a) => {
            if (where?.id && a.id !== where.id) return false;
            if (where?.user_id && a.user_id !== where.user_id) return false;
            if (where?.type && a.type !== where.type) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where, select, orderBy }) => {
        let list = mockAccounts.filter((a) => {
          if (where?.user_id && a.user_id !== where.user_id) return false;
          if (where?.id?.in && !where.id.in.includes(a.id)) return false;
          if (where?.type && a.type !== where.type) return false;
          return true;
        });
        if (orderBy?.created_at === 'asc') {
          list = [...list].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        }
        if (select?.id && select?.is_opening_locked) {
          return list.map((a) => ({ id: a.id, is_opening_locked: a.is_opening_locked }));
        }
        return list;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const a of mockAccounts) {
          if (typeof where?.id === 'string' && a.id !== where.id) continue;
          if (where?.id?.in && !where.id.in.includes(a.id)) continue;
          if (where?.user_id && a.user_id !== where.user_id) continue;
          if (where?.is_opening_locked !== undefined && a.is_opening_locked !== where.is_opening_locked) {
            continue;
          }
          if (data.is_opening_locked !== undefined) {
            a.is_opening_locked = data.is_opening_locked;
          }
          if (data.opening_balance !== undefined) {
            a.opening_balance = new Prisma.Decimal(data.opening_balance.toString());
          }
          a.updated_at = new Date();
          count++;
        }
        return { count };
      })
    },
    transaction: {
      create: vi.fn(async ({ data }) => {
        const record: MockTransactionRecord = {
          id: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          user_id: data.user_id,
          primary_account_id: data.primary_account_id,
          form: data.form,
          total_amount: new Prisma.Decimal(data.total_amount.toString()),
          transaction_date: data.transaction_date,
          description: data.description || null,
          created_at: new Date()
        };
        mockTransactions.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where }) => {
        return mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          if (where?.primary_account_id && t.primary_account_id !== where.primary_account_id) return false;
          if (where?.primary_account_id?.in && !where.primary_account_id.in.includes(t.primary_account_id)) return false;
          if (where?.form && t.form !== where.form) return false;
          return true;
        });
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matches = mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          if (typeof where?.primary_account_id === 'string' && t.primary_account_id !== where.primary_account_id) {
            return false;
          }
          if (where?.primary_account_id?.in && !where.primary_account_id.in.includes(t.primary_account_id)) {
            return false;
          }
          if (where?.form && t.form !== where.form) return false;
          return true;
        });

        const zero = new Prisma.Decimal('0.00');
        const sumVal = matches.reduce((sum, t) => sum.add(t.total_amount), zero);
        return { _sum: { total_amount: matches.length > 0 ? sumVal : null } };
      }),
      groupBy: vi.fn(async ({ by, where }) => {
        const matches = mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          if (where?.primary_account_id?.in && !where.primary_account_id.in.includes(t.primary_account_id)) {
            return false;
          }
          if (where?.form && t.form !== where.form) return false;
          return true;
        });

        const map = new Map<string, Prisma.Decimal>();
        for (const t of matches) {
          const key = t.primary_account_id;
          const current = map.get(key) || new Prisma.Decimal('0.00');
          map.set(key, current.add(t.total_amount));
        }

        return Array.from(map.entries()).map(([primary_account_id, sumAmount]) => ({
          primary_account_id,
          _sum: { total_amount: sumAmount }
        }));
      })
    },
    allocationLine: {
      create: vi.fn(async ({ data }) => {
        const record: MockAllocationLineRecord = {
          id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          transaction_id: data.transaction_id,
          target_account_id: data.target_account_id,
          amount: new Prisma.Decimal(data.amount.toString()),
          notes: data.notes || null
        };
        mockAllocationLines.push(record);
        return record;
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matches = mockAllocationLines.filter((al) => {
          const parentTxn = mockTransactions.find((t) => t.id === al.transaction_id);
          if (!parentTxn) return false;
          if (where?.transaction?.user_id && parentTxn.user_id !== where.transaction.user_id) {
            return false;
          }
          if (where?.transaction?.form && parentTxn.form !== where.transaction.form) {
            return false;
          }
          if (where?.transaction?.primary_account?.type) {
            const primaryAcc = mockAccounts.find((a) => a.id === parentTxn.primary_account_id);
            if (!primaryAcc || primaryAcc.type !== where.transaction.primary_account.type) return false;
          }
          if (where?.transaction?.primary_account?.user_id) {
            const primaryAcc = mockAccounts.find((a) => a.id === parentTxn.primary_account_id);
            if (!primaryAcc || primaryAcc.user_id !== where.transaction.primary_account.user_id) return false;
          }
          if (typeof where?.target_account_id === 'string' && al.target_account_id !== where.target_account_id) {
            return false;
          }
          if (where?.target_account_id?.in && !where.target_account_id.in.includes(al.target_account_id)) {
            return false;
          }
          const targetAcc = mockAccounts.find((a) => a.id === al.target_account_id);
          if (!targetAcc) return false;
          if (where?.target_account?.type && targetAcc.type !== where.target_account.type) {
            return false;
          }
          if (where?.target_account?.user_id && targetAcc.user_id !== where.target_account.user_id) {
            return false;
          }
          return true;
        });

        const zero = new Prisma.Decimal('0.00');
        const sumVal = matches.reduce((sum, al) => sum.add(al.amount), zero);
        return { _sum: { amount: matches.length > 0 ? sumVal : null } };
      }),
      groupBy: vi.fn(async ({ by, where }) => {
        const matches = mockAllocationLines.filter((al) => {
          const parentTxn = mockTransactions.find((t) => t.id === al.transaction_id);
          if (!parentTxn) return false;
          if (where?.transaction?.user_id && parentTxn.user_id !== where.transaction.user_id) {
            return false;
          }
          if (where?.transaction?.form && parentTxn.form !== where.transaction.form) {
            return false;
          }
          if (where?.transaction?.primary_account?.type) {
            const primaryAcc = mockAccounts.find((a) => a.id === parentTxn.primary_account_id);
            if (!primaryAcc || primaryAcc.type !== where.transaction.primary_account.type) return false;
          }
          if (where?.transaction?.primary_account?.user_id) {
            const primaryAcc = mockAccounts.find((a) => a.id === parentTxn.primary_account_id);
            if (!primaryAcc || primaryAcc.user_id !== where.transaction.primary_account.user_id) return false;
          }
          if (typeof where?.target_account_id === 'string' && al.target_account_id !== where.target_account_id) {
            return false;
          }
          if (where?.target_account_id?.in && !where.target_account_id.in.includes(al.target_account_id)) {
            return false;
          }
          const targetAcc = mockAccounts.find((a) => a.id === al.target_account_id);
          if (!targetAcc) return false;
          if (where?.target_account?.type && targetAcc.type !== where.target_account.type) {
            return false;
          }
          if (where?.target_account?.user_id && targetAcc.user_id !== where.target_account.user_id) {
            return false;
          }
          return true;
        });

        const map = new Map<string, Prisma.Decimal>();
        for (const al of matches) {
          const key = al.target_account_id;
          const current = map.get(key) || new Prisma.Decimal('0.00');
          map.set(key, current.add(al.amount));
        }

        return Array.from(map.entries()).map(([target_account_id, sumAmount]) => ({
          target_account_id,
          _sum: { amount: sumAmount }
        }));
      })
    }
  };

  const prismaMock = {
    $transaction: vi.fn(async (callback) => {
      return callback(txClient);
    }),
    user: {
      findFirst: vi.fn(async ({ where }) => {
        if (where?.OR) {
          for (const cond of where.OR) {
            const u = findMockUser(cond);
            if (u) return u;
          }
        }
        return null;
      }),
      findUnique: vi.fn(async ({ where }) => findMockUser(where))
    },
    account: txClient.account,
    transaction: txClient.transaction,
    allocationLine: txClient.allocationLine
  };

  return { prisma: prismaMock };
});

import { app } from '../../src/app.js';

describe('Integration Test: Credit Card Debt Settlement (Repayment) (WP-05, F-07)', () => {
  const USER_A_ID = 'user-a-uuid';
  const USER_B_ID = 'user-b-uuid';
  const ADMIN_ID = 'admin-uuid';

  const userACookie = createAuthCookie(USER_A_ID, 'user_demo', 'USER');
  const userBCookie = createAuthCookie(USER_B_ID, 'user_other', 'USER');
  const adminCookie = createAuthCookie(ADMIN_ID, 'admin_demo', 'ADMIN');

  const CHECKING_ID = MOCK_UUIDS.DEMO_CHECKING;
  const CC_ACCOUNT_ID = MOCK_UUIDS.DEMO_CC;
  const SALARY_ID = MOCK_UUIDS.DEMO_SALARY;
  const DINING_ID = MOCK_UUIDS.DEMO_DINING;
  const GROCERY_ID = MOCK_UUIDS.DEMO_GROCERY;

  const OTHER_CHECKING_ID = MOCK_UUIDS.OTHER_CHECKING;
  const OTHER_CC_ID = MOCK_UUIDS.OTHER_CC;

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();
    useMockUuidAccounts();
  });

  /**
   * Helper to set up the Golden Journey state prior to Transaction 3:
   * - Bank account opening balance = 10,000.00 THB
   * - Transaction 1: Income of 20,000.00 THB (Salary -> Bank) => Bank balance = 30,000.00 THB
   * - Transaction 2: Expense of 3,000.00 THB on Credit Card (Dining 1,000 + Grocery 2,000) => CC debt = 3,000.00 THB
   */
  function setupGoldenJourneyPriorToRepayment() {
    const bank = mockAccounts.find((a) => a.id === CHECKING_ID);
    if (bank) {
      bank.opening_balance = new Prisma.Decimal('10000.00');
    }

    // Txn 1: Income 20,000.00 THB
    const t1: MockTransactionRecord = {
      id: 'txn-golden-1',
      user_id: USER_A_ID,
      primary_account_id: CHECKING_ID,
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      transaction_date: new Date('2026-11-05T00:00:00.000Z'),
      description: 'Monthly Salary',
      created_at: new Date('2026-11-05T00:00:00.000Z')
    };
    mockTransactions.push(t1);
    mockAllocationLines.push({
      id: 'alloc-golden-1',
      transaction_id: t1.id,
      target_account_id: SALARY_ID,
      amount: new Prisma.Decimal('20000.00'),
      notes: 'November Salary'
    });

    // Txn 2: Credit Card Purchase 3,000.00 THB
    const t2: MockTransactionRecord = {
      id: 'txn-golden-2',
      user_id: USER_A_ID,
      primary_account_id: CC_ACCOUNT_ID,
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      transaction_date: new Date('2026-11-06T00:00:00.000Z'),
      description: 'Dinner & Groceries',
      created_at: new Date('2026-11-06T00:00:00.000Z')
    };
    mockTransactions.push(t2);
    mockAllocationLines.push({
      id: 'alloc-golden-2a',
      transaction_id: t2.id,
      target_account_id: DINING_ID,
      amount: new Prisma.Decimal('1000.00'),
      notes: 'Dinner'
    });
    mockAllocationLines.push({
      id: 'alloc-golden-2b',
      transaction_id: t2.id,
      target_account_id: GROCERY_ID,
      amount: new Prisma.Decimal('2000.00'),
      notes: 'Groceries'
    });
  }

  describe('TEST-REPAY-01: Full Credit Card Repayment (AC-07-1, BR-07)', () => {
    it('records repayment of 3000.00 THB from Bank to Credit Card, reducing Bank to 27000.00 and CC Debt to 0.00', async () => {
      setupGoldenJourneyPriorToRepayment();

      const payload = {
        from_account_id: CHECKING_ID,
        to_account_id: CC_ACCOUNT_ID,
        amount: 3000.00,
        transaction_date: '2026-11-06',
        description: 'Settle November Credit Card Balance'
      };

      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const { transaction, updated_cash_balance, updated_debt } = res.body.data;
      expect(transaction).toBeDefined();
      expect(transaction.primary_account_id).toBe(CHECKING_ID);
      expect(transaction.form).toBe('PAYMENT_CHARGE');
      expect(transaction.total_amount).toBe('3000.00');
      expect(transaction.allocations).toHaveLength(1);
      expect(transaction.allocations[0].target_account_id).toBe(CC_ACCOUNT_ID);
      expect(transaction.allocations[0].amount).toBe('3000.00');

      expect(updated_cash_balance).toBe('27000.00');
      expect(updated_debt).toBe('0.00');

      // Verify opening balances are atomically locked on both accounts
      const bankAcc = mockAccounts.find((a) => a.id === CHECKING_ID);
      const ccAcc = mockAccounts.find((a) => a.id === CC_ACCOUNT_ID);
      expect(bankAcc?.is_opening_locked).toBe(true);
      expect(ccAcc?.is_opening_locked).toBe(true);
    });
  });

  describe('TEST-REPAY-02: Expense Exclusion Invariant Verification (AC-07-2, BR-08)', () => {
    it('verifies that Expense Summary remains unchanged at 3000.00 THB after debt repayment', async () => {
      setupGoldenJourneyPriorToRepayment();

      // Submit repayment of 3000.00 THB
      const repayRes = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 3000.00,
          transaction_date: '2026-11-06',
          description: 'Settle Credit Card'
        });

      expect(repayRes.status).toBe(201);

      // Query GET /api/reports/summary
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);

      const summary = summaryRes.body.data;
      // In accordance with BR-08: repayment targets LOAN_TAKEN and is strictly excluded from total_expense
      expect(Number(summary.total_expense)).toBe(3000.00);
      expect(Number(summary.total_income)).toBe(20000.00);
      expect(Number(summary.credit_debt)).toBe(0.00);
      expect(Number(summary.bank_balance)).toBe(27000.00);
          });
  });

  describe('TEST-REPAY-03: Repayment Exceeding Outstanding Debt (AC-07-4)', () => {
    it('rejects repayment request of 3500.00 THB when outstanding debt is 3000.00 THB with HTTP 422 REPAYMENT_EXCEEDS_DEBT', async () => {
      // Dedicated fixture: Bank = 5000.00, Debt = 3000.00
      const bank = mockAccounts.find((a) => a.id === CHECKING_ID);
      if (bank) {
        bank.opening_balance = new Prisma.Decimal('5000.00');
      }
      const t = {
        id: 'txn-fixture-debt',
        user_id: USER_A_ID,
        primary_account_id: CC_ACCOUNT_ID,
        form: 'PAYMENT_CHARGE' as const,
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-06T00:00:00.000Z'),
        description: 'Existing purchase',
        created_at: new Date('2026-11-06T00:00:00.000Z')
      };
      mockTransactions.push(t);
      mockAllocationLines.push({
        id: 'alloc-fixture-debt',
        transaction_id: t.id,
        target_account_id: DINING_ID,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Dining'
      });

      const initialTxnCount = mockTransactions.length;
      const initialAllocCount = mockAllocationLines.length;

      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 3500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');

      // Verify zero records written and balances unchanged
      expect(mockTransactions.length).toBe(initialTxnCount);
      expect(mockAllocationLines.length).toBe(initialAllocCount);
    });
  });

  describe('TEST-REPAY-04: Insufficient Funds in Source Cash Account (AC-07-5)', () => {
    it('rejects repayment request of 30000.00 THB when Bank funds are 27000.00 THB with HTTP 422 INSUFFICIENT_FUNDS', async () => {
      // Dedicated fixture: Bank = 27000.00, Debt = 50000.00
      const bank = mockAccounts.find((a) => a.id === CHECKING_ID);
      if (bank) {
        bank.opening_balance = new Prisma.Decimal('27000.00');
      }
      const t = {
        id: 'txn-fixture-bigdebt',
        user_id: USER_A_ID,
        primary_account_id: CC_ACCOUNT_ID,
        form: 'PAYMENT_CHARGE' as const,
        total_amount: new Prisma.Decimal('50000.00'),
        transaction_date: new Date('2026-11-06T00:00:00.000Z'),
        description: 'Big purchase',
        created_at: new Date('2026-11-06T00:00:00.000Z')
      };
      mockTransactions.push(t);
      mockAllocationLines.push({
        id: 'alloc-fixture-bigdebt',
        transaction_id: t.id,
        target_account_id: DINING_ID,
        amount: new Prisma.Decimal('50000.00'),
        notes: 'Big Dining'
      });

      const initialTxnCount = mockTransactions.length;
      const initialAllocCount = mockAllocationLines.length;

      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 30000.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Verify zero records written and balances unchanged
      expect(mockTransactions.length).toBe(initialTxnCount);
      expect(mockAllocationLines.length).toBe(initialAllocCount);
    });
  });

  describe('TEST-REPAY-05: Partial Repayment (AC-07-3)', () => {
    it('records partial repayment of 1500.00 THB against 3000.00 THB debt, reducing debt to 1500.00 and bank to 25500.00', async () => {
      // Dedicated fixture: Bank = 27000.00, Debt = 3000.00
      const bank = mockAccounts.find((a) => a.id === CHECKING_ID);
      if (bank) {
        bank.opening_balance = new Prisma.Decimal('27000.00');
      }
      const t = {
        id: 'txn-fixture-partial',
        user_id: USER_A_ID,
        primary_account_id: CC_ACCOUNT_ID,
        form: 'PAYMENT_CHARGE' as const,
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-06T00:00:00.000Z'),
        description: 'Purchase to partially settle',
        created_at: new Date('2026-11-06T00:00:00.000Z')
      };
      mockTransactions.push(t);
      mockAllocationLines.push({
        id: 'alloc-fixture-partial',
        transaction_id: t.id,
        target_account_id: DINING_ID,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Dining'
      });

      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 1500.00,
          transaction_date: '2026-11-06',
          description: 'Partial repayment'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updated_cash_balance).toBe('25500.00');
      expect(res.body.data.updated_debt).toBe('1500.00');
    });
  });

  describe('TEST-REPAY-06: Non-Positive & Non-Numeric Amount Validation (AC-07-6)', () => {
    it.each([
      { amount: 0, desc: 'zero amount (0)' },
      { amount: -100, desc: 'negative amount (-100)' },
      { amount: -50.25, desc: 'negative decimal (-50.25)' },
      { amount: '0.00', desc: 'zero string ("0.00")' },
      { amount: '-10.00', desc: 'negative string ("-10.00")' },
      { amount: '1000abc', desc: 'alphanumeric string ("1000abc")' },
      { amount: 'abc', desc: 'text string ("abc")' },
      { amount: '1e3', desc: 'exponent notation ("1e3")' },
      { amount: 100.999, desc: 'excess precision (3 decimals)' },
      { amount: '', desc: 'empty string' },
      { amount: null, desc: 'null amount' }
    ])('rejects $desc with HTTP 400 Bad Request INVALID_AMOUNT', async ({ amount }) => {
      const initialTxnCount = mockTransactions.length;

      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_AMOUNT');
      expect(mockTransactions.length).toBe(initialTxnCount);
    });
  });

  describe('Tenancy & Boundary Security Validations (BR-01, BR-10)', () => {
    it('rejects repayment originating from another tenant CASH account with HTTP 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: OTHER_CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects repayment targeting another tenant Credit Card account with HTTP 404 NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: OTHER_CC_ID,
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects repayment when from_account is not CASH with HTTP 400 INVALID_ACCOUNT_TYPE', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: DINING_ID, // EXPENSE account
          to_account_id: CC_ACCOUNT_ID,
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ACCOUNT_TYPE');
    });

    it('rejects repayment when to_account is not LOAN_TAKEN with HTTP 400 INVALID_ACCOUNT_TYPE', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: DINING_ID, // EXPENSE account
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ACCOUNT_TYPE');
    });

    it('rejects ADMIN user attempting to record repayment with HTTP 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN (BR-10)', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', adminCookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    });

    it('rejects unauthenticated request with HTTP 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects missing required fields (missing from_account_id) with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          to_account_id: CC_ACCOUNT_ID,
          amount: 500.00,
          transaction_date: '2026-11-06'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects missing transaction_date with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/transactions/repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie)
        .send({
          from_account_id: CHECKING_ID,
          to_account_id: CC_ACCOUNT_ID,
          amount: 500.00
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
