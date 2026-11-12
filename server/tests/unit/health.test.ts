import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthHandler, readyHandler, sanitizeLogMessage, app } from '../../src/app.js';
import { prisma } from '../../src/prisma.js';
import { config } from '../../src/config/env.js';

describe('Unit Test: Cloud-Ready Health, Readiness Probes & Safe Logging (Point 6)', () => {
  let mockReq: any;
  let mockRes: any;
  let responseData: any;
  let responseStatus: number;

  beforeEach(() => {
    responseData = null;
    responseStatus = 0;

    mockReq = {};
    mockRes = {
      status: vi.fn().mockImplementation((code: number) => {
        responseStatus = code;
        return mockRes;
      }),
      json: vi.fn().mockImplementation((data: any) => {
        responseData = data;
        return mockRes;
      })
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/health returns 200 with status ok, timestamp, and commitSha', async () => {
    await healthHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(responseStatus).toBe(200);
    expect(responseData).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      commitSha: config.appCommitSha
    });
    // Verify ISO 8601 timestamp format
    expect(new Date(responseData.timestamp).toISOString()).toBe(responseData.timestamp);
  });

  it('GET /api/ready returns 200 when database connectivity check succeeds', async () => {
    const queryRawSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);

    await readyHandler(mockReq, mockRes);

    expect(queryRawSpy).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(responseStatus).toBe(200);
    expect(responseData).toEqual({
      status: 'ready',
      database: 'connected',
      timestamp: expect.any(String),
      commitSha: config.appCommitSha
    });
  });

  it('GET /api/ready returns 503 when database connectivity check fails without leaking internal error details', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sensitiveDbError = new Error(
      "Can't reach database server at postgresql://postgres:SuperSecretPassword123!@db-prod.internal:5432/whatsss_prod"
    );
    const queryRawSpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(sensitiveDbError);

    await readyHandler(mockReq, mockRes);

    expect(queryRawSpy).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(responseStatus).toBe(503);
    expect(responseData).toEqual({
      status: 'not_ready',
      database: 'disconnected',
      error: 'Database connection unavailable',
      timestamp: expect.any(String),
      commitSha: config.appCommitSha
    });

    // Verify server-side logging sanitizes sensitive credentials
    expect(errorSpy).toHaveBeenCalled();
    const loggedErrorString = errorSpy.mock.calls[0][0];
    expect(loggedErrorString).not.toContain('SuperSecretPassword123!');
    expect(loggedErrorString).toContain('postgresql://***:***@db-prod.internal:5432/whatsss_prod');
  });

  it('sanitizeLogMessage redacts credentials in database URLs, query params, and passwords', () => {
    const rawUrl = 'Error at postgresql://whatsss_admin:TopSecretPass2026!@pg-cluster.gcp:5432/whatsss_db?ssl=true&password=pass123';
    const sanitized = sanitizeLogMessage(rawUrl);

    expect(sanitized).not.toContain('TopSecretPass2026!');
    expect(sanitized).not.toContain('whatsss_admin');
    expect(sanitized).not.toContain('pass123');
    expect(sanitized).toContain('postgresql://***:***@pg-cluster.gcp:5432/whatsss_db?ssl=true&password=***');
  });

  it('sanitizeLogMessage redacts Bearer tokens, access tokens, refresh tokens, auth headers and cookies', () => {
    const raw = 'Auth debug: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretToken123 with access_token=tok_abc123 and refreshToken: ref_xyz987 and Cookie: session_token=secret_cookie_val; path=/';
    const sanitized = sanitizeLogMessage(raw);

    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretToken123');
    expect(sanitized).not.toContain('tok_abc123');
    expect(sanitized).not.toContain('ref_xyz987');
    expect(sanitized).not.toContain('secret_cookie_val');
    expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    expect(sanitized).toContain('access_token=***');
    expect(sanitized).toContain('refreshToken: ***');
    expect(sanitized).toContain('[REDACTED_COOKIE]');
  });

  it('GET /api/ready handles database timeout gracefully and returns 503', async () => {
    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Mock queryRaw that hangs indefinitely
    vi.spyOn(prisma, '$queryRaw').mockImplementation(() => new Promise(() => {}));

    const readyPromise = readyHandler(mockReq, mockRes);
    // Advance timers past 3000ms timeout
    vi.advanceTimersByTime(3500);
    await readyPromise;

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(responseStatus).toBe(503);
    expect(responseData.status).toBe('not_ready');
    expect(responseData.error).toBe('Database connection unavailable');
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls[0][0];
    expect(logged).toContain('Database probe query timed out');
    vi.useRealTimers();
  });

  it('verifies that /api/health and /api/ready routes are registered in Express router stack', () => {
    const routes = app._router.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const healthRoute = routes.find((r: any) => r.path === '/api/health');
    const readyRoute = routes.find((r: any) => r.path === '/api/ready');

    expect(healthRoute).toBeDefined();
    expect(healthRoute.methods).toContain('get');

    expect(readyRoute).toBeDefined();
    expect(readyRoute.methods).toContain('get');
  });
});
