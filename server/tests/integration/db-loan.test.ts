import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

/**
 * Integration Test: PostgreSQL Live Database Peer Lending (F-12) & General Borrowing (F-13) (WP-09)
 * Target: TEST-LOAN-GIVEN-01..05, TEST-LOAN-TAKEN-01..05, and Multi-Workflow Balance & Report Regression
 * All tests execute against a real PostgreSQL 16 database ("whatsss_test") and verify persisted database state.
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
    savingsOpening?: string;
    friendLoanOpening: string;
    personalLoanOpening: string;
    visaCardOpening?: string;
  }): Promise<{
    userId: string;
    cookie: string;
    checkingId: string;
    savingsId: string;
    friendLoanId: string;
    personalLoanId: string;
    visaCardId: string;
    salaryId: string;
    diningId: string;
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

    const savings = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Savings Bank',
        normalized_name: 'savings bank',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal(opts.savingsOpening ?? '0.00'),
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

    const salary = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Salary',
        normalized_name: 'salary',
        type: 'INCOME',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const dining = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Dining',
        normalized_name: 'dining',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
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
      savingsId: savings.id,
      friendLoanId: friendLoan.id,
      personalLoanId: personalLoan.id,
      visaCardId: visaCard.id,
      salaryId: salary.id,
      diningId: dining.id
    };
  }

  it('TEST-LOAN-GIVEN-01 & TEST-LOAN-GIVEN-02 (Live PostgreSQL): disburses 2500.00 THB loan given and recovers partial (1000.00) + full remaining (1500.00) THB on live PostgreSQL 16 while preserving total_income = 0.00 and total_expense = 0.00 (BR-08)', async (ctx) => {
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

    // Verify in PostgreSQL and via GET /api/accounts after disbursement
    let accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    expect(accRes.status).toBe(200);
    let checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.checkingId);
    let friendLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.friendLoanId);
    expect(checkingAcc.current_balance).toBe(7500.00);
    expect(friendLoanAcc.current_balance).toBe(2500.00);
    expect(checkingAcc.is_opening_locked).toBe(true);
    expect(friendLoanAcc.is_opening_locked).toBe(true);

    // 2. Partial Recovery of 1000.00 THB (TEST-LOAN-GIVEN-02)
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

    // 3. Full Remaining Recovery of 1500.00 THB returning receivable to 0.00
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

    accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.checkingId);
    friendLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.friendLoanId);
    expect(checkingAcc.current_balance).toBe(10000.00);
    expect(friendLoanAcc.current_balance).toBe(0.00);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(10000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-LOAN-GIVEN-03 (Live PostgreSQL): rejects insufficient cash disbursement (422 INSUFFICIENT_FUNDS), zero-receivable recovery (422 ZERO_OUTSTANDING_RECEIVABLE), over-recovery (422 RECOVERY_EXCEEDS_RECEIVABLE), and archived accounts (422 ACCOUNT_ARCHIVED) with zero partial writes in PostgreSQL', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '10000.00',
      friendLoanOpening: '0.00',
      personalLoanOpening: '0.00'
    });

    // 1. Loan Given when cash is insufficient (15000.00 > 10000.00) -> 422 INSUFFICIENT_FUNDS
    const insuffGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.friendLoanId,
        amount: 15000.00,
        transaction_date: '2026-11-12'
      });
    expect(insuffGiveRes.status).toBe(422);
    expect(insuffGiveRes.body.error.code).toBe('INSUFFICIENT_FUNDS');

    // Verify in PostgreSQL: 0 transactions, 0 allocation lines, balances and locks untouched
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(0);
    expect(await prisma.allocationLine.count({ where: { transaction: { user_id: tenant.userId } } })).toBe(0);
    const dbCheckingBefore = await prisma.account.findUniqueOrThrow({ where: { id: tenant.checkingId } });
    expect(dbCheckingBefore.is_opening_locked).toBe(false);

    // 2. Loan Recovery when receivable is 0.00 -> 422 ZERO_OUTSTANDING_RECEIVABLE
    const zeroRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.friendLoanId,
        to_account_id: tenant.checkingId,
        amount: 100.00,
        transaction_date: '2026-11-12'
      });
    expect(zeroRecRes.status).toBe(422);
    expect(zeroRecRes.body.error.code).toBe('ZERO_OUTSTANDING_RECEIVABLE');
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(0);
    expect(await prisma.allocationLine.count({ where: { transaction: { user_id: tenant.userId } } })).toBe(0);

    // Seed a valid 2500.00 THB Loan Given so receivable = 2500.00, cash = 7500.00
    const validGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.friendLoanId,
        amount: 2500.00,
        transaction_date: '2026-11-12'
      });
    expect(validGiveRes.status).toBe(201);
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(1);

    // 3. Loan Recovery exceeding receivable (3000.00 > 2500.00) -> 422 RECOVERY_EXCEEDS_RECEIVABLE
    const overRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.friendLoanId,
        to_account_id: tenant.checkingId,
        amount: 3000.00,
        transaction_date: '2026-11-13'
      });
    expect(overRecRes.status).toBe(422);
    expect(overRecRes.body.error.code).toBe('RECOVERY_EXCEEDS_RECEIVABLE');

    // Verify in PostgreSQL: transaction count remains 1, cash = 7500.00, receivable = 2500.00
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(1);
    expect(await prisma.allocationLine.count({ where: { transaction: { user_id: tenant.userId } } })).toBe(1);

    // 4. Archived Account Guard in PostgreSQL -> 422 ACCOUNT_ARCHIVED
    await prisma.account.update({
      where: { id: tenant.friendLoanId },
      data: { is_archived: true }
    });

    const archivedGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.friendLoanId,
        amount: 500.00,
        transaction_date: '2026-11-14'
      });
    expect(archivedGiveRes.status).toBe(422);
    expect(archivedGiveRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const archivedRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.friendLoanId,
        to_account_id: tenant.checkingId,
        amount: 500.00,
        transaction_date: '2026-11-14'
      });
    expect(archivedRecRes.status).toBe(422);
    expect(archivedRecRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    await prisma.account.update({
      where: { id: tenant.friendLoanId },
      data: { is_archived: false }
    });

    // Verify database balances after all rejected attempts remain 7500.00 cash and 2500.00 receivable
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    const checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.checkingId);
    const friendLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.friendLoanId);
    expect(checkingAcc.current_balance).toBe(7500.00);
    expect(friendLoanAcc.current_balance).toBe(2500.00);
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(1);
  });

  it('TEST-LOAN-GIVEN-04 (Live PostgreSQL): enforces cross-tenant isolation (404 NOT_FOUND on another user account) and blocks ADMIN financial access (403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN) with zero database writes (BR-01, BR-10)', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenantA = await createIsolatedLoanTenant({
      checkingOpening: '10000.00',
      friendLoanOpening: '1500.00',
      personalLoanOpening: '2000.00'
    });
    const tenantB = await createIsolatedLoanTenant({
      checkingOpening: '8000.00',
      friendLoanOpening: '1200.00',
      personalLoanOpening: '3000.00'
    });

    // 1. Tenant A attempts to disburse loan-given to Tenant B's LOAN_GIVEN account -> 404 NOT_FOUND
    const crossGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({
        from_account_id: tenantA.checkingId,
        to_account_id: tenantB.friendLoanId,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(crossGiveRes.status).toBe(404);
    expect(crossGiveRes.body.error.code).toBe('NOT_FOUND');

    // 2. Tenant A attempts to recover loan-recovery from Tenant B's LOAN_GIVEN account -> 404 NOT_FOUND
    const crossRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({
        from_account_id: tenantB.friendLoanId,
        to_account_id: tenantA.checkingId,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(crossRecRes.status).toBe(404);
    expect(crossRecRes.body.error.code).toBe('NOT_FOUND');

    // 3. Tenant A attempts to borrow/repay targeting Tenant B's GENERAL_LOAN account -> 404 NOT_FOUND
    const crossBorrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({
        from_account_id: tenantB.personalLoanId,
        to_account_id: tenantA.checkingId,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(crossBorrowRes.status).toBe(404);
    expect(crossBorrowRes.body.error.code).toBe('NOT_FOUND');

    const crossRepayRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({
        from_account_id: tenantA.checkingId,
        to_account_id: tenantB.personalLoanId,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(crossRepayRes.status).toBe(404);
    expect(crossRepayRes.body.error.code).toBe('NOT_FOUND');

    // 4. ADMIN role blocked across all 4 loan endpoints -> 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN (BR-10)
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { username: 'admin_demo' } });
    const adminToken = jwt.sign(
      { userId: adminUser.id, username: adminUser.username, role: 'ADMIN' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );
    const adminCookie = `token=${adminToken}; Path=/; HttpOnly; SameSite=Lax`;

    for (const endpoint of [
      '/api/transactions/loan-given',
      '/api/transactions/loan-recovery',
      '/api/transactions/loan-borrowing',
      '/api/transactions/loan-repayment'
    ]) {
      const adminRes = await request(app)
        .post(endpoint)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', adminCookie)
        .send({
          from_account_id: tenantA.checkingId,
          to_account_id: tenantA.friendLoanId,
          amount: 500.00,
          transaction_date: '2026-11-12'
        });
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    }

    // Verify in PostgreSQL: zero transactions written for either tenant and all balances untouched
    expect(await prisma.transaction.count({ where: { user_id: { in: [tenantA.userId, tenantB.userId] } } })).toBe(0);
    const accResB = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenantB.cookie);
    expect(accResB.body.data.accounts.find((a: any) => a.id === tenantB.checkingId).current_balance).toBe(8000.00);
    expect(accResB.body.data.accounts.find((a: any) => a.id === tenantB.friendLoanId).current_balance).toBe(1200.00);
    expect(accResB.body.data.accounts.find((a: any) => a.id === tenantB.personalLoanId).current_balance).toBe(3000.00);
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

  it('TEST-LOAN-TAKEN-01, TEST-LOAN-TAKEN-02 & TEST-LOAN-TAKEN-04 (Live PostgreSQL): borrows 4000.00 THB on GENERAL_LOAN, repays partial (< 500 THB floor and leaving < 100 THB cash) and full remaining debt to 0.00, enforces CREDIT_CARD vs GENERAL_LOAN separation, and preserves total_income = 0.00 / total_expense = 0.00', async (ctx) => {
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

    // 2. Partial repayments: 200.00 THB (< 500 THB floor) and 3750.00 THB (leaving 50.00 THB cash < 100 THB reserve) (TEST-LOAN-TAKEN-02)
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

    // 3. Domain separation (TEST-LOAN-TAKEN-04): GENERAL_LOAN rejected on /repayment, CREDIT_CARD rejected on /loan-repayment and /loan-borrowing
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

    const ccToGeneralBorrow = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.visaCardId,
        to_account_id: tenant.checkingId,
        amount: 50.00,
        transaction_date: '2026-11-17'
      });
    expect(ccToGeneralBorrow.status).toBe(400);
    expect(ccToGeneralBorrow.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    // 4. Full repayment of remaining 50.00 THB general loan debt -> debt returns to 0.00
    const repay3 = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 50.00,
        transaction_date: '2026-11-18'
      });
    expect(repay3.status).toBe(201);
    expect(repay3.body.data.updated_cash_balance).toBe('0.00');
    expect(repay3.body.data.updated_debt).toBe('0.00');

    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    const personalLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.personalLoanId);
    expect(personalLoanAcc.current_balance).toBe(0.00);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(0.00);
    expect(summaryRes.body.data.credit_debt).toBe(3000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-LOAN-TAKEN-03 (Live PostgreSQL): rejects general loan repayment on zero debt (422 ZERO_OUTSTANDING_DEBT), over-repayment (422 REPAYMENT_EXCEEDS_DEBT), insufficient cash (422 INSUFFICIENT_FUNDS), and archived accounts (422 ACCOUNT_ARCHIVED) with zero partial writes in PostgreSQL', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '1000.00',
      friendLoanOpening: '0.00',
      personalLoanOpening: '0.00'
    });

    // 1. Repay when general loan debt is 0.00 -> 422 ZERO_OUTSTANDING_DEBT
    const zeroDebtRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 100.00,
        transaction_date: '2026-11-12'
      });
    expect(zeroDebtRes.status).toBe(422);
    expect(zeroDebtRes.body.error.code).toBe('ZERO_OUTSTANDING_DEBT');
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(0);
    expect(await prisma.allocationLine.count({ where: { transaction: { user_id: tenant.userId } } })).toBe(0);

    // Update Personal Loan opening balance to 4000.00 THB so debt = 4000.00, while cash = 1000.00
    await prisma.account.update({
      where: { id: tenant.personalLoanId },
      data: { opening_balance: new Prisma.Decimal('4000.00') }
    });

    // 2. Repay 5000.00 on 4000.00 debt -> 422 REPAYMENT_EXCEEDS_DEBT
    const overRepayRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 5000.00,
        transaction_date: '2026-11-12'
      });
    expect(overRepayRes.status).toBe(422);
    expect(overRepayRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(0);

    // 3. Repay 3000.00 on 4000.00 debt when CASH = 1000.00 -> 422 INSUFFICIENT_FUNDS
    const insuffRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 3000.00,
        transaction_date: '2026-11-12'
      });
    expect(insuffRes.status).toBe(422);
    expect(insuffRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(0);
    expect(await prisma.allocationLine.count({ where: { transaction: { user_id: tenant.userId } } })).toBe(0);

    // 4. Archived Account Guard in PostgreSQL -> 422 ACCOUNT_ARCHIVED
    await prisma.account.update({
      where: { id: tenant.personalLoanId },
      data: { is_archived: true }
    });

    const archivedBorrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.personalLoanId,
        to_account_id: tenant.checkingId,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(archivedBorrowRes.status).toBe(422);
    expect(archivedBorrowRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const archivedRepayRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(archivedRepayRes.status).toBe(422);
    expect(archivedRepayRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    await prisma.account.update({
      where: { id: tenant.personalLoanId },
      data: { is_archived: false }
    });

    // Verify in PostgreSQL: 0 transactions, cash remains 1000.00, debt remains 4000.00
    expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(0);
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    expect(accRes.body.data.accounts.find((a: any) => a.id === tenant.checkingId).current_balance).toBe(1000.00);
    expect(accRes.body.data.accounts.find((a: any) => a.id === tenant.personalLoanId).current_balance).toBe(4000.00);
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

  it('Multi-Workflow Ledger & Report Consistency Regression (Live PostgreSQL): executes Income (F-04), CC Purchase (F-05), CC Repayment (F-07 / BR-07 v1.1), Internal Cash Transfer (F-11 / BR-02), Loan Given & Recovery (F-12 / BR-08), and General Loan Borrowing & Repayment (F-13 / BR-08) in one ledger without double-counting and verifies GET /api/accounts matches GET /api/reports/summary', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    // Initial state: Checking = 10000.00, Savings = 2000.00, Friend Loan = 0.00, Personal Loan = 0.00, Visa CC = 0.00
    const tenant = await createIsolatedLoanTenant({
      checkingOpening: '10000.00',
      savingsOpening: '2000.00',
      friendLoanOpening: '0.00',
      personalLoanOpening: '0.00',
      visaCardOpening: '0.00'
    });

    // 1. Record Income (F-04): +20000.00 THB into Checking Bank from Salary -> Checking = 30000.00, total_income = 20000.00
    const incRes = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.checkingId,
        income_account_id: tenant.salaryId,
        total_amount: '20000.00',
        transaction_date: '2026-11-01',
        description: 'Monthly Salary'
      });
    expect(incRes.status).toBe(201);

    // 2. Record Credit Card Purchase (F-05): 3000.00 THB on Visa Credit Card for Dining -> Visa Debt = 3000.00, total_expense = 3000.00
    const expRes = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.visaCardId,
        total_amount: '3000.00',
        transaction_date: '2026-11-02',
        description: 'Team Dinner',
        allocations: [{ target_account_id: tenant.diningId, amount: '3000.00', notes: 'Dining' }]
      });
    expect(expRes.status).toBe(201);

    // 3. Verify BR-07 v1.1 minimum repayment floor (400.00 < 500.00 floor on 3000.00 CC debt -> 422 MIN_REPAYMENT_NOT_MET)
    const belowFloorCcRepay = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.visaCardId,
        amount: 400.00,
        transaction_date: '2026-11-03'
      });
    expect(belowFloorCcRepay.status).toBe(422);
    expect(belowFloorCcRepay.body.error.code).toBe('MIN_REPAYMENT_NOT_MET');

    // Record valid 1000.00 THB Credit Card Repayment (F-07): Checking = 29000.00, Visa Debt = 2000.00
    const ccRepayRes = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.visaCardId,
        amount: 1000.00,
        transaction_date: '2026-11-03',
        description: 'Visa partial settlement'
      });
    expect(ccRepayRes.status).toBe(201);

    // 4. Record Internal Cash Transfer (F-11, BR-02): 4000.00 THB Checking -> Savings (Checking = 25000.00, Savings = 6000.00)
    const xferRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.savingsId,
        amount: 4000.00,
        transaction_date: '2026-11-04',
        description: 'Transfer to Savings'
      });
    expect(xferRes.status).toBe(201);

    // 5. Record Loan Given (2500.00 from Checking) & Partial Recovery (1000.00 into Savings) (F-12, BR-08)
    // -> Checking = 22500.00, Savings = 7000.00, Friend Loan Receivable = 1500.00
    const giveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.friendLoanId,
        amount: 2500.00,
        transaction_date: '2026-11-05'
      });
    expect(giveRes.status).toBe(201);

    const recRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.friendLoanId,
        to_account_id: tenant.savingsId,
        amount: 1000.00,
        transaction_date: '2026-11-06'
      });
    expect(recRes.status).toBe(201);

    // 6. Record General Loan Borrowing (5000.00 from Personal Loan into Checking) & Partial Repayment (1200.00 from Checking to Personal Loan) (F-13, BR-08)
    // -> Checking = 22500.00 + 5000.00 - 1200.00 = 26300.00, Savings = 7000.00, Personal Loan Debt = 3800.00, Visa Debt = 2000.00
    const borrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.personalLoanId,
        to_account_id: tenant.checkingId,
        amount: 5000.00,
        transaction_date: '2026-11-07'
      });
    expect(borrowRes.status).toBe(201);

    const genRepayRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.checkingId,
        to_account_id: tenant.personalLoanId,
        amount: 1200.00,
        transaction_date: '2026-11-08'
      });
    expect(genRepayRes.status).toBe(201);

    // 7. Cross-verify GET /api/accounts and GET /api/reports/summary on live PostgreSQL 16 (zero double counting)
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    expect(accRes.status).toBe(200);
    const accountsList = accRes.body.data.accounts as Array<any>;

    const checkingAcc = accountsList.find((a) => a.id === tenant.checkingId);
    const savingsAcc = accountsList.find((a) => a.id === tenant.savingsId);
    const friendLoanAcc = accountsList.find((a) => a.id === tenant.friendLoanId);
    const personalLoanAcc = accountsList.find((a) => a.id === tenant.personalLoanId);
    const visaCardAcc = accountsList.find((a) => a.id === tenant.visaCardId);

    expect(checkingAcc.current_balance).toBe(26300.00);
    expect(savingsAcc.current_balance).toBe(7000.00);
    expect(friendLoanAcc.current_balance).toBe(1500.00);
    expect(personalLoanAcc.current_balance).toBe(3800.00);
    expect(visaCardAcc.current_balance).toBe(2000.00);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);

    // Aggregate CASH balance across accounts (26300.00 + 7000.00 = 33300.00) must equal summary.bank_balance
    const sumCashAccounts = checkingAcc.current_balance + savingsAcc.current_balance;
    expect(sumCashAccounts).toBe(33300.00);
    expect(summaryRes.body.data.bank_balance).toBe(sumCashAccounts);

    // Aggregate LOAN_TAKEN debt across accounts (2000.00 + 3800.00 = 5800.00) must equal summary.credit_debt
    const sumLoanTakenAccounts = visaCardAcc.current_balance + personalLoanAcc.current_balance;
    expect(sumLoanTakenAccounts).toBe(5800.00);
    expect(summaryRes.body.data.credit_debt).toBe(sumLoanTakenAccounts);

    // Total Income (20000.00) and Total Expense (3000.00) strictly exclude transfers, repayments, and loan movements (BR-02, BR-08)
    expect(summaryRes.body.data.total_income).toBe(20000.00);
    expect(summaryRes.body.data.total_expense).toBe(3000.00);
    expect(summaryRes.body.data.category_breakdown).toEqual({ Dining: 3000.00 });
  });
});
