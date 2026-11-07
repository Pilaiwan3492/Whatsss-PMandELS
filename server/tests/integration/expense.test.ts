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

// Setup Mock Prisma for expense integration tests
vi.mock('../../src/prisma.js', () => {
  const txClient = {
    account: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          mockAccounts.find((a) => {
            if (where?.id && a.id !== where.id) return false;
            if (where?.user_id && a.user_id !== where.user_id) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where, select, orderBy }) => {
        let list = mockAccounts.filter((a) => {
          if (where?.user_id && a.user_id !== where.user_id) return false;
          if (where?.id?.in && !where.id.in.includes(a.id)) return false;
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

describe('Integration Test: Credit Card Purchase & Split Allocation (WP-04, F-05, F-06)', () => {
  const USER_A_ID = 'user-a-uuid';
  const USER_B_ID = 'user-b-uuid';
  const ADMIN_ID = 'admin-uuid';

  const userACookie = createAuthCookie(USER_A_ID, 'user_demo', 'USER');
  const userBCookie = createAuthCookie(USER_B_ID, 'user_other', 'USER');
  const adminCookie = createAuthCookie(ADMIN_ID, 'admin_demo', 'ADMIN');

  const CC_ACCOUNT_ID = MOCK_UUIDS.DEMO_CC;
  const DINING_ID = MOCK_UUIDS.DEMO_DINING;
  const GROCERY_ID = MOCK_UUIDS.DEMO_GROCERY;
  const CHECKING_ID = MOCK_UUIDS.DEMO_CHECKING;
  const SALARY_ID = MOCK_UUIDS.DEMO_SALARY;

  const OTHER_CC_ID = MOCK_UUIDS.OTHER_CC;
  const OTHER_DINING_ID = MOCK_UUIDS.OTHER_DINING;

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();
    useMockUuidAccounts();
  });

  describe('TEST-EXP-01 & TEST-ALLOC-01: Successful Purchase & Split Allocation (AC-05-1, AC-06-1, BR-04, BR-05)', () => {
    it('records credit purchase of 3000.00 THB split into Dining (1000.00) and Grocery (2000.00), increases credit debt and expense summary', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 3000.00,
        transaction_date: '2026-11-06',
        description: 'Weekly shopping',
        allocations: [
          { target_account_id: DINING_ID, amount: 1000.00, notes: 'Dinner with team' },
          { target_account_id: GROCERY_ID, amount: 2000.00, notes: 'Supermarket essentials' }
        ]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction).toBeDefined();
      expect(res.body.data.transaction.form).toBe('PAYMENT_CHARGE');
      expect(res.body.data.transaction.total_amount).toBe('3000.00');
      expect(res.body.data.transaction.primary_account_id).toBe(CC_ACCOUNT_ID);
      expect(res.body.data.transaction.transaction_date).toBe('2026-11-06');
      expect(res.body.data.transaction.description).toBe('Weekly shopping');
      expect(res.body.data.transaction.allocations).toHaveLength(2);

      // Verify allocations
      expect(res.body.data.transaction.allocations[0].target_account_id).toBe(DINING_ID);
      expect(res.body.data.transaction.allocations[0].amount).toBe('1000.00');
      expect(res.body.data.transaction.allocations[1].target_account_id).toBe(GROCERY_ID);
      expect(res.body.data.transaction.allocations[1].amount).toBe('2000.00');

      // Verify updated debt
      expect(res.body.data.updated_debt).toBeDefined();
      expect(res.body.data.updated_debt.account_id).toBe(CC_ACCOUNT_ID);
      expect(res.body.data.updated_debt.current_debt).toBe('3000.00');

      // Verify opening balances of CC and expense accounts are atomically locked (AC-03-3)
      const ccAcc = mockAccounts.find((a) => a.id === CC_ACCOUNT_ID);
      const diningAcc = mockAccounts.find((a) => a.id === DINING_ID);
      const groceryAcc = mockAccounts.find((a) => a.id === GROCERY_ID);
      expect(ccAcc?.is_opening_locked).toBe(true);
      expect(diningAcc?.is_opening_locked).toBe(true);
      expect(groceryAcc?.is_opening_locked).toBe(true);

      // Verify financial summary report reflects credit debt and expense totals (BR-04, FR-10)
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.credit_debt).toBe(3000.00);
      expect(summaryRes.body.data.total_expense).toBe(3000.00);
    });

    it('accepts single allocation line equal to total amount', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1500.00,
        transaction_date: '2026-11-06',
        allocations: [
          { target_account_id: DINING_ID, amount: 1500.00, notes: 'Single line dinner' }
        ]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction.allocations).toHaveLength(1);
      expect(res.body.data.transaction.total_amount).toBe('1500.00');
    });
  });

  describe('TEST-EXP-02: Missing Primary Account ID (AC-05-2)', () => {
    it('rejects credit purchase transaction omitting primary_account_id with 400 INVALID_ACCOUNT_ID', async () => {
      const payload = {
        total_amount: 3000.00,
        transaction_date: '2026-11-06',
        allocations: [
          { target_account_id: DINING_ID, amount: 1000.00 },
          { target_account_id: GROCERY_ID, amount: 2000.00 }
        ]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ACCOUNT_ID');
      expect(mockTransactions).toHaveLength(0);
      expect(mockAllocationLines).toHaveLength(0);
    });
  });

  describe('TEST-ALLOC-02: Allocation Sum Mismatch Integrity (AC-06-2, BR-06)', () => {
    it('rejects split purchase with unbalanced allocations (1000 + 1500 != 3000) with 422 ALLOCATION_SUM_MISMATCH', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 3000.00,
        transaction_date: '2026-11-06',
        allocations: [
          { target_account_id: DINING_ID, amount: 1000.00 },
          { target_account_id: GROCERY_ID, amount: 1500.00 }
        ]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ALLOCATION_SUM_MISMATCH');
      expect(res.body.error.message).toContain('Total amount must equal the sum of all allocation lines');
      expect(mockTransactions).toHaveLength(0);
      expect(mockAllocationLines).toHaveLength(0);
    });

    it('rejects allocations sum greater than total amount with 422 ALLOCATION_SUM_MISMATCH', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [
          { target_account_id: DINING_ID, amount: 600.00 },
          { target_account_id: GROCERY_ID, amount: 500.00 }
        ]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ALLOCATION_SUM_MISMATCH');
    });
  });

  describe('Security Boundaries & Tenancy Isolation (TEST-SEC-01, 02, 03, BR-01, BR-09, BR-10)', () => {
    it('TEST-SEC-01 Case 1: rejects cross-tenant primary_account_id with 404 NOT_FOUND', async () => {
      const payload = {
        primary_account_id: OTHER_CC_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockTransactions).toHaveLength(0);
    });

    it('TEST-SEC-01 Case 2: rejects cross-tenant allocation target_account_id with 404 NOT_FOUND', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: OTHER_DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockTransactions).toHaveLength(0);
    });

    it('TEST-SEC-02: rejects unauthenticated request with 401 UNAUTHORIZED', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('TEST-SEC-03: rejects ADMIN request with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', adminCookie)
        .send(payload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    });
  });

  describe('Account Type Validation Invariants', () => {
    it('rejects wrong primary account type (CASH instead of LOAN_TAKEN) with 400 INVALID_PRIMARY_ACCOUNT', async () => {
      const payload = {
        primary_account_id: CHECKING_ID, // Checking Bank is CASH
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PRIMARY_ACCOUNT');
    });

    it('rejects wrong target account type (INCOME instead of EXPENSE) with 400 INVALID_EXPENSE_ACCOUNT', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: SALARY_ID, amount: 1000.00 }] // Salary is INCOME
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_EXPENSE_ACCOUNT');
    });
  });

  describe('Input Validation & Format Rejections', () => {
    it('rejects non-positive total amount (0.00) with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 0.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: 0.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects negative total amount (-500.00) with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: -500.00,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: -500.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects total amount with more than 2 decimal places with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 100.123,
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: DINING_ID, amount: 100.123 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects missing transaction date with 400 INVALID_TRANSACTION_DATE', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        allocations: [{ target_account_id: DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_DATE');
    });

    it('rejects malformed transaction date with 400 INVALID_TRANSACTION_DATE', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: 'invalid-date',
        allocations: [{ target_account_id: DINING_ID, amount: 1000.00 }]
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_DATE');
    });

    it('rejects missing allocations with 400 EMPTY_ALLOCATIONS', async () => {
      const payload = {
        primary_account_id: CC_ACCOUNT_ID,
        total_amount: 1000.00,
        transaction_date: '2026-11-06'
      };

      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMPTY_ALLOCATIONS');
    });
  });
});
