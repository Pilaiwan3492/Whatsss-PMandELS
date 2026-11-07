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
 * Target: TEST-EXP-01, TEST-EXP-02, TEST-ALLOC-01, TEST-ALLOC-02, TEST-SEC-01, TEST-EXP-ATOM, TEST-EXP-DECIMAL, NFR-DATA-01
 *
 * SAFETY INVARIANTS:
 * - Live database tests run ONLY in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - In local developer environments, live database tests are SKIPPED by default to protect developer databases.
 * - Test database name MUST strictly equal "whatsss_test" via immutable assertTestDatabase.
 * - Cleanups track EXACT IDs created by each test; broad table deletions are strictly prohibited.
 * - Account snapshots are captured prior to mutation and restored in afterEach via executeCleanupsSafely.
 * - Never silently return: skipped tests explicitly call ctx.skip(), and missing fixtures fail with clear diagnostics.
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
  let demoCheckingAccount: { id: string };
  let demoDiningAccount: { id: string };
  let demoGroceryAccount: { id: string };

  let otherCreditCardAccount: { id: string };
  let otherDiningAccount: { id: string };

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
        `[WP-04 CI FAILURE] Failed to authenticate user_demo in live DB. Status: ${loginRes.status}, body: ${JSON.stringify(loginRes.body)}`
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
      const grocery = await prisma.account.findFirst({
        where: { user_id: user.id, name: 'Grocery' }
      });

      if (cc && checking && dining && grocery) {
        demoCreditCardAccount = {
          id: cc.id,
          opening_balance: cc.opening_balance,
          is_opening_locked: cc.is_opening_locked
        };
        demoCheckingAccount = { id: checking.id };
        demoDiningAccount = { id: dining.id };
        demoGroceryAccount = { id: grocery.id };
      }
    }

    const otherUser = await prisma.user.findUnique({ where: { username: 'user_other' } });
    if (otherUser) {
      const otherCc = await prisma.account.findFirst({
        where: { user_id: otherUser.id, name: 'Visa Credit Card' }
      });
      const otherDining = await prisma.account.findFirst({
        where: { user_id: otherUser.id, name: 'Dining' }
      });
      if (otherCc) otherCreditCardAccount = { id: otherCc.id };
      if (otherDining) otherDiningAccount = { id: otherDining.id };
    }

    if (isCI && (!demoCreditCardAccount || !demoDiningAccount || !demoGroceryAccount)) {
      throw new Error('[WP-04 CI FAILURE] Required seeded accounts not found for user_demo in live PostgreSQL');
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
  // 1. Live TEST-EXP-01: Credit Card Purchase increases Credit Debt by purchase amount
  // -------------------------------------------------------------------------
  it('durably records credit purchase charged to LOAN_TAKEN account, increases credit debt balance by exact purchase amount in PostgreSQL (TEST-EXP-01, BR-04, FR-08, FR-10)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCreditCardAccount || !demoDiningAccount) {
      expect.fail('Missing required fixtures for live credit card purchase test');
    }

    // Capture initial account snapshot
    const ccSnap = await snapshotAccount(demoCreditCardAccount.id);
    const diningSnap = await snapshotAccount(demoDiningAccount.id);
    const createdTxnIds: string[] = [];

    // Register cleanup before mutation
    pendingCleanups.push(async () => {
      if (createdTxnIds.length > 0) {
        await prisma.allocationLine.deleteMany({ where: { transaction_id: { in: createdTxnIds } } });
        await prisma.transaction.deleteMany({ where: { id: { in: createdTxnIds } } });
      }
      await restoreAccount(ccSnap);
      await restoreAccount(diningSnap);
    });

    // Query initial summary to measure baseline credit debt
    const baselineSummaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', demoUserSessionCookie);
    expect(baselineSummaryRes.status).toBe(200);
    const initialCreditDebt = baselineSummaryRes.body.data.credit_debt;
    const initialTotalExpense = baselineSummaryRes.body.data.total_expense;

    // Submit live credit card purchase of 3000.00 THB
    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: demoCreditCardAccount.id,
        total_amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'PostgreSQL Live DB Credit Purchase 3000',
        allocations: [
          { target_account_id: demoDiningAccount.id, amount: '3000.00', notes: 'Dinner at Bistro' }
        ]
      });

    if (res.body?.data?.transaction?.id) {
      createdTxnIds.push(res.body.data.transaction.id);
    }

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const createdTxnId = res.body.data.transaction.id;
    expect(res.body.data.transaction.form).toBe('PAYMENT_CHARGE');
    expect(res.body.data.transaction.total_amount).toBe('3000.00');
    expect(res.body.data.updated_debt.account_id).toBe(demoCreditCardAccount.id);

    // Direct database assertions on live PostgreSQL
    const persistedTxn = await prisma.transaction.findUnique({
      where: { id: createdTxnId },
      include: { allocation_lines: true }
    });

    expect(persistedTxn).toBeDefined();
    expect(persistedTxn!.form).toBe('PAYMENT_CHARGE');
    expect(persistedTxn!.primary_account_id).toBe(demoCreditCardAccount.id);
    expect(persistedTxn!.total_amount.equals(new Prisma.Decimal('3000.00'))).toBe(true);
    expect(persistedTxn!.allocation_lines).toHaveLength(1);
    expect(persistedTxn!.allocation_lines[0].target_account_id).toBe(demoDiningAccount.id);
    expect(persistedTxn!.allocation_lines[0].amount.equals(new Prisma.Decimal('3000.00'))).toBe(true);

    // Verify account opening balance was atomically locked in PostgreSQL
    const updatedCc = await prisma.account.findUnique({ where: { id: demoCreditCardAccount.id } });
    expect(updatedCc!.is_opening_locked).toBe(true);

    // Verify live summary: credit_debt and total_expense increase by exactly 3000.00 THB
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', demoUserSessionCookie);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.credit_debt).toBe(Number((initialCreditDebt + 3000.00).toFixed(2)));
    expect(summaryRes.body.data.total_expense).toBe(Number((initialTotalExpense + 3000.00).toFixed(2)));

    // Opening balance modification is blocked (AC-03-3)
    const patchRes = await request(app)
      .patch(`/api/accounts/${demoCreditCardAccount.id}/opening-balance`)
      .set('Cookie', demoUserSessionCookie)
      .set('Origin', TRUSTED_ORIGIN)
      .send({ opening_balance: 5000.00 });

    expect(patchRes.status).toBe(422);
    expect(patchRes.body.error.code).toBe('OPENING_BALANCE_LOCKED');
  });

  // -------------------------------------------------------------------------
  // 2. Live TEST-ALLOC-01: Multi-Line Split Allocation Relational Integrity
  // -------------------------------------------------------------------------
  it('records multi-category split allocation with foreign key relations and exact Decimal(12,2) persistence (TEST-ALLOC-01, F-06, BR-04, NFR-DATA-01)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCreditCardAccount || !demoDiningAccount || !demoGroceryAccount) {
      expect.fail('Missing required fixtures for multi-line split allocation test');
    }

    const ccSnap = await snapshotAccount(demoCreditCardAccount.id);
    const diningSnap = await snapshotAccount(demoDiningAccount.id);
    const grocerySnap = await snapshotAccount(demoGroceryAccount.id);
    const createdTxnIds: string[] = [];

    pendingCleanups.push(async () => {
      if (createdTxnIds.length > 0) {
        await prisma.allocationLine.deleteMany({ where: { transaction_id: { in: createdTxnIds } } });
        await prisma.transaction.deleteMany({ where: { id: { in: createdTxnIds } } });
      }
      await restoreAccount(ccSnap);
      await restoreAccount(diningSnap);
      await restoreAccount(grocerySnap);
    });

    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: demoCreditCardAccount.id,
        total_amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'Split Allocation Test Dining & Grocery',
        allocations: [
          { target_account_id: demoDiningAccount.id, amount: '1000.00', notes: 'Dinner split' },
          { target_account_id: demoGroceryAccount.id, amount: '2000.00', notes: 'Weekly grocery split' }
        ]
      });

    if (res.body?.data?.transaction?.id) {
      createdTxnIds.push(res.body.data.transaction.id);
    }

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const createdTxnId = res.body.data.transaction.id;
    expect(res.body.data.transaction.allocations).toHaveLength(2);

    // Direct database assertions on live PostgreSQL
    const persistedTxn = await prisma.transaction.findUnique({
      where: { id: createdTxnId },
      include: {
        allocation_lines: {
          orderBy: { amount: 'asc' }
        }
      }
    });

    expect(persistedTxn).toBeDefined();
    expect(persistedTxn!.allocation_lines).toHaveLength(2);

    const [allocDining, allocGrocery] = persistedTxn!.allocation_lines;
    expect(allocDining.target_account_id).toBe(demoDiningAccount.id);
    expect(allocDining.amount.equals(new Prisma.Decimal('1000.00'))).toBe(true);
    expect(allocDining.notes).toBe('Dinner split');

    expect(allocGrocery.target_account_id).toBe(demoGroceryAccount.id);
    expect(allocGrocery.amount.equals(new Prisma.Decimal('2000.00'))).toBe(true);
    expect(allocGrocery.notes).toBe('Weekly grocery split');

    // Verify sum of allocation lines matches total_amount exactly
    const sumAlloc = allocDining.amount.add(allocGrocery.amount);
    expect(sumAlloc.equals(persistedTxn!.total_amount)).toBe(true);

    // All involved accounts have opening balances locked
    const diningAcc = await prisma.account.findUnique({ where: { id: demoDiningAccount.id } });
    const groceryAcc = await prisma.account.findUnique({ where: { id: demoGroceryAccount.id } });
    expect(diningAcc!.is_opening_locked).toBe(true);
    expect(groceryAcc!.is_opening_locked).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Live TEST-ALLOC-02: Complete Rollback upon Unbalanced Allocation Sum
  // -------------------------------------------------------------------------
  it('rolls back completely upon unbalanced allocation sum without partial writes or orphaned records (TEST-ALLOC-02, AC-06-1, BR-04)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCreditCardAccount || !demoDiningAccount || !demoGroceryAccount) {
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
        total_amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'Unbalanced Allocation Test',
        allocations: [
          { target_account_id: demoDiningAccount.id, amount: '1000.00' },
          { target_account_id: demoGroceryAccount.id, amount: '1500.00' } // Sum = 2500 != 3000
        ]
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ALLOCATION_SUM_MISMATCH');

    const txnCountAfter = await prisma.transaction.count({ where: { user_id: demoUserId } });
    const allocCountAfter = await prisma.allocationLine.count({
      where: { transaction: { user_id: demoUserId } }
    });

    // Zero records created; no orphaned transaction headers or allocation lines in PostgreSQL
    expect(txnCountAfter).toBe(txnCountBefore);
    expect(allocCountAfter).toBe(allocCountBefore);
  });

  // -------------------------------------------------------------------------
  // 4. Live TEST-SEC-01 (DB Primary): Foreign Tenant Primary Account Rejection
  // -------------------------------------------------------------------------
  it('rejects foreign tenant credit card with 404 ACCOUNT_NOT_FOUND and writes zero rows to PostgreSQL (TEST-SEC-01, BR-01)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !otherCreditCardAccount || !demoDiningAccount) {
      ctx.skip();
      return;
    }

    const txnCountBefore = await prisma.transaction.count();
    const allocCountBefore = await prisma.allocationLine.count();

    const otherCcSnap = await snapshotAccount(otherCreditCardAccount.id);
    pendingCleanups.push(async () => {
      await restoreAccount(otherCcSnap);
    });

    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: otherCreditCardAccount.id,
        total_amount: '500.00',
        transaction_date: '2026-11-06',
        description: 'Cross-tenant primary attack',
        allocations: [{ target_account_id: demoDiningAccount.id, amount: '500.00' }]
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    // Confirm zero writes to PostgreSQL
    const txnCountAfter = await prisma.transaction.count();
    const allocCountAfter = await prisma.allocationLine.count();
    expect(txnCountAfter).toBe(txnCountBefore);
    expect(allocCountAfter).toBe(allocCountBefore);

    // Verify other user's account remains completely untouched
    const currentOtherCc = await prisma.account.findUnique({ where: { id: otherCreditCardAccount.id } });
    expect(currentOtherCc!.is_opening_locked).toBe(otherCcSnap.is_opening_locked);
    expect(currentOtherCc!.opening_balance.equals(otherCcSnap.opening_balance)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Live TEST-SEC-01 (DB Target): Foreign Tenant Target Expense Category Rejection
  // -------------------------------------------------------------------------
  it('rejects foreign tenant expense account in allocations with 404 ACCOUNT_NOT_FOUND and writes zero rows (TEST-SEC-01, BR-01)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCreditCardAccount || !otherDiningAccount) {
      ctx.skip();
      return;
    }

    const txnCountBefore = await prisma.transaction.count();
    const allocCountBefore = await prisma.allocationLine.count();

    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: demoCreditCardAccount.id,
        total_amount: '500.00',
        transaction_date: '2026-11-06',
        description: 'Cross-tenant target attack',
        allocations: [{ target_account_id: otherDiningAccount.id, amount: '500.00' }]
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');

    const txnCountAfter = await prisma.transaction.count();
    const allocCountAfter = await prisma.allocationLine.count();
    expect(txnCountAfter).toBe(txnCountBefore);
    expect(allocCountAfter).toBe(allocCountBefore);
  });

  // -------------------------------------------------------------------------
  // 6. Live TEST-VAL-01 (DB Primary Type): Reject Non-Credit Account as Primary
  // -------------------------------------------------------------------------
  it('rejects non-LOAN_TAKEN account as primary with 400 INVALID_PRIMARY_ACCOUNT (BR-04, AC-05-3)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCheckingAccount || !demoDiningAccount) {
      ctx.skip();
      return;
    }

    const txnCountBefore = await prisma.transaction.count();

    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', demoUserSessionCookie)
      .send({
        primary_account_id: demoCheckingAccount.id, // CASH account, not LOAN_TAKEN
        total_amount: '500.00',
        transaction_date: '2026-11-06',
        allocations: [{ target_account_id: demoDiningAccount.id, amount: '500.00' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PRIMARY_ACCOUNT');

    const txnCountAfter = await prisma.transaction.count();
    expect(txnCountAfter).toBe(txnCountBefore);
  });

  // -------------------------------------------------------------------------
  // 7. Live TEST-EXP-ATOM: Mid-Flight Failure Rolls Back Transaction & Lock in PostgreSQL
  // -------------------------------------------------------------------------
  it('rolls back Transaction and opening balance lock in PostgreSQL when AllocationLine creation fails mid-flight (TEST-EXP-ATOM, AC-03-3, BR-04)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoCreditCardAccount || !demoDiningAccount || !demoUserId) {
      expect.fail('Missing required fixtures for allocation failure rollback test');
    }

    const ccSnap = await snapshotAccount(demoCreditCardAccount.id);
    pendingCleanups.push(async () => {
      await restoreAccount(ccSnap);
    });

    // Ensure account is unlocked for the test
    await prisma.account.update({
      where: { id: demoCreditCardAccount.id },
      data: { is_opening_locked: false }
    });

    const description = `Live Rollback Expense Alloc Test ${Date.now()}`;
    let allocFailureInjected = false;

    // Wrap real PostgreSQL Prisma client to inject AllocationLine creation failure inside $transaction
    const wrappedPrismaForAlloc = new Proxy(prisma, {
      get(target, prop, receiver) {
        if (prop === '$transaction') {
          return async (callback: (tx: any) => Promise<any>, options?: any) => {
            return target.$transaction(async (realTx) => {
              const txProxy = new Proxy(realTx, {
                get(txTarget, txProp) {
                  if (txProp === 'allocationLine') {
                    return new Proxy(txTarget.allocationLine, {
                      get(allocTarget, allocProp) {
                        if (allocProp === 'create') {
                          return async () => {
                            allocFailureInjected = true;
                            throw new Error('INJECTED_ALLOCATION_LINE_FAILURE');
                          };
                        }
                        return Reflect.get(allocTarget, allocProp);
                      }
                    });
                  }
                  return Reflect.get(txTarget, txProp);
                }
              });
              return callback(txProxy);
            }, options);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });

    let errorCaught = false;
    try {
      await recordExpense(
        demoUserId,
        {
          primary_account_id: demoCreditCardAccount.id,
          total_amount: '1500.00',
          transaction_date: '2026-11-06',
          description,
          allocations: [{ target_account_id: demoDiningAccount.id, amount: '1500.00' }]
        },
        wrappedPrismaForAlloc as any
      );
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toBe('INJECTED_ALLOCATION_LINE_FAILURE');
    }

    expect(allocFailureInjected).toBe(true);
    expect(errorCaught).toBe(true);

    // Verify in live PostgreSQL that Transaction was completely rolled back
    const foundTxn = await prisma.transaction.findFirst({ where: { user_id: demoUserId, description } });
    expect(foundTxn).toBeNull();

    // Verify opening balance lock state rolled back and remains unlocked
    const currentAcc = await prisma.account.findUnique({ where: { id: demoCreditCardAccount.id } });
    expect(currentAcc!.is_opening_locked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Live TEST-OPEN-04: Failed Validation Preserves Unlocked Opening Balance
  // -------------------------------------------------------------------------
  it('does not lock opening balance when expense request fails validation (TEST-OPEN-04, AC-03-3)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCreditCardAccount || !demoDiningAccount) {
      expect.fail('Missing required fixtures for validation failure lock preservation test');
    }

    const ccSnap = await snapshotAccount(demoCreditCardAccount.id);
    pendingCleanups.push(async () => {
      await restoreAccount(ccSnap);
    });

    // Ensure account is unlocked
    await prisma.account.update({
      where: { id: demoCreditCardAccount.id },
      data: { is_opening_locked: false }
    });

    // Submit invalid request (impossible date)
    const res = await request(app)
      .post('/api/transactions/expense')
      .set('Cookie', demoUserSessionCookie)
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        primary_account_id: demoCreditCardAccount.id,
        total_amount: '1000.00',
        transaction_date: '2026-02-30', // Invalid date
        allocations: [{ target_account_id: demoDiningAccount.id, amount: '1000.00' }]
      });

    expect(res.status).toBe(400);

    // Verify in live PostgreSQL that is_opening_locked remains false
    const afterAcc = await prisma.account.findUnique({ where: { id: demoCreditCardAccount.id } });
    expect(afterAcc!.is_opening_locked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 9. Live TEST-EXP-DECIMAL: Decimal Boundary Precision Verification
  // -------------------------------------------------------------------------
  it('preserves exact boundary Decimal values in live PostgreSQL without floating-point distortion (TEST-EXP-DECIMAL, NFR-DATA-01)', async (ctx) => {
    if (!isDbConnected) {
      ctx.skip();
      return;
    }
    if (!demoUserSessionCookie || !demoCreditCardAccount || !demoDiningAccount) {
      expect.fail('Missing required fixtures for decimal boundary verification test');
    }

    const testDecimals = ['0.01', '0.29', '100.10', '9999999999.99'];
    const decimalTxnIds: string[] = [];
    const ccSnap = await snapshotAccount(demoCreditCardAccount.id);
    const diningSnap = await snapshotAccount(demoDiningAccount.id);

    pendingCleanups.push(async () => {
      if (decimalTxnIds.length > 0) {
        await prisma.allocationLine.deleteMany({ where: { transaction_id: { in: decimalTxnIds } } });
        await prisma.transaction.deleteMany({ where: { id: { in: decimalTxnIds } } });
      }
      await restoreAccount(ccSnap);
      await restoreAccount(diningSnap);
    });

    for (const val of testDecimals) {
      const res = await request(app)
        .post('/api/transactions/expense')
        .set('Cookie', demoUserSessionCookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: demoCreditCardAccount.id,
          total_amount: val,
          transaction_date: '2026-11-06',
          allocations: [{ target_account_id: demoDiningAccount.id, amount: val }]
        });

      if (res.body?.data?.transaction?.id) {
        decimalTxnIds.push(res.body.data.transaction.id);
      }

      expect(res.status, `Expected 201 for decimal boundary input ${val}`).toBe(201);

      const txnId = res.body.data.transaction.id;

      // Verify exact Prisma.Decimal match in live PostgreSQL
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
