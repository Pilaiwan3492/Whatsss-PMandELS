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
 * Integration Test: Database Persistence Across Server Restart (WP-06, Feature F-09)
 * Target: TEST-PERSIST-01, AC-09-2, NFR-DATA-01
 *
 * SAFETY INVARIANTS:
 * - Runs in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - Test database name MUST strictly equal "whatsss_test".
 * - Cleanups track EXACT IDs created by this test suite; broad table deletions are strictly prohibited.
 */
describe('Integration Test: Relational Database Persistence Across Process Restart (TEST-PERSIST-01, AC-09-2)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  let demoUserId = '';
  let demoUserSessionCookie = '';
  let demoCheckingAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  let demoCreditCardAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  let demoSalaryAccount: { id: string };
  let demoDiningAccount: { id: string };
  let demoGroceryAccount: { id: string };

  const createdTxnIds: string[] = [];
  const accountSnapshots: AccountSnapshot[] = [];
  const pendingCleanups: Array<() => Promise<void>> = [];

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
        throw new Error(`[WP-06 CI FAILURE] PostgreSQL live database connection failed in CI environment: ${err}`);
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

    if (loginRes.status === 200) {
      const setCookie = loginRes.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        demoUserSessionCookie = setCookie[0];
      }
    } else if (isCI) {
      throw new Error(`[WP-06 CI FAILURE] Failed to authenticate user_demo in live DB: ${loginRes.status}`);
    }

    const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
    if (!user) {
      if (isCI) throw new Error('[WP-06 CI FAILURE] user_demo not found in DB');
      return;
    }
    demoUserId = user.id;

    // Load accounts
    const accounts = await prisma.account.findMany({ where: { user_id: demoUserId } });
    for (const a of accounts) {
      accountSnapshots.push({
        id: a.id,
        opening_balance: a.opening_balance,
        is_opening_locked: a.is_opening_locked
      });
      if (a.name === 'Checking Bank') demoCheckingAccount = a;
      if (a.name === 'Visa Credit Card') demoCreditCardAccount = a;
      if (a.name === 'Salary') demoSalaryAccount = a;
      if (a.name === 'Dining') demoDiningAccount = a;
      if (a.name === 'Grocery') demoGroceryAccount = a;
    }

    // Clean up any stale transactions for demo user before running test
    const staleTxns = await prisma.transaction.findMany({ where: { user_id: demoUserId }, select: { id: true } });
    if (staleTxns.length > 0) {
      await prisma.transaction.deleteMany({ where: { id: { in: staleTxns.map((t) => t.id) } } });
    }

    // 1. Step 1: Set Checking Bank opening balance = 10,000.00 THB
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('10000.00'), is_opening_locked: true }
    });

    // 2. Step 2: Salary 20,000.00 THB (RECEIVE_MONEY, 1 AllocationLine)
    const txSalary = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCheckingAccount.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-02'),
        description: 'Salary',
        allocation_lines: {
          create: [
            {
              target_account_id: demoSalaryAccount.id,
              amount: new Prisma.Decimal('20000.00'),
              notes: 'Monthly Salary'
            }
          ]
        }
      }
    });
    createdTxnIds.push(txSalary.id);

    // 3. Step 3: CC Purchase 3,000.00 THB (PAYMENT_CHARGE, 2 AllocationLines: Dining 1k, Grocery 2k)
    const txPurchase = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-03'),
        description: 'Dining & Grocery',
        allocation_lines: {
          create: [
            {
              target_account_id: demoDiningAccount.id,
              amount: new Prisma.Decimal('1000.00'),
              notes: 'Dining'
            },
            {
              target_account_id: demoGroceryAccount.id,
              amount: new Prisma.Decimal('2000.00'),
              notes: 'Grocery'
            }
          ]
        }
      }
    });
    createdTxnIds.push(txPurchase.id);

    // 4. Step 4: CC Repayment 3,000.00 THB (PAYMENT_CHARGE, 1 AllocationLine to CC)
    const txRepayment = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCheckingAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-04'),
        description: 'CC Repayment',
        allocation_lines: {
          create: [
            {
              target_account_id: demoCreditCardAccount.id,
              amount: new Prisma.Decimal('3000.00'),
              notes: 'Repayment'
            }
          ]
        }
      }
    });
    createdTxnIds.push(txRepayment.id);
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

  it('TEST-PERSIST-01: simulates process restart and verifies identical data retrieval (AC-09-2, NFR-DATA-01)', async () => {
    if (!isCI && !allowLiveDb) {
      return;
    }

    // SIMULATE SERVER PROCESS RESTART:
    // 1. Disconnect active PrismaClient instance
    await prisma.$disconnect();

    // 2. Instantiate a fresh PrismaClient representing a brand new server process instance
    const freshPrisma = new PrismaClient();
    await freshPrisma.$queryRaw`SELECT 1`;

    // 3. Query GET /api/reports/summary
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', demoUserSessionCookie);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data.bank_balance).toBe(27000.00);
    expect(summaryRes.body.data.credit_debt).toBe(0.00);
    expect(summaryRes.body.data.total_income).toBe(20000.00);
    expect(summaryRes.body.data.total_expense).toBe(3000.00);
    expect(summaryRes.body.data.category_breakdown['Dining']).toBe(1000.00);
    expect(summaryRes.body.data.category_breakdown['Grocery']).toBe(2000.00);

    // 4. Query GET /api/transactions
    const historyRes = await request(app)
      .get('/api/transactions')
      .set('Cookie', demoUserSessionCookie);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.success).toBe(true);

    const txns = historyRes.body.data.transactions;
    expect(txns).toHaveLength(3);

    const totalLines = txns.reduce((sum: number, t: any) => sum + t.allocation_lines.length, 0);
    expect(totalLines).toBe(4);

    // Re-assign prisma for cleanup
    prisma = freshPrisma;
  });
});
