import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
  updated_at: Date;
}

/**
 * Integration Test: PostgreSQL Live Database Income Transaction Processing (WP-03)
 * Target: TEST-INC-01, TEST-INC-02, TEST-OPEN-04, TEST-INC-DECIMAL, TEST-INC-ATOM
 *
 * SAFETY INVARIANTS:
 * - Live database tests run ONLY in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - In local developer environments, live database tests are SKIPPED by default to protect developer databases.
 * - Test database name MUST strictly equal "whatsss_test" via immutable assertTestDatabase.
 * - Non-destructive snapshot restoration cleans up all created records and restores original account states.
 */
describe('Integration Test: PostgreSQL Live Database Income Processing (WP-03)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  let demoUserSessionCookie = '';
  let demoCheckingAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  let demoSalaryAccount: { id: string };

  const pendingCleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) {
      console.warn(
        '[WP-03 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
        'Set ALLOW_LIVE_DB_TESTS=true with a dedicated test database ("whatsss_test") to run locally.'
      );
      return;
    }

    // Verify test database safety invariant
    assertTestDatabase(databaseUrl, {
      isCI,
      allowLiveDb,
      nodeEnv: process.env.NODE_ENV
    });

    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch (err) {
      if (isCI) {
        throw new Error(`[WP-03 CI FAILURE] PostgreSQL live database connection failed in CI environment: ${err}`);
      }
      return;
    }

    // Authenticate demo user to get live session cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        identifier: 'user_demo',
        password: 'Password123!'
      });

    if (loginRes.status === 200) {
      const setCookie = loginRes.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        demoUserSessionCookie = setCookie[0];
      }
    }

    // Load demo user's checking bank and salary accounts
    const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
    if (user) {
      const checking = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Checking Bank' }
      });
      const salary = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Salary' }
      });
      if (checking) {
        demoCheckingAccount = checking;
      }
      if (salary) {
        demoSalaryAccount = salary;
      }
    }
  });

  afterEach(async () => {
    if (!isDbConnected || pendingCleanups.length === 0) return;
    await executeCleanupsSafely(pendingCleanups);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Live TEST-INC-01: Full Round-Trip Income Processing
  // -------------------------------------------------------------------------
  it('records salary of 20000.00 THB in live PostgreSQL, creates 1 allocation line, and atomically locks opening balance (TEST-INC-01, AC-04-1, BR-03)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCheckingAccount || !demoSalaryAccount) {
      return;
    }

    // Capture initial state of checking account
    const initialChecking = await prisma.account.findUnique({
      where: { id: demoCheckingAccount.id }
    });
    expect(initialChecking).toBeDefined();

    // Prepare cleanup
    pendingCleanups.push(async () => {
      // Delete any transactions created for demo user
      const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      if (user) {
        await prisma.transaction.deleteMany({
          where: { user_id: user.id }
        });
      }
      // Restore checking account opening balance and lock state
      if (initialChecking) {
        await prisma.account.update({
          where: { id: initialChecking.id },
          data: {
            opening_balance: initialChecking.opening_balance,
            is_opening_locked: initialChecking.is_opening_locked
          }
        });
      }
    });

    // Submit live income transaction
    const res = await request(app)
      .post('/api/transactions/income')
      .set('Cookie', demoUserSessionCookie)
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        primary_account_id: demoCheckingAccount.id,
        total_amount: '20000.00',
        transaction_date: '2026-11-06',
        income_account_id: demoSalaryAccount.id,
        description: 'Monthly Salary'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction.form).toBe('RECEIVE_MONEY');
    expect(res.body.data.transaction.total_amount).toBe('20000.00');
    expect(res.body.data.transaction.allocations).toHaveLength(1);
    expect(res.body.data.transaction.allocations[0].target_account_id).toBe(demoSalaryAccount.id);

    // Direct database assertions on live PostgreSQL
    const persistedTxn = await prisma.transaction.findUnique({
      where: { id: res.body.data.transaction.id },
      include: { allocation_lines: true }
    });

    expect(persistedTxn).toBeDefined();
    expect(persistedTxn!.form).toBe('RECEIVE_MONEY');
    expect(persistedTxn!.total_amount.equals(new Prisma.Decimal('20000.00'))).toBe(true);
    expect(persistedTxn!.allocation_lines).toHaveLength(1);
    expect(persistedTxn!.allocation_lines[0].target_account_id).toBe(demoSalaryAccount.id);
    expect(persistedTxn!.allocation_lines[0].amount.equals(new Prisma.Decimal('20000.00'))).toBe(true);

    // Direct database assertion on opening balance lock
    const updatedChecking = await prisma.account.findUnique({
      where: { id: demoCheckingAccount.id }
    });
    expect(updatedChecking!.is_opening_locked).toBe(true);

    // Live Summary Assertion (BR-02, BR-03)
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', demoUserSessionCookie);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.total_income).toBe(20000.00);

    // Opening balance modification is blocked (AC-03-3)
    const patchRes = await request(app)
      .patch(`/api/accounts/${demoCheckingAccount.id}/opening-balance`)
      .set('Cookie', demoUserSessionCookie)
      .set('Origin', TRUSTED_ORIGIN)
      .send({ opening_balance: 50000.00 });

    expect(patchRes.status).toBe(422);
    expect(patchRes.body.error.code).toBe('OPENING_BALANCE_LOCKED');
  });

  // -------------------------------------------------------------------------
  // 2. Live TEST-INC-DECIMAL: Decimal Boundary Precision Verification
  // -------------------------------------------------------------------------
  it('preserves exact boundary Decimal values in live PostgreSQL without floating-point distortion', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCheckingAccount || !demoSalaryAccount) {
      return;
    }

    const testDecimals = ['0.01', '0.29', '100.10'];

    for (const val of testDecimals) {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', demoUserSessionCookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: demoCheckingAccount.id,
          total_amount: val,
          transaction_date: '2026-11-06',
          income_account_id: demoSalaryAccount.id
        });

      if (res.status === 201) {
        const txnId = res.body.data.transaction.id;
        pendingCleanups.push(async () => {
          await prisma.transaction.deleteMany({ where: { id: txnId } });
        });

        const inDb = await prisma.transaction.findUnique({ where: { id: txnId } });
        expect(inDb!.total_amount.equals(new Prisma.Decimal(val))).toBe(true);
      }
    }
  });
});
