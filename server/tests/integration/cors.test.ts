import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

describe('System Security Contract: CORS Preflight (TEST-SEC-05)', () => {
  it('Preflight from trusted origin receives CORS response headers with credentials policy and Vary: Origin', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['vary']).toBe('Origin');
  });

  it('Preflight from untrusted origin terminates with 204 but omits authorizing header', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://evil.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['vary']).toBe('Origin');
  });

  it('Preflight does not execute route handlers or mutate data', async () => {
    const res = await request(app)
      .options('/api/accounts/acc-user-a')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    // Zero body or business payload returned
    expect(res.text).toBe('');
  });
});
