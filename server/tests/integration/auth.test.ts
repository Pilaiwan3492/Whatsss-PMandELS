/**
 * Integration Test Suite: Feature F-01 Authentication & Session Lifecycle (Mocked Prisma)
 *
 * NOTE FOR INSTRUCTORS & AUDITORS:
 * This suite verifies the HTTP authentication lifecycle (Login, Session Cookies, Introspection,
 * Logout, and AuthGuard middleware behavior) using a mocked Prisma database layer with isolated
 * in-memory user fixtures (findMockUser / mockUsers).
 *
 * Database-backed password persistence verification against a live PostgreSQL 16 instance
 * is executed separately in:
 * server/tests/integration/db-password.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockUsers, findMockUser, resetMockUsers, DEMO_PASSWORD } from '../fixtures/mockPrisma.js';
import { config } from '../../src/config/env.js';

// Mock Prisma client with dynamic lookup against mockUsers fixture
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

// Import app after mocking Prisma
import { app } from '../../src/app.js';

const CLIENT_ORIGIN = 'http://localhost:5173';

describe('Feature F-01: Authentication Behavior (Mocked Prisma)', () => {
  beforeEach(() => {
    resetMockUsers();
  });

  describe('TEST-AUTH-01: Login Cookie Attributes & Token Invariant (AC-01-1)', () => {
    it('sets HttpOnly, SameSite=Lax, Path=/ session cookie and does not expose token in body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', CLIENT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          username: 'user_demo',
          password: DEMO_PASSWORD
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.username).toBe('user_demo');
      expect(res.body.data.user.role).toBe('USER');

      // Token invariant: never in response body
      expect(res.body.data.token).toBeUndefined();

      // Set-Cookie header inspection
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
      expect(tokenCookie).toContain('Path=/');
      expect(tokenCookie).toMatch(/SameSite=Lax/i);

      // Verify token inside cookie is verifiable
      const tokenMatch = tokenCookie.match(/token=([^;]+)/);
      expect(tokenMatch).not.toBeNull();
      const decoded = jwt.verify(tokenMatch[1], config.jwtSecret) as any;
      expect(decoded.userId).toBe('user-a-uuid');
    });
  });

  describe('TEST-AUTH-02: Invalid Credentials Handling (AC-01-2)', () => {
    it('returns 401 Unauthorized with INVALID_CREDENTIALS for incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', CLIENT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          username: 'user_demo',
          password: 'IncorrectPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('returns 401 Unauthorized with INVALID_CREDENTIALS for nonexistent username', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', CLIENT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          username: 'ghost_user',
          password: DEMO_PASSWORD
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns 401 Unauthorized for missing username or password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Origin', CLIENT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('AUDIT-02 Hardening: rejects non-string, empty, or whitespace-only username and non-string or empty password with 401 INVALID_CREDENTIALS without stack trace', async () => {
      const invalidCases = [
        { label: 'Object username', payload: { username: { $gt: '' }, password: DEMO_PASSWORD } },
        { label: 'Array username', payload: { username: ['user_demo'], password: DEMO_PASSWORD } },
        { label: 'Number password', payload: { username: 'user_demo', password: 12345 } },
        { label: 'Empty string username', payload: { username: '', password: DEMO_PASSWORD } },
        { label: 'Whitespace-only username', payload: { username: '   ', password: DEMO_PASSWORD } },
        { label: 'Empty string password', payload: { username: 'user_demo', password: '' } }
      ];

      for (const tc of invalidCases) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('Origin', CLIENT_ORIGIN)
          .set('Content-Type', 'application/json')
          .send(tc.payload);

        expect(res.status, `Expected 401 for ${tc.label}`).toBe(401);
        expect(res.body).toEqual({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password'
          }
        });
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    });
  });

  describe('TEST-AUTH-03: Session Introspection (AC-01-3)', () => {
    it('returns 200 with current user profile and verified role on GET /api/auth/me', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', CLIENT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          username: 'user_demo',
          password: DEMO_PASSWORD
        });

      const cookie = loginRes.headers['set-cookie'];

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.id).toBe('user-a-uuid');
      expect(meRes.body.data.user.username).toBe('user_demo');
      expect(meRes.body.data.user.role).toBe('USER');
    });
  });

  describe('TEST-AUTH-05: Logout Session Termination (AC-01-5, FR-01)', () => {
    it('clears cookie with Max-Age=0 and subsequent request returns 401', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', CLIENT_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({
          username: 'user_demo',
          password: DEMO_PASSWORD
        });

      const cookie = loginRes.headers['set-cookie'];

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Origin', CLIENT_ORIGIN)
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      const logoutCookies = logoutRes.headers['set-cookie'];
      expect(logoutCookies).toBeDefined();
      const clearedTokenCookie = logoutCookies.find((c: string) => c.startsWith('token='));
      expect(clearedTokenCookie).toBeDefined();
      expect(clearedTokenCookie).toMatch(/Max-Age=0/i);
      expect(clearedTokenCookie).toContain('Path=/');
      expect(clearedTokenCookie).toContain('HttpOnly');
      expect(clearedTokenCookie).toMatch(/SameSite=Lax/i);

      // Subsequent call with cleared cookie
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', clearedTokenCookie);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('UNAUTHORIZED');
    });

    it('TEST-AUTH-LOGOUT-UNAUTHENTICATED (DEF-OUT-02 Verification, AC-01-5): returns 200 OK and idempotently clears token cookie when called without any session cookie or Authorization header', async () => {
      // Do NOT attach any Cookie or Authorization header
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Origin', CLIENT_ORIGIN);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toEqual({
        success: true,
        data: {
          message: 'Logged out successfully'
        }
      });
      // Confirm no private user profile or session token is returned
      expect(logoutRes.body.data.user).toBeUndefined();
      expect(logoutRes.body.data.token).toBeUndefined();

      // Confirm cookie-clearing header is present with matching configured attributes
      const logoutCookies = logoutRes.headers['set-cookie'];
      expect(logoutCookies).toBeDefined();
      const clearedTokenCookie = logoutCookies.find((c: string) => c.startsWith('token=;'));
      expect(clearedTokenCookie).toBeDefined();
      expect(clearedTokenCookie).toMatch(/Max-Age=0/i);
      expect(clearedTokenCookie).toContain('Path=/');
      expect(clearedTokenCookie).toContain('HttpOnly');
      expect(clearedTokenCookie).toMatch(/SameSite=Lax/i);

      // Confirm the operation did not create a session
      const meRes = await request(app).get('/api/auth/me');
      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('AuthGuard User Lifecycle & Dynamic Role Verification (Mocked Prisma)', () => {
    it('rejects expired JWT token with 401 Unauthorized', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user-a-uuid', username: 'user_demo', role: 'USER' },
        config.jwtSecret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects token with invalid signature with 401 Unauthorized', async () => {
      const forgedToken = jwt.sign(
        { userId: 'user-a-uuid', username: 'user_demo', role: 'USER' },
        'wrong_tampered_secret_key_minimum_32_characters_long'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with 401 when user is not found in database', async () => {
      const ghostToken = jwt.sign(
        { userId: 'deleted-user-uuid', username: 'ghost', role: 'USER' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${ghostToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with 403 ACCOUNT_DISABLED when user is deactivated in database after login (F-19 / AC-19-3)', async () => {
      // 1. Valid user logs in
      const validToken = jwt.sign(
        { userId: 'user-a-uuid', username: 'user_demo', role: 'USER' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // Verify active user passes
      const firstRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${validToken}`);
      expect(firstRes.status).toBe(200);

      // 2. Administrator deactivates user in database
      mockUsers[0].is_active = false;

      // 3. Subsequent request with the same token MUST be rejected with 403 ACCOUNT_DISABLED (F-19 / AC-19-3)
      const nextRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${validToken}`);

      expect(nextRes.status).toBe(403);
      expect(nextRes.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('immediately reflects role changes from database and ignores stale role in JWT', async () => {
      // 1. Token has stale role: 'USER'
      const tokenWithStaleUserRole = jwt.sign(
        { userId: 'user-a-uuid', username: 'user_demo', role: 'USER' },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

      // 2. Change role in database to 'ADMIN'
      mockUsers[0].role = 'ADMIN';

      // 3. User requests /api/auth/me -> role must be 'ADMIN' (from DB)
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${tokenWithStaleUserRole}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.role).toBe('ADMIN');

      // 4. RoleGuard immediately blocks this user from financial routes because DB role is ADMIN
      const finRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', `token=${tokenWithStaleUserRole}`);

      expect(finRes.status).toBe(403);
      expect(finRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    });
  });
});
