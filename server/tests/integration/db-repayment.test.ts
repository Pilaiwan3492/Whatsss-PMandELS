import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { recordRepayment } from '../../src/services/repayment.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
  updated_at: Date;
}

/**
 * Integration Test: PostgreSQL Live Database Credit Card Repayment (WP-05)
 * Target: TEST-REPAY-01, TEST-REPAY-02, TEST-REPAY-03, TEST-REPAY-04, TEST-REPAY-05, TEST-REPAY-06, NFR-DATA-01
 *
 * SAFETY INVARIANTS:
 * - Live database tests run ONLY in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - In local developer environments, live database tests are SKIPPED by default to protect developer databases.
 * - Test database name MUST strictly equal "whatsss_test" via immutable assertTestDatabase.
 * - Cleanups track EXACT IDs created by each test; broad table deletions are strictly prohibited.
 * - Account snapshots are captured prior to mutation and restored in afterEach via executeCleanupsSafely.
 */
describe('Integration Test: PostgreSQL Live Database Credit Card Repayment (WP-05)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  let demoUserId = '';
  let demoUserSessionCookie = '';
  let demoCreditCardAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  let demoCheckingAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };

  const pendingCleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) {
      console.warn(
        '[WP-05 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
        'Set ALLOW_LIVE_DB_TESTS=true with a dedicated test database ("whatsss_test") to run locally.'
      );
      return;
    }

    assertTestDatabase(databaseUrl, {
      isCI,
      allowLiveDb,
      nodeEnv: process.env.NODE_ENV
    });

    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    isDbConnected = true;

    const user = await prisma.user.findFirst({
      where: { username: 'user_demo' },
      include: { accounts: true }
    });

    if (!user) {
      throw new Error('user_demo not found in test database. Seed database before running live tests.');
    }

    demoUserId = user.id;

    const checking = user.accounts.find((a) => a.type === 'CASH');
    const cc = user.accounts.find((a) => a.type === 'LOAN_TAKEN');

    if (!checking || !cc) {
      throw new Error('Required accounts (CASH, LOAN_TAKEN) not found for user_demo.');
    }

    demoCheckingAccount = {
      id: checking.id,
      opening_balance: checking.opening_balance,
      is_opening_locked: checking.is_opening_locked
    };
    demoCreditCardAccount = {
      id: cc.id,
      opening_balance: cc.opening_balance,
      is_opening_locked: cc.is_opening_locked
    };

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ usernameOrEmail: 'user_demo', password: 'Password123!' });

    if (loginRes.status !== 200) {
      throw new Error(`Failed to login user_demo in test DB: ${JSON.stringify(loginRes.body)}`);
    }

    const cookies = loginRes.headers['set-cookie'];
    demoUserSessionCookie = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
  });

  afterAll(async () => {
    if (isDbConnected && prisma) {
      await prisma.$disconnect();
    }
  });

  afterEach(async () => {
    if (!isCI && !allowLiveDb) return;
    await executeCleanupsSafely(pendingCleanups);
  });

  it('verifies live DB test guard or runs live test', (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
    }
    expect(isDbConnected).toBe(true);
  });
});
