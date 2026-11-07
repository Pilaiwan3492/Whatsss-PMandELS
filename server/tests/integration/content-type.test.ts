import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';
import { config } from '../../src/config/env.js';
import { findMockUser, DEMO_PASSWORD } from '../fixtures/mockPrisma.js';
import { requireJsonContentType } from '../../src/middlewares/contentType.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';

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

describe('System API Contract: Content-Type Validation and JSON Body Parsing (TEST-SEC-06)', () => {
  const loginEndpoint = '/api/auth/login';
  const logoutEndpoint = '/api/auth/logout';
  const userCookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');

  // Dedicated test application for verifying PUT and PATCH method behaviors with middleware
  const testApp = express();
  testApp.use(requireJsonContentType);
  testApp.use(express.json());
  testApp.put('/api/test/put-endpoint', (_req, res) => res.status(200).json({ success: true }));
  testApp.patch('/api/test/patch-endpoint', (_req, res) => res.status(200).json({ success: true }));
  testApp.use(errorHandler);

  describe('Case C: Endpoints Requiring a JSON Body (e.g. POST /api/auth/login)', () => {
    it('POST JSON endpoint without payload and without Content-Type returns 400 MISSING_REQUEST_BODY', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_REQUEST_BODY');
    });

    it('POST JSON endpoint with payload but missing Content-Type returns 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .send('{"username":"user_demo","password":"Password123!"}')
        .unset('Content-Type');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('POST JSON endpoint with payload and text/plain returns 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('username=user_demo');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('POST JSON endpoint with payload and application/x-www-form-urlencoded returns 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('username=user_demo&password=Password123!');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('POST JSON endpoint with payload and multipart/form-data returns 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'multipart/form-data; boundary=---boundary')
        .send('-----boundary\r\nContent-Disposition: form-data; name="username"\r\n\r\nuser_demo\r\n-----boundary--');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('POST JSON endpoint with payload and substring spoof application/jsonp returns 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/jsonp')
        .send(JSON.stringify({ username: 'user_demo', password: DEMO_PASSWORD }));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('POST JSON endpoint with payload and substring spoof application/json-invalid returns 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json-invalid')
        .send(JSON.stringify({ username: 'user_demo', password: DEMO_PASSWORD }));

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('POST JSON endpoint with malformed JSON body returns 400 INVALID_JSON_BODY', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{ "username": "user_demo", "password": invalid_json_syntax');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_JSON_BODY');
    });

    it('POST JSON endpoint with valid application/json passes to controller and succeeds', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ username: 'user_demo', password: DEMO_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST JSON endpoint with application/json; charset=utf-8 passes to controller and succeeds', async () => {
      const res = await request(app)
        .post(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json; charset=utf-8')
        .send({ username: 'user_demo', password: DEMO_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST JSON endpoint with query string correctly normalizes path and enforces validation', async () => {
      const res = await request(app)
        .post(`${loginEndpoint}?ref=navbar&mode=quick`)
        .set('Origin', TRUSTED_ORIGIN)
        .send('{"username":"user_demo","password":"Password123!"}')
        .unset('Content-Type');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });
  });

  describe('Case A & D: Bodyless POST (Logout) Behavior', () => {
    it('POST bodyless endpoint with no Content-Type proceeds to controller', async () => {
      const res = await request(app)
        .post(logoutEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('POST bodyless endpoint with Content-Type: text/plain proceeds to controller', async () => {
      const res = await request(app)
        .post(logoutEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'text/plain')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('POST bodyless endpoint with Content-Type: application/json proceeds to controller', async () => {
      const res = await request(app)
        .post(logoutEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('POST logout endpoint that carries a payload with non-JSON Content-Type is rejected with 400', async () => {
      const res = await request(app)
        .post(logoutEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'text/plain')
        .set('Cookie', userCookie)
        .send('unexpected=payload');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });
  });

  describe('PUT & PATCH Endpoints Matrix (Bodyless vs. Payload)', () => {
    it('PUT bodyless endpoint with no Content-Type proceeds', async () => {
      const res = await request(testApp)
        .put('/api/test/put-endpoint');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PUT bodyless endpoint with Content-Type: text/plain proceeds', async () => {
      const res = await request(testApp)
        .put('/api/test/put-endpoint')
        .set('Content-Type', 'text/plain');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PUT endpoint with payload and text/plain is rejected with 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(testApp)
        .put('/api/test/put-endpoint')
        .set('Content-Type', 'text/plain')
        .send('raw text payload');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('PUT endpoint with payload and application/json proceeds', async () => {
      const res = await request(testApp)
        .put('/api/test/put-endpoint')
        .set('Content-Type', 'application/json')
        .send({ key: 'value' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PATCH bodyless endpoint with no Content-Type proceeds', async () => {
      const res = await request(testApp)
        .patch('/api/test/patch-endpoint');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PATCH bodyless endpoint with Content-Type: text/plain proceeds', async () => {
      const res = await request(testApp)
        .patch('/api/test/patch-endpoint')
        .set('Content-Type', 'text/plain');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('PATCH endpoint with payload and text/plain is rejected with 400 INVALID_CONTENT_TYPE', async () => {
      const res = await request(testApp)
        .patch('/api/test/patch-endpoint')
        .set('Content-Type', 'text/plain')
        .send('raw text payload');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONTENT_TYPE');
    });

    it('PATCH endpoint with payload and application/json proceeds', async () => {
      const res = await request(testApp)
        .patch('/api/test/patch-endpoint')
        .set('Content-Type', 'application/json')
        .send({ key: 'value' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE & CORS Preflight Behaviors', () => {
    it('DELETE bodyless endpoint with no Content-Type proceeds', async () => {
      const res = await request(app)
        .delete('/api/accounts/acc-user-a')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Account deleted successfully');
    });

    it('DELETE bodyless endpoint with Content-Type: text/plain proceeds without restriction', async () => {
      const res = await request(app)
        .delete('/api/accounts/acc-user-a')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'text/plain')
        .set('Cookie', userCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Account deleted successfully');
    });

    it('OPTIONS CORS preflight terminates with 204 No Content', async () => {
      const res = await request(app)
        .options(loginEndpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    });
  });
});
