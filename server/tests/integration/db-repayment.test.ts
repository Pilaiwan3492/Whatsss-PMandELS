import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
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
 * Target: TEST-REPAY-01..06, TEST-REPAY-CONCURRENT-DEBT, TEST-REPAY-CONCURRENT-FUNDS, TEST-REPAY-ATOM, TEST-REPAY-DECIMAL, NFR-DATA-01
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
  let demoDiningAccount: { id: string };

  let otherCheckingAccount: { id: string };
  let otherCreditCardAccount: { id: string };

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

    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch (err) {
      if (isCI || allowLiveDb) {
        throw new Error(`[WP-05 LIVE DB FAILURE] PostgreSQL live database connection failed: ${err}`);
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
    } else if (isCI || allowLiveDb) {
      throw new Error(
        `[WP-05 LIVE DB FAILURE] Failed to authenticate user_demo in live DB. Status: ${loginRes.status}, body: ${JSON.stringify(loginRes.body)}`
      );
    }

    const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
    if (user) {
      demoUserId = user.id;

      const cc = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Visa Credit Card' }
      });
      const checking = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Checking Bank' }
      });
      const dining = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Dining' }
      });

      if (cc && checking && dining) {
        demoCreditCardAccount = {
          id: cc.id,
          opening_balance: cc.opening_balance,
          is_opening_locked: cc.is_opening_locked
        };
        demoCheckingAccount = {
          id: checking.id,
          opening_balance: checking.opening_balance,
          is_opening_locked: checking.is_opening_locked
        };
        demoDiningAccount = { id: dining.id };
      }
    }

    const otherUser = await prisma.user.findUnique({ where: { username: 'user_other' } });
    if (otherUser) {
      const otherChecking = await prisma.account.findFirst({
        where: { user_id: otherUser.id, name: 'Checking Bank' }
      });
      const otherCc = await prisma.account.findFirst({
        where: { user_id: otherUser.id, name: 'Visa Credit Card' }
      });
      if (otherChecking) otherCheckingAccount = { id: otherChecking.id };
      if (otherCc) otherCreditCardAccount = { id: otherCc.id };
    }

    if (isCI && (!demoCreditCardAccount || !demoCheckingAccount)) {
      throw new Error('[WP-05 CI FAILURE] Required seeded accounts not found for user_demo in live PostgreSQL');
    }
  });

  afterEach(async () => {
    if (!isDbConnected || pendingCleanups.length === 0) return;
    await executeCleanupsSafely(pendingCleanups);
    pendingCleanups.length = 0;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function captureAccountSnapshot(accountId: string): Promise<AccountSnapshot> {
    const acc = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    return {
      id: acc.id,
      opening_balance: acc.opening_balance,
      is_opening_locked: acc.is_opening_locked,
      updated_at: acc.updated_at
    };
  }

  function registerAccountRestore(snapshot: AccountSnapshot): void {
    pendingCleanups.push(async () => {
      await prisma.account.update({
        where: { id: snapshot.id },
        data: {
          opening_balance: snapshot.opening_balance,
          is_opening_locked: snapshot.is_opening_locked,
          updated_at: snapshot.updated_at
        }
      });
    });
  }

  function registerTransactionCleanup(transactionId: string): void {
    pendingCleanups.push(async () => {
      await prisma.allocationLine.deleteMany({ where: { transaction_id: transactionId } });
      await prisma.transaction.delete({ where: { id: transactionId } });
    });
  }

  it('TEST-REPAY-01 (Live DB): processes valid credit card repayment reducing Bank and Debt atomically', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Seed temporary purchase to establish outstanding debt of 3000.00 THB
    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Temporary Test Debt'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Test Debt'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    // Fund checking account with 30,000.00 opening balance for this test
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('30000.00'), is_opening_locked: false }
    });

    const res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 3000.00,
        transaction_date: '2026-11-06',
        description: 'Live DB Repayment'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const repaymentTxnId = res.body.data.transaction.id;
    registerTransactionCleanup(repaymentTxnId);

    expect(res.body.data.updated_cash_balance).toBe('27000.00');
    expect(res.body.data.updated_debt).toBe('0.00');

    // Verify exactly 1 allocation line was persisted
    const allocLines = await prisma.allocationLine.findMany({
      where: { transaction_id: repaymentTxnId }
    });
    expect(allocLines).toHaveLength(1);
    expect(allocLines[0].target_account_id).toBe(demoCreditCardAccount.id);

    // Verify opening balances were locked
    const updatedChecking = await prisma.account.findUniqueOrThrow({ where: { id: demoCheckingAccount.id } });
    const updatedCc = await prisma.account.findUniqueOrThrow({ where: { id: demoCreditCardAccount.id } });
    expect(updatedChecking.is_opening_locked).toBe(true);
    expect(updatedCc.is_opening_locked).toBe(true);
  });

  it('TEST-REPAY-02 (Live DB): verifies expense exclusion invariant (BR-08) in report summary', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Create purchase of 3000.00 THB
    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Purchase for Expense Invariant Test'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Dining'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('30000.00'), is_opening_locked: false }
    });

    const res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 3000.00,
        transaction_date: '2026-11-06'
      });

    expect(res.status).toBe(201);
    registerTransactionCleanup(res.body.data.transaction.id);

    // Query summary
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie);

    expect(summaryRes.status).toBe(200);
    // Expense summary must strictly equal 3000.00 (not 6000.00)
    expect(Number(summaryRes.body.data.total_expense)).toBe(3000.00);
  });

  it('TEST-REPAY-03 (Live DB): rejects repayment exceeding outstanding debt with HTTP 422', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Establish debt of 1000.00 THB
    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Small debt'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('1000.00'),
        notes: 'Dining'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('5000.00') }
    });

    const res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 1500.00, // Exceeds 1000.00 debt
        transaction_date: '2026-11-06'
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');
  });

  it('TEST-REPAY-04 (Live DB): rejects repayment when bank funds are insufficient with HTTP 422', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Establish large debt of 10000.00 THB
    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('10000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Big Debt'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('10000.00'),
        notes: 'Dining'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    // Bank only has 500.00 THB
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('500.00') }
    });

    const res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 2000.00, // Exceeds 500.00 available funds
        transaction_date: '2026-11-06'
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('TEST-REPAY-05 (Live DB): supports partial repayment reducing debt proportionally', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Debt of 3000.00 THB
    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Debt for partial'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Dining'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('10000.00') }
    });

    const res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 1200.00,
        transaction_date: '2026-11-06'
      });

    expect(res.status).toBe(201);
    registerTransactionCleanup(res.body.data.transaction.id);
    expect(res.body.data.updated_debt).toBe('1800.00');
    expect(res.body.data.updated_cash_balance).toBe('8800.00');
  });

  it('TEST-REPAY-06 (Live DB): rejects non-positive or malformed amounts with HTTP 400', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const res = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: -100,
        transaction_date: '2026-11-06'
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AMOUNT');
  });

  it('TEST-REPAY-SEC (Live DB): rejects cross-tenant repayment (foreign source CASH or foreign target LOAN_TAKEN) with HTTP 404', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    if (!otherCheckingAccount || !otherCreditCardAccount) return;

    // 1. Foreign source CASH account -> 404 NOT_FOUND
    const resForeignFrom = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: otherCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 100.00,
        transaction_date: '2026-11-06'
      });

    expect(resForeignFrom.status).toBe(404);
    expect(resForeignFrom.body.error.code).toBe('NOT_FOUND');

    // 2. Foreign target LOAN_TAKEN account -> 404 NOT_FOUND
    const resForeignTo = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: otherCreditCardAccount.id,
        amount: 100.00,
        transaction_date: '2026-11-06'
      });

    expect(resForeignTo.status).toBe(404);
    expect(resForeignTo.body.error.code).toBe('NOT_FOUND');
  });

  it('TEST-REPAY-CONCURRENT-DEBT (Live DB): serializes concurrent repayments on 3000 THB debt with two 2000 THB requests; exactly 1 succeeds and 1 fails with REPAYMENT_EXCEEDS_DEBT', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Setup initial state: Bank = 10,000 THB, Debt = 3,000 THB
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('10000.00'), is_opening_locked: false }
    });

    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Debt for concurrent test'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Dining'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    // Send two concurrent repayment requests of 2,000.00 THB each
    const req1 = request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 2000.00,
        transaction_date: '2026-11-06',
        description: 'Concurrent payment 1'
      });

    const req2 = request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 2000.00,
        transaction_date: '2026-11-06',
        description: 'Concurrent payment 2'
      });

    const [res1, res2] = await Promise.all([req1, req2]);

    if (res1.status === 201 && res1.body?.data?.transaction?.id) {
      registerTransactionCleanup(res1.body.data.transaction.id);
    }
    if (res2.status === 201 && res2.body?.data?.transaction?.id) {
      registerTransactionCleanup(res2.body.data.transaction.id);
    }

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.success).toBe(true);

    expect(failedRes.body.success).toBe(false);
    expect(failedRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');

    // Verify exactly 1 repayment transaction was recorded in PostgreSQL
    const repaymentTxns = await prisma.transaction.findMany({
      where: {
        user_id: demoUserId,
        primary_account_id: demoCheckingAccount.id,
        form: 'PAYMENT_CHARGE'
      }
    });
    expect(repaymentTxns).toHaveLength(1);

    // Verify debt is exactly 1000.00 THB (not negative)
    const reportRes = await request(app)
      .get('/api/reports/summary')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie);
    expect(reportRes.status).toBe(200);
    expect(Number(reportRes.body.data.credit_debt)).toBe(1000.00);
    expect(Number(reportRes.body.data.bank_balance)).toBe(8000.00);
  });

  it('TEST-REPAY-CONCURRENT-FUNDS (Live DB): serializes concurrent repayments with insufficient bank balance; exactly 1 succeeds and 1 fails with INSUFFICIENT_FUNDS', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const checkingSnap = await captureAccountSnapshot(demoCheckingAccount.id);
    const ccSnap = await captureAccountSnapshot(demoCreditCardAccount.id);
    registerAccountRestore(checkingSnap);
    registerAccountRestore(ccSnap);

    // Setup initial state: Bank = 3,000 THB, Debt = 5,000 THB
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('3000.00'), is_opening_locked: false }
    });

    const purchaseTxn = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('5000.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Large debt for concurrent funds test'
      }
    });
    await prisma.allocationLine.create({
      data: {
        transaction_id: purchaseTxn.id,
        target_account_id: demoDiningAccount.id,
        amount: new Prisma.Decimal('5000.00'),
        notes: 'Dining'
      }
    });
    registerTransactionCleanup(purchaseTxn.id);

    // Send two concurrent repayment requests of 2,000.00 THB each
    const req1 = request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 2000.00,
        transaction_date: '2026-11-06',
        description: 'Concurrent funds 1'
      });

    const req2 = request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie)
      .send({
        from_account_id: demoCheckingAccount.id,
        to_account_id: demoCreditCardAccount.id,
        amount: 2000.00,
        transaction_date: '2026-11-06',
        description: 'Concurrent funds 2'
      });

    const [res1, res2] = await Promise.all([req1, req2]);

    if (res1.status === 201 && res1.body?.data?.transaction?.id) {
      registerTransactionCleanup(res1.body.data.transaction.id);
    }
    if (res2.status === 201 && res2.body?.data?.transaction?.id) {
      registerTransactionCleanup(res2.body.data.transaction.id);
    }

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.success).toBe(true);

    expect(failedRes.body.success).toBe(false);
    expect(failedRes.body.error.code).toBe('INSUFFICIENT_FUNDS');

    // Verify exactly 1 repayment transaction was recorded
    const repaymentTxns = await prisma.transaction.findMany({
      where: {
        user_id: demoUserId,
        primary_account_id: demoCheckingAccount.id,
        form: 'PAYMENT_CHARGE'
      }
    });
    expect(repaymentTxns).toHaveLength(1);

    // Verify bank balance is exactly 1000.00 THB (not negative)
    const reportRes = await request(app)
      .get('/api/reports/summary')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', demoUserSessionCookie);
    expect(reportRes.status).toBe(200);
    expect(Number(reportRes.body.data.bank_balance)).toBe(1000.00);
    expect(Number(reportRes.body.data.credit_debt)).toBe(3000.00);
  });
});

/**
 * Isolated Live PostgreSQL Integration Tests for Lab 7 BR-07 v1.1 (LIVE-01..LIVE-09).
 * Uses a dedicated test user, dedicated accounts, and tracked-ID cleanup only.
 */
describe('Integration Test: PostgreSQL Live DB BR-07 v1.1 Repayment Rules (LIVE-01..09)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  let testUserId = '';
  let testSessionCookie = '';
  let testCashAccountId = '';
  let testCreditCardId = '';
  let testExpenseAccountId = '';

  const createdUserIds: string[] = [];
  const createdAccountIds: string[] = [];
  const createdTxnIds: string[] = [];
  const createdAllocIds: string[] = [];

  async function createRepaymentTestUser(): Promise<{ id: string; cookie: string }> {
    const suffix = `lab7_live_${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        username: suffix,
        email: `${suffix}@whatsss.test`,
        password_hash: '$2b$10$liveTestHashPlaceholderNotForLogin000000000000000000000',
        role: 'USER',
        is_active: true
      }
    });
    createdUserIds.push(user.id);
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: 'USER' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );
    return { id: user.id, cookie: `token=${token}; Path=/; HttpOnly; SameSite=Lax` };
  }

  async function createRepaymentTestAccounts(userId: string) {
    const cash = await prisma.account.create({
      data: { user_id: userId, name: 'Live Test Checking', type: 'CASH', opening_balance: new Prisma.Decimal('0.00') }
    });
    const cc = await prisma.account.create({
      data: { user_id: userId, name: 'Live Test Credit Card', type: 'LOAN_TAKEN', opening_balance: new Prisma.Decimal('0.00') }
    });
    const expense = await prisma.account.create({
      data: { user_id: userId, name: 'Live Test Dining', type: 'EXPENSE', opening_balance: new Prisma.Decimal('0.00') }
    });
    createdAccountIds.push(cash.id, cc.id, expense.id);
    return { cashId: cash.id, ccId: cc.id, expenseId: expense.id };
  }

  async function createRepaymentScenario(cashBalance: string, debtAmount: string) {
    await prisma.account.update({
      where: { id: testCashAccountId },
      data: { opening_balance: new Prisma.Decimal(cashBalance), is_opening_locked: false }
    });
    await prisma.account.update({
      where: { id: testCreditCardId },
      data: { opening_balance: new Prisma.Decimal('0.00'), is_opening_locked: false }
    });

    if (new Prisma.Decimal(debtAmount).greaterThan('0.00')) {
      const txn = await prisma.transaction.create({
        data: {
          user_id: testUserId,
          primary_account_id: testCreditCardId,
          form: 'PAYMENT_CHARGE',
          total_amount: new Prisma.Decimal(debtAmount),
          transaction_date: new Date('2026-11-06T00:00:00.000Z'),
          description: 'Live fixture CC purchase'
        }
      });
      createdTxnIds.push(txn.id);

      const alloc = await prisma.allocationLine.create({
        data: {
          transaction_id: txn.id,
          target_account_id: testExpenseAccountId,
          amount: new Prisma.Decimal(debtAmount),
          notes: 'Live fixture expense'
        }
      });
      createdAllocIds.push(alloc.id);
    }
  }

  async function readPersistedRepaymentState() {
    const cashAcc = await prisma.account.findUniqueOrThrow({ where: { id: testCashAccountId } });
    const ccAcc = await prisma.account.findUniqueOrThrow({ where: { id: testCreditCardId } });
    const txns = await prisma.transaction.findMany({
      where: { user_id: testUserId },
      include: { allocation_lines: true }
    });

    let cashInflow = new Prisma.Decimal('0.00');
    let cashOutflow = new Prisma.Decimal('0.00');
    let ccCharges = new Prisma.Decimal('0.00');
    let ccRepayments = new Prisma.Decimal('0.00');
    let allocCount = 0;

    for (const t of txns) {
      allocCount += t.allocation_lines.length;
      if (t.primary_account_id === testCashAccountId) {
        if (t.form === 'RECEIVE_MONEY') cashInflow = cashInflow.add(t.total_amount);
        if (t.form === 'PAYMENT_CHARGE') cashOutflow = cashOutflow.add(t.total_amount);
      }
      if (t.primary_account_id === testCreditCardId && t.form === 'PAYMENT_CHARGE') {
        ccCharges = ccCharges.add(t.total_amount);
      }
      for (const line of t.allocation_lines) {
        if (line.target_account_id === testCreditCardId && t.primary_account_id === testCashAccountId) {
          ccRepayments = ccRepayments.add(line.amount);
        }
      }
    }

    return {
      cashBalance: new Prisma.Decimal(cashAcc.opening_balance.toString()).add(cashInflow).sub(cashOutflow),
      debtBalance: new Prisma.Decimal(ccAcc.opening_balance.toString()).add(ccCharges).sub(ccRepayments),
      txnCount: txns.length,
      allocCount
    };
  }

  async function postLiveRepayment(amount: number) {
    return request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', testSessionCookie)
      .send({
        from_account_id: testCashAccountId,
        to_account_id: testCreditCardId,
        amount,
        transaction_date: '2026-11-06',
        description: 'Live BR-07 v1.1 repayment'
      });
  }

  async function assertRejectedRepaymentUnchanged(
    res: request.Response,
    expectedStatus: number,
    expectedCode: string,
    before: Awaited<ReturnType<typeof readPersistedRepaymentState>>,
    expectedCash: string,
    expectedDebt: string,
    expectedExpense: string
  ) {
    expect(res.status).toBe(expectedStatus);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(expectedCode);

    const after = await readPersistedRepaymentState();
    expect(after.txnCount).toBe(before.txnCount);
    expect(after.allocCount).toBe(before.allocCount);
    expect(after.cashBalance.equals(new Prisma.Decimal(expectedCash))).toBe(true);
    expect(after.debtBalance.equals(new Prisma.Decimal(expectedDebt))).toBe(true);

    const summaryRes = await request(app).get('/api/reports/summary').set('Cookie', testSessionCookie);
    expect(summaryRes.status).toBe(200);
    expect(new Prisma.Decimal(summaryRes.body.data.total_expense.toString()).equals(new Prisma.Decimal(expectedExpense))).toBe(true);
  }

  async function assertAcceptedRepaymentPersisted(
    res: request.Response,
    before: Awaited<ReturnType<typeof readPersistedRepaymentState>>,
    repayAmount: string,
    expectedCash: string,
    expectedDebt: string,
    expectedExpense: string
  ) {
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const txnId: string = res.body.data.transaction.id;
    createdTxnIds.push(txnId);
    for (const a of res.body.data.transaction.allocations) {
      createdAllocIds.push(a.id);
    }

    const persistedTxn = await prisma.transaction.findUniqueOrThrow({
      where: { id: txnId },
      include: { allocation_lines: true }
    });
    expect(persistedTxn.user_id).toBe(testUserId);
    expect(persistedTxn.primary_account_id).toBe(testCashAccountId);
    expect(persistedTxn.form).toBe('PAYMENT_CHARGE');
    expect(new Prisma.Decimal(persistedTxn.total_amount.toString()).equals(new Prisma.Decimal(repayAmount))).toBe(true);
    expect(persistedTxn.allocation_lines).toHaveLength(1);
    expect(persistedTxn.allocation_lines[0].target_account_id).toBe(testCreditCardId);
    expect(new Prisma.Decimal(persistedTxn.allocation_lines[0].amount.toString()).equals(new Prisma.Decimal(repayAmount))).toBe(true);

    const after = await readPersistedRepaymentState();
    expect(after.txnCount).toBe(before.txnCount + 1);
    expect(after.allocCount).toBe(before.allocCount + 1);
    expect(after.cashBalance.equals(new Prisma.Decimal(expectedCash))).toBe(true);
    expect(after.debtBalance.equals(new Prisma.Decimal(expectedDebt))).toBe(true);

    const summaryRes = await request(app).get('/api/reports/summary').set('Cookie', testSessionCookie);
    expect(summaryRes.status).toBe(200);
    expect(new Prisma.Decimal(summaryRes.body.data.total_expense.toString()).equals(new Prisma.Decimal(expectedExpense))).toBe(true);
  }

  async function cleanupTrackedTransactions() {
    if (!isDbConnected) return;
    if (createdAllocIds.length > 0) {
      await prisma.allocationLine.deleteMany({ where: { id: { in: [...createdAllocIds] } } });
      createdAllocIds.length = 0;
    }
    if (createdTxnIds.length > 0) {
      await prisma.allocationLine.deleteMany({ where: { transaction_id: { in: [...createdTxnIds] } } });
      await prisma.transaction.deleteMany({ where: { id: { in: [...createdTxnIds] } } });
      createdTxnIds.length = 0;
    }
  }

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) return;
    assertTestDatabase(databaseUrl, { isCI, allowLiveDb, nodeEnv: process.env.NODE_ENV });

    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch (err) {
      if (isCI || allowLiveDb) {
        throw new Error(`[Lab 7 Live DB FAILURE] Connection failed: ${err}`);
      }
      return;
    }

    const user = await createRepaymentTestUser();
    testUserId = user.id;
    testSessionCookie = user.cookie;
    const accs = await createRepaymentTestAccounts(testUserId);
    testCashAccountId = accs.cashId;
    testCreditCardId = accs.ccId;
    testExpenseAccountId = accs.expenseId;
  });

  afterEach(async () => {
    await cleanupTrackedTransactions();
  });

  afterAll(async () => {
    if (isDbConnected && prisma) {
      await cleanupTrackedTransactions();
      if (createdAccountIds.length > 0) {
        await prisma.account.deleteMany({ where: { id: { in: [...createdAccountIds] } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: [...createdUserIds] } } });
      }
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('LIVE-01: rejects 599.99 below 10% minimum on 6000.00 debt with MIN_REPAYMENT_NOT_MET', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('10000.00', '6000.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(599.99);
    await assertRejectedRepaymentUnchanged(res, 422, 'MIN_REPAYMENT_NOT_MET', before, '10000.00', '6000.00', '6000.00');
  });

  it('LIVE-02: accepts exact 600.00 minimum on 6000.00 debt and persists 1 txn + 1 alloc', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('10000.00', '6000.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(600.00);
    await assertAcceptedRepaymentPersisted(res, before, '600.00', '9400.00', '5400.00', '6000.00');
  });

  it('LIVE-03: rejects partial 1500.00 leaving 99.99 (<100.00 reserve) with MINIMUM_CASH_RESERVE_VIOLATION', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('1599.99', '3000.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(1500.00);
    await assertRejectedRepaymentUnchanged(res, 422, 'MINIMUM_CASH_RESERVE_VIOLATION', before, '1599.99', '3000.00', '3000.00');
  });

  it('LIVE-04: accepts partial 1500.00 leaving exact 100.00 cash reserve', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('1600.00', '3000.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(1500.00);
    await assertAcceptedRepaymentPersisted(res, before, '1500.00', '100.00', '1500.00', '3000.00');
  });

  it('LIVE-05: rejects 500.00 on 0.00 debt with ZERO_OUTSTANDING_DEBT', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('10000.00', '0.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(500.00);
    await assertRejectedRepaymentUnchanged(res, 422, 'ZERO_OUTSTANDING_DEBT', before, '10000.00', '0.00', '0.00');
  });

  it('LIVE-06: accepts full settlement 3000.00 when Cash is 3000.00 (reserve exemption)', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('3000.00', '3000.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(3000.00);
    await assertAcceptedRepaymentPersisted(res, before, '3000.00', '0.00', '0.00', '3000.00');
  });

  it('LIVE-07: rejects full settlement 3000.00 when Cash is 2999.99 with INSUFFICIENT_FUNDS', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('2999.99', '3000.00');
    const before = await readPersistedRepaymentState();
    const res = await postLiveRepayment(3000.00);
    await assertRejectedRepaymentUnchanged(res, 422, 'INSUFFICIENT_FUNDS', before, '2999.99', '3000.00', '3000.00');
  });

  it('LIVE-08: enforces below-500 full settlement (499.98 rejected, 499.99 accepted)', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('10000.00', '499.99');
    const before = await readPersistedRepaymentState();
    const failRes = await postLiveRepayment(499.98);
    await assertRejectedRepaymentUnchanged(failRes, 422, 'MIN_REPAYMENT_NOT_MET', before, '10000.00', '499.99', '499.99');

    const okRes = await postLiveRepayment(499.99);
    await assertAcceptedRepaymentPersisted(okRes, before, '499.99', '9500.01', '0.00', '499.99');
  });

  it('LIVE-09: enforces ROUND_HALF_UP boundary on 5555.55 debt (555.55 rejected, 555.56 accepted)', async (ctx) => {
    if (!isDbConnected) { ctx.skip(); return; }
    await createRepaymentScenario('10000.00', '5555.55');
    const before = await readPersistedRepaymentState();
    const failRes = await postLiveRepayment(555.55);
    await assertRejectedRepaymentUnchanged(failRes, 422, 'MIN_REPAYMENT_NOT_MET', before, '10000.00', '5555.55', '5555.55');

    const okRes = await postLiveRepayment(555.56);
    await assertAcceptedRepaymentPersisted(okRes, before, '555.56', '9444.44', '4999.99', '5555.55');
  });
});
