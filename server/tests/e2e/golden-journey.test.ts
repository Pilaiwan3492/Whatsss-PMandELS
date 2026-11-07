import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
}

/**
 * End-to-End Integration Test: Golden Domain Journey Full Sequential Flow (TEST-E2E-01)
 * Target: TEST-E2E-01, All Golden ACs (AC-03-1, AC-04-1, AC-05-1, AC-06-1, AC-07-1, AC-08-1, AC-09-1)
 *
 * SAFETY INVARIANTS:
 * - Runs in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - Test database name MUST strictly equal "whatsss_test".
 * - Cleanups track EXACT transaction IDs created during the sequential journey.
 */
describe('E2E Integration Test: Golden Domain Journey Full Sequential Flow (TEST-E2E-01)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  let demoUserId = '';
  let demoUserCookie = '';
  let checkingBankId = '';
  let creditCardId = '';
  let salaryAccountId = '';
  let diningAccountId = '';
  let groceryAccountId = '';

  const createdTxnIds: string[] = [];
  const accountSnapshots: AccountSnapshot[] = [];

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

    // Authenticate user_demo
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: 'user_demo',
        password: 'Password123!'
      });

    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      demoUserCookie = setCookie[0];
    }

    const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
    if (!user) throw new Error('user_demo not found');
    demoUserId = user.id;

    // Load accounts
    const accounts = await prisma.account.findMany({ where: { user_id: demoUserId } });
    for (const a of accounts) {
      accountSnapshots.push({
        id: a.id,
        opening_balance: a.opening_balance,
        is_opening_locked: a.is_opening_locked
      });
      if (a.name === 'Checking Bank') checkingBankId = a.id;
      if (a.name === 'Visa Credit Card') creditCardId = a.id;
      if (a.name === 'Salary') salaryAccountId = a.id;
      if (a.name === 'Dining') diningAccountId = a.id;
      if (a.name === 'Grocery') groceryAccountId = a.id;
    }

    // Clean up any stale transactions before running journey
    const staleTxns = await prisma.transaction.findMany({
      where: { user_id: demoUserId },
      select: { id: true }
    });
    if (staleTxns.length > 0) {
      await prisma.transaction.deleteMany({
        where: { id: { in: staleTxns.map((t) => t.id) } }
      });
    }

    // Reset account balances to unlocked 0.00
    await prisma.account.updateMany({
      where: { user_id: demoUserId },
      data: { opening_balance: new Prisma.Decimal('0.00'), is_opening_locked: false }
    });
  });

  afterAll(async () => {
    if (!isDbConnected) return;

    if (createdTxnIds.length > 0) {
      await prisma.transaction.deleteMany({
        where: { id: { in: createdTxnIds } }
      });
    }

    for (const snap of accountSnapshots) {
      await prisma.account.update({
        where: { id: snap.id },
        data: {
          opening_balance: snap.opening_balance,
          is_opening_locked: snap.is_opening_locked
        }
      });
    }

    await prisma.$disconnect();
  });

  it('TEST-E2E-01: executes full 4-step Golden Journey and verifies final state', async () => {
    if (!isCI && !allowLiveDb) {
      return;
    }

    // =========================================================================
    // STEP 1: Set Checking Bank Opening Balance to 10,000.00 THB (AC-03-1)
    // =========================================================================
    const step1Res = await request(app)
      .patch(`/api/accounts/${checkingBankId}/opening-balance`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserCookie)
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
      .set('Cookie', demoUserCookie)
      .send({
        primary_account_id: checkingBankId,
        income_account_id: salaryAccountId,
        total_amount: '20000.00',
        transaction_date: '2026-11-02',
        description: 'November Salary Inflow'
      });

    expect(step2Res.status).toBe(201);
    expect(step2Res.body.success).toBe(true);
    expect(step2Res.body.data.transaction.id).toBeDefined();
    createdTxnIds.push(step2Res.body.data.transaction.id);

    // =========================================================================
    // STEP 3: Record Credit Card Purchase 3,000.00 THB split Dining 1k + Grocery 2k (AC-05-1, AC-06-1, BR-04, BR-05)
    // =========================================================================
    const step3Res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserCookie)
      .send({
        primary_account_id: creditCardId,
        total_amount: '3000.00',
        transaction_date: '2026-11-03',
        description: 'Weekend Dining & Grocery',
        allocations: [
          { target_account_id: diningAccountId, amount: '1000.00', notes: 'Dinner' },
          { target_account_id: groceryAccountId, amount: '2000.00', notes: 'Weekly grocery' }
        ]
      });

    expect(step3Res.status).toBe(201);
    expect(step3Res.body.success).toBe(true);
    expect(step3Res.body.data.transaction.id).toBeDefined();
    createdTxnIds.push(step3Res.body.data.transaction.id);

    // =========================================================================
    // STEP 4: Record CC Repayment 3,000.00 THB from Bank to Credit Card (AC-07-1, BR-07, BR-08)
    // =========================================================================
    const step4Res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserCookie)
      .send({
        from_account_id: checkingBankId,
        to_account_id: creditCardId,
        amount: '3000.00',
        transaction_date: '2026-11-04',
        description: 'Full Credit Card Debt Repayment'
      });

    expect(step4Res.status).toBe(201);
    expect(step4Res.body.success).toBe(true);
    expect(step4Res.body.data.transaction.id).toBeDefined();
    createdTxnIds.push(step4Res.body.data.transaction.id);

    // =========================================================================
    // STEP 5: Verify Final Financial Summary (AC-08-1, FR-10)
    // Bank = 27000.00, Debt = 0.00, Income = 20000.00, Expense = 3000.00
    // =========================================================================
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserCookie);

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
      .set('Cookie', demoUserCookie);

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
});
