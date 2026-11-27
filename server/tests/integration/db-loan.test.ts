import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

/**
 * Integration Test: PostgreSQL Live Database Peer Lending (F-12) & General Borrowing (F-13) (WP-09)
 * Target: TEST-LOAN-GIVEN-01, TEST-LOAN-GIVEN-02, TEST-LOAN-GIVEN-05, TEST-LOAN-TAKEN-01, TEST-LOAN-TAKEN-02, TEST-LOAN-TAKEN-04, TEST-LOAN-TAKEN-05
 */
describe('Integration Test: PostgreSQL Live Database Peer Lending (F-12) & General Borrowing (F-13) (WP-09)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  const pendingCleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) {
      console.warn(
        '[WP-09 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
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
        throw new Error(`[WP-09 LIVE DB FAILURE] PostgreSQL live database connection failed: ${err}`);
      }
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

  async function createIsolatedLoanTenant(opts: {
    checkingOpening: string;
    friendLoanOpening: string;
    personalLoanOpening: string;
    visaCardOpening?: string;
  }): Promise<{
    userId: string;
    cookie: string;
    checkingId: string;
    friendLoanId: string;
    personalLoanId: string;
    visaCardId: string;
  }> {
    const suffix = `wp09_loan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({
      data: {
        username: suffix,
        email: `${suffix}@whatsss.test`,
        password_hash: '$2b$10$liveLoanTestHashPlaceholder0000000000000000000000000000',
        role: 'USER',
        is_active: true
      }
    });

    const checking = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Checking Bank',
        normalized_name: 'checking bank',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal(opts.checkingOpening),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const friendLoan = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Friend Loan',
        normalized_name: 'friend loan',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal(opts.friendLoanOpening),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const personalLoan = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Personal Loan',
        normalized_name: 'personal loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal(opts.personalLoanOpening),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const visaCard = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Visa Credit Card',
        normalized_name: 'visa credit card',
        type: 'LOAN_TAKEN',
        subtype: 'CREDIT_CARD',
        opening_balance: new Prisma.Decimal(opts.visaCardOpening ?? '0.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    pendingCleanups.push(async () => {
      await prisma.allocationLine.deleteMany({
        where: { transaction: { user_id: user.id } }
      });
      await prisma.transaction.deleteMany({
        where: { user_id: user.id }
      });
      await prisma.account.deleteMany({
        where: { user_id: user.id }
      });
      await prisma.user.deleteMany({
        where: { id: user.id }
      });
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: 'USER' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    return {
      userId: user.id,
      cookie: `token=${token}; Path=/; HttpOnly; SameSite=Lax`,
      checkingId: checking.id,
      friendLoanId: friendLoan.id,
      personalLoanId: personalLoan.id,
      visaCardId: visaCard.id
    };
  }

  it('TEST-LOAN-GIVEN-01 & TEST-LOAN-GIVEN-02 (Live PostgreSQL): disburses 2500.00 THB loan given and recovers 1000.00 + 1500.00 THB on live PostgreSQL 16 while preserving total_income = 0.00 and total_expense = 0.00 (BR-08)', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '10000.00',
      friendLoanOpening: '0.00',
      personalLoanOpening: '0.00'
    });

    // 1. Disburse 2500.00 THB (TEST-LOAN-GIVEN-01)
    const giveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.friendLoanId,
        amount: 2500.00,
        transaction_date: '2026-11-12',
        description: 'Live PG16 Loan Given'
      });
    expect(giveRes.status).toBe(201);
    expect(giveRes.body.data.updated_cash_balance).toBe('7500.00');
    expect(giveRes.body.data.updated_receivable).toBe('2500.00');

    // 2. Recover 1000.00 THB then 1500.00 THB (TEST-LOAN-GIVEN-02)
    const rec1 = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.friendLoanId,
        to_account_id: tenant.checkingId,
        amount: 1000.00,
        transaction_date: '2026-11-15'
      });
    expect(rec1.status).toBe(201);
    expect(rec1.body.data.updated_cash_balance).toBe('8500.00');
    expect(rec1.body.data.updated_receivable).toBe('1500.00');

    const rec2 = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.friendLoanId,
        to_account_id: tenant.checkingId,
        amount: 1500.00,
        transaction_date: '2026-11-18'
      });
    expect(rec2.status).toBe(201);
    expect(rec2.body.data.updated_cash_balance).toBe('10000.00');
    expect(rec2.body.data.updated_receivable).toBe('0.00');

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(10000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-LOAN-GIVEN-05 (Live PostgreSQL): serializes concurrent loan-recovery requests under SELECT ... FOR UPDATE row locks so only 1 succeeds when total exceeds receivable and receivable never becomes negative', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '5000.00',
      friendLoanOpening: '2000.00',
      personalLoanOpening: '0.00'
    });

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/loan-recovery')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          from_account_id: tenant.friendLoanId,
          to_account_id: tenant.checkingId,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent Recovery A'
        }),
      request(app)
        .post('/api/transactions/loan-recovery')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          from_account_id: tenant.friendLoanId,
          to_account_id: tenant.checkingId,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent Recovery B'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.data.updated_receivable).toBe('500.00');
    expect(successRes.body.data.updated_cash_balance).toBe('6500.00');
    expect(failedRes.body.error.code).toBe('RECOVERY_EXCEEDS_RECEIVABLE');

    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    const friendAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.friendLoanId);
    expect(friendAcc.current_balance).toBe(500.00);
    expect(friendAcc.current_balance).toBeGreaterThanOrEqual(0);
  });

  it('TEST-LOAN-TAKEN-01, TEST-LOAN-TAKEN-02 & TEST-LOAN-TAKEN-04 (Live PostgreSQL): borrows 4000.00 THB on GENERAL_LOAN, repays < 500 THB floor and leaving < 100 THB cash, enforces CREDIT_CARD vs GENERAL_LOAN separation, and preserves total_income = 0.00 / total_expense = 0.00', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '0.00',
      friendLoanOpening: '0.00',
      personalLoanOpening: '0.00',
      visaCardOpening: '3000.00'
    });

    // 1. Borrow 4000.00 THB (TEST-LOAN-TAKEN-01)
    const borrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.personalLoanId,
        to_account_id: tenant.checkingId,
        amount: 4000.00,
        transaction_date: '2026-11-12'
      });
    expect(borrowRes.status).toBe(201);
    expect(borrowRes.body.data.updated_cash_balance).toBe('4000.00');
    expect(borrowRes.body.data.updated_debt).toBe('4000.00');

    // 2. Repay 200.00 THB (< 500 THB floor) and 3750.00 THB (leaving 50.00 THB cash < 100 THB reserve) (TEST-LOAN-TAKEN-02)
    const repay1 = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 200.00,
        transaction_date: '2026-11-15'
      });
    expect(repay1.status).toBe(201);
    expect(repay1.body.data.updated_debt).toBe('3800.00');

    const repay2 = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 3750.00,
        transaction_date: '2026-11-16'
      });
    expect(repay2.status).toBe(201);
    expect(repay2.body.data.updated_cash_balance).toBe('50.00');
    expect(repay2.body.data.updated_debt).toBe('50.00');

    // 3. Domain separation (TEST-LOAN-TAKEN-04): GENERAL_LOAN rejected on /repayment, CREDIT_CARD rejected on /loan-repayment
    const generalToCcRepay = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 50.00,
        transaction_date: '2026-11-17'
      });
    expect(generalToCcRepay.status).toBe(400);
    expect(generalToCcRepay.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    const ccToGeneralRepay = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.visaCardId,
        amount: 50.00,
        transaction_date: '2026-11-17'
      });
    expect(ccToGeneralRepay.status).toBe(400);
    expect(ccToGeneralRepay.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(50.00);
    expect(summaryRes.body.data.credit_debt).toBe(3050.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-LOAN-TAKEN-05 (Live PostgreSQL): serializes concurrent general loan repayment requests under SELECT ... FOR UPDATE row locks so only 1 succeeds when total exceeds debt and debt never becomes negative', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '10000.00',
      friendLoanOpening: '0.00',
      personalLoanOpening: '2000.00'
    });

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/loan-repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          from_account_id: tenant.checkingId,
          to_account_id: tenant.personalLoanId,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent General Loan Repay A'
        }),
      request(app)
        .post('/api/transactions/loan-repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          from_account_id: tenant.checkingId,
          to_account_id: tenant.personalLoanId,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent General Loan Repay B'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.data.updated_debt).toBe('500.00');
    expect(successRes.body.data.updated_cash_balance).toBe('8500.00');
    expect(failedRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');

    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    const personalLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.personalLoanId);
    expect(personalLoanAcc.current_balance).toBe(500.00);
    expect(personalLoanAcc.current_balance).toBeGreaterThanOrEqual(0);
  });
});
