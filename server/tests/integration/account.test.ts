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
  });

  describe('TEST-OPEN-02: Opening Balance Exclusion from Summary (AC-03-4, BR-02, F-03)', () => {
    it('verifies opening balance is excluded from income and expense summaries in GET /api/reports/summary', async () => {
      // 1. Set opening balance to 10000.00 THB
      await request(app)
        .patch('/api/accounts/acc-demo-checking/opening-balance')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ opening_balance: 10000.00 });

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

      // 2. Simulate transaction commit locking the account (e.g. Salary Income Txn 1)
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

  describe('accountLock.service: Atomic Transaction Locking Unit Verification', () => {
    it('locks accounts belonging to user within transaction boundary and skips foreign accounts', async () => {
      const mockTx = {
        account: {
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
          updateMany: vi.fn()
        }
      } as any;

      await lockAccounts(mockTx, [], 'user-a-uuid');
      expect(mockTx.account.updateMany).not.toHaveBeenCalled();
    });
  });
});
