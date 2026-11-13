import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockAccounts,
  resetMockAccounts
} from '../fixtures/mockPrisma.js';
import { lockAccounts } from '../../src/services/accountLock.service.js';

// Setup Mock Prisma for integration tests
vi.mock('../../src/prisma.js', () => {
  return {
    prisma: {
      $transaction: vi.fn(async (callback) => {
        return callback(prisma);
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
        findUnique: vi.fn(async ({ where }) => {
          return findMockUser(where);
        })
      },
      account: {
        findMany: vi.fn(async ({ where, orderBy }) => {
          let list = mockAccounts.filter((a) => {
            if (where?.user_id && a.user_id !== where.user_id) return false;
            if (where?.id?.in && !where.id.in.includes(a.id)) return false;
            return true;
          });
          if (orderBy?.created_at === 'asc') {
            list = [...list].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
          }
          return list;
        }),
        findFirst: vi.fn(async ({ where }) => {
          return (
            mockAccounts.find((a) => {
              if (where?.id && a.id !== where.id) return false;
              if (where?.user_id && a.user_id !== where.user_id) return false;
              return true;
            }) || null
          );
        }),
        findUnique: vi.fn(async ({ where }) => {
          return (
            mockAccounts.find((a) => {
              if (where?.id && a.id !== where.id) return false;
              if (where?.user_id_name) {
                if (a.user_id !== where.user_id_name.user_id) return false;
                if (a.name !== where.user_id_name.name) return false;
              }
              return true;
            }) || null
          );
        }),
        updateMany: vi.fn(async ({ where, data }) => {
          let count = 0;
          for (const a of mockAccounts) {
            if (where?.id && a.id !== where.id) continue;
            if (where?.id?.in && !where.id.in.includes(a.id)) continue;
            if (where?.user_id && a.user_id !== where.user_id) continue;
            if (where?.is_opening_locked !== undefined && a.is_opening_locked !== where.is_opening_locked) continue;

            if (data.opening_balance !== undefined) {
              a.opening_balance = data.opening_balance;
            }
            if (data.is_opening_locked !== undefined) {
              a.is_opening_locked = data.is_opening_locked;
            }
            if (data.updated_at) {
              a.updated_at = data.updated_at;
            }
            count++;
          }
          return { count };
        })
      },
      transaction: {
        groupBy: vi.fn(async () => {
          if ((prisma as any).__mockCharges) {
            return (prisma as any).__mockCharges;
          }
          return [];
        }),
        aggregate: vi.fn(async () => {
          if ((prisma as any).__mockAggregate) {
            return (prisma as any).__mockAggregate;
          }
          return { _sum: { total_amount: null } };
        })
      },
      allocationLine: {
        groupBy: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _sum: { amount: null } }))
      }
    }
  };
});

import { app } from '../../src/app.js';
import { prisma } from '../../src/prisma.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign(
    { userId, username, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

describe('Feature F-03: Financial Account Foundation & Opening Balance Lifecycle (WP-02)', () => {
  const userACookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');
  const userBCookie = createAuthCookie('user-b-uuid', 'user_other', 'USER');
  const adminCookie = createAuthCookie('admin-uuid', 'admin_demo', 'ADMIN');

  beforeEach(() => {
    resetMockAccounts();
    vi.clearAllMocks();
  });

  describe('GET /api/accounts (Account Foundation & Seeding)', () => {
    it('returns all 5 seeded accounts for user_demo in ascending order', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.accounts)).toBe(true);
      expect(res.body.data.accounts).toHaveLength(5);

      const names = res.body.data.accounts.map((a: any) => a.name);
      expect(names).toEqual([
        'Checking Bank',
        'Visa Credit Card',
        'Salary',
        'Dining',
        'Grocery'
      ]);

      for (const acc of res.body.data.accounts) {
        expect(acc.user_id).toBe('user-a-uuid');
        expect(acc.opening_balance).toBe(0.00);
        expect(acc.is_opening_locked).toBe(false);
      }
    });

    it('returns only accounts belonging to user_other when queried by user_other', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.data.accounts).toHaveLength(5);
      for (const acc of res.body.data.accounts) {
        expect(acc.user_id).toBe('user-b-uuid');
      }
    });
  });

  describe('TEST-OPEN-01: Valid Opening Balance Setup (AC-03-1, F-03)', () => {
    it('user_demo updates Checking Bank opening balance to 10000.00 THB successfully', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 10000.00 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account).toBeDefined();
      expect(res.body.data.account.id).toBe('acc-demo-checking');
      expect(res.body.data.account.name).toBe('Checking Bank');
      expect(res.body.data.account.opening_balance).toBe(10000.00);
      expect(res.body.data.account.is_opening_locked).toBe(false);

      // Verify persistence in mock database state
      const target = mockAccounts.find((a) => a.id === 'acc-demo-checking');
      expect(target?.opening_balance.toString()).toBe('10000');
    });

    it('accepts maximum valid opening balance 9999999999.99', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 9999999999.99 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account.opening_balance).toBe(9999999999.99);
    });

    it('accepts zero opening balance 0.00', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 0.00 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account.opening_balance).toBe(0.00);
    });
  });

  describe('TEST-OPEN-02: Opening Balance Exclusion from Summary (AC-03-4, BR-02, F-03)', () => {
    it('verifies opening balance is excluded from income and expense summaries in GET /api/reports/summary', async () => {
      // 1. Set opening balance to 10000.00 THB and assert PATCH response
      const patchRes = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 10000.00 });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.data.account.opening_balance).toBe(10000.00);

      // Verify persistence in underlying store
      const checking = mockAccounts.find((a) => a.id === 'acc-demo-checking');
      expect(checking?.opening_balance.toString()).toBe('10000');

      // 2. Query summary immediately
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);
      expect(summaryRes.body.data.bank_balance).toBe(10000.00);
      expect(summaryRes.body.data.credit_debt).toBe(0.00);
      // BR-02 Invariant: Opening balance must NOT count as income or expense
      expect(summaryRes.body.data.total_income).toBe(0.00);
      expect(summaryRes.body.data.total_expense).toBe(0.00);
    });

    it('proves non-zero opening balances on INCOME and EXPENSE accounts are strictly excluded from income/expense summaries (BR-02)', async () => {
      // 1. Configure non-zero opening balances across diverse account types and assert each PATCH response
      // Checking Bank (CASH): 10,000.00
      const patchCheckingRes = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 10000.00 });

      expect(patchCheckingRes.status).toBe(200);
      expect(patchCheckingRes.body.success).toBe(true);
      expect(patchCheckingRes.body.data.account.opening_balance).toBe(10000.00);

      // Visa Credit Card (LOAN_TAKEN): 1,500.00
      const patchCcRes = await request(app)
        .patch('/api/accounts/acc-demo-cc/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 1500.00 });

      expect(patchCcRes.status).toBe(200);
      expect(patchCcRes.body.success).toBe(true);
      expect(patchCcRes.body.data.account.opening_balance).toBe(1500.00);

      // Salary (INCOME): 5,000.00
      const patchSalaryRes = await request(app)
        .patch('/api/accounts/acc-demo-salary/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 5000.00 });

      expect(patchSalaryRes.status).toBe(200);
      expect(patchSalaryRes.body.success).toBe(true);
      expect(patchSalaryRes.body.data.account.opening_balance).toBe(5000.00);

      // Dining (EXPENSE): 300.00
      const patchDiningRes = await request(app)
        .patch('/api/accounts/acc-demo-dining/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 300.00 });

      expect(patchDiningRes.status).toBe(200);
      expect(patchDiningRes.body.success).toBe(true);
      expect(patchDiningRes.body.data.account.opening_balance).toBe(300.00);

      // Grocery (EXPENSE): 200.00
      const patchGroceryRes = await request(app)
        .patch('/api/accounts/acc-demo-grocery/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 200.00 });

      expect(patchGroceryRes.status).toBe(200);
      expect(patchGroceryRes.body.success).toBe(true);
      expect(patchGroceryRes.body.data.account.opening_balance).toBe(200.00);

      // 2. Assert each opening balance was persisted in the underlying database store
      const checking = mockAccounts.find((a) => a.id === 'acc-demo-checking');
      const cc = mockAccounts.find((a) => a.id === 'acc-demo-cc');
      const salary = mockAccounts.find((a) => a.id === 'acc-demo-salary');
      const dining = mockAccounts.find((a) => a.id === 'acc-demo-dining');
      const grocery = mockAccounts.find((a) => a.id === 'acc-demo-grocery');

      expect(checking?.opening_balance.toString()).toBe('10000');
      expect(cc?.opening_balance.toString()).toBe('1500');
      expect(salary?.opening_balance.toString()).toBe('5000');
      expect(dining?.opening_balance.toString()).toBe('300');
      expect(grocery?.opening_balance.toString()).toBe('200');

      // 3. Query summary endpoint after verifying all 5 accounts were persisted
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);

      // Liquid asset balance reflects CASH account
      expect(summaryRes.body.data.bank_balance).toBe(10000.00);

      // Liability balance reflects LOAN_TAKEN account separately from income/expense
      expect(summaryRes.body.data.credit_debt).toBe(1500.00);

      // BR-02 Critical Invariant: Opening balances on Salary (5,000), Dining (300), and Grocery (200)
      // must NEVER count as income or expense!
      expect(summaryRes.body.data.total_income).toBe(0.00);
      expect(summaryRes.body.data.total_expense).toBe(0.00);
    });

    it('propagates genuine database errors to errorHandler and rejects with 500 without returning fake zero summary', async () => {
      // Temporarily mock prisma.account.findMany to reject with database error
      vi.mocked(prisma.account.findMany).mockRejectedValueOnce(new Error('Simulated PostgreSQL connection failure'));

      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(500);
      expect(summaryRes.body.success).toBe(false);
      expect(summaryRes.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(summaryRes.body.data).toBeUndefined();
    });

    it('calculates summary using exact Decimal arithmetic without IEEE 754 precision errors (e.g. 0.10 + 0.20 = 0.30)', async () => {
      // Set Checking Bank (CASH) to 0.10
      const patch1 = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 0.10 });
      expect(patch1.status).toBe(200);

      // Add a second cash account for user_demo to test sum
      mockAccounts.push({
        id: 'acc-demo-petty-cash',
        user_id: 'user-a-uuid',
        name: 'Petty Cash',
        type: 'CASH',
        opening_balance: new Prisma.Decimal('0.20'),
        is_opening_locked: false,
        created_at: new Date('2026-11-01T00:00:10.000Z'),
        updated_at: new Date('2026-11-01T00:00:10.000Z')
      });

      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);
      // In JS floating point, 0.10 + 0.20 = 0.30000000000000004. Decimal arithmetic must preserve exactly 0.30
      expect(summaryRes.body.data.bank_balance).toBe(0.30);
    });
  });

  describe('TEST-OPEN-03: Invalid Input Rejection (AC-03-2, F-03)', () => {
    it('rejects negative balance (-500.00) with 400 INVALID_OPENING_BALANCE', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: -500.00 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_OPENING_BALANCE');

      // State remains unchanged
      const target = mockAccounts.find((a) => a.id === 'acc-demo-checking');
      expect(target?.opening_balance.toString()).toBe('0');
    });

    it('rejects non-numeric balance ("invalid") with 400 INVALID_OPENING_BALANCE', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_OPENING_BALANCE');
    });

    it('rejects invalid precision exceeding 2 decimal places (100.123) with 400 INVALID_OPENING_BALANCE', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 100.123 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_OPENING_BALANCE');

      const target = mockAccounts.find((a) => a.id === 'acc-demo-checking');
      expect(target?.opening_balance.toString()).toBe('0');
    });

    it('rejects micro-precision values (1e-7) with 400 INVALID_OPENING_BALANCE', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 1e-7 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OPENING_BALANCE');
    });

    it('rejects values exceeding maximum DECIMAL(12,2) limit (10000000000.00)', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 10000000000.00 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OPENING_BALANCE');
    });

    it('rejects missing body with 400 MISSING_REQUEST_BODY via contentType middleware', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_REQUEST_BODY');
    });
  });

  describe('TEST-OPEN-04: Opening Balance Locking After Transaction Commit (AC-03-3, F-03)', () => {
    it('rejects opening balance modification when is_opening_locked = true with 422 OPENING_BALANCE_LOCKED', async () => {
      // 1. Initial valid setup
      await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 10000.00 });

      // 2. Account is locked
      const checkingAcc = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
      checkingAcc.is_opening_locked = true;

      // 3. Attempt modification on locked account
      const lockedRes = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 15000.00 });

      expect(lockedRes.status).toBe(422);
      expect(lockedRes.body.success).toBe(false);
      expect(lockedRes.body.error.code).toBe('OPENING_BALANCE_LOCKED');

      // Assert balance remains 10000.00 THB without mutation
      expect(checkingAcc.opening_balance.toString()).toBe('10000');
    });

    describe('Concurrent Request & Race Condition Handling (AC-03-1, AC-03-3)', () => {
      it('executes real concurrent PATCH requests simultaneously without lost updates or corruption', async () => {
        // Send 2 concurrent PATCH requests to update the same account
        const [res1, res2] = await Promise.all([
          request(app)
            .patch('/api/accounts/acc-demo-checking/opening-balance')
            .set('Origin', TRUSTED_ORIGIN)
            .set('Content-Type', 'application/json')
            .set('Cookie', userACookie)
            .send({ opening_balance: 7500.00 }),
          request(app)
            .patch('/api/accounts/acc-demo-checking/opening-balance')
            .set('Origin', TRUSTED_ORIGIN)
            .set('Content-Type', 'application/json')
            .set('Cookie', userACookie)
            .send({ opening_balance: 8500.00 })
        ]);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);
        expect(res1.body.success).toBe(true);
        expect(res2.body.success).toBe(true);

        // Database balance must accurately reflect one of the requested values without partial state
        const target = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
        expect(['7500', '8500']).toContain(target.opening_balance.toString());
      });

      it('returns 422 OPENING_BALANCE_LOCKED if account was locked concurrently during atomic updateMany', async () => {
        // Mock updateMany to simulate race condition: account was locked between check and updateMany
        vi.mocked(prisma.account.updateMany).mockResolvedValueOnce({ count: 0 });

        // Subsequent findFirst will observe locked state
        const target = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
        target.is_opening_locked = true;

        const res = await request(app)
          .patch('/api/accounts/acc-demo-checking/opening-balance')
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', userACookie)
          .send({ opening_balance: 12000.00 });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('OPENING_BALANCE_LOCKED');
      });

      it('returns 404 NOT_FOUND if account was deleted concurrently during atomic updateMany', async () => {
        // First findFirst succeeds
        // updateMany returns 0
        vi.mocked(prisma.account.updateMany).mockResolvedValueOnce({ count: 0 });
        // Rechecked findFirst returns null
        vi.mocked(prisma.account.findFirst)
          .mockResolvedValueOnce(mockAccounts[0] as any)
          .mockResolvedValueOnce(null);

        const res = await request(app)
          .patch('/api/accounts/acc-demo-checking/opening-balance')
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', userACookie)
          .send({ opening_balance: 12000.00 });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });

      it('returns 409 CONCURRENT_UPDATE_CONFLICT if update affected 0 rows while account exists and remains unlocked', async () => {
        // Mock updateMany to return count 0
        vi.mocked(prisma.account.updateMany).mockResolvedValueOnce({ count: 0 });

        // Account still exists and remains unlocked
        const target = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
        target.is_opening_locked = false;

        const res = await request(app)
          .patch('/api/accounts/acc-demo-checking/opening-balance')
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', userACookie)
          .send({ opening_balance: 12000.00 });

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('CONCURRENT_UPDATE_CONFLICT');
      });
    });
  });

  describe('TEST-SEC-01: Tenancy Boundary Enforcement on Accounts (AC-02-3, BR-01)', () => {
    it('rejects User A attempting to read User B account with 404 NOT_FOUND', async () => {
      const res = await request(app)
        .get('/api/accounts/acc-other-checking')
        .set('Cookie', userACookie);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects User A attempting to update User B opening balance with 404 NOT_FOUND', async () => {
      const initialUserBOpening = mockAccounts.find((a) => a.id === 'acc-other-checking')!.opening_balance;

      const res = await request(app)
        .patch('/api/accounts/acc-other-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 50000.00 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');

      // User B account remains untouched
      const current = mockAccounts.find((a) => a.id === 'acc-other-checking')!;
      expect(current.opening_balance).toEqual(initialUserBOpening);
    });

    it('rejects cross-tenant PUT and DELETE attempts on accounts and transactions with 404 NOT_FOUND and zero state mutation', async () => {
      const initialUserBOpening = mockAccounts.find((a) => a.id === 'acc-other-checking')!.opening_balance;
      const initialAccountCount = mockAccounts.length;

      // 1. User A attempts PUT /api/accounts/:id on User B's account -> 404 NOT_FOUND
      const putAccRes = await request(app)
        .put('/api/accounts/acc-other-checking')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ name: 'Hijacked Account', opening_balance: 99999.00 });
      expect(putAccRes.status).toBe(404);
      expect(putAccRes.body.success).toBe(false);
      expect(putAccRes.body.error.code).toBe('NOT_FOUND');

      // 2. User A attempts DELETE /api/accounts/:id on User B's account -> 404 NOT_FOUND
      const delAccRes = await request(app)
        .delete('/api/accounts/acc-other-checking')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie);
      expect(delAccRes.status).toBe(404);
      expect(delAccRes.body.success).toBe(false);
      expect(delAccRes.body.error.code).toBe('NOT_FOUND');

      // 3. User A attempts PUT/PATCH/DELETE on a foreign transaction ID -> 404 NOT_FOUND
      const putTxnRes = await request(app)
        .put('/api/transactions/txn-other-1')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ total_amount: 1.00 });
      expect(putTxnRes.status).toBe(404);
      expect(putTxnRes.body.error.code).toBe('NOT_FOUND');

      const delTxnRes = await request(app)
        .delete('/api/transactions/txn-other-1')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookie);
      expect(delTxnRes.status).toBe(404);
      expect(delTxnRes.body.error.code).toBe('NOT_FOUND');

      // Verify User B's account balance and total account count are untouched
      const afterUserB = mockAccounts.find((a) => a.id === 'acc-other-checking')!;
      expect(afterUserB.opening_balance).toEqual(initialUserBOpening);
      expect(mockAccounts).toHaveLength(initialAccountCount);
    });
  });

  describe('Role-Based Access Control on Account Routes (BR-10, TEST-SEC-03)', () => {
    it('blocks ADMIN from listing accounts with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
      expect(res.body.data).toBeUndefined();
    });

    it('blocks ADMIN from updating opening balance with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', adminCookie)
        .send({ opening_balance: 10000.00 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    });
  });

  describe('accountLock.service: Atomic Transaction Locking Verification', () => {
    it('locks accounts belonging to user within transaction boundary and handles duplicates', async () => {
      const mockTx = {
        account: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'acc-demo-checking', is_opening_locked: false },
            { id: 'acc-demo-cc', is_opening_locked: false }
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 2 })
        }
      } as any;

      await lockAccounts(
        mockTx,
        ['acc-demo-checking', 'acc-demo-cc', 'acc-demo-checking'], // With duplicates
        'user-a-uuid'
      );

      expect(mockTx.account.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['acc-demo-checking', 'acc-demo-cc'] },
          user_id: 'user-a-uuid',
          is_opening_locked: false
        },
        data: {
          is_opening_locked: true,
          updated_at: expect.any(Date)
        }
      });
    });

    it('does nothing when accountIds array is empty', async () => {
      const mockTx = {
        account: {
          findMany: vi.fn(),
          updateMany: vi.fn()
        }
      } as any;

      await lockAccounts(mockTx, [], 'user-a-uuid');
      expect(mockTx.account.findMany).not.toHaveBeenCalled();
      expect(mockTx.account.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('Credit Card Current Debt calculation on LOAN_TAKEN accounts (F-05, BR-04)', () => {
    it('calculates dynamic current_balance as Opening Balance + Charges - Repayments in GET /api/accounts', async () => {
      (prisma as any).__mockCharges = [
        {
          primary_account_id: 'acc-demo-cc',
          _sum: { total_amount: new Prisma.Decimal('3000.00') }
        }
      ];

      const res = await request(app)
        .get('/api/accounts')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      const ccAcc = res.body.data.accounts.find((a: any) => a.id === 'acc-demo-cc');
      expect(ccAcc).toBeDefined();
      expect(ccAcc.type).toBe('LOAN_TAKEN');
      expect(ccAcc.opening_balance).toBe(0.00);
      expect(ccAcc.current_balance).toBe(3000.00);

      delete (prisma as any).__mockCharges;
    });

    it('calculates dynamic current_balance on GET /api/accounts/:id for LOAN_TAKEN', async () => {
      (prisma as any).__mockAggregate = {
        _sum: { total_amount: new Prisma.Decimal('3000.00') }
      };

      const res = await request(app)
        .get('/api/accounts/acc-demo-cc')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.data.account.type).toBe('LOAN_TAKEN');
      expect(res.body.data.account.current_balance).toBe(3000.00);

      delete (prisma as any).__mockAggregate;
    });
  });
});
