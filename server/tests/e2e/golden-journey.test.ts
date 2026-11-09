import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app.js';
import { assertTestDatabase } from '../fixtures/testDbGuard.js';
import {
  createWP06TestFixture,
  captureDemoUserSnapshot,
  assertDemoUserUnmodified,
  WP06TestFixture,
  DemoUserSnapshot
} from '../fixtures/wp06TestFixtures.js';

/**
 * End-to-End Integration Test: Golden Domain Journey Full Sequential Flow (TEST-E2E-01)
 * Target: TEST-E2E-01, All Golden ACs (AC-03-1, AC-04-1, AC-05-1, AC-06-1, AC-07-1, AC-08-1, AC-09-1)
 *
 * DATA ISOLATION & INTEGRITY INVARIANTS:
 * - Uses dedicated, isolated Test User and Accounts via createWP06TestFixture.
 * - Does NOT mutate or delete user_demo accounts or transactions.
 * - Verifies 100% data isolation: user_demo baseline snapshot is verified before and after the journey.
 * - Deterministic teardown cleans up only fixtures created by this test suite.
 */
describe('E2E Integration Test: Golden Domain Journey Full Sequential Flow (TEST-E2E-01)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  let fixture: WP06TestFixture | null = null;
  let demoUserSnapshot: DemoUserSnapshot;
  let testUserCookie = '';

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) {
      console.warn(
        '[WP-06 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
        'Set ALLOW_LIVE_DB_TESTS=true with a dedicated test database ("whatsss_test") to run locally.'
      );
      return;
    }

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
        throw new Error(`[WP-06 CI FAILURE] PostgreSQL connection failed in CI: ${err}`);
      }
      return;
    }

    // Capture baseline snapshot of user_demo to verify zero side effects
    demoUserSnapshot = await captureDemoUserSnapshot(prisma);

    // Provision dedicated isolated Test User and Accounts for WP-06 Golden Journey
    fixture = await createWP06TestFixture(prisma, 'golden_journey');

    // Authenticate as the isolated test user
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: fixture.user.username,
        password: fixture.user.rawPassword
      });

    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      testUserCookie = setCookie[0];
    }
  });

  afterAll(async () => {
    const cleanupErrors: string[] = [];

    try {
      // 1. Clean up only the fixtures created for this test run
      if (isDbConnected && fixture) {
        try {
          await fixture.cleanup();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cleanupErrors.push(`Fixture cleanup failed: ${message}`);
        }
      }

      // 2. Verify user_demo was 100% untouched and preserved
      if (isDbConnected && demoUserSnapshot) {
        try {
          await assertDemoUserUnmodified(prisma, demoUserSnapshot);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cleanupErrors.push(`Demo user isolation check failed: ${message}`);
        }
      }
    } finally {
      // 3. Always attempt Prisma disconnect
      if (prisma) {
        try {
          await prisma.$disconnect();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          cleanupErrors.push(`Prisma disconnect failed: ${message}`);
        }
      }
    }

    if (cleanupErrors.length > 0) {
      throw new Error(`Golden Journey cleanup failed:\n${cleanupErrors.join('\n')}`);
    }
  });

  it('TEST-E2E-01: executes full 4-step Golden Journey and verifies final state', async () => {
    if (!isCI && !allowLiveDb) {
      return;
    }

    expect(fixture).toBeDefined();
    const { accounts } = fixture!;

    // =========================================================================
    // STEP 1: Set Checking Bank Opening Balance to 10,000.00 THB (AC-03-1)
    // =========================================================================
    const step1Res = await request(app)
      .patch(`/api/accounts/${accounts.checkingBank.id}/opening-balance`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', testUserCookie)
      .send({ opening_balance: 10000.00 });

    expect(step1Res.status).toBe(200);
    expect(step1Res.body.success).toBe(true);
    expect(Number(step1Res.body.data.account.opening_balance)).toBe(10000.00);

    // =========================================================================
    // STEP 2: Record Salary Income 20,000.00 THB (AC-04-1, BR-03)
    // =========================================================================
    const step2Res = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', testUserCookie)
      .send({
        primary_account_id: accounts.checkingBank.id,
        income_account_id: accounts.salary.id,
        total_amount: '20000.00',
        transaction_date: '2026-11-02',
        description: 'November Salary Inflow'
      });

    expect(step2Res.status).toBe(201);
    expect(step2Res.body.success).toBe(true);
    const step2TxId = step2Res.body.data.transaction.id;
    expect(step2TxId).toBeDefined();
    fixture!.trackTxnId(step2TxId);

    // =========================================================================
    // STEP 3: Record Credit Card Purchase 3,000.00 THB split Dining 1k + Grocery 2k (AC-05-1, AC-06-1, BR-04, BR-05)
    // =========================================================================
    const step3Res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', testUserCookie)
      .send({
        primary_account_id: accounts.creditCard.id,
        total_amount: '3000.00',
        transaction_date: '2026-11-03',
        description: 'Weekend Dining & Grocery',
        allocations: [
          { target_account_id: accounts.dining.id, amount: '1000.00', notes: 'Dinner' },
          { target_account_id: accounts.grocery.id, amount: '2000.00', notes: 'Weekly grocery' }
        ]
      });

    expect(step3Res.status).toBe(201);
    expect(step3Res.body.success).toBe(true);
    const step3TxId = step3Res.body.data.transaction.id;
    expect(step3TxId).toBeDefined();
    fixture!.trackTxnId(step3TxId);

    // =========================================================================
    // STEP 4: Record CC Repayment 3,000.00 THB from Bank to Credit Card (AC-07-1, BR-07, BR-08)
    // =========================================================================
    const step4Res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', testUserCookie)
      .send({
        from_account_id: accounts.checkingBank.id,
        to_account_id: accounts.creditCard.id,
        amount: '3000.00',
        transaction_date: '2026-11-04',
        description: 'Full Credit Card Debt Repayment'
      });

    expect(step4Res.status).toBe(201);
    expect(step4Res.body.success).toBe(true);
    const step4TxId = step4Res.body.data.transaction.id;
    expect(step4TxId).toBeDefined();
    fixture!.trackTxnId(step4TxId);

    // =========================================================================
    // STEP 5: Verify Final Financial Summary (AC-08-1, FR-10)
    // Bank = 27000.00, Debt = 0.00, Income = 20000.00, Expense = 3000.00
    // =========================================================================
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', testUserCookie);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.bank_balance).toBe(27000.00);
    expect(summaryRes.body.data.credit_debt).toBe(0.00);
    expect(summaryRes.body.data.total_income).toBe(20000.00);
    expect(summaryRes.body.data.total_expense).toBe(3000.00);
    expect(summaryRes.body.data.category_breakdown['Dining']).toBe(1000.00);
    expect(summaryRes.body.data.category_breakdown['Grocery']).toBe(2000.00);

    // =========================================================================
    // STEP 6: Verify Transaction History (AC-09-1, FR-11)
    // Exactly 3 transactions, 4 allocation lines total, chronological order
    // =========================================================================
    const historyRes = await request(app)
      .get('/api/transactions')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', testUserCookie);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.success).toBe(true);

    const txns = historyRes.body.data.transactions;
    expect(txns).toHaveLength(3);

    // Chronological order: Repayment (Nov 4) -> Purchase (Nov 3) -> Salary (Nov 2)
    expect(txns[0].transaction_date).toBe('2026-11-04');
    expect(txns[0].form).toBe('PAYMENT_CHARGE');
    expect(txns[0].total_amount).toBe(3000.00);

    expect(txns[1].transaction_date).toBe('2026-11-03');
    expect(txns[1].form).toBe('PAYMENT_CHARGE');
    expect(txns[1].total_amount).toBe(3000.00);

    expect(txns[2].transaction_date).toBe('2026-11-02');
    expect(txns[2].form).toBe('RECEIVE_MONEY');
    expect(txns[2].total_amount).toBe(20000.00);

    // Total allocation lines across all 3 transactions must equal 4
    const totalAllocations = txns.reduce((sum: number, t: any) => sum + t.allocation_lines.length, 0);
    expect(totalAllocations).toBe(4);
  });

  it('TEST-E2E-02: verifies data isolation preserving user_demo accounts and clean fixture teardown', async () => {
    if (!isCI && !allowLiveDb) {
      return;
    }

    // Assert that user_demo was NOT touched, modified, or depleted during the entire test flow
    await assertDemoUserUnmodified(prisma, demoUserSnapshot);

    // Assert that the test user has exactly 3 transactions and 5 accounts before teardown
    const testUserTxnCount = await prisma.transaction.count({
      where: { user_id: fixture!.user.id }
    });
    expect(testUserTxnCount).toBe(3);

    const testUserAccCount = await prisma.account.count({
      where: { user_id: fixture!.user.id }
    });
    expect(testUserAccCount).toBe(5);
  });
});
