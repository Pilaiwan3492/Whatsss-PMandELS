import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { correctTransaction } from '../../src/services/correction.service.js';
import { updateUserAccessStatus } from '../../src/services/admin.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

/**
 * Integration Test: PostgreSQL 16 Live Database Transaction Corrections (F-16) & Admin Governance (F-19) (WP-11)
 *
 * Verifies real PostgreSQL persistence, atomicity, rollback, opening-balance locking,
 * SELECT ... FOR UPDATE row-lock serialization, and Last Active Admin protection without mocking Prisma.
 */
describe('Integration Test: PostgreSQL 16 Live Database Corrections (F-16) & Admin Governance (F-19) (WP-11)', () => {
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
        '[WP-11 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
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
        throw new Error(`[WP-11 LIVE DB FAILURE] PostgreSQL live database connection failed: ${err}`);
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

  async function createIsolatedUserTenant(
    tag: string,
    opts?: { preserveAuditLoggedRows?: boolean }
  ) {
    const suffix = `wp11_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const passwordPlain = 'LiveTestPass123!';
    const passwordHash = await bcrypt.hash(passwordPlain, 10);

    const user = await prisma.user.create({
      data: {
        username: suffix,
        email: `${suffix}@whatsss.test`,
        password_hash: passwordHash,
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
        opening_balance: new Prisma.Decimal('10000.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const cc = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Visa Credit Card',
        normalized_name: 'visa credit card',
        type: 'LOAN_TAKEN',
        subtype: 'CREDIT_CARD',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const loanGiven = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Friend Loan',
        normalized_name: 'friend loan',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
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

    const grocery = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Grocery',
        normalized_name: 'grocery',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const utilities = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Utilities',
        normalized_name: 'utilities',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    pendingCleanups.push(async () => {
      if (opts?.preserveAuditLoggedRows) {
        // Respect PostgreSQL BEFORE DELETE trigger & ON DELETE RESTRICT on transaction_audit_logs
        await prisma.transaction.deleteMany({
          where: { user_id: user.id, audit_logs: { none: {} } }
        });
        return;
      }
      await prisma.allocationLine.deleteMany({ where: { transaction: { user_id: user.id } } });
      await prisma.transaction.deleteMany({ where: { user_id: user.id } });
      await prisma.account.deleteMany({ where: { user_id: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: 'USER' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    return {
      user,
      passwordPlain,
      cookie: `token=${token}; Path=/; HttpOnly; SameSite=Lax`,
      accounts: { checking, cc, loanGiven, salary, dining, grocery, utilities }
    };
  }

  async function createIsolatedAdmin(tag: string) {
    const suffix = `wp11_adm_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const admin = await prisma.user.create({
      data: {
        username: suffix,
        email: `${suffix}@whatsss.test`,
        password_hash: await bcrypt.hash('AdminPass123!', 10),
        role: 'ADMIN',
        is_active: true
      }
    });

    pendingCleanups.push(async () => {
      await prisma.user.deleteMany({ where: { id: admin.id } });
    });

    const token = jwt.sign(
      { userId: admin.id, username: admin.username, role: 'ADMIN' },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    return { admin, cookie: `token=${token}; Path=/; HttpOnly; SameSite=Lax` };
  }

  // ============================================================================
  // F-16 LIVE POSTGRESQL TESTS
  // ============================================================================

  it('TEST-CORR-LIVE-01: persists correction, allocation target change/add/remove, audit snapshot, summary balances/debt, and locks newly referenced account opening balance', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedUserTenant('corr_persist', { preserveAuditLoggedRows: true });

    // Seed CC purchase (Dining 1000 + Grocery 2000 = 3000). Utilities is unused & unlocked.
    const txn = await prisma.transaction.create({
      data: {
        user_id: tenant.user.id,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Initial Split',
        allocation_lines: {
          create: [
            { target_account_id: tenant.accounts.dining.id, amount: new Prisma.Decimal('1000.00'), notes: 'Lunch' },
            { target_account_id: tenant.accounts.grocery.id, amount: new Prisma.Decimal('2000.00'), notes: 'Food' }
          ]
        }
      }
    });

    expect((await prisma.account.findUnique({ where: { id: tenant.accounts.utilities.id } }))?.is_opening_locked).toBe(false);

    // Correct: remove Grocery, keep Dining (1500), add previously unused Utilities (2500) => Total 4000
    const res = await request(app)
      .put(`/api/transactions/${txn.id}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({
        total_amount: '4000.00',
        transaction_date: '2026-11-06',
        description: 'Updated Split With Utilities',
        allocations: [
          { target_account_id: tenant.accounts.dining.id, amount: '1500.00', notes: 'Updated lunch' },
          { target_account_id: tenant.accounts.utilities.id, amount: '2500.00', notes: 'Electric bill' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.transaction.total_amount).toBe('4000.00');

    // Verify persisted transaction & allocation lines in PostgreSQL
    const persisted = await prisma.transaction.findUnique({
      where: { id: txn.id },
      include: { allocation_lines: { orderBy: { amount: 'asc' } } }
    });
    expect(persisted?.total_amount.toFixed(2)).toBe('4000.00');
    expect(persisted?.description).toBe('Updated Split With Utilities');
    expect(persisted?.allocation_lines).toHaveLength(2);
    expect(persisted?.allocation_lines[0].target_account_id).toBe(tenant.accounts.dining.id);
    expect(persisted?.allocation_lines[1].target_account_id).toBe(tenant.accounts.utilities.id);

    // Verify TransactionAuditLog persisted in same transaction with previous & new snapshots
    const auditLogs = await prisma.transactionAuditLog.findMany({
      where: { transaction_id: txn.id }
    });
    expect(auditLogs).toHaveLength(1);
    expect((auditLogs[0].previous_snapshot as any).total_amount).toBe('3000.00');
    expect((auditLogs[0].new_snapshot as any).total_amount).toBe('4000.00');

    // Verify newly referenced account (Utilities) now has is_opening_locked = true in PostgreSQL
    const utilAfter = await prisma.account.findUnique({ where: { id: tenant.accounts.utilities.id } });
    expect(utilAfter?.is_opening_locked).toBe(true);

    // Verify summary balances & CC debt reflect 4000.00
    const sumRes = await request(app).get('/api/reports/summary').set('Cookie', tenant.cookie);
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.data.credit_debt).toBe(4000);
    expect(sumRes.body.data.total_expense).toBe(4000);
    expect(sumRes.body.data.bank_balance).toBe(10000);
  });

  it('TEST-CORR-LIVE-02: rolls back completely on audit-log insert failure, archived account, and cross-tenant attempts in PostgreSQL', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenantA = await createIsolatedUserTenant('corr_rb_a');
    const tenantB = await createIsolatedUserTenant('corr_rb_b');

    const txnA = await prisma.transaction.create({
      data: {
        user_id: tenantA.user.id,
        primary_account_id: tenantA.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Original Atomic',
        allocation_lines: {
          create: [
            { target_account_id: tenantA.accounts.dining.id, amount: new Prisma.Decimal('1000.00'), notes: 'Orig' }
          ]
        }
      }
    });

    // 1. Simulated audit log insert failure inside real PostgreSQL $transaction -> full rollback
    const failingAuditProxy = {
      $transaction: async (fn: (tx: any) => Promise<any>) => {
        return prisma.$transaction(async (realTx) => {
          const wrappedTx = new Proxy(realTx, {
            get(target, prop) {
              if (prop === 'transactionAuditLog') {
                return {
                  create: async () => {
                    throw new Error('SIMULATED_PG_AUDIT_LOG_FAILURE');
                  }
                };
              }
              return (target as any)[prop];
            }
          });
          return fn(wrappedTx);
        });
      },
      transaction: prisma.transaction
    } as unknown as PrismaClient;

    await expect(
      correctTransaction(
        tenantA.user.id,
        txnA.id,
        {
          total_amount: '2500.00',
          transaction_date: '2026-11-05',
          description: 'Must Roll Back',
          allocations: [{ target_account_id: tenantA.accounts.utilities.id, amount: '2500.00' }]
        },
        failingAuditProxy
      )
    ).rejects.toThrow('SIMULATED_PG_AUDIT_LOG_FAILURE');

    // Original transaction, allocations, and unlocked Utilities state remain completely intact
    const afterRollback = await prisma.transaction.findUnique({
      where: { id: txnA.id },
      include: { allocation_lines: true }
    });
    expect(afterRollback?.total_amount.toFixed(2)).toBe('1000.00');
    expect(afterRollback?.description).toBe('Original Atomic');
    expect(afterRollback?.allocation_lines[0].target_account_id).toBe(tenantA.accounts.dining.id);
    expect((await prisma.account.findUnique({ where: { id: tenantA.accounts.utilities.id } }))?.is_opening_locked).toBe(false);

    // 2. Archived account rejected with 422 ACCOUNT_ARCHIVED
    await prisma.account.update({
      where: { id: tenantA.accounts.utilities.id },
      data: { is_archived: true }
    });
    const archRes = await request(app)
      .put(`/api/transactions/${txnA.id}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-05',
        allocations: [{ target_account_id: tenantA.accounts.utilities.id, amount: '1000.00' }]
      });
    expect(archRes.status).toBe(422);
    expect(archRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 3. Foreign-user account rejected with 404 NOT_FOUND
    const foreignAccRes = await request(app)
      .put(`/api/transactions/${txnA.id}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-05',
        allocations: [{ target_account_id: tenantB.accounts.dining.id, amount: '1000.00' }]
      });
    expect(foreignAccRes.status).toBe(404);
    expect(foreignAccRes.body.error.code).toBe('NOT_FOUND');

    // 4. Foreign-user transaction rejected with 404 NOT_FOUND
    const foreignTxnRes = await request(app)
      .put(`/api/transactions/${txnA.id}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantB.cookie)
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-05',
        allocations: [{ target_account_id: tenantB.accounts.dining.id, amount: '1000.00' }]
      });
    expect(foreignTxnRes.status).toBe(404);
    expect(foreignTxnRes.body.error.code).toBe('NOT_FOUND');
  });

  it('TEST-CORR-LIVE-03: serializes genuinely concurrent corrections on the same transaction via PostgreSQL SELECT ... FOR UPDATE', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedUserTenant('corr_conc', { preserveAuditLoggedRows: true });
    const txn = await prisma.transaction.create({
      data: {
        user_id: tenant.user.id,
        primary_account_id: tenant.accounts.checking.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'Base Salary',
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.salary.id, amount: new Prisma.Decimal('20000.00'), notes: null }]
        }
      }
    });

    const [r1, r2] = await Promise.all([
      request(app)
        .put(`/api/transactions/${txn.id}`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          total_amount: '22000.00',
          transaction_date: '2026-11-01',
          description: 'Correction A',
          allocations: [{ target_account_id: tenant.accounts.salary.id, amount: '22000.00' }]
        }),
      request(app)
        .put(`/api/transactions/${txn.id}`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({
          total_amount: '25000.00',
          transaction_date: '2026-11-01',
          description: 'Correction B',
          allocations: [{ target_account_id: tenant.accounts.salary.id, amount: '25000.00' }]
        })
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const logs = await prisma.transactionAuditLog.findMany({
      where: { transaction_id: txn.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }]
    });
    expect(logs).toHaveLength(2);
    // Strict sequential chaining proved by PostgreSQL row locks: 20000 -> X, then X -> Y.
    // Identify first/second by snapshot chain because two serialized commits can share the same millisecond
    // and random UUIDv4 tie-breaking on `id` does not encode commit order.
    const firstLog = logs.find((l) => (l.previous_snapshot as any).total_amount === '20000.00');
    expect(firstLog).toBeDefined();
    const secondLog = logs.find((l) => l.id !== firstLog!.id);
    expect(secondLog).toBeDefined();
    expect((secondLog!.previous_snapshot as any).total_amount).toBe(
      (firstLog!.new_snapshot as any).total_amount
    );
    expect(
      [(firstLog!.new_snapshot as any).total_amount, (secondLog!.new_snapshot as any).total_amount].sort()
    ).toEqual(['22000.00', '25000.00']);
  });

  // ============================================================================
  // F-19 LIVE POSTGRESQL TESTS
  // ============================================================================

  it('TEST-ADMIN-LIVE-01..02: Admin User Directory returns exact approved fields, disables/re-enables user in PostgreSQL, enforces 403 ACCOUNT_DISABLED & BR-10', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const { admin, cookie: adminCookie } = await createIsolatedAdmin('dir');
    const tenant = await createIsolatedUserTenant('adm_target');

    // 1. GET /api/admin/users returns exact 6 contract-approved fields, zero password_hash or financial data
    const dirRes = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(dirRes.status).toBe(200);
    const targetRow = dirRes.body.data.users.find((u: any) => u.id === tenant.user.id);
    expect(targetRow).toBeDefined();
    expect(Object.keys(targetRow).sort()).toEqual([
      'created_at',
      'email',
      'id',
      'is_active',
      'role',
      'username'
    ]);

    // 2. USER denied on /api/admin/users (403 ADMIN_ONLY_ENDPOINT)
    const userDenied = await request(app).get('/api/admin/users').set('Cookie', tenant.cookie);
    expect(userDenied.status).toBe(403);
    expect(userDenied.body.error.code).toBe('ADMIN_ONLY_ENDPOINT');

    // 3. ADMIN denied on financial endpoints (403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN)
    const adminFin = await request(app).get('/api/accounts').set('Cookie', adminCookie);
    expect(adminFin.status).toBe(403);
    expect(adminFin.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');

    // 4. ADMIN cannot deactivate self (422 CANNOT_DEACTIVATE_SELF)
    const selfRes = await request(app)
      .patch(`/api/admin/users/${admin.id}/status`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', adminCookie)
      .send({ is_active: false });
    expect(selfRes.status).toBe(422);
    expect(selfRes.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');

    // 5. Deactivate target user -> persists in PostgreSQL, blocks existing JWT AND fresh login
    const disableRes = await request(app)
      .patch(`/api/admin/users/${tenant.user.id}/status`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', adminCookie)
      .send({ is_active: false });
    expect(disableRes.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: tenant.user.id } }))?.is_active).toBe(false);

    const blockedMe = await request(app).get('/api/auth/me').set('Cookie', tenant.cookie);
    expect(blockedMe.status).toBe(403);
    expect(blockedMe.body.error.code).toBe('ACCOUNT_DISABLED');

    const blockedLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ username: tenant.user.username, password: tenant.passwordPlain });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe('ACCOUNT_DISABLED');

    // 6. Re-enable target user -> restores authentication and API access
    const enableRes = await request(app)
      .patch(`/api/admin/users/${tenant.user.id}/status`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', adminCookie)
      .send({ is_active: true });
    expect(enableRes.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: tenant.user.id } }))?.is_active).toBe(true);

    const restoredLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({ username: tenant.user.username, password: tenant.passwordPlain });
    expect(restoredLogin.status).toBe(200);
  });

  it('TEST-ADMIN-LIVE-03: isolates exactly 2 controlled active ADMINs, proves concurrent cross-deactivation rejects the 2nd with 422 CANNOT_DEACTIVATE_LAST_ADMIN, and persists exactly 1 active test admin (Finding 3 & Task 8)', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    // Snapshot & temporarily deactivate any pre-existing active ADMIN rows so unrelated
    // seeded admins cannot cause a false-positive pass; always restored in finally.
    const preExistingActiveAdmins = await prisma.user.findMany({
      where: { role: 'ADMIN', is_active: true },
      select: { id: true }
    });
    const preExistingIds = preExistingActiveAdmins.map((u) => u.id);

    const admin1 = await createIsolatedAdmin('last1');
    const admin2 = await createIsolatedAdmin('last2');

    try {
      if (preExistingIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: preExistingIds } },
          data: { is_active: false }
        });
      }

      // Confirm controlled state: ONLY admin1 and admin2 are active ADMINs in PostgreSQL
      const activeBefore = await prisma.user.findMany({
        where: { role: 'ADMIN', is_active: true },
        select: { id: true }
      });
      expect(activeBefore.map((u) => u.id).sort()).toEqual([admin1.admin.id, admin2.admin.id].sort());

      // Concurrently attempt to deactivate BOTH controlled admins
      const results = await Promise.allSettled([
        updateUserAccessStatus(admin1.admin.id, admin2.admin.id, { is_active: false }, prisma),
        updateUserAccessStatus(admin2.admin.id, admin1.admin.id, { is_active: false }, prisma)
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      // Exactly 1 succeeds and 1 is rejected with 422 CANNOT_DEACTIVATE_LAST_ADMIN
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({
        statusCode: 422,
        code: 'CANNOT_DEACTIVATE_LAST_ADMIN'
      });

      // Verify persisted PostgreSQL state for our 2 controlled test admins
      const persistedControlled = await prisma.user.findMany({
        where: { id: { in: [admin1.admin.id, admin2.admin.id] } },
        select: { id: true, is_active: true }
      });
      const remainingActive = persistedControlled.filter((u) => u.is_active);
      const deactivated = persistedControlled.filter((u) => !u.is_active);
      expect(remainingActive).toHaveLength(1);
      expect(deactivated).toHaveLength(1);

      // Sequential attempt to deactivate the sole remaining active test admin MUST also fail with 422 CANNOT_DEACTIVATE_LAST_ADMIN
      await expect(
        updateUserAccessStatus('external-admin-caller', remainingActive[0].id, { is_active: false }, prisma)
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'CANNOT_DEACTIVATE_LAST_ADMIN'
      });

      const stillActive = await prisma.user.findUnique({
        where: { id: remainingActive[0].id },
        select: { is_active: true }
      });
      expect(stillActive?.is_active).toBe(true);
    } finally {
      if (preExistingIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: preExistingIds } },
          data: { is_active: true }
        });
      }
    }
  });
});
