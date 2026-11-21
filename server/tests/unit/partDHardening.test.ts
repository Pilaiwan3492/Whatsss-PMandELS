import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { requireJsonContentType } from '../../src/middlewares/contentType.js';
import { login, logout } from '../../src/controllers/auth.controller.js';
import { recordIncome } from '../../src/services/income.service.js';

function createMockReqRes(
  path: string,
  originalUrl: string,
  role?: 'USER' | 'ADMIN',
  method: string = 'GET',
  body?: any,
  headers: Record<string, string> = {}
) {
  const req = {
    method,
    path,
    originalUrl,
    body,
    headers,
    cookies: {},
    user: role ? { id: 'test-user-id', username: role === 'ADMIN' ? 'admin' : 'user_demo', role } : undefined
  } as unknown as Request;

  const clearedCookies: Array<{ name: string; options: any }> = [];
  const res = {
    statusCode: 200,
    body: undefined as any,
    clearedCookies,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    clearCookie(name: string, options: any) {
      clearedCookies.push({ name, options });
      return this;
    }
  } as unknown as Response & { statusCode: number; body: any; clearedCookies: Array<{ name: string; options: any }> };

  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('Unit Test: Part D Security & Audit Hardening (DEF-OUT-02, AUDIT-01..03)', () => {
  it('TEST-AUTH-LOGOUT-UNAUTHENTICATED (DEF-OUT-02 Verification, AC-01-5): unauthenticated POST /api/auth/logout without cookie returns 200 OK and clears token cookie with configured attributes', () => {
    const { req, res } = createMockReqRes('/api/auth/logout', '/api/auth/logout', undefined, 'POST');
    logout(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    });
    expect(res.body.data.user).toBeUndefined();
    expect(res.clearedCookies).toHaveLength(1);
    expect(res.clearedCookies[0].name).toBe('token');
    expect(res.clearedCookies[0].options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });
  });

  it('AUDIT-01 Hardening (AC-03-3): recordIncome locks both primary Checking Bank and target Salary accounts atomically, and rolls back locks on transaction failure (Mocked Unit Verification)', async () => {
    const checkingId = '11111111-1111-4111-8111-111111111111';
    const salaryId = '22222222-2222-4222-8222-222222222222';
    const userId = 'user-a-uuid';

    const accountsState = [
      { id: checkingId, user_id: userId, name: 'Checking Bank', type: 'CASH', opening_balance: new Prisma.Decimal('10000.00'), is_opening_locked: false },
      { id: salaryId, user_id: userId, name: 'Salary', type: 'INCOME', opening_balance: new Prisma.Decimal('0.00'), is_opening_locked: false }
    ];

    const mockPrisma: any = {
      $transaction: vi.fn(async (cb: any) => {
        const tx = {
          $queryRaw: vi.fn(async () => []),
          account: {
            findFirst: vi.fn(async ({ where }: any) => accountsState.find((a) => a.id === where.id && a.user_id === where.user_id) || null),
            findMany: vi.fn(async ({ where }: any) => accountsState.filter((a) => where.id.in.includes(a.id) && a.user_id === where.user_id)),
            updateMany: vi.fn(async ({ where, data }: any) => {
              let count = 0;
              for (const acc of accountsState) {
                if (where.id.in.includes(acc.id) && acc.user_id === where.user_id && acc.is_opening_locked === where.is_opening_locked) {
                  acc.is_opening_locked = data.is_opening_locked;
                  count++;
                }
              }
              return { count };
            })
          },
          transaction: {
            create: vi.fn(async ({ data }: any) => ({ id: 'txn-inc-1', ...data })),
            aggregate: vi.fn(async ({ where }: any) => ({
              _sum: { total_amount: where.form === 'RECEIVE_MONEY' ? new Prisma.Decimal('20000.00') : null }
            }))
          },
          allocationLine: {
            create: vi.fn(async ({ data }: any) => ({ id: 'alloc-inc-1', ...data }))
          }
        };
        return cb(tx);
      })
    };

    const result = await recordIncome(
      userId,
      {
        primary_account_id: checkingId,
        income_account_id: salaryId,
        total_amount: '20000.00',
        transaction_date: '2026-11-06',
        description: 'Monthly Salary'
      },
      mockPrisma
    );

    expect(result.updated_balance.current_balance).toBe('30000.00');
    expect(accountsState.find((a) => a.id === checkingId)!.is_opening_locked).toBe(true);
    expect(accountsState.find((a) => a.id === salaryId)!.is_opening_locked).toBe(true);

    // Sub-check B: Simulate allocationLine.create failure and verify transactional rollback in unit harness
    accountsState[0].is_opening_locked = false;
    accountsState[1].is_opening_locked = false;
    const committedTransactions: any[] = [];
    const committedAllocations: any[] = [];

    const failingMockPrisma: any = {
      $transaction: vi.fn(async (cb: any) => {
        const snapshotLocks = accountsState.map((a) => ({ id: a.id, is_opening_locked: a.is_opening_locked }));
        const stagedTransactions: any[] = [];
        const stagedAllocations: any[] = [];

        const tx = {
          $queryRaw: vi.fn(async () => []),
          account: {
            findFirst: vi.fn(async ({ where }: any) => accountsState.find((a) => a.id === where.id && a.user_id === where.user_id) || null),
            findMany: vi.fn(async ({ where }: any) => accountsState.filter((a) => where.id.in.includes(a.id) && a.user_id === where.user_id)),
            updateMany: vi.fn(async ({ where, data }: any) => {
              let count = 0;
              for (const acc of accountsState) {
                if (where.id.in.includes(acc.id) && acc.user_id === where.user_id && acc.is_opening_locked === where.is_opening_locked) {
                  acc.is_opening_locked = data.is_opening_locked;
                  count++;
                }
              }
              return { count };
            })
          },
          transaction: {
            create: vi.fn(async ({ data }: any) => {
              const rec = { id: 'txn-inc-rollback', ...data };
              stagedTransactions.push(rec);
              return rec;
            }),
            aggregate: vi.fn()
          },
          allocationLine: {
            create: vi.fn(async () => {
              throw new Error('Simulated allocationLine.create database failure');
            })
          }
        };

        try {
          const res = await cb(tx);
          committedTransactions.push(...stagedTransactions);
          committedAllocations.push(...stagedAllocations);
          return res;
        } catch (err) {
          for (const snap of snapshotLocks) {
            const acc = accountsState.find((a) => a.id === snap.id)!;
            acc.is_opening_locked = snap.is_opening_locked;
          }
          throw err;
        }
      })
    };

    await expect(
      recordIncome(
        userId,
        {
          primary_account_id: checkingId,
          income_account_id: salaryId,
          total_amount: '20000.00',
          transaction_date: '2026-11-06',
          description: 'Failed Salary Rollback Test'
        },
        failingMockPrisma
      )
    ).rejects.toThrow('Simulated allocationLine.create database failure');

    expect(accountsState.find((a) => a.id === checkingId)!.is_opening_locked).toBe(false);
    expect(accountsState.find((a) => a.id === salaryId)!.is_opening_locked).toBe(false);
    expect(committedTransactions).toHaveLength(0);
    expect(committedAllocations).toHaveLength(0);
  });

  it('AUDIT-02 Hardening: rejects non-string, empty, or whitespace-only username and non-string or empty password with 401 INVALID_CREDENTIALS', async () => {
    const invalidPayloads = [
      { username: { $gt: '' }, password: 'Password123!' },
      { username: ['user_demo'], password: 'Password123!' },
      { username: 'user_demo', password: 12345 },
      { username: '', password: 'Password123!' },
      { username: '   ', password: 'Password123!' },
      { username: 'user_demo', password: '' }
    ];

    for (const payload of invalidPayloads) {
      const { req, res } = createMockReqRes('/api/auth/login', '/api/auth/login', undefined, 'POST', payload);
      await login(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      });
    }
  });

  it('AUDIT-03 Hardening: requireJsonContentType middleware rejects missing body (400 MISSING_REQUEST_BODY), missing/wrong Content-Type (400 INVALID_CONTENT_TYPE), and passes valid application/json across transaction routes and case/slash variants', () => {
    const transactionRoutes = [
      '/api/transactions/income',
      '/transactions/income',
      '/api/transactions/expense',
      '/transactions/expense',
      '/api/transactions/repayment',
      '/transactions/repayment',
      '/api/Transactions/Income/',
      '/API/TRANSACTIONS/EXPENSE',
      '/api/Transactions/Repayment/'
    ];

    // Test A: Missing body -> 400 MISSING_REQUEST_BODY
    for (const route of transactionRoutes) {
      const { req, res, next } = createMockReqRes(route, route, 'USER', 'POST', undefined, {});
      requireJsonContentType(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MISSING_REQUEST_BODY');
      expect(next).not.toHaveBeenCalled();
    }

    // Test B: Body present but missing Content-Type -> 400 INVALID_CONTENT_TYPE
    for (const route of transactionRoutes) {
      const { req, res, next } = createMockReqRes(route, route, 'USER', 'POST', undefined, { 'content-length': '25' });
      requireJsonContentType(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
      expect(next).not.toHaveBeenCalled();
    }

    // Test C: Wrong Content-Type (text/plain) -> 400 INVALID_CONTENT_TYPE
    for (const route of transactionRoutes) {
      const { req, res, next } = createMockReqRes(route, route, 'USER', 'POST', undefined, {
        'content-length': '20',
        'content-type': 'text/plain'
      });
      requireJsonContentType(req, res, next);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
      expect(next).not.toHaveBeenCalled();
    }

    // Test D: Valid application/json (including empty JSON object "{}" with content-length 2) -> passes middleware (next() called)
    for (const route of transactionRoutes) {
      const { req, res, next } = createMockReqRes(route, route, 'USER', 'POST', {}, {
        'content-length': '2',
        'content-type': 'application/json'
      });
      requireJsonContentType(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.body).toBeUndefined();
    }

    // Safe GET requests are never blocked by requireJsonContentType
    const { req: getReq, res: getRes, next: getNext } = createMockReqRes('/api/transactions', '/api/transactions', 'USER', 'GET');
    requireJsonContentType(getReq, getRes, getNext);
    expect(getNext).toHaveBeenCalledTimes(1);
  });
});
