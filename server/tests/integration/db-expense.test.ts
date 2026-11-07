import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { recordExpense } from '../../src/services/expense.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
  updated_at: Date;
}

/**
 * Integration Test: PostgreSQL Live Database Credit Card Purchase & Split Allocation (WP-04)
 * Target: TEST-EXP-01, TEST-EXP-02, TEST-ALLOC-01, TEST-ALLOC-02, NFR-DATA-01
 *
 * SAFETY INVARIANTS:
 * - Live database tests run ONLY in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - In local developer environments, live database tests are SKIPPED by default to protect developer databases.
 * - Test database name MUST strictly equal "whatsss_test" via immutable assertTestDatabase.
 * - Cleanups track EXACT IDs created by each test; broad table deletions are strictly prohibited.
 * - Account snapshots are captured prior to mutation and restored in afterEach via executeCleanupsSafely.
 */
describe('Integration Test: PostgreSQL Live Database Expense & Split Allocation (WP-04)', () => {
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
  let demoDiningAccount: { id: string };
  let demoGroceryAccount: { id: string };

  const pendingCleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) {
      console.warn(
        '[WP-04 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
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
        throw new Error(`[WP-04 CI FAILURE] PostgreSQL live database connection failed in CI environment: ${err}`);
      }
      return;
    }

    // Authenticate demo user to get live session cookie
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
      throw new Error(
        `[WP-04 CI FAILURE] Failed to authenticate user_demo in live DB. Status: ${loginRes.status}`
      );
    }

    const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
    if (user) {
      demoUserId = user.id;
      const cc = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Visa Credit Card' }
      });
      const dining = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Dining' }
      });
      const grocery = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Grocery' }
      });

      if (cc && dining && grocery) {
        demoCreditCardAccount = {
          id: cc.id,
          opening_balance: cc.opening_balance,
          is_opening_locked: cc.is_opening_locked
        };
        demoDiningAccount = { id: dining.id };
        demoGroceryAccount = { id: grocery.id };
      }
    }
  });

  afterEach(async () => {
    if (prisma && pendingCleanups.length > 0) {
      await executeCleanupsSafely(prisma, pendingCleanups);
      pendingCleanups.length = 0;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('TEST-EXP-01 & TEST-ALLOC-01: durably records credit purchase with split allocations and locks account opening balance', async (ctx) => {
    if (!isDbConnected || !demoUserId || !demoCreditCardAccount) {
      ctx.skip();
      return;
    }

    // Capture initial state
    const ccPre = await prisma.account.findUnique({ where: { id: demoCreditCardAccount.id } });
    const diningPre = await prisma.account.findUnique({ where: { id: demoDiningAccount.id } });
    const groceryPre = await prisma.account.findUnique({ where: { id: demoGroceryAccount.id } });

    pendingCleanups.push(async () => {
      if (ccPre) {
        await prisma.account.update({
          where: { id: ccPre.id },
          data: { is_opening_locked: ccPre.is_opening_locked }
        });
      }
      if (diningPre) {
        await prisma.account.update({
          where: { id: diningPre.id },
          data: { is_opening_locked: diningPre.is_opening_locked }
        });
      }
      if (groceryPre) {
        await prisma.account.update({
          where: { id: groceryPre.id },
          data: { is_opening_locked: groceryPre.is_opening_locked }
        });
      }
    });

    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: demoCreditCardAccount.id,
        total_amount: 3000.00,
        transaction_date: '2026-11-06',
        description: 'PostgreSQL Live DB Credit Purchase',
        allocations: [
          { target_account_id: demoDiningAccount.id, amount: 1000.00, notes: 'Live DB Dining' },
          { target_account_id: demoGroceryAccount.id, amount: 2000.00, notes: 'Live DB Grocery' }
        ]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const createdTxnId = res.body.data.transaction.id;
    pendingCleanups.push(async () => {
      await prisma.allocationLine.deleteMany({ where: { transaction_id: createdTxnId } });
      await prisma.transaction.delete({ where: { id: createdTxnId } });
    });

    // Verify database persistence directly via Prisma
    const persistedTxn = await prisma.transaction.findUnique({
      where: { id: createdTxnId },
      include: { allocation_lines: true }
    });

    expect(persistedTxn).toBeDefined();
    expect(persistedTxn?.form).toBe('PAYMENT_CHARGE');
    expect(new Prisma.Decimal(persistedTxn!.total_amount.toString()).toFixed(2)).toBe('3000.00');
    expect(persistedTxn?.allocation_lines).toHaveLength(2);

    // Verify opening balance lock
    const ccPost = await prisma.account.findUnique({ where: { id: demoCreditCardAccount.id } });
    expect(ccPost?.is_opening_locked).toBe(true);
  });

  it('TEST-ALLOC-02: rolls back completely upon unbalanced allocation sum without partial writes', async (ctx) => {
    if (!isDbConnected || !demoUserId || !demoCreditCardAccount) {
      ctx.skip();
      return;
    }

    const txnCountBefore = await prisma.transaction.count({ where: { user_id: demoUserId } });
    const allocCountBefore = await prisma.allocationLine.count({
      where: { transaction: { user_id: demoUserId } }
    });

    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: demoCreditCardAccount.id,
        total_amount: 3000.00,
        transaction_date: '2026-11-06',
        allocations: [
          { target_account_id: demoDiningAccount.id, amount: 1000.00 },
          { target_account_id: demoGroceryAccount.id, amount: 1500.00 } // Sum = 2500 != 3000
        ]
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ALLOCATION_SUM_MISMATCH');

    const txnCountAfter = await prisma.transaction.count({ where: { user_id: demoUserId } });
    const allocCountAfter = await prisma.allocationLine.count({
      where: { transaction: { user_id: demoUserId } }
    });

    expect(txnCountAfter).toBe(txnCountBefore);
    expect(allocCountAfter).toBe(allocCountBefore);
  });
});
