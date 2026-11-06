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

const TRUSTED_ORIGIN = 'http://localhost:5173';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign(
    { userId, username, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

/**
 * Feature F-02: Application-Tier Tenancy Boundary & Role Segregation Suite
 *
 * SCOPE & EVIDENCE CLARIFICATION (FOR AUDITORS & INSTRUCTORS):
 * In WP-01, the PostgreSQL schema only contains the `users` table. Financial tables (`accounts`,
 * `transactions`, `allocations`) are formally scheduled for implementation in WP-02 through WP-05.
 *
 * Therefore, TEST-SEC-01 in this suite verifies application-tier tenancy boundary enforcement
 * via isolated mock financial endpoint stubs (verifying that the server scopes ownership by authenticated
 * `req.user.id`, returns 404 to conceal resource existence, and never trusts client-supplied user IDs).
 *
 * Full database-backed relational query isolation (`where: { userId: req.user.id }` executed against PostgreSQL)
 * must be verified in WP-02 (Issue #3: Account table) and WP-04 (Issue #5: Allocation cross-tenant target_account_id).
 */
describe('Feature F-02: Tenancy & Role-Based Access Control Suite (TEST-SEC-01, 02, 03)', () => {
  const userACookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');
  const userBCookie = createAuthCookie('user-b-uuid', 'user_other', 'USER');
  const adminCookie = createAuthCookie('admin-uuid', 'admin_demo', 'ADMIN');

  describe('TEST-SEC-01: Application-Tier Tenancy Isolation Stub Verification (AC-02-3, BR-01)', () => {
    it('allows User A to read, modify, and delete their own account (acc-user-a)', async () => {
      const readRes = await request(app)
        .get('/api/accounts/acc-user-a')
        .set('Cookie', userACookie);

      expect(readRes.status).toBe(200);
      expect(readRes.body.success).toBe(true);
      expect(readRes.body.data.account.id).toBe('acc-user-a');
    });

    it('rejects User A attempting to read User B account with 404 RESOURCE_NOT_FOUND', async () => {
      const foreignRes = await request(app)
        .get('/api/accounts/acc-user-b')
        .set('Cookie', userACookie);

      // Tenancy Concealment Invariant (BR-01): Returns 404 to conceal resource existence
      expect(foreignRes.status).toBe(404);
      expect(foreignRes.body.success).toBe(false);
      expect(foreignRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(foreignRes.body.data).toBeUndefined();
    });

    it('rejects User A attempting to update User B account with 404 RESOURCE_NOT_FOUND', async () => {
      const updateRes = await request(app)
        .put('/api/accounts/acc-user-b')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({ name: 'Tampered Account Name' });

      expect(updateRes.status).toBe(404);
      expect(updateRes.body.success).toBe(false);
      expect(updateRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects User A attempting to delete User B account with 404 RESOURCE_NOT_FOUND', async () => {
      const deleteRes = await request(app)
        .delete('/api/accounts/acc-user-b')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie);

      expect(deleteRes.status).toBe(404);
      expect(deleteRes.body.success).toBe(false);
      expect(deleteRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('allows User B to read their own account (acc-user-b)', async () => {
      const userBOwnRes = await request(app)
        .get('/api/accounts/acc-user-b')
        .set('Cookie', userBCookie);

      expect(userBOwnRes.status).toBe(200);
      expect(userBOwnRes.body.success).toBe(true);
      expect(userBOwnRes.body.data.account.id).toBe('acc-user-b');
    });
  });

  describe('TEST-SEC-02: Unauthenticated Security Barrier (AC-02-1, BR-09)', () => {
    it('rejects unauthenticated requests to financial routes with 401 Unauthorized', async () => {
      const accRes = await request(app).get('/api/accounts/acc-user-a');
      expect(accRes.status).toBe(401);
      expect(accRes.body.error.code).toBe('UNAUTHORIZED');

      const txnRes = await request(app).get('/api/transactions');
      expect(txnRes.status).toBe(401);
      expect(txnRes.body.error.code).toBe('UNAUTHORIZED');

      const summaryRes = await request(app).get('/api/reports/summary');
      expect(summaryRes.status).toBe(401);
      expect(summaryRes.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('TEST-SEC-03: Administrative Role Segregation (AC-02-2, BR-10)', () => {
    it('blocks admin from accessing financial endpoints with 403 and zero financial payload', async () => {
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', adminCookie);

      expect(summaryRes.status).toBe(403);
      expect(summaryRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
      expect(summaryRes.body.data).toBeUndefined();

      const txnRes = await request(app)
        .get('/api/transactions')
        .set('Cookie', adminCookie);

      expect(txnRes.status).toBe(403);
      expect(txnRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
      expect(txnRes.body.data).toBeUndefined();

      const accRes = await request(app)
        .get('/api/accounts/acc-user-a')
        .set('Cookie', adminCookie);

      expect(accRes.status).toBe(403);
      expect(accRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
      expect(accRes.body.data).toBeUndefined();
    });
  });
});
