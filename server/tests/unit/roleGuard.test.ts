import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { roleGuard } from '../../src/middlewares/roleGuard.js';
import { isJsonBodyRequired } from '../../src/middlewares/contentType.js';
import { login } from '../../src/controllers/auth.controller.js';

function createMockReqRes(path: string, originalUrl: string, role?: 'USER' | 'ADMIN', method: string = 'GET', body?: any) {
  const req = {
    method,
    path,
    originalUrl,
    body,
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

describe('Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, AUDIT-02, AUDIT-03)', () => {
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

  it('DEF-OUT-01 Regression (BR-10, AC-02-2): blocks ADMIN from mixed-case and uppercase financial routes (/api/Accounts, /api/Reports/summary, /api/Transactions, /API/ACCOUNTS)', () => {
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
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('allows USER role to proceed through financial routes regardless of path casing', () => {
    for (const route of ['/api/accounts', '/api/Accounts', '/api/Reports/summary']) {
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

  it('AUDIT-02 Hardening: rejects non-string username or password payloads with 401 INVALID_CREDENTIALS without unhandled rejection', async () => {
    const invalidPayloads = [
      { username: { $gt: '' }, password: 'Password123!' },
      { username: ['user_demo'], password: 'Password123!' },
      { username: 'user_demo', password: 12345 },
      { username: '   ', password: 'Password123!' }
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

  it('AUDIT-03 Hardening: enforces JSON body requirement on transaction creation endpoints', () => {
    const transactionRoutes = [
      '/api/transactions/income',
      '/api/transactions/expense',
      '/api/transactions/repayment',
      '/api/Transactions/Income'
    ];

    for (const route of transactionRoutes) {
      const { req } = createMockReqRes(route, route, 'USER', 'POST');
      expect(isJsonBodyRequired(req)).toBe(true);
    }
  });
});
