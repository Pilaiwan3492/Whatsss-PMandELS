import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mockUsers, findMockUser, DEMO_PASSWORD } from '../fixtures/mockPrisma.js';

// Mock Prisma client with seeded users
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

describe('Feature F-01: Authentication Suite (TEST-AUTH-01, 02, 03, 05)', () => {
  it('TEST-AUTH-01: Valid credentials return 200 OK and set HttpOnly session cookie (AC-01-1)', async () => {
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

    // Token must NOT be exposed in response body
    expect(res.body.data.token).toBeUndefined();

    // Verify Set-Cookie header contains HttpOnly cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toContain('HttpOnly');
    expect(tokenCookie).toContain('Path=/');
  });

  it('TEST-AUTH-02: Invalid password or nonexistent username returns 401 with INVALID_CREDENTIALS (AC-01-2)', async () => {
    // Case 1: Wrong password for existing user
    const wrongPassRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: 'user_demo',
        password: 'IncorrectPassword999!'
      });

    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.success).toBe(false);
    expect(wrongPassRes.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassRes.headers['set-cookie']).toBeUndefined();

    // Case 2: Nonexistent username
    const nonExistentRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: 'ghost_user',
        password: DEMO_PASSWORD
      });

    expect(nonExistentRes.status).toBe(401);
    expect(nonExistentRes.body.success).toBe(false);
    expect(nonExistentRes.body.error.code).toBe('INVALID_CREDENTIALS');

    // Case 3: Missing credentials
    const missingRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({});

    expect(missingRes.status).toBe(401);
    expect(missingRes.body.success).toBe(false);
    expect(missingRes.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('TEST-AUTH-03: Submitting valid session cookie to GET /api/auth/me returns 200 with role (AC-01-3)', async () => {
    // First log in to obtain cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: 'user_demo',
        password: DEMO_PASSWORD
      });

    const cookie = loginRes.headers['set-cookie'];

    // Call GET /api/auth/me with cookie
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.id).toBe('user-a-uuid');
    expect(meRes.body.data.user.username).toBe('user_demo');
    expect(meRes.body.data.user.role).toBe('USER');
  });

  it('TEST-AUTH-05: POST /api/auth/logout clears cookie and subsequent /me returns 401 (AC-01-5, FR-01)', async () => {
    // 1. Log in
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: 'user_demo',
        password: DEMO_PASSWORD
      });

    const cookie = loginRes.headers['set-cookie'];

    // 2. Log out with cookie and bodyless POST request
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', cookie);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
    expect(logoutRes.body.data.message).toBe('Logged out successfully');

    // Verify cookie cleared with Max-Age=0
    const logoutCookies = logoutRes.headers['set-cookie'];
    expect(logoutCookies).toBeDefined();
    const clearedTokenCookie = logoutCookies.find((c: string) => c.startsWith('token='));
    expect(clearedTokenCookie).toBeDefined();
    expect(clearedTokenCookie).toMatch(/Max-Age=0/i);

    // 3. Subsequent request to /api/auth/me without cookie or with cleared cookie returns 401
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', clearedTokenCookie);

    expect(meRes.status).toBe(401);
    expect(meRes.body.success).toBe(false);
    expect(meRes.body.error.code).toBe('UNAUTHORIZED');
  });
});
