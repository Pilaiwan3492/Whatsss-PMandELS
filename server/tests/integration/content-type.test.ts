import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { findMockUser, DEMO_PASSWORD } from '../fixtures/mockPrisma.js';

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

describe('System API Contract: Content-Type Validation and JSON Body Parsing (TEST-SEC-06)', () => {
  it('Condition 1: JSON endpoint with missing Content-Type returns 400 INVALID_CONTENT_TYPE', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .send('{"username":"user_demo","password":"Password123!"}')
      .unset('Content-Type');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('Condition 2: Unsupported application/x-www-form-urlencoded returns 400 INVALID_CONTENT_TYPE', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('username=user_demo&password=Password123!');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('Condition 3: Unsupported multipart/form-data returns 400 INVALID_CONTENT_TYPE', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'multipart/form-data; boundary=---boundary')
      .send('-----boundary\r\nContent-Disposition: form-data; name="username"\r\n\r\nuser_demo\r\n-----boundary--');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('Condition 4: Malformed JSON body returns 400 INVALID_JSON_BODY', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{ "username": "user_demo", "password": invalid_json_syntax');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_JSON_BODY');
  });

  it('Condition 5: Valid JSON payload proceeds to domain handler', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ username: 'user_demo', password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Condition 6: Bodyless POST /api/auth/logout proceeds without Content-Type rejection', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ username: 'user_demo', password: DEMO_PASSWORD });

    const cookie = loginRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
    expect(logoutRes.body.data.message).toBe('Logged out successfully');
  });
});
