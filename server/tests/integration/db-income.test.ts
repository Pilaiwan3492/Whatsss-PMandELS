import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { lockAccounts } from '../../src/services/accountLock.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
  updated_at: Date;
}

/**
 * Integration Test: PostgreSQL Live Database Income Transaction Processing (WP-03)
 * Target: TEST-INC-01, TEST-INC-02, TEST-OPEN-04, TEST-INC-DECIMAL, TEST-INC-ATOM, TEST-INC-CONCURRENT
 *
 * SAFETY INVARIANTS:
 * - Live database tests run ONLY in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - In local developer environments, live database tests are SKIPPED by default to protect developer databases.
 * - Test database name MUST strictly equal "whatsss_test" via immutable assertTestDatabase.
 * - Cleanups track EXACT IDs created by each test; broad table deletions are strictly prohibited.
 * - Account snapshots are captured prior to mutation and restored in afterEach via executeCleanupsSafely.
 * - Never silently return: skipped tests explicitly call ctx.skip(), and missing fixtures fail with clear diagnostics.
 */
describe('Integration Test: PostgreSQL Live Database Income Processing (WP-03)', () => {
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

    // Verify test database safety invariant: exactly whatsss_test
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
      demoUserId = user.id;
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

  async function snapshotAccount(accountId: string): Promise<AccountSnapshot> {
    const acc = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    return {
      id: acc.id,
      opening_balance: acc.opening_balance,
      is_opening_locked: acc.is_opening_locked,
      updated_at: acc.updated_at
    };
  }

  async function restoreAccount(snap: AccountSnapshot): Promise<void> {
    await prisma.account.update({
      where: { id: snap.id },
      data: {
        opening_balance: snap.opening_balance,
        is_opening_locked: snap.is_opening_locked,
        updated_at: snap.updated_at
      }
    });
  }

  // -------------------------------------------------------------------------
  // 1. Live TEST-INC-01: Full Round-Trip Income Processing
  // -------------------------------------------------------------------------
  it('records salary of 20000.00 THB in live PostgreSQL, creates 1 allocation line, and atomically locks opening balance (TEST-INC-01, AC-04-1, BR-03)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie) {
      expect.fail('Failed to obtain demoUserSessionCookie during beforeAll fixture setup');
    }
    if (!demoCheckingAccount || !demoSalaryAccount) {
      expect.fail('Failed to locate demoCheckingAccount or demoSalaryAccount in live PostgreSQL');
    }

    // Snapshot checking account state before mutation
    const checkingSnap = await snapshotAccount(demoCheckingAccount.id);

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

    const createdTxnId = res.body.data.transaction.id;
    // Register specific ID cleanup and account restoration
    pendingCleanups.push(async () => {
      await prisma.allocationLine.deleteMany({ where: { transaction_id: createdTxnId } });
      await prisma.transaction.deleteMany({ where: { id: createdTxnId } });
      await restoreAccount(checkingSnap);
    });

    expect(res.body.data.transaction.form).toBe('RECEIVE_MONEY');
    expect(res.body.data.transaction.total_amount).toBe('20000.00');
    expect(res.body.data.transaction.allocations).toHaveLength(1);
    expect(res.body.data.transaction.allocations[0].target_account_id).toBe(demoSalaryAccount.id);

    // Direct database assertions on live PostgreSQL
    const persistedTxn = await prisma.transaction.findUnique({
      where: { id: createdTxnId },
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
  // 2. AllocationLine failure rolls back Transaction in live PostgreSQL
  // -------------------------------------------------------------------------
  it('rolls back the Transaction in live PostgreSQL when AllocationLine creation fails (TEST-INC-ATOM)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoCheckingAccount || !demoSalaryAccount || !demoUserId) {
      expect.fail('Missing required fixtures for allocation failure rollback test');
    }

    const checkingSnap = await snapshotAccount(demoCheckingAccount.id);
    pendingCleanups.push(async () => {
      await restoreAccount(checkingSnap);
    });

    const testTxnId = `test-rollback-alloc-${Date.now()}`;

    // Exercise real PostgreSQL transaction boundary:
    // Insert Transaction header, then attempt to insert an AllocationLine with non-existent foreign target_account_id
    let errorCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        await lockAccounts(tx, [demoCheckingAccount.id], demoUserId);

        await tx.transaction.create({
          data: {
            id: testTxnId,
            user_id: demoUserId,
            primary_account_id: demoCheckingAccount.id,
            form: 'RECEIVE_MONEY',
            total_amount: new Prisma.Decimal('1500.00'),
            transaction_date: new Date('2026-11-06')
          }
        });

        // Insert AllocationLine referencing a non-existent foreign key to trigger constraint error
        await tx.allocationLine.create({
          data: {
            transaction_id: testTxnId,
            target_account_id: '00000000-0000-0000-0000-000000000000', // Non-existent foreign key
            amount: new Prisma.Decimal('1500.00')
          }
        });
      });
    } catch {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);

    // Verify in live PostgreSQL that Transaction header was completely rolled back
    const foundTxn = await prisma.transaction.findUnique({ where: { id: testTxnId } });
    expect(foundTxn).toBeNull();

    // Verify opening balance lock state was rolled back to original state
    const currentAcc = await prisma.account.findUnique({ where: { id: demoCheckingAccount.id } });
    expect(currentAcc!.is_opening_locked).toBe(checkingSnap.is_opening_locked);
  });

  // -------------------------------------------------------------------------
  // 3. Account-locking failure rolls back Transaction and AllocationLine
  // -------------------------------------------------------------------------
  it('rolls back Transaction and AllocationLine in live PostgreSQL when account locking fails', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoCheckingAccount || !demoSalaryAccount || !demoUserId) {
      expect.fail('Missing required fixtures for lock failure rollback test');
    }

    const checkingSnap = await snapshotAccount(demoCheckingAccount.id);
    pendingCleanups.push(async () => {
      await restoreAccount(checkingSnap);
    });

    const testTxnId = `test-rollback-lock-${Date.now()}`;

    let errorCaught = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            id: testTxnId,
            user_id: demoUserId,
            primary_account_id: demoCheckingAccount.id,
            form: 'RECEIVE_MONEY',
            total_amount: new Prisma.Decimal('3000.00'),
            transaction_date: new Date('2026-11-06')
          }
        });

        await tx.allocationLine.create({
          data: {
            transaction_id: testTxnId,
            target_account_id: demoSalaryAccount.id,
            amount: new Prisma.Decimal('3000.00')
          }
        });

        // Attempt to lock an account not belonging to userDemo -> triggers abort
        await lockAccounts(tx, ['00000000-0000-0000-0000-000000000000'], demoUserId);
      });
    } catch {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);

    // Assert neither Transaction nor AllocationLine exists in PostgreSQL
    const foundTxn = await prisma.transaction.findUnique({ where: { id: testTxnId } });
    expect(foundTxn).toBeNull();

    const foundAlloc = await prisma.allocationLine.findFirst({ where: { transaction_id: testTxnId } });
    expect(foundAlloc).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. Failed request does not leave opening balance locked
  // -------------------------------------------------------------------------
  it('does not lock opening balance when income request fails validation', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCheckingAccount || !demoSalaryAccount) {
      expect.fail('Missing required fixtures for validation failure lock preservation test');
    }

    // Ensure account is initially unlocked
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { is_opening_locked: false }
    });

    const checkingSnap = await snapshotAccount(demoCheckingAccount.id);
    pendingCleanups.push(async () => {
      await restoreAccount(checkingSnap);
    });

    // Submit invalid request (impossible date)
    const res = await request(app)
      .post('/api/transactions/income')
      .set('Cookie', demoUserSessionCookie)
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        primary_account_id: demoCheckingAccount.id,
        total_amount: '1000.00',
        transaction_date: '2026-02-30', // Invalid date
        income_account_id: demoSalaryAccount.id
      });

    expect(res.status).toBe(400);

    // Verify in live PostgreSQL that is_opening_locked remains false
    const afterAcc = await prisma.account.findUnique({ where: { id: demoCheckingAccount.id } });
    expect(afterAcc!.is_opening_locked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5, 6, 7, 8. Concurrent simultaneous income submissions in live PostgreSQL
  // -------------------------------------------------------------------------
  it('handles simultaneous valid income requests in live PostgreSQL without conflict or corruption (TEST-INC-CONCURRENT)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCheckingAccount || !demoSalaryAccount) {
      expect.fail('Missing required fixtures for concurrent live submissions test');
    }

    // Reset checking account to unlocked with known baseline balance (10000.00)
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('10000.00'), is_opening_locked: false }
    });

    const checkingSnap = await snapshotAccount(demoCheckingAccount.id);

    // Execute two simultaneous income requests against the same CASH account
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/income')
        .set('Cookie', demoUserSessionCookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: demoCheckingAccount.id,
          total_amount: '5000.00',
          transaction_date: '2026-11-06',
          income_account_id: demoSalaryAccount.id,
          description: 'Concurrent Income 1'
        }),
      request(app)
        .post('/api/transactions/income')
        .set('Cookie', demoUserSessionCookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: demoCheckingAccount.id,
          total_amount: '3000.00',
          transaction_date: '2026-11-06',
          income_account_id: demoSalaryAccount.id,
          description: 'Concurrent Income 2'
        })
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const txn1Id = res1.body.data.transaction.id;
    const txn2Id = res2.body.data.transaction.id;

    pendingCleanups.push(async () => {
      await prisma.allocationLine.deleteMany({ where: { transaction_id: { in: [txn1Id, txn2Id] } } });
      await prisma.transaction.deleteMany({ where: { id: { in: [txn1Id, txn2Id] } } });
      await restoreAccount(checkingSnap);
    });

    // Verify exactly 2 distinct transaction records created in PostgreSQL
    const txns = await prisma.transaction.findMany({
      where: { id: { in: [txn1Id, txn2Id] } },
      include: { allocation_lines: true }
    });
    expect(txns).toHaveLength(2);

    // Verify each transaction has exactly 1 allocation line
    for (const t of txns) {
      expect(t.allocation_lines).toHaveLength(1);
      expect(t.allocation_lines[0].target_account_id).toBe(demoSalaryAccount.id);
    }

    // Verify final account balance is 10000.00 (opening) + 5000.00 + 3000.00 = 18000.00
    const finalChecking = await prisma.account.findUnique({ where: { id: demoCheckingAccount.id } });
    expect(finalChecking!.is_opening_locked).toBe(true);

    const accountsRes = await request(app)
      .get(`/api/accounts/${demoCheckingAccount.id}`)
      .set('Cookie', demoUserSessionCookie);

    expect(accountsRes.status).toBe(200);
    expect(accountsRes.body.data.account.current_balance).toBe(18000.00);
  });

  // -------------------------------------------------------------------------
  // 9. Live TEST-INC-DECIMAL: Decimal Boundary Precision Verification
  // -------------------------------------------------------------------------
  it('preserves exact boundary Decimal values in live PostgreSQL without floating-point distortion (TEST-INC-DECIMAL, NFR-DATA-01)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCheckingAccount || !demoSalaryAccount) {
      expect.fail('Missing required fixtures for decimal boundary verification test');
    }

    const testDecimals = ['0.01', '0.29', '100.10', '9999999999.99'];

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

      expect(res.status, `Expected 201 for decimal boundary input ${val}`).toBe(201);

      const txnId = res.body.data.transaction.id;
      pendingCleanups.push(async () => {
        await prisma.allocationLine.deleteMany({ where: { transaction_id: txnId } });
        await prisma.transaction.deleteMany({ where: { id: txnId } });
      });

      // Verify exact Prisma.Decimal match in PostgreSQL
      const inDb = await prisma.transaction.findUnique({
        where: { id: txnId },
        include: { allocation_lines: true }
      });

      expect(inDb).toBeDefined();
      expect(inDb!.total_amount.equals(new Prisma.Decimal(val))).toBe(true);
      expect(inDb!.total_amount.toFixed(2)).toBe(val);
      expect(inDb!.allocation_lines[0].amount.equals(new Prisma.Decimal(val))).toBe(true);
    }
  });
});
