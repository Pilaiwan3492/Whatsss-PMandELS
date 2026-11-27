import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { recordTransfer } from '../../src/services/transfer.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

/**
 * Integration Test: PostgreSQL Live Database Internal Cash Transfer & Concurrency Row-Locking (WP-08, F-11)
 * Target: TEST-XFER-01, TEST-XFER-02, TEST-XFER-06 (Live PostgreSQL 16 SELECT ... FOR UPDATE & Deadlock Prevention)
 */
describe('Integration Test: PostgreSQL Live Database Internal Cash Transfer & Row-Locking (WP-08, F-11)', () => {
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
        '[WP-08 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
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
        throw new Error(`[WP-08 LIVE DB FAILURE] PostgreSQL live database connection failed: ${err}`);
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

  async function createIsolatedTransferTenant(
    checkingOpening: string,
    savingsOpening: string
  ): Promise<{
    userId: string;
    cookie: string;
    checkingId: string;
    savingsId: string;
  }> {
    const suffix = `wp08_xfer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({
      data: {
        username: suffix,
        email: `${suffix}@whatsss.test`,
        password_hash: '$2b$10$liveTransferTestHashPlaceholder000000000000000000000000',
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
        opening_balance: new Prisma.Decimal(checkingOpening),
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
        opening_balance: new Prisma.Decimal(savingsOpening),
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
      savingsId: savings.id
    };
  }

  it('TEST-XFER-06 (Live PostgreSQL): serializes concurrent transfers from the same CASH account under SELECT ... FOR UPDATE row locks so only 1 succeeds when funds are insufficient and balance never becomes negative', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    // Checking = 2000.00 THB, Savings = 0.00 THB
    const tenant = await createIsolatedTransferTenant('2000.00', '0.00');

    // Dispatch two concurrent 1500.00 THB transfer requests against real PostgreSQL
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          from_account_id: tenant.checkingId,
          to_account_id: tenant.savingsId,
          amount: 1500.00,
          transaction_date: '2026-11-10',
          description: 'Concurrent Transfer A'
        }),
      request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          from_account_id: tenant.checkingId,
          to_account_id: tenant.savingsId,
          amount: 1500.00,
          transaction_date: '2026-11-10',
          description: 'Concurrent Transfer B'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.data.updated_from_cash_balance).toBe('500.00');
    expect(successRes.body.data.updated_to_cash_balance).toBe('1500.00');
    expect(failedRes.body.error.code).toBe('INSUFFICIENT_FUNDS');

    // Verify in PostgreSQL that strictly 1 transfer transaction was committed
    const committedTxns = await prisma.transaction.findMany({
      where: { user_id: tenant.userId }
    });
    expect(committedTxns).toHaveLength(1);

    // Verify via GET /api/accounts and GET /api/reports/summary that neither balance is negative and total cash is conserved at 2000.00
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    expect(accRes.status).toBe(200);
    const checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.checkingId);
    const savingsAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.savingsId);
    expect(checkingAcc.current_balance).toBe(500.00);
    expect(savingsAcc.current_balance).toBe(1500.00);
    expect(checkingAcc.current_balance).toBeGreaterThanOrEqual(0);
    expect(savingsAcc.current_balance).toBeGreaterThanOrEqual(0);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(2000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-XFER-06 Bidirectional (Live PostgreSQL): executes concurrent bidirectional transfers (A -> B and B -> A) without deadlock via canonical ascending UUID lock order and conserves total cash', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    // Checking = 5000.00 THB, Savings = 3000.00 THB (Total Cash = 8000.00 THB)
    const tenant = await createIsolatedTransferTenant('5000.00', '3000.00');

    // Execute concurrent bidirectional transfers directly against PostgreSQL:
    // Request 1: Checking -> Savings (1200.00 THB)
    // Request 2: Savings -> Checking (700.00 THB)
    const [resAtoB, resBtoA] = await Promise.all([
      recordTransfer(
        tenant.userId,
        {
          from_account_id: tenant.checkingId,
          to_account_id: tenant.savingsId,
          amount: '1200.00',
          transaction_date: '2026-11-10',
          description: 'Bidirectional A to B'
        },
        prisma
      ),
      recordTransfer(
        tenant.userId,
        {
          from_account_id: tenant.savingsId,
          to_account_id: tenant.checkingId,
          amount: '700.00',
          transaction_date: '2026-11-10',
          description: 'Bidirectional B to A'
        },
        prisma
      )
    ]);

    expect(resAtoB.transaction.id).toBeDefined();
    expect(resBtoA.transaction.id).toBeDefined();

    // Verify post-commit database balances:
    // Checking: 5000.00 - 1200.00 + 700.00 = 4500.00
    // Savings:  3000.00 + 1200.00 - 700.00 = 3500.00
    // Total Cash = 8000.00
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', tenant.cookie);
    expect(accRes.status).toBe(200);
    const checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.checkingId);
    const savingsAcc = accRes.body.data.accounts.find((a: any) => a.id === tenant.savingsId);
    expect(checkingAcc.current_balance).toBe(4500.00);
    expect(savingsAcc.current_balance).toBe(3500.00);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(8000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });
});
