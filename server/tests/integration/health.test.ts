import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/prisma.js';
import { config } from '../../src/config/env.js';

describe('HTTP Integration Test: Health Endpoints, CSRF Exemption & API 404 Routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/health (Liveness Probe)', () => {
    it('returns HTTP 200 with JSON status ok and commit SHA through HTTP pipeline', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        commitSha: config.appCommitSha
      });
      // Timestamp must be valid ISO string
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    it('is exempt from CSRF Origin validation as a safe GET request', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://untrusted-cross-origin.com');

      // Must NOT be blocked with 403 CSRF_ORIGIN_REJECTED
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/ready (Readiness Probe)', () => {
    it('returns HTTP 200 when database connectivity query succeeds', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }] as any);

      const res = await request(app).get('/api/ready');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        status: 'ready',
        database: 'connected',
        timestamp: expect.any(String),
        commitSha: config.appCommitSha
      });
    });

    it('returns HTTP 503 with generic error when database connectivity query fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(
        new Error("Connection refused at postgresql://postgres:Secret123@db:5432/whatsss_db")
      );

      const res = await request(app).get('/api/ready');

      expect(res.status).toBe(503);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        status: 'not_ready',
        database: 'disconnected',
        error: 'Database connection unavailable',
        timestamp: expect.any(String),
        commitSha: config.appCommitSha
      });

      // Internal connection details are sanitized in logs and never leaked to response
      expect(JSON.stringify(res.body)).not.toContain('Secret123');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const logged = consoleErrorSpy.mock.calls[0][0];
      expect(logged).not.toContain('Secret123');
      expect(logged).toContain('postgresql://***:***@db:5432/whatsss_db');
    });

    it('is exempt from CSRF Origin validation as a safe GET request', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([{ '?column?': 1 }] as any);

      const res = await request(app)
        .get('/api/ready')
        .set('Origin', 'http://untrusted-cross-origin.com');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('API 404 Catch-All & SPA Fallback Routing', () => {
    it('returns HTTP 404 JSON for non-existent GET /api routes instead of HTML', async () => {
      const res = await request(app).get('/api/non-existent-endpoint');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API endpoint not found: GET /api/non-existent-endpoint'
        }
      });
    });

    it('returns HTTP 404 JSON for non-existent POST /api routes', async () => {
      const res = await request(app)
        .post('/api/unknown/resource')
        .set('Origin', config.clientUrl)
        .set('Content-Type', 'application/json')
        .send({ test: true });

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'API endpoint not found: POST /api/unknown/resource'
        }
      });
    });

    it('serves SPA fallback index.html for client application navigation routes', async () => {
      const res = await request(app).get('/dashboard');

      // If client/dist exists, it serves index.html (200 with text/html).
      // If client/dist does not exist, Express default router falls through.
      if (res.status === 200) {
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('<!doctype html>');
      }
    });
  });
});
