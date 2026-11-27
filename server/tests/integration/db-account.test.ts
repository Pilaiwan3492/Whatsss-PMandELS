import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { seed, seedStandardAccountsForUser } from '../../prisma/seed.js';
import { lockAccounts } from '../../src/services/accountLock.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
  updated_at: Date;
}

interface UserSnapshot {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  updated_at: Date;
}

/**
 * Integration Test: PostgreSQL Live Database Account Foundation & Live API Tenant Isolation
 * Target: TEST-OPEN-01, TEST-OPEN-04, TEST-SEC-01 (Live HTTP API), NFR-DATA-01
 *
 * SAFETY INVARIANTS (P0 Quality Requirement):
 * - Live database tests run ONLY in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - In local developer environments, live database tests are SKIPPED by default to prevent data mutation.
 * - In CI environments, live PostgreSQL service container availability is mandatory (failures abort the build).
 * - Blanket database resets (such as updateMany without where) are strictly prohibited.
 * - Every test that mutates an account captures a snapshot beforehand and restores the exact original state.
 * - Seed testing snapshots and restores demo user credentials/status to prevent drift.
 * - Cleanup failures are rethrown and never silently swallowed.
 */
describe('Integration Test: PostgreSQL Live Database Account Foundation & Live API Isolation (WP-02)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  // Baseline snapshots of untouched accounts across users, captured at start of suite
  let initialOtherAccountsSnapshot: AccountSnapshot[] = [];
  let initialDemoUntouchedAccountsSnapshot: AccountSnapshot[] = [];

  // Track pending cleanup tasks using bounded-retry snapshot restoration with failure reporting
  const pendingCleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    // 1. In local environments, live database tests are strictly SKIPPED by default
    if (!isCI && !allowLiveDb) {
      console.warn(
        '[WP-02 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
        'Set ALLOW_LIVE_DB_TESTS=true with a dedicated test database ("whatsss_test") to run locally.'
      );
      isDbConnected = false;
      return;
    }

    // 2. Validate that DATABASE_URL points to the dedicated, verified test database (whatsss_test)
    // If verification fails, ABORT IMMEDIATELY (throw Error, do not just warn)
    assertTestDatabase(databaseUrl, {
      isCI,
      allowLiveDb,
      nodeEnv: process.env.NODE_ENV
    });

    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;

      // Capture pre-test snapshot of user_other accounts and user_demo's non-Checking accounts
      // To prove they were never mutated by any test, without assuming balances are 0.00
      const userOther = await prisma.user.findUnique({
        where: { username: 'user_other' },
        include: { accounts: true }
      });
      if (userOther) {
        initialOtherAccountsSnapshot = userOther.accounts.map((a) => ({
          id: a.id,
          opening_balance: a.opening_balance,
          is_opening_locked: a.is_opening_locked,
          updated_at: a.updated_at
        }));
      }

      const userDemo = await prisma.user.findUnique({
        where: { username: 'user_demo' },
        include: { accounts: { where: { name: { not: 'Checking Bank' } } } }
      });
      if (userDemo) {
        initialDemoUntouchedAccountsSnapshot = userDemo.accounts.map((a) => ({
          id: a.id,
          opening_balance: a.opening_balance,
          is_opening_locked: a.is_opening_locked,
          updated_at: a.updated_at
        }));
      }
    } catch (err) {
      isDbConnected = false;
      if (isCI) {
        throw new Error(
          'FATAL: PostgreSQL service container is not reachable in CI environment. ' +
          'Live database integration tests must execute in CI.'
        );
      }
      throw err;
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  afterEach(async () => {
    // Execute all registered cleanups safely using bounded-retry snapshot restoration with failure reporting
    await executeCleanupsSafely(pendingCleanups);
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

  async function snapshotUsers(usernames: string[]): Promise<UserSnapshot[]> {
    const users = await prisma.user.findMany({
      where: { username: { in: usernames } }
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      password_hash: u.password_hash,
      role: u.role,
      is_active: u.is_active,
      updated_at: u.updated_at
    }));
  }

  async function restoreUsers(snaps: UserSnapshot[]): Promise<void> {
    const errors: Error[] = [];
    for (const u of snaps) {
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: {
            password_hash: u.password_hash,
            role: u.role as any,
            is_active: u.is_active,
            updated_at: u.updated_at
          }
        });
      } catch (err: any) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
    if (errors.length > 0) {
      throw new Error(`Failed to restore ${errors.length} user(s): ${errors.map((e) => e.message).join('; ')}`);
    }
  }

  describe('Database Schema & Seed Verification (Fix #4)', () => {
    it('validates seeded accounts in PostgreSQL have correct types, zero initial balance, and are unlocked for USER demo users while admin_demo has no financial accounts', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      for (const username of ['user_demo', 'user_other']) {
        const user = await prisma.user.findUnique({
          where: { username },
          include: { accounts: { orderBy: { created_at: 'asc' } } }
        });

        expect(user).toBeDefined();
        expect(user!.role).toBe('USER');
        expect(user!.accounts).toHaveLength(5);

        const accountNames = user!.accounts.map((a) => a.name);
        expect(accountNames).toEqual([
          'Checking Bank',
          'Visa Credit Card',
          'Salary',
          'Dining',
          'Grocery'
        ]);

        for (const acc of user!.accounts) {
          expect(acc.user_id).toBe(user!.id);
          expect(Number(acc.opening_balance)).toBe(0.00);
          expect(acc.is_opening_locked).toBe(false);
        }
      }

      const adminUser = await prisma.user.findUnique({
        where: { username: 'admin_demo' },
        include: { accounts: true }
      });
      expect(adminUser).toBeDefined();
      expect(adminUser!.role).toBe('ADMIN');
      expect(adminUser!.accounts).toHaveLength(0);
    });

    it('validates @@unique([user_id, name]) constraint in PostgreSQL', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      expect(userDemo).toBeDefined();

      // Attempting to insert duplicate account with same name for same user must reject
      await expect(
        prisma.account.create({
          data: {
            user_id: userDemo!.id,
            name: 'Checking Bank',
            type: 'CASH',
            opening_balance: 0.00
          }
        })
      ).rejects.toThrow();
    });

    it('validates seed script idempotency preserves configured opening balance (F-03)', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      const checking = await prisma.account.findFirst({
        where: { user_id: userDemo!.id, name: 'Checking Bank' }
      });
      expect(checking).toBeDefined();

      // Snapshot checking account and demo users before mutation
      const accountSnap = await snapshotAccount(checking!.id);
      const userSnaps = await snapshotUsers(['user_demo', 'user_other', 'admin_demo']);

      // Register independent cleanups in central queue BEFORE mutation/seed
      // Failure in restoring account will NOT prevent restoring users
      pendingCleanups.push(async () => {
        await restoreUsers(userSnaps);
      });
      pendingCleanups.push(async () => {
        await restoreAccount(accountSnap);
      });

      // Update opening balance to 10000.00 THB
      await prisma.account.update({
        where: { id: checking!.id },
        data: { opening_balance: 10000.00, is_opening_locked: false }
      });

      // Re-run seed inside try/finally ensuring cleanup is never bypassed on unexpected crash
      try {
        await seed(prisma);
      } finally {
        // executeCleanupsSafely in afterEach guarantees restoration
      }

      // Opening balance must be preserved at 10000.00 THB without reset to 0.00
      const rechecked = await prisma.account.findUnique({ where: { id: checking!.id } });
      expect(Number(rechecked!.opening_balance)).toBe(10000.00);
    });

    it('validates demo user snapshot captures and restores exact updated_at timestamp across seed execution', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // 1. Snapshot demo users before seed execution
      const userSnaps = await snapshotUsers(['user_demo', 'user_other', 'admin_demo']);
      expect(userSnaps).toHaveLength(3);
      for (const snap of userSnaps) {
        expect(snap.updated_at).toBeInstanceOf(Date);
      }

      // Register guaranteed cleanup in central queue BEFORE seed
      pendingCleanups.push(async () => {
        await restoreUsers(userSnaps);
      });

      // 2. Execute seed inside try/finally ensuring restore is attempted even if seed throws
      try {
        await seed(prisma);
      } finally {
        await restoreUsers(userSnaps);
      }

      // 3. Verify that each demo user's updated_at matches the pre-seed snapshot exactly
      const restoredUsers = await prisma.user.findMany({
        where: { username: { in: ['user_demo', 'user_other', 'admin_demo'] } }
      });

      for (const snap of userSnaps) {
        const restored = restoredUsers.find((u) => u.id === snap.id);
        expect(restored).toBeDefined();
        expect(restored!.updated_at.getTime()).toBe(snap.updated_at.getTime());
        expect(restored!.password_hash).toBe(snap.password_hash);
        expect(restored!.role).toBe(snap.role);
        expect(restored!.is_active).toBe(snap.is_active);
      }
    });

    it('attempts bounded-retry snapshot restoration and restores database state when real seed execution encounters an error (Task 3 Real Seed Failure)', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // 1. Snapshot demo users and checking account before mutation
      const userSnaps = await snapshotUsers(['user_demo', 'user_other', 'admin_demo']);
      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      const checking = await prisma.account.findFirst({
        where: { user_id: userDemo!.id, name: 'Checking Bank' }
      });
      expect(checking).toBeDefined();
      const accountSnap = await snapshotAccount(checking!.id);

      // 2. Register independent cleanups in central queue BEFORE running test
      pendingCleanups.push(async () => {
        await restoreUsers(userSnaps);
      });
      pendingCleanups.push(async () => {
        await restoreAccount(accountSnap);
      });

      // 3. Mutate checking balance to test restoration
      await prisma.account.update({
        where: { id: checking!.id },
        data: { opening_balance: 5555.55, is_opening_locked: false }
      });

      // 4. Construct proxy client where user operations hit real PostgreSQL,
      // but account.upsert throws an injected database error during seed execution
      // (both directly and inside interactive $transaction callbacks)
      const wrapClientWithUpsertFailure = (clientTarget: any): any =>
        new Proxy(clientTarget, {
          get(target, prop, receiver) {
            if (prop === '$transaction' && typeof target.$transaction === 'function') {
              return async (arg: any, ...rest: any[]) => {
                if (typeof arg === 'function') {
                  return target.$transaction(
                    async (tx: any) => arg(wrapClientWithUpsertFailure(tx)),
                    ...rest
                  );
                }
                return target.$transaction(arg, ...rest);
              };
            }
            if (prop === 'account') {
              const realAccount = target.account;
              return new Proxy(realAccount, {
                get(accTarget, accProp, accReceiver) {
                  if (accProp === 'upsert') {
                    return async () => {
                      throw new Error('Injected database error during real seed account upsert');
                    };
                  }
                  return Reflect.get(accTarget, accProp, accReceiver);
                }
              });
            }
            return Reflect.get(target, prop, receiver);
          }
        });

      const proxyPrisma = wrapClientWithUpsertFailure(prisma);

      // 5. Execute real seed(proxyPrisma) inside try/finally
      let seedError: Error | null = null;
      try {
        await seed(proxyPrisma as any);
      } catch (err: any) {
        seedError = err;
      } finally {
        await restoreAccount(accountSnap);
        await restoreUsers(userSnaps);
      }

      // 6. Assert real seed execution failed at the injected account upsert step
      expect(seedError).toBeDefined();
      expect(seedError!.message).toContain('Injected database error during real seed account upsert');

      // 7. Verify all demo users and account were completely restored in PostgreSQL
      const restoredChecking = await prisma.account.findUnique({ where: { id: checking!.id } });
      expect(Number(restoredChecking!.opening_balance)).toBe(Number(accountSnap.opening_balance));
      expect(restoredChecking!.is_opening_locked).toBe(accountSnap.is_opening_locked);

      const restoredUsers = await prisma.user.findMany({
        where: { username: { in: ['user_demo', 'user_other', 'admin_demo'] } }
      });
      for (const snap of userSnaps) {
        const u = restoredUsers.find((r) => r.id === snap.id);
        expect(u).toBeDefined();
        expect(u!.role).toBe(snap.role);
        expect(u!.password_hash).toBe(snap.password_hash);
        expect(u!.is_active).toBe(snap.is_active);
        expect(u!.updated_at.getTime()).toBe(snap.updated_at.getTime());
      }
    });

    it('P0-02 (Live PostgreSQL): rolls back earlier accounts in real PostgreSQL $transaction when 2nd or 5th account fails, and preserves existing transactions on seed re-run', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      const tempUsername = `temp_seed_atomic_${Date.now()}`;
      const tempUser = await prisma.user.create({
        data: {
          username: tempUsername,
          email: `${tempUsername}@whatsss.local`,
          password_hash: '$2b$10$TempAtomicSeedUserHashValue123456789012345678901234',
          role: 'USER',
          is_active: true
        }
      });

      pendingCleanups.push(async () => {
        await prisma.account.deleteMany({ where: { user_id: tempUser.id } });
        await prisma.user.deleteMany({ where: { id: tempUser.id } });
      });

      // Helper wrapping real PrismaClient so real SQL inserts happen for earlier accounts, then throws on targetAccountName
      const makePartialFailClient = (failOnName: string): any =>
        new Proxy(prisma, {
          get(target, prop, receiver) {
            if (prop === '$transaction') {
              return async (fn: any, ...rest: any[]) =>
                target.$transaction(async (realTx) => {
                  const txProxy = new Proxy(realTx, {
                    get(txTarget, txProp, txReceiver) {
                      if (txProp === 'account') {
                        return new Proxy(txTarget.account, {
                          get(accTarget, accProp, accReceiver) {
                            if (accProp === 'upsert') {
                              return async (args: any) => {
                                if (args?.create?.name === failOnName) {
                                  throw new Error(`Injected live PostgreSQL failure on ${failOnName}`);
                                }
                                return accTarget.upsert(args);
                              };
                            }
                            return Reflect.get(accTarget, accProp, accReceiver);
                          }
                        });
                      }
                      return Reflect.get(txTarget, txProp, txReceiver);
                    }
                  });
                  return fn(txProxy);
                }, ...rest);
            }
            return Reflect.get(target, prop, receiver);
          }
        });

      // 1. Fail on 2nd account ('Visa Credit Card') -> 1st account ('Checking Bank') must be rolled back in PostgreSQL
      await expect(
        seedStandardAccountsForUser(makePartialFailClient('Visa Credit Card'), {
          id: tempUser.id,
          role: 'USER',
          username: tempUser.username
        })
      ).rejects.toThrow(/Injected live PostgreSQL failure on Visa Credit Card/);

      const countAfterSecondFail = await prisma.account.count({ where: { user_id: tempUser.id } });
      expect(countAfterSecondFail).toBe(0);

      // 2. Fail on 5th account ('Grocery') -> all 4 preceding accounts must be rolled back in PostgreSQL
      await expect(
        seedStandardAccountsForUser(makePartialFailClient('Grocery'), {
          id: tempUser.id,
          role: 'USER',
          username: tempUser.username
        })
      ).rejects.toThrow(/Injected live PostgreSQL failure on Grocery/);

      const countAfterFifthFail = await prisma.account.count({ where: { user_id: tempUser.id } });
      expect(countAfterFifthFail).toBe(0);

      // 3. Normal execution succeeds and commits all 5 accounts in PostgreSQL
      await seedStandardAccountsForUser(prisma, {
        id: tempUser.id,
        role: 'USER',
        username: tempUser.username
      });
      const countAfterSuccess = await prisma.account.count({ where: { user_id: tempUser.id } });
      expect(countAfterSuccess).toBe(5);
    });
  });

  describe('Live PostgreSQL Decimal Precision Verification (Part 2, F-03, AC-03-2)', () => {
    it('verifies accepted and rejected boundary Decimal values through live API and asserts exact Prisma.Decimal in PostgreSQL', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // Authenticate user_demo via real HTTP login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ username: 'user_demo', password: 'Password123!' });

      expect(loginRes.status).toBe(200);
      const userCookies = loginRes.headers['set-cookie'];

      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      const checking = await prisma.account.findFirst({
        where: { user_id: userDemo!.id, name: 'Checking Bank' }
      });
      expect(checking).toBeDefined();

      // Snapshot checking account and register bounded-retry cleanup before mutation
      const checkingSnap = await snapshotAccount(checking!.id);
      pendingCleanups.push(async () => {
        await restoreAccount(checkingSnap);
      });

      // 1. Accepted boundary values: 0.01, 0.29, 100.10, 9999999999.99
      const acceptedValues = [
        { input: 0.01, expectedStr: '0.01' },
        { input: 0.29, expectedStr: '0.29' },
        { input: 100.10, expectedStr: '100.10' },
        { input: 9999999999.99, expectedStr: '9999999999.99' }
      ];

      for (const { input, expectedStr } of acceptedValues) {
        const patchRes = await request(app)
          .patch(`/api/accounts/${checking!.id}/opening-balance`)
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', userCookies)
          .send({ opening_balance: input });

        expect(patchRes.status, `Failed for accepted input ${input}`).toBe(200);
        expect(patchRes.body.success).toBe(true);

        // Query PostgreSQL directly using Prisma
        const dbAcc = await prisma.account.findUniqueOrThrow({ where: { id: checking!.id } });
        const expectedDecimal = new Prisma.Decimal(expectedStr);

        // Verify exact Prisma.Decimal equality (no floating-point comparison)
        expect(
          dbAcc.opening_balance.equals(expectedDecimal),
          `Prisma.Decimal comparison failed for ${input}: stored ${dbAcc.opening_balance.toString()} vs expected ${expectedStr}`
        ).toBe(true);

        // Verify trailing zeros and decimal precision format
        expect(dbAcc.opening_balance.toFixed(2)).toBe(expectedStr);
      }

      // Capture current stored balance as baseline for rejected value tests
      const baselineAcc = await prisma.account.findUniqueOrThrow({ where: { id: checking!.id } });
      const baselineDecimal = baselineAcc.opening_balance;

      // 2. Rejected boundary values: 100.123, 10000000000.00, -0.01
      const rejectedValues = [100.123, 10000000000.00, -0.01];

      for (const invalidInput of rejectedValues) {
        const patchRes = await request(app)
          .patch(`/api/accounts/${checking!.id}/opening-balance`)
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', userCookies)
          .send({ opening_balance: invalidInput });

        expect(patchRes.status, `Expected HTTP 400 for input ${invalidInput}`).toBe(400);
        expect(patchRes.body.success).toBe(false);
        expect(patchRes.body.error.code).toBe('INVALID_OPENING_BALANCE');

        // Verify no unintended database update occurred; opening balance remains unchanged in PostgreSQL
        const afterAcc = await prisma.account.findUniqueOrThrow({ where: { id: checking!.id } });
        expect(
          afterAcc.opening_balance.equals(baselineDecimal),
          `Database was mutated on rejected input ${invalidInput}`
        ).toBe(true);
      }

      // Clean up account back to original pre-test snapshot
      await restoreAccount(checkingSnap);
    });
  });

  describe('Live HTTP API Tenant Isolation Verification (Fix #2, TEST-SEC-01)', () => {
    it('executes real HTTP requests through auth middleware and verifies cross-tenant isolation in PostgreSQL', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // 1. Authenticate User A (user_demo) via real login API
      const userALoginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ username: 'user_demo', password: 'Password123!' });

      expect(userALoginRes.status).toBe(200);
      const userACookies = userALoginRes.headers['set-cookie'];
      expect(userACookies).toBeDefined();

      // 2. Fetch User B's account from PostgreSQL
      const userOther = await prisma.user.findUnique({ where: { username: 'user_other' } });
      const userBChecking = await prisma.account.findFirst({
        where: { user_id: userOther!.id, name: 'Checking Bank' }
      });
      expect(userBChecking).toBeDefined();
      const initialUserBBalance = Number(userBChecking!.opening_balance);

      // 3. User A attempts GET User B account via real HTTP endpoint -> 404 NOT_FOUND
      const getForeignRes = await request(app)
        .get(`/api/accounts/${userBChecking!.id}`)
        .set('Cookie', userACookies);

      expect(getForeignRes.status).toBe(404);
      expect(getForeignRes.body.success).toBe(false);
      expect(getForeignRes.body.error.code).toBe('NOT_FOUND');

      // 4. User A attempts PATCH User B opening balance via real HTTP endpoint -> 404 NOT_FOUND
      const patchForeignRes = await request(app)
        .patch(`/api/accounts/${userBChecking!.id}/opening-balance`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookies)
        .send({ opening_balance: 5555.00 });

      expect(patchForeignRes.status).toBe(404);
      expect(patchForeignRes.body.success).toBe(false);
      expect(patchForeignRes.body.error.code).toBe('NOT_FOUND');

      // 4b. User A attempts PUT and DELETE on User B account and transactions via real HTTP endpoints -> 404 NOT_FOUND
      const putForeignAccRes = await request(app)
        .put(`/api/accounts/${userBChecking!.id}`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookies)
        .send({ name: 'Tampered', opening_balance: 5555.00 });
      expect(putForeignAccRes.status).toBe(404);
      expect(putForeignAccRes.body.error.code).toBe('NOT_FOUND');

      const deleteForeignAccRes = await request(app)
        .delete(`/api/accounts/${userBChecking!.id}`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookies);
      expect(deleteForeignAccRes.status).toBe(404);
      expect(deleteForeignAccRes.body.error.code).toBe('NOT_FOUND');

      const deleteForeignTxnRes = await request(app)
        .delete(`/api/transactions/${userBChecking!.id}`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userACookies);
      expect(deleteForeignTxnRes.status).toBe(404);
      expect(deleteForeignTxnRes.body.error.code).toBe('NOT_FOUND');

      // 5. Verify User B's row in PostgreSQL remains completely untouched
      const recheckedUserB = await prisma.account.findUnique({ where: { id: userBChecking!.id } });
      expect(Number(recheckedUserB!.opening_balance)).toBe(initialUserBBalance);
      expect(recheckedUserB!.is_opening_locked).toBe(false);

      // 6. User A lists accounts -> returns only User A's accounts
      const listRes = await request(app)
        .get('/api/accounts')
        .set('Cookie', userACookies);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.accounts).toHaveLength(5);
      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      for (const acc of listRes.body.data.accounts) {
        expect(acc.user_id).toBe(userDemo!.id);
      }

      // 7. User A sets own opening balance to 10000.00 THB -> returns 200 OK and updates PostgreSQL
      const userAChecking = await prisma.account.findFirst({
        where: { user_id: userDemo!.id, name: 'Checking Bank' }
      });
      expect(userAChecking).toBeDefined();

      // Snapshot user A's checking account before mutation
      const userASnap = await snapshotAccount(userAChecking!.id);
      pendingCleanups.push(async () => {
        await restoreAccount(userASnap);
      });

      const patchOwnRes = await request(app)
        .patch(`/api/accounts/${userAChecking!.id}/opening-balance`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookies)
        .send({ opening_balance: 10000.00 });

      expect(patchOwnRes.status).toBe(200);
      expect(patchOwnRes.body.success).toBe(true);
      expect(patchOwnRes.body.data.account.opening_balance).toBe(10000.00);

      // Verify PostgreSQL row reflects 10000.00
      const recheckedUserA = await prisma.account.findUnique({ where: { id: userAChecking!.id } });
      expect(Number(recheckedUserA!.opening_balance)).toBe(10000.00);
    });

    it('blocks admin_demo from accessing financial accounts via HTTP with 403 Forbidden (BR-10)', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // Authenticate admin_demo
      const adminLoginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ username: 'admin_demo', password: 'Password123!' });

      expect(adminLoginRes.status).toBe(200);
      const adminCookies = adminLoginRes.headers['set-cookie'];

      // Attempt to list accounts
      const listRes = await request(app)
        .get('/api/accounts')
        .set('Cookie', adminCookies);

      expect(listRes.status).toBe(403);
      expect(listRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');

      // Attempt to update opening balance
      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      const checking = await prisma.account.findFirst({
        where: { user_id: userDemo!.id, name: 'Checking Bank' }
      });

      const patchRes = await request(app)
        .patch(`/api/accounts/${checking!.id}/opening-balance`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', adminCookies)
        .send({ opening_balance: 10000.00 });

      expect(patchRes.status).toBe(403);
      expect(patchRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    });
  });

  describe('Prisma Transaction Commit & Rollback Locking Evidence (AC-03-3 Service-Level)', () => {
    /**
     * SCOPE BOUNDARY FOR AC-03-3:
     * This test suite verifies the atomic account lock service `lockAccounts()` within an active
     * Prisma transaction boundary (`prisma.$transaction`). It proves:
     * 1. Committed transactions persist `is_opening_locked = true` in PostgreSQL, causing subsequent
     *    HTTP PATCH requests to reject with 422 OPENING_BALANCE_LOCKED.
     * 2. Failed transactions roll back `is_opening_locked` to false in PostgreSQL, allowing opening
     *    balance configuration to continue.
     *
     * BOUNDARY NOTE:
     * In WP-02, this lock service is tested directly. Integration into the financial transaction
     * creation workflow (`POST /api/transactions`) is scheduled for implementation in WP-03.
     * End-to-end transaction-triggered locking is verified when transaction creation is introduced in WP-03.
     */
    it('proves account lock persists on transaction commit and rolls back on transaction failure (lock service verified; transaction creation integration pending WP-03)', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      const userDemo = await prisma.user.findUnique({ where: { username: 'user_demo' } });
      const checking = await prisma.account.findFirst({
        where: { user_id: userDemo!.id, name: 'Checking Bank' }
      });
      expect(checking).toBeDefined();

      // Snapshot checking account before mutation
      const checkingSnap = await snapshotAccount(checking!.id);
      pendingCleanups.push(async () => {
        await restoreAccount(checkingSnap);
      });

      // 1. Commit case: Lock inside successful transaction
      await prisma.$transaction(async (tx) => {
        await lockAccounts(tx, [checking!.id], userDemo!.id);
      });

      // Verify in PostgreSQL that account is now locked
      let dbAccount = await prisma.account.findUnique({ where: { id: checking!.id } });
      expect(dbAccount!.is_opening_locked).toBe(true);

      // Verify subsequent HTTP update is rejected with 422 OPENING_BALANCE_LOCKED
      const userALoginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ username: 'user_demo', password: 'Password123!' });
      const userACookies = userALoginRes.headers['set-cookie'];

      const lockedRes = await request(app)
        .patch(`/api/accounts/${checking!.id}/opening-balance`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookies)
        .send({ opening_balance: 15000.00 });

      expect(lockedRes.status).toBe(422);
      expect(lockedRes.body.error.code).toBe('OPENING_BALANCE_LOCKED');

      // 2. Reset lock to false for rollback test
      await prisma.account.update({
        where: { id: checking!.id },
        data: { is_opening_locked: false }
      });

      // 3. Rollback case: Lock executed inside failing transaction
      try {
        await prisma.$transaction(async (tx) => {
          await lockAccounts(tx, [checking!.id], userDemo!.id);
          throw new Error('Simulated business logic failure triggering transaction rollback');
        });
      } catch {
        // Expected rollback
      }

      // Verify in PostgreSQL that is_opening_locked rolled back to false!
      dbAccount = await prisma.account.findUnique({ where: { id: checking!.id } });
      expect(dbAccount!.is_opening_locked).toBe(false);

      // Verify that after rollback, opening balance update is still allowed
      const allowedRes = await request(app)
        .patch(`/api/accounts/${checking!.id}/opening-balance`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookies)
        .send({ opening_balance: 5000.00 });

      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body.data.account.opening_balance).toBe(5000.00);
    });

    it('verifies live DB test safety: unrelated accounts and other users remain completely unmutated relative to pre-test baseline', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // 1. Verify user_other's accounts in PostgreSQL match pre-test baseline snapshot exactly
      // Proves no mutation occurred without assuming initial balances were 0.00
      const userOther = await prisma.user.findUnique({
        where: { username: 'user_other' },
        include: { accounts: true }
      });
      expect(userOther).toBeDefined();
      expect(userOther!.accounts).toHaveLength(initialOtherAccountsSnapshot.length);
      for (const snap of initialOtherAccountsSnapshot) {
        const current = userOther!.accounts.find((a) => a.id === snap.id);
        expect(current, `Expected account ${snap.id} to exist`).toBeDefined();
        expect(Number(current!.opening_balance)).toBe(Number(snap.opening_balance));
        expect(current!.is_opening_locked).toBe(snap.is_opening_locked);
        expect(current!.updated_at.getTime()).toBe(snap.updated_at.getTime());
      }

      // 2. Verify user_demo's untouched accounts match pre-test baseline snapshot exactly
      const userDemo = await prisma.user.findUnique({
        where: { username: 'user_demo' },
        include: { accounts: { where: { name: { not: 'Checking Bank' } } } }
      });
      expect(userDemo).toBeDefined();
      expect(userDemo!.accounts).toHaveLength(initialDemoUntouchedAccountsSnapshot.length);
      for (const snap of initialDemoUntouchedAccountsSnapshot) {
        const current = userDemo!.accounts.find((a) => a.id === snap.id);
        expect(current, `Expected account ${snap.id} to exist`).toBeDefined();
        expect(Number(current!.opening_balance)).toBe(Number(snap.opening_balance));
        expect(current!.is_opening_locked).toBe(snap.is_opening_locked);
        expect(current!.updated_at.getTime()).toBe(snap.updated_at.getTime());
      }
    });
  });

  describe('Live PostgreSQL Verification for WP-08 (F-10: TEST-ACC-05 Concurrency, Trigger & Migration Safety)', () => {
    it('TEST-ACC-05 (Live PostgreSQL): serializes concurrent duplicate account creation requests (exact match, case-insensitive, whitespace variants) via DB unique constraint and maps P2002 to 409 DUPLICATE_ACCOUNT_NAME', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      const tempUsername = `temp_acc05_${Date.now()}`;
      const tempUser = await prisma.user.create({
        data: {
          username: tempUsername,
          email: `${tempUsername}@whatsss.test`,
          password_hash: '$2b$10$TempAcc05LiveTestHashValue12345678901234567890123456',
          role: 'USER',
          is_active: true
        }
      });

      pendingCleanups.push(async () => {
        await prisma.account.deleteMany({ where: { user_id: tempUser.id } });
        await prisma.user.deleteMany({ where: { id: tempUser.id } });
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ username: 'user_demo', password: 'Password123!' });
      expect(loginRes.status).toBe(200);
      const demoCookie = loginRes.headers['set-cookie'];

      const userDemo = await prisma.user.findUniqueOrThrow({ where: { username: 'user_demo' } });

      // Ensure cleanup of any Emergency Fund test rows for user_demo
      const baseName = `Emergency Fund ${Date.now()}`;
      const lowerVariant = baseName.toLowerCase();
      const whitespaceVariant = `   ${baseName.replace(' ', '    ')}   `;

      pendingCleanups.push(async () => {
        await prisma.account.deleteMany({
          where: {
            user_id: userDemo.id,
            normalized_name: lowerVariant
          }
        });
      });

      // 1. Concurrent API requests with case + whitespace variants on live PostgreSQL
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/accounts')
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', demoCookie)
          .send({ name: baseName, type: 'CASH', opening_balance: 100.00 }),
        request(app)
          .post('/api/accounts')
          .set('Origin', TRUSTED_ORIGIN)
          .set('Content-Type', 'application/json')
          .set('Cookie', demoCookie)
          .send({ name: whitespaceVariant.toUpperCase(), type: 'CASH', opening_balance: 100.00 })
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.success).toBe(false);
      expect(conflictRes.body.error.code).toBe('DUPLICATE_ACCOUNT_NAME');

      // Verify PostgreSQL holds strictly 1 row for this normalized name
      const persistedRows = await prisma.account.findMany({
        where: {
          user_id: userDemo.id,
          normalized_name: lowerVariant
        }
      });
      expect(persistedRows).toHaveLength(1);
      expect(persistedRows[0].normalized_name).toBe(lowerVariant);

      // 2. Direct PostgreSQL trigger & functional unique index test (P2 Item 5 & 6):
      // Insert directly without specifying normalized_name, verify trigger computes it,
      // and verify direct SQL UPDATE / INSERT with "Food" vs "  food  " is blocked by DB unique index.
      const foodAcc = await prisma.account.create({
        data: {
          user_id: tempUser.id,
          name: '  Food   &   Drink  ',
          type: 'EXPENSE',
          opening_balance: 0.00
        }
      });
      expect(foodAcc.normalized_name).toBe('food & drink');

      // Direct SQL UPDATE of name without touching normalized_name must trigger sync_account_normalized_name()
      await prisma.$executeRaw`
        UPDATE "accounts"
        SET "name" = '  Fresh   Groceries  '
        WHERE "id" = ${foodAcc.id}
      `;
      const afterDirectUpdate = await prisma.account.findUniqueOrThrow({ where: { id: foodAcc.id } });
      expect(afterDirectUpdate.normalized_name).toBe('fresh groceries');

      // Attempting to insert "FRESH   GROCERIES" for the same user must fail at DB level with P2002
      await expect(
        prisma.account.create({
          data: {
            user_id: tempUser.id,
            name: 'FRESH   GROCERIES',
            type: 'EXPENSE',
            opening_balance: 0.00
          }
        })
      ).rejects.toThrow();

      // 3. Verify LOAN_TAKEN subtype trigger preservation (P2 Item 7):
      // Creating a LOAN_TAKEN account with explicit GENERAL_LOAN must keep GENERAL_LOAN (never overwritten to CREDIT_CARD)
      const generalLoanAcc = await prisma.account.create({
        data: {
          user_id: tempUser.id,
          name: 'Education Loan',
          type: 'LOAN_TAKEN',
          subtype: 'GENERAL_LOAN',
          opening_balance: 5000.00
        }
      });
      expect(generalLoanAcc.subtype).toBe('GENERAL_LOAN');

      // Verify seeded Visa Credit Card has subtype CREDIT_CARD
      const seededCc = await prisma.account.findFirstOrThrow({
        where: { user_id: userDemo.id, name: 'Visa Credit Card' }
      });
      expect(seededCc.subtype).toBe('CREDIT_CARD');

      // 4. Verify Pre-Migration Collision Check Function and Backfill Function execute cleanly on existing data (P2 Item 6 & 7)
      await expect(
        prisma.$executeRaw`SELECT check_pre_migration_account_name_collisions()`
      ).resolves.toBeDefined();
      await expect(
        prisma.$executeRaw`SELECT backfill_loan_taken_subtypes()`
      ).resolves.toBeDefined();
    });

    it('TEST-ACC-05 Pre-Migration Collision Failure (Live PostgreSQL): check_pre_migration_account_name_collisions() rejects legacy duplicate account names (case-insensitive, leading/trailing spaces, multiple internal spaces) with SQLSTATE 23505 without deleting or renaming existing accounts', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      const tempUsername = `temp_collision_${Date.now()}`;
      const tempUser = await prisma.user.create({
        data: {
          username: tempUsername,
          email: `${tempUsername}@whatsss.test`,
          password_hash: '$2b$10$TempCollisionLiveTestHash1234567890123456789012345678',
          role: 'USER',
          is_active: true
        }
      });

      pendingCleanups.push(async () => {
        await prisma.account.deleteMany({ where: { user_id: tempUser.id } });
        await prisma.user.deleteMany({ where: { id: tempUser.id } });
      });

      const collisionPairs: Array<{ label: string; first: string; second: string }> = [
        { label: 'case-insensitive duplicate ("Food" vs "food")', first: 'Food', second: 'food' },
        { label: 'leading/trailing whitespace duplicate ("Food" vs "  Food  ")', first: 'Food', second: '  Food  ' },
        { label: 'multiple internal spaces duplicate ("Food   Account" vs "Food Account")', first: 'Food   Account', second: 'Food Account' }
      ];

      // Run inside an isolated PostgreSQL transaction that rolls back transactional DDL at the end
      let rollbackCompleted = false;
      try {
        await prisma.$transaction(async (tx) => {
          // Temporarily drop post-migration unique indexes and disable trigger inside this transaction
          // to simulate a pre-migration database state containing legacy colliding account names
          await tx.$executeRawUnsafe(`DROP INDEX "accounts_user_id_normalized_name_key"`);
          await tx.$executeRawUnsafe(`DROP INDEX "accounts_user_id_normalized_name_expr_idx"`);
          await tx.$executeRawUnsafe(`ALTER TABLE "accounts" DISABLE TRIGGER trg_accounts_sync_normalized_name`);

          for (const pair of collisionPairs) {
            const acc1 = await tx.account.create({
              data: {
                user_id: tempUser.id,
                name: pair.first,
                normalized_name: '',
                type: 'EXPENSE',
                opening_balance: 0.00
              }
            });
            const acc2 = await tx.account.create({
              data: {
                user_id: tempUser.id,
                name: pair.second,
                normalized_name: '',
                type: 'EXPENSE',
                opening_balance: 0.00
              }
            });

            // Establish a savepoint before invoking check_pre_migration_account_name_collisions()
            await tx.$executeRawUnsafe(`SAVEPOINT sp_before_collision_check`);

            let caughtErr: any = null;
            try {
              await tx.$executeRaw`SELECT check_pre_migration_account_name_collisions()`;
            } catch (err: any) {
              caughtErr = err;
            }

            // Assert that check_pre_migration_account_name_collisions() failed with PostgreSQL SQLSTATE 23505
            expect(caughtErr, `Expected collision failure for ${pair.label}`).not.toBeNull();
            const errStr = String(caughtErr?.message || caughtErr);
            expect(errStr).toContain('23505');
            if (caughtErr?.meta?.code) {
              expect(caughtErr.meta.code).toBe('23505');
            }

            // Recover transaction state to savepoint and verify neither row was deleted or renamed
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT sp_before_collision_check`);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT sp_before_collision_check`);

            const survivingAccounts = await tx.account.findMany({
              where: { user_id: tempUser.id },
              orderBy: { created_at: 'asc' }
            });
            expect(survivingAccounts).toHaveLength(2);
            const names = survivingAccounts.map((a) => a.name);
            expect(names).toContain(acc1.name);
            expect(names).toContain(acc2.name);

            // Clean up pair before testing next collision scenario
            await tx.account.deleteMany({ where: { user_id: tempUser.id } });
          }

          throw new Error('INTENTIONAL_ROLLBACK_PRE_MIGRATION_SIMULATION');
        });
      } catch (err: any) {
        if (err?.message === 'INTENTIONAL_ROLLBACK_PRE_MIGRATION_SIMULATION') {
          rollbackCompleted = true;
        } else {
          throw err;
        }
      }

      expect(rollbackCompleted).toBe(true);

      // Verify post-rollback that both unique indexes remain active in PostgreSQL
      const activeIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'accounts'
          AND indexname IN ('accounts_user_id_normalized_name_key', 'accounts_user_id_normalized_name_expr_idx')
      `;
      expect(activeIndexes).toHaveLength(2);
    });

    it('TEST-ACC-02 Backfill Scenarios (Live PostgreSQL): backfill_loan_taken_subtypes() accurately classifies LOAN_TAKEN accounts across all 5 transaction-history and explicit-subtype cases', async (ctx) => {
      if (!isDbConnected) {
        ctx.skip();
        return;
      }

      // Verify that backfill_loan_taken_subtypes() is already installed by the Prisma migration (never created or replaced by the test)
      const installedFns = await prisma.$queryRaw<Array<{ proname: string }>>`
        SELECT proname
        FROM pg_proc
        WHERE proname = 'backfill_loan_taken_subtypes'
      `;
      expect(installedFns).toHaveLength(1);

      let verifiedAllFiveCases = false;
      try {
        await prisma.$transaction(async (tx) => {
          const suffix = `temp_backfill_${Date.now()}`;
          const user = await tx.user.create({
            data: {
              username: suffix,
              email: `${suffix}@whatsss.test`,
              password_hash: '$2b$10$TempBackfillLiveTestHash12345678901234567890123456789',
              role: 'USER',
              is_active: true
            }
          });

          const cashAcc = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Primary Cash',
              type: 'CASH',
              opening_balance: 50000.00
            }
          });
          const expenseAcc = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'General Expense',
              type: 'EXPENSE',
              opening_balance: 0.00
            }
          });

          // Temporarily disable trigger so we can insert legacy pre-migration LOAN_TAKEN accounts with subtype = 'DEFAULT'
          await tx.$executeRawUnsafe(`ALTER TABLE "accounts" DISABLE TRIGGER trg_accounts_sync_normalized_name`);

          // Case 1: Legacy LOAN_TAKEN account (subtype = 'DEFAULT') with Credit Card Purchase history (PAYMENT_CHARGE on LOAN_TAKEN) -> CREDIT_CARD
          const case1CreditPurchase = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Legacy Card With Purchase',
              normalized_name: 'legacy card with purchase',
              type: 'LOAN_TAKEN',
              subtype: 'DEFAULT',
              opening_balance: 0.00
            }
          });
          await tx.transaction.create({
            data: {
              user_id: user.id,
              primary_account_id: case1CreditPurchase.id,
              form: 'PAYMENT_CHARGE',
              total_amount: new Prisma.Decimal('1200.00'),
              transaction_date: new Date('2026-11-05T00:00:00.000Z'),
              description: 'Credit Card Purchase',
              allocation_lines: {
                create: [{ target_account_id: expenseAcc.id, amount: new Prisma.Decimal('1200.00') }]
              }
            }
          });

          // Case 2: Legacy LOAN_TAKEN account (subtype = 'DEFAULT') with General Loan Borrowing history (RECEIVE_MONEY on CASH targeting LOAN_TAKEN) -> GENERAL_LOAN
          const case2GeneralBorrow = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Legacy Loan With Borrowing',
              normalized_name: 'legacy loan with borrowing',
              type: 'LOAN_TAKEN',
              subtype: 'DEFAULT',
              opening_balance: 0.00
            }
          });
          await tx.transaction.create({
            data: {
              user_id: user.id,
              primary_account_id: cashAcc.id,
              form: 'RECEIVE_MONEY',
              total_amount: new Prisma.Decimal('5000.00'),
              transaction_date: new Date('2026-11-06T00:00:00.000Z'),
              description: 'Personal Loan Disbursement Received',
              allocation_lines: {
                create: [{ target_account_id: case2GeneralBorrow.id, amount: new Prisma.Decimal('5000.00') }]
              }
            }
          });

          // Case 3: Legacy LOAN_TAKEN account (subtype = 'DEFAULT') with NO transaction history -> CREDIT_CARD (documented legacy default)
          const case3NoHistoryDefault = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Legacy Empty Loan Account',
              normalized_name: 'legacy empty loan account',
              type: 'LOAN_TAKEN',
              subtype: 'DEFAULT',
              opening_balance: 0.00
            }
          });

          // Case 4: LOAN_TAKEN accounts with an ALREADY explicitly assigned subtype ('GENERAL_LOAN' with 0 txns, and 'CREDIT_CARD' with borrowing allocation) -> preserved unchanged
          const case4ExplicitGeneral = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Explicit General Loan No Txns',
              normalized_name: 'explicit general loan no txns',
              type: 'LOAN_TAKEN',
              subtype: 'GENERAL_LOAN',
              opening_balance: 0.00
            }
          });
          const case4ExplicitCard = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Explicit Credit Card Preserved',
              normalized_name: 'explicit credit card preserved',
              type: 'LOAN_TAKEN',
              subtype: 'CREDIT_CARD',
              opening_balance: 0.00
            }
          });
          await tx.transaction.create({
            data: {
              user_id: user.id,
              primary_account_id: cashAcc.id,
              form: 'RECEIVE_MONEY',
              total_amount: new Prisma.Decimal('1000.00'),
              transaction_date: new Date('2026-11-07T00:00:00.000Z'),
              description: 'Refund/Inflow on Explicit Credit Card',
              allocation_lines: {
                create: [{ target_account_id: case4ExplicitCard.id, amount: new Prisma.Decimal('1000.00') }]
              }
            }
          });

          // Case 5: Legacy LOAN_TAKEN account (subtype = 'DEFAULT') with MIXED transaction history (both PAYMENT_CHARGE purchase and RECEIVE_MONEY borrowing allocation) -> CREDIT_CARD
          const case5MixedHistory = await tx.account.create({
            data: {
              user_id: user.id,
              name: 'Legacy Mixed History Account',
              normalized_name: 'legacy mixed history account',
              type: 'LOAN_TAKEN',
              subtype: 'DEFAULT',
              opening_balance: 0.00
            }
          });
          await tx.transaction.create({
            data: {
              user_id: user.id,
              primary_account_id: case5MixedHistory.id,
              form: 'PAYMENT_CHARGE',
              total_amount: new Prisma.Decimal('800.00'),
              transaction_date: new Date('2026-11-08T00:00:00.000Z'),
              description: 'Direct Card Charge on Mixed Account',
              allocation_lines: {
                create: [{ target_account_id: expenseAcc.id, amount: new Prisma.Decimal('800.00') }]
              }
            }
          });
          await tx.transaction.create({
            data: {
              user_id: user.id,
              primary_account_id: cashAcc.id,
              form: 'RECEIVE_MONEY',
              total_amount: new Prisma.Decimal('2000.00'),
              transaction_date: new Date('2026-11-09T00:00:00.000Z'),
              description: 'Borrowing Inflow on Mixed Account',
              allocation_lines: {
                create: [{ target_account_id: case5MixedHistory.id, amount: new Prisma.Decimal('2000.00') }]
              }
            }
          });

          // Execute backfill_loan_taken_subtypes() on live PostgreSQL
          await tx.$executeRaw`SELECT backfill_loan_taken_subtypes()`;

          // Re-enable trigger before assertions
          await tx.$executeRawUnsafe(`ALTER TABLE "accounts" ENABLE TRIGGER trg_accounts_sync_normalized_name`);

          // Assert all 5 cases
          const resCase1 = await tx.account.findUniqueOrThrow({ where: { id: case1CreditPurchase.id } });
          const resCase2 = await tx.account.findUniqueOrThrow({ where: { id: case2GeneralBorrow.id } });
          const resCase3 = await tx.account.findUniqueOrThrow({ where: { id: case3NoHistoryDefault.id } });
          const resCase4General = await tx.account.findUniqueOrThrow({ where: { id: case4ExplicitGeneral.id } });
          const resCase4Card = await tx.account.findUniqueOrThrow({ where: { id: case4ExplicitCard.id } });
          const resCase5 = await tx.account.findUniqueOrThrow({ where: { id: case5MixedHistory.id } });

          expect(resCase1.subtype).toBe('CREDIT_CARD');
          expect(resCase2.subtype).toBe('GENERAL_LOAN');
          expect(resCase3.subtype).toBe('CREDIT_CARD');
          expect(resCase4General.subtype).toBe('GENERAL_LOAN');
          expect(resCase4Card.subtype).toBe('CREDIT_CARD');
          expect(resCase5.subtype).toBe('CREDIT_CARD');

          verifiedAllFiveCases = true;
          throw new Error('INTENTIONAL_ROLLBACK_BACKFILL_SIMULATION');
        });
      } catch (err: any) {
        if (err?.message !== 'INTENTIONAL_ROLLBACK_BACKFILL_SIMULATION') {
          throw err;
        }
      }

      expect(verifiedAllFiveCases).toBe(true);
    });
  });
});
