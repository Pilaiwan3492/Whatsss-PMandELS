import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env.js';
import { findMockUser } from '../fixtures/mockPrisma.js';

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
      }
    }
  };
});

import { app } from '../../src/app.js';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign(
    { userId, username, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

describe('Feature F-02: Tenancy & Role-Based Access Control Suite (TEST-SEC-01, 02, 03)', () => {
  const userACookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');
  const userBCookie = createAuthCookie('user-b-uuid', 'user_other', 'USER');
  const adminCookie = createAuthCookie('admin-uuid', 'admin_demo', 'ADMIN');

  it('TEST-SEC-01: Cross-tenant request returns 404 Not Found, concealing foreign resource (AC-02-3, BR-01)', async () => {
    // 1. User A can access own account
    const ownRes = await request(app)
      .get('/api/accounts/acc-user-a')
      .set('Cookie', userACookie);

    expect(ownRes.status).toBe(200);
    expect(ownRes.body.success).toBe(true);
    expect(ownRes.body.data.account.id).toBe('acc-user-a');

    // 2. User A requests User B account (acc-user-b belongs to user-b-uuid)
    const foreignRes = await request(app)
      .get('/api/accounts/acc-user-b')
      .set('Cookie', userACookie);

    // Conceal foreign resource existence with 404 Not Found
    expect(foreignRes.status).toBe(404);
    expect(foreignRes.body.success).toBe(false);
    expect(foreignRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(foreignRes.body.data).toBeUndefined();

    // 3. User B can access own account acc-user-b
    const userBOwnRes = await request(app)
      .get('/api/accounts/acc-user-b')
      .set('Cookie', userBCookie);

    expect(userBOwnRes.status).toBe(200);
    expect(userBOwnRes.body.success).toBe(true);
    expect(userBOwnRes.body.data.account.id).toBe('acc-user-b');
  });

  it('TEST-SEC-02: Unauthenticated request sent to financial routes returns 401 Unauthorized (AC-02-1, BR-09)', async () => {
    // 1. Unauthenticated request to /api/accounts/:id
    const accRes = await request(app).get('/api/accounts/acc-user-a');
    expect(accRes.status).toBe(401);
    expect(accRes.body.success).toBe(false);
    expect(accRes.body.error.code).toBe('UNAUTHORIZED');

    // 2. Unauthenticated request to /api/transactions
    const txnRes = await request(app).get('/api/transactions');
    expect(txnRes.status).toBe(401);
    expect(txnRes.body.success).toBe(false);
    expect(txnRes.body.error.code).toBe('UNAUTHORIZED');

    // 3. Unauthenticated request to /api/reports/summary
    const summaryRes = await request(app).get('/api/reports/summary');
    expect(summaryRes.status).toBe(401);
    expect(summaryRes.body.success).toBe(false);
    expect(summaryRes.body.error.code).toBe('UNAUTHORIZED');
  });

  it('TEST-SEC-03: Admin accessing financial endpoints returns 403 Forbidden with zero data (AC-02-2, BR-10)', async () => {
    // 1. Admin accessing /api/reports/summary
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', adminCookie);

    expect(summaryRes.status).toBe(403);
    expect(summaryRes.body.success).toBe(false);
    expect(summaryRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    expect(summaryRes.body.data).toBeUndefined();

    // 2. Admin accessing /api/transactions
    const txnRes = await request(app)
      .get('/api/transactions')
      .set('Cookie', adminCookie);

    expect(txnRes.status).toBe(403);
    expect(txnRes.body.success).toBe(false);
    expect(txnRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    expect(txnRes.body.data).toBeUndefined();

    // 3. Admin accessing /api/accounts/:id
    const accRes = await request(app)
      .get('/api/accounts/acc-user-a')
      .set('Cookie', adminCookie);

    expect(accRes.status).toBe(403);
    expect(accRes.body.success).toBe(false);
    expect(accRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    expect(accRes.body.data).toBeUndefined();
  });
});
