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

describe('Feature F-02: CSRF Origin Verification Across 9 Conditions & All Mutating Methods (TEST-SEC-04, AC-02-4)', () => {
  const endpoint = '/api/auth/login';
  const validPayload = { username: 'user_demo', password: DEMO_PASSWORD };

  describe('Core Origin / Referer Validation Conditions (POST)', () => {
    it('Condition 1: Trusted Origin matching CLIENT_URL passes CSRF layer', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Condition 2: Untrusted Origin returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Origin', 'http://malicious-site.com')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('Condition 3: Omitted Origin with trusted Referer passes CSRF layer', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Referer', `${TRUSTED_ORIGIN}/login`)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('Condition 4: Both Origin and Referer missing returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('Condition 5: Malformed Referer returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Referer', 'not-a-valid-url-format')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('Condition 6: Scheme mismatch (https vs http) returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Origin', 'https://localhost:5173')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('Condition 7: Hostname mismatch returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Origin', 'http://localhost2:5173')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('Condition 8: Port mismatch returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Origin', 'http://localhost:5174')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('Condition 9: Origin value of literal "null" returns 403 CSRF_ORIGIN_REJECTED', async () => {
      const res = await request(app)
        .post(endpoint)
        .set('Origin', 'null')
        .set('Content-Type', 'application/json')
        .send(validPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });
  });

  describe('State-Changing HTTP Methods Coverage (PUT, PATCH, DELETE)', () => {
    it('enforces CSRF rejection on untrusted PUT request', async () => {
      const res = await request(app)
        .put('/api/accounts/acc-user-a')
        .set('Origin', 'http://evil.com')
        .set('Content-Type', 'application/json')
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('enforces CSRF rejection on untrusted PATCH request', async () => {
      const res = await request(app)
        .patch('/api/accounts/acc-user-a')
        .set('Origin', 'http://evil.com')
        .set('Content-Type', 'application/json')
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('enforces CSRF rejection on untrusted DELETE request', async () => {
      const res = await request(app)
        .delete('/api/accounts/acc-user-a')
        .set('Origin', 'http://evil.com');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });
  });
});
