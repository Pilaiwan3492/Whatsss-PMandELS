import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { roleGuard } from '../../src/middlewares/roleGuard.js';

function createMockReqRes(
  path: string,
  originalUrl: string,
  role?: 'USER' | 'ADMIN',
  method: string = 'GET'
) {
  const req = {
    method,
    path,
    originalUrl,
    cookies: {},
    user: role ? { id: 'test-user-id', username: role === 'ADMIN' ? 'admin' : 'user_demo', role } : undefined
  } as unknown as Request;

  const res = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  } as unknown as Response & { statusCode: number; body: any };

  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('Unit Test: roleGuard Middleware (DEF-OUT-01, BR-10, AC-02-2)', () => {
  it('blocks ADMIN from lowercase financial endpoints (/api/accounts, /api/transactions, /api/reports/summary) with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN', () => {
    for (const url of ['/api/accounts', '/api/transactions', '/api/reports/summary']) {
      const { req, res, next } = createMockReqRes(url, url, 'ADMIN');
      roleGuard(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'ADMIN_FINANCIAL_ACCESS_FORBIDDEN',
          message: 'Admins cannot access financial endpoints'
        }
      });
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('DEF-OUT-01 Regression (BR-10, AC-02-2): blocks ADMIN from mixed-case and uppercase financial routes (/api/Accounts, /api/Accounts/, /API/ACCOUNTS, /api/Reports/summary, /api/Transactions)', () => {
    const mixedCaseRoutes = [
      '/api/Accounts',
      '/api/Accounts/',
      '/api/Accounts/656b87b3-79c0-4a37-bc47-68ed01321292',
      '/api/Reports/summary',
      '/api/Transactions',
      '/api/Transactions/expense',
      '/API/ACCOUNTS',
      '/Accounts',
      '/Reports/summary',
      '/Transactions'
    ];

    for (const route of mixedCaseRoutes) {
      const { req, res, next } = createMockReqRes(route, route, 'ADMIN');
      roleGuard(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'ADMIN_FINANCIAL_ACCESS_FORBIDDEN',
          message: 'Admins cannot access financial endpoints'
        }
      });
      expect(res.body.data).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('allows USER role to proceed through financial routes regardless of path casing', () => {
    for (const route of ['/api/accounts', '/api/Accounts', '/api/Accounts/', '/API/ACCOUNTS', '/api/Reports/summary', '/api/Transactions']) {
      const { req, res, next } = createMockReqRes(route, route, 'USER');
      roleGuard(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.body).toBeUndefined();
    }
  });

  it('does not block ADMIN on non-financial routes (/api/auth/me, /api/accountsXYZ)', () => {
    for (const route of ['/api/auth/me', '/api/accountsXYZ', '/api/reportsXYZ', '/api/transactionsXYZ']) {
      const { req, res, next } = createMockReqRes(route, route, 'ADMIN');
      roleGuard(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.body).toBeUndefined();
    }
  });
});
