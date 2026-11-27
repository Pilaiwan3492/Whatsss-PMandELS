import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { duplicateTransaction } from '../../src/services/favoriteDuplicate.service.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

/**
 * Integration Test: PostgreSQL 16 Live Database Favorite, Duplicate, Search & Concurrency Suite (WP-10, F-14 & F-15)
 *
 * Covers:
 * - Favorite persistence (true / false) read back directly from PostgreSQL and GET /api/transactions
 * - Duplicate persistence: new Transaction/AllocationLine UUIDs, fresh timestamps, is_favorite=false,
 *   zero copied TransactionAuditLog rows, and accurate balance/debt calculations before & after
 * - Atomicity & Rollback: simulated mid-transaction failure during allocationLine.create rolls back
 *   completely with zero orphaned Transaction or AllocationLine rows in PostgreSQL
 * - Live PostgreSQL Search & Filtering: keyword (q), date range, accountId, categoryId, combined filters,
 *   semantic type filters (INCOME/EXPENSE/REPAYMENT/TRANSFER/LOAN), and strict multi-tenant isolation (BR-01)
 * - Concurrency (Task 4): Duplicate (F-14) vs. Correction (F-16) operating concurrently on the same source
 *   transaction proves SELECT ... FOR UPDATE prevents stale-read duplication
 */
describe('Integration Test: PostgreSQL 16 Live Database Favorite, Duplicate, Search & Concurrency (WP-10, F-14 & F-15)', () => {
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
        '[WP-10 NOTICE] Live PostgreSQL tests are disabled locally by default to protect developer databases. ' +
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
        throw new Error(`[WP-10 LIVE DB FAILURE] PostgreSQL live database connection failed: ${err}`);
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

  async function createIsolatedTenant(
    tag: string,
    opts?: { preserveImmutableAuditRows?: boolean }
  ) {
    const suffix = `wp10_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({
      data: {
        username: suffix,
        email: `${suffix}@whatsss.test`,
        password_hash: '$2b$10$liveWp10TestHashPlaceholder000000000000000000000000000',
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

    const wallet = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Cash Wallet',
        normalized_name: 'cash wallet',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('1000.00'),
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

    const generalLoan = await prisma.account.create({
      data: {
        user_id: user.id,
        name: 'Personal Car Loan',
        normalized_name: 'personal car loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
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

    pendingCleanups.push(async () => {
      if (opts?.preserveImmutableAuditRows) {
        // TransactionAuditLog rows are protected by PostgreSQL BEFORE DELETE trigger & ON DELETE RESTRICT.
        // Clean up only transactions without audit logs so immutability invariants remain untouched.
        await prisma.transaction.deleteMany({
          where: { user_id: user.id, audit_logs: { none: {} } }
        });
        return;
      }
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
      accounts: { checking, wallet, cc, generalLoan, loanGiven, salary, dining, grocery }
    };
  }

  it('TEST-FAV-01 (Live PG16): persists is_favorite=true and is_favorite=false in PostgreSQL and returns updated state in GET /api/transactions', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedTenant('fav');
    const txn = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.checking.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'Live PG Salary',
        is_favorite: false,
        allocation_lines: {
          create: [
            {
              target_account_id: tenant.accounts.salary.id,
              amount: new Prisma.Decimal('20000.00'),
              notes: 'Nov salary'
            }
          ]
        }
      }
    });

    // 1. Persist is_favorite = true
    const favTrueRes = await request(app)
      .patch(`/api/transactions/${txn.id}/favorite`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({ is_favorite: true });

    expect(favTrueRes.status).toBe(200);
    expect(favTrueRes.body.data.transaction.is_favorite).toBe(true);

    const dbAfterTrue = await prisma.transaction.findUnique({ where: { id: txn.id } });
    expect(dbAfterTrue?.is_favorite).toBe(true);

    const listAfterTrue = await request(app)
      .get('/api/transactions')
      .set('Cookie', tenant.cookie);
    expect(listAfterTrue.status).toBe(200);
    expect(listAfterTrue.body.data.transactions[0].is_favorite).toBe(true);

    // 2. Persist is_favorite = false
    const favFalseRes = await request(app)
      .patch(`/api/transactions/${txn.id}/favorite`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({ is_favorite: false });

    expect(favFalseRes.status).toBe(200);
    expect(favFalseRes.body.data.transaction.is_favorite).toBe(false);

    const dbAfterFalse = await prisma.transaction.findUnique({ where: { id: txn.id } });
    expect(dbAfterFalse?.is_favorite).toBe(false);
  });

  it('TEST-FAV-02 (Live PG16): duplicates split transaction in PostgreSQL with new IDs, is_favorite=false, 0 copied audit logs, and accurate balances & debt before/after', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedTenant('dup_audit', { preserveImmutableAuditRows: true });

    // Seed split CC purchase (Dining 1000 + Grocery 2000 = 3000) marked as favorite with 1 audit log
    const sourceTxn = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Supermarket Split Live',
        is_favorite: true,
        allocation_lines: {
          create: [
            {
              target_account_id: tenant.accounts.dining.id,
              amount: new Prisma.Decimal('1000.00'),
              notes: 'Dinner'
            },
            {
              target_account_id: tenant.accounts.grocery.id,
              amount: new Prisma.Decimal('2000.00'),
              notes: 'Groceries'
            }
          ]
        }
      },
      include: { allocation_lines: true }
    });

    await prisma.transactionAuditLog.create({
      data: {
        transaction_id: sourceTxn.id,
        user_id: tenant.userId,
        action: 'CORRECTED',
        previous_snapshot: { total_amount: '2500.00' },
        new_snapshot: { total_amount: '3000.00' }
      }
    });

    // Check balances & debt BEFORE duplicate
    const summaryBefore = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryBefore.status).toBe(200);
    expect(summaryBefore.body.data.bank_balance).toBe(11000); // 10000 checking + 1000 wallet
    expect(summaryBefore.body.data.credit_debt).toBe(3000);
    expect(summaryBefore.body.data.total_expense).toBe(3000);

    // Execute duplicate via HTTP API
    const dupRes = await request(app)
      .post(`/api/transactions/${sourceTxn.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({ transaction_date: '2026-11-15' });

    expect(dupRes.status).toBe(201);
    const dupId = dupRes.body.data.transaction.id;
    expect(dupId).not.toBe(sourceTxn.id);

    // Verify persisted duplicate record directly in PostgreSQL
    const persistedDup = await prisma.transaction.findUnique({
      where: { id: dupId },
      include: { allocation_lines: { orderBy: { amount: 'asc' } } }
    });
    expect(persistedDup).not.toBeNull();
    expect(persistedDup!.is_favorite).toBe(false);
    expect(persistedDup!.total_amount.toFixed(2)).toBe('3000.00');
    expect(persistedDup!.allocation_lines).toHaveLength(2);

    const sourceAllocIds = new Set(sourceTxn.allocation_lines.map((l) => l.id));
    for (const line of persistedDup!.allocation_lines) {
      expect(sourceAllocIds.has(line.id)).toBe(false);
    }
    expect(persistedDup!.allocation_lines[0].amount.toFixed(2)).toBe('1000.00');
    expect(persistedDup!.allocation_lines[1].amount.toFixed(2)).toBe('2000.00');

    // Verify 0 audit logs were copied to the duplicated transaction (source still has 1)
    const sourceAuditCount = await prisma.transactionAuditLog.count({
      where: { transaction_id: sourceTxn.id }
    });
    const dupAuditCount = await prisma.transactionAuditLog.count({
      where: { transaction_id: dupId }
    });
    expect(sourceAuditCount).toBe(1);
    expect(dupAuditCount).toBe(0);

    // Verify balances & debt AFTER duplicate
    const summaryAfter = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryAfter.status).toBe(200);
    expect(summaryAfter.body.data.bank_balance).toBe(11000); // Cash unchanged
    expect(summaryAfter.body.data.credit_debt).toBe(6000); // +3000 CC debt
    expect(summaryAfter.body.data.total_expense).toBe(6000); // +3000 expense
  });

  it('TEST-FAV-03 (Live PG16): rolls back PostgreSQL transaction completely on mid-duplication failure with zero orphaned rows', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedTenant('rollback');
    const sourceTxn = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Split for Rollback Test',
        is_favorite: false,
        allocation_lines: {
          create: [
            {
              target_account_id: tenant.accounts.dining.id,
              amount: new Prisma.Decimal('1000.00'),
              notes: 'Line 1'
            },
            {
              target_account_id: tenant.accounts.grocery.id,
              amount: new Prisma.Decimal('2000.00'),
              notes: 'Line 2'
            }
          ]
        }
      }
    });

    const txCountBefore = await prisma.transaction.count({ where: { user_id: tenant.userId } });
    const allocCountBefore = await prisma.allocationLine.count({
      where: { transaction: { user_id: tenant.userId } }
    });

    // Wrap real PrismaClient.$transaction so the 2nd allocationLine.create throws AFTER tx.transaction.create
    // and 1st tx.allocationLine.create have already executed inside PostgreSQL
    const failingPrismaProxy = {
      $transaction: async (fn: (tx: any) => Promise<any>) => {
        return prisma.$transaction(async (realTx) => {
          let allocCreateCalls = 0;
          const wrappedTx = new Proxy(realTx, {
            get(target, prop) {
              if (prop === 'allocationLine') {
                return new Proxy(target.allocationLine, {
                  get(alTarget, alProp) {
                    if (alProp === 'create') {
                      return async (args: any) => {
                        allocCreateCalls++;
                        if (allocCreateCalls === 2) {
                          throw new Error('SIMULATED_PG_ALLOCATION_INSERT_FAILURE');
                        }
                        return alTarget.create(args);
                      };
                    }
                    return (alTarget as any)[alProp];
                  }
                });
              }
              return (target as any)[prop];
            }
          });
          return fn(wrappedTx);
        });
      }
    } as unknown as PrismaClient;

    await expect(
      duplicateTransaction(tenant.userId, sourceTxn.id, {}, failingPrismaProxy)
    ).rejects.toThrow('SIMULATED_PG_ALLOCATION_INSERT_FAILURE');

    // Verify PostgreSQL rolled back both the new Transaction AND the 1st AllocationLine
    const txCountAfter = await prisma.transaction.count({ where: { user_id: tenant.userId } });
    const allocCountAfter = await prisma.allocationLine.count({
      where: { transaction: { user_id: tenant.userId } }
    });
    expect(txCountAfter).toBe(txCountBefore);
    expect(allocCountAfter).toBe(allocCountBefore);
  });

  it('TEST-SRCH-01..06 (Live PG16): executes keyword, date-range, account, category, combined, type filters and tenant isolation against PostgreSQL', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenantA = await createIsolatedTenant('srch_a');
    const tenantB = await createIsolatedTenant('srch_b');

    // Seed Tenant A transactions across types and dates
    const txIncome = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'November Salary',
        is_favorite: false,
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.salary.id, amount: new Prisma.Decimal('20000.00'), notes: 'Payroll' }]
        }
      }
    });

    const txExpense = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-10T00:00:00.000Z'),
        description: 'Supermarket Split Trip',
        is_favorite: true,
        allocation_lines: {
          create: [
            { target_account_id: tenantA.accounts.dining.id, amount: new Prisma.Decimal('1000.00'), notes: 'Food court lunch' },
            { target_account_id: tenantA.accounts.grocery.id, amount: new Prisma.Decimal('2000.00'), notes: 'Weekly veggies' }
          ]
        }
      }
    });

    const txTransfer = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('500.00'),
        transaction_date: new Date('2026-11-15T00:00:00.000Z'),
        description: 'Wallet Topup',
        is_favorite: false,
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.wallet.id, amount: new Prisma.Decimal('500.00'), notes: 'Cash move' }]
        }
      }
    });

    const txLoan = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1500.00'),
        transaction_date: new Date('2026-11-20T00:00:00.000Z'),
        description: 'Loan to Friend',
        is_favorite: false,
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.loanGiven.id, amount: new Prisma.Decimal('1500.00'), notes: 'IOU' }]
        }
      }
    });

    // Seed Tenant B transaction with matching keyword
    await prisma.transaction.create({
      data: {
        user_id: tenantB.userId,
        primary_account_id: tenantB.accounts.checking.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('9999.00'),
        transaction_date: new Date('2026-11-10T00:00:00.000Z'),
        description: 'Supermarket Secret TenantB',
        is_favorite: true,
        allocation_lines: {
          create: [{ target_account_id: tenantB.accounts.salary.id, amount: new Prisma.Decimal('9999.00'), notes: 'Confidential' }]
        }
      }
    });

    // 1. Keyword search (ILIKE against description & notes)
    const qRes = await request(app)
      .get('/api/transactions?q=supermarket')
      .set('Cookie', tenantA.cookie);
    expect(qRes.status).toBe(200);
    expect(qRes.body.data.transactions.map((t: any) => t.id)).toEqual([txExpense.id]);

    // 2. Date-range filtering
    const dateRes = await request(app)
      .get('/api/transactions?startDate=2026-11-05&endDate=2026-11-16')
      .set('Cookie', tenantA.cookie);
    expect(dateRes.status).toBe(200);
    expect(dateRes.body.data.transactions.map((t: any) => t.id)).toEqual([txTransfer.id, txExpense.id]);

    // 3. Account & Category filtering
    const catRes = await request(app)
      .get(`/api/transactions?categoryId=${tenantA.accounts.dining.id}`)
      .set('Cookie', tenantA.cookie);
    expect(catRes.status).toBe(200);
    expect(catRes.body.data.transactions.map((t: any) => t.id)).toEqual([txExpense.id]);

    const accRes = await request(app)
      .get(`/api/transactions?accountId=${tenantA.accounts.wallet.id}`)
      .set('Cookie', tenantA.cookie);
    expect(accRes.status).toBe(200);
    expect(accRes.body.data.transactions.map((t: any) => t.id)).toEqual([txTransfer.id]);

    // 4. Combined filters (date + type + favorite + q)
    const combinedRes = await request(app)
      .get('/api/transactions?startDate=2026-11-01&endDate=2026-11-30&type=EXPENSE&favorite=true&q=veggies')
      .set('Cookie', tenantA.cookie);
    expect(combinedRes.status).toBe(200);
    expect(combinedRes.body.data.transactions.map((t: any) => t.id)).toEqual([txExpense.id]);

    // 5. Semantic type filters (INCOME, TRANSFER, LOAN)
    const incTypeRes = await request(app).get('/api/transactions?type=INCOME').set('Cookie', tenantA.cookie);
    expect(incTypeRes.body.data.transactions.map((t: any) => t.id)).toEqual([txIncome.id]);

    const loanTypeRes = await request(app).get('/api/transactions?type=LOAN').set('Cookie', tenantA.cookie);
    expect(loanTypeRes.body.data.transactions.map((t: any) => t.id)).toEqual([txLoan.id]);

    // 6. Strict multi-tenant isolation (BR-01)
    const crossRes = await request(app)
      .get(`/api/transactions?accountId=${tenantB.accounts.checking.id}&q=TenantB`)
      .set('Cookie', tenantA.cookie);
    expect(crossRes.status).toBe(200);
    expect(crossRes.body.data.transactions).toEqual([]);
  });

  it('TEST-FAV-CONC-01 (Live PG16): serializes concurrent Duplicate (F-14) and Correction (F-16) on the same source transaction via SELECT ... FOR UPDATE (zero stale-read duplication)', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedTenant('conc_dup_corr');

    const sourceTxn = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-10T00:00:00.000Z'),
        description: 'Pre-Correction Purchase',
        is_favorite: false,
        allocation_lines: {
          create: [
            {
              target_account_id: tenant.accounts.dining.id,
              amount: new Prisma.Decimal('1000.00'),
              notes: 'Original dining'
            },
            {
              target_account_id: tenant.accounts.grocery.id,
              amount: new Prisma.Decimal('2000.00'),
              notes: 'Original grocery'
            }
          ]
        }
      }
    });

    let signalLockAcquired!: () => void;
    const lockAcquiredBarrier = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });

    // Transaction A: Simulates F-16 Correction acquiring SELECT ... FOR UPDATE on source transaction,
    // holding the lock briefly while Transaction B (F-14 Duplicate) attempts to read/lock the same row,
    // then committing the corrected amount (4500.00 = 2500.00 Dining + 2000.00 Grocery).
    const correctionPromise = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "transactions"
        WHERE id = ${sourceTxn.id}
          AND user_id = ${tenant.userId}
        FOR UPDATE
      `;

      // Notify duplicateTransaction to start concurrently while row lock is held
      signalLockAcquired();

      // Hold lock briefly so PostgreSQL genuinely blocks Transaction B on the row lock
      await new Promise((r) => setTimeout(r, 150));

      await tx.transaction.update({
        where: { id: sourceTxn.id },
        data: {
          total_amount: new Prisma.Decimal('4500.00'),
          description: 'Post-Correction Purchase'
        }
      });

      await tx.allocationLine.deleteMany({ where: { transaction_id: sourceTxn.id } });
      await tx.allocationLine.createMany({
        data: [
          {
            transaction_id: sourceTxn.id,
            target_account_id: tenant.accounts.dining.id,
            amount: new Prisma.Decimal('2500.00'),
            notes: 'Corrected dining'
          },
          {
            transaction_id: sourceTxn.id,
            target_account_id: tenant.accounts.grocery.id,
            amount: new Prisma.Decimal('2000.00'),
            notes: 'Original grocery'
          }
        ]
      });
    });

    // Wait until Correction holds the row lock, then launch Duplicate concurrently
    await lockAcquiredBarrier;
    const duplicatePromise = duplicateTransaction(
      tenant.userId,
      sourceTxn.id,
      { transaction_date: '2026-11-16' },
      prisma
    );

    const [, dupResult] = await Promise.all([correctionPromise, duplicatePromise]);

    // Duplicate MUST have waited for Correction to commit and cloned the post-correction 4500.00 state
    expect(dupResult.transaction.total_amount).toBe('4500.00');
    expect(dupResult.transaction.description).toBe('Post-Correction Purchase');
    const clonedAmounts = dupResult.transaction.allocations
      .map((a) => a.amount)
      .sort();
    expect(clonedAmounts).toEqual(['2000.00', '2500.00']);

    // Verify PostgreSQL summary reflects 4500.00 + 4500.00 = 9000.00 CC debt
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', tenant.cookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.credit_debt).toBe(9000);
    expect(summaryRes.body.data.total_expense).toBe(9000);

    // Case B: If concurrent Correction fails and ROLLS BACK, HTTP POST /api/transactions/:id/duplicate
    // unblocks and duplicates the intact committed state (4500.00), never seeing uncommitted rolled-back data (9999.00)
    let signalRbLock!: () => void;
    const rbLockBarrier = new Promise<void>((resolve) => {
      signalRbLock = resolve;
    });

    const rollingBackCorrection = prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "transactions"
          WHERE id = ${sourceTxn.id}
            AND user_id = ${tenant.userId}
          FOR UPDATE
        `;
        signalRbLock();
        await new Promise((r) => setTimeout(r, 120));
        await tx.transaction.update({
          where: { id: sourceTxn.id },
          data: { total_amount: new Prisma.Decimal('9999.00'), description: 'Rolled Back Draft' }
        });
        throw new Error('INTENTIONAL_CORRECTION_ROLLBACK');
      })
      .catch(() => 'ROLLED_BACK');

    await rbLockBarrier;
    const dupHttpRes = await request(app)
      .post(`/api/transactions/${sourceTxn.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({ transaction_date: '2026-11-17' });

    const rbOutcome = await rollingBackCorrection;
    expect(rbOutcome).toBe('ROLLED_BACK');
    expect(dupHttpRes.status).toBe(201);
    expect(dupHttpRes.body.data.transaction.total_amount).toBe('4500.00');
    expect(dupHttpRes.body.data.transaction.description).toBe('Post-Correction Purchase');
    expect(dupHttpRes.body.data.transaction.allocations).toHaveLength(2);
  });

  it('TEST-FAV-03-LIVE-CC (Live PG16): enforces BR-07 v1.1 Credit Card Repayment rules (ZERO_OUTSTANDING_DEBT, REPAYMENT_EXCEEDS_DEBT, MIN_REPAYMENT_NOT_MET, MINIMUM_CASH_RESERVE_VIOLATION) and valid repayment duplication against PostgreSQL', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenant = await createIsolatedTenant('dup_cc_rules');

    // Helper to assert zero DB writes and unchanged summary on rejected duplicate
    const assertRejectedDuplicate = async (
      txnId: string,
      expectedStatus: number,
      expectedCode: string
    ) => {
      const txBefore = await prisma.transaction.count({ where: { user_id: tenant.userId } });
      const allocBefore = await prisma.allocationLine.count({
        where: { transaction: { user_id: tenant.userId } }
      });
      const sumBefore = (
        await request(app).get('/api/reports/summary').set('Cookie', tenant.cookie)
      ).body.data;

      const res = await request(app)
        .post(`/api/transactions/${txnId}/duplicate`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', tenant.cookie)
        .send({});

      expect(res.status).toBe(expectedStatus);
      expect(res.body.error.code).toBe(expectedCode);
      expect(await prisma.transaction.count({ where: { user_id: tenant.userId } })).toBe(txBefore);
      expect(
        await prisma.allocationLine.count({ where: { transaction: { user_id: tenant.userId } } })
      ).toBe(allocBefore);
      const sumAfter = (
        await request(app).get('/api/reports/summary').set('Cookie', tenant.cookie)
      ).body.data;
      expect(sumAfter).toEqual(sumBefore);
    };

    // 1. Seed 3000.00 CC charge + 3000.00 full CC repayment => debt is now 0.00
    await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'CC Charge',
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.dining.id, amount: new Prisma.Decimal('3000.00') }]
        }
      }
    });
    const fullRepay = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-02T00:00:00.000Z'),
        description: 'Full CC Repay',
        is_favorite: true,
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.cc.id, amount: new Prisma.Decimal('3000.00') }]
        }
      }
    });

    // (a) ZERO_OUTSTANDING_DEBT
    await assertRejectedDuplicate(fullRepay.id, 422, 'ZERO_OUTSTANDING_DEBT');

    // 2. Add 1000.00 CC charge => debt = 1000.00; duplicating 3000.00 repayment => REPAYMENT_EXCEEDS_DEBT
    await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-03T00:00:00.000Z'),
        description: 'Small Charge',
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.grocery.id, amount: new Prisma.Decimal('1000.00') }]
        }
      }
    });
    await assertRejectedDuplicate(fullRepay.id, 422, 'REPAYMENT_EXCEEDS_DEBT');

    // 3. Add 7500.00 charge + 500.00 repay => debt = 8000.00 (min = 800.00); duplicating 500.00 => MIN_REPAYMENT_NOT_MET
    await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.cc.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('7500.00'),
        transaction_date: new Date('2026-11-04T00:00:00.000Z'),
        description: 'Big Charge',
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.grocery.id, amount: new Prisma.Decimal('7500.00') }]
        }
      }
    });
    const repay500 = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('500.00'),
        transaction_date: new Date('2026-11-04T00:00:00.000Z'),
        description: 'Repay 500',
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.cc.id, amount: new Prisma.Decimal('500.00') }]
        }
      }
    });
    await assertRejectedDuplicate(repay500.id, 422, 'MIN_REPAYMENT_NOT_MET');

    // 4. Valid repayment duplication (1000.00 on 8000.00 debt; checking = 6500.00 -> leaves 5500.00 >= 100.00)
    const repay1000 = await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Valid Partial Repay',
        is_favorite: true,
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.cc.id, amount: new Prisma.Decimal('1000.00') }]
        }
      },
      include: { allocation_lines: true }
    });
    // Now debt = 7000.00 (min 700.00), checking = 5500.00. Duplicating 1000.00 succeeds -> debt = 6000.00, checking = 4500.00
    const validDupRes = await request(app)
      .post(`/api/transactions/${repay1000.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenant.cookie)
      .send({ transaction_date: '2026-11-06' });

    expect(validDupRes.status).toBe(201);
    const newRepayId = validDupRes.body.data.transaction.id;
    expect(newRepayId).not.toBe(repay1000.id);
    expect(validDupRes.body.data.transaction.is_favorite).toBe(false);
    expect(validDupRes.body.data.transaction.allocations[0].id).not.toBe(repay1000.allocation_lines[0].id);

    const sumAfterValid = (
      await request(app).get('/api/reports/summary').set('Cookie', tenant.cookie)
    ).body.data;
    expect(sumAfterValid.credit_debt).toBe(6000);
    expect(sumAfterValid.bank_balance).toBe(5500); // 4500 checking + 1000 wallet

    // 5. Drain checking down to 1050.00 (transfer 3450.00 to wallet) -> duplicating 1000.00 partial repayment leaves 50.00 < 100.00 -> MINIMUM_CASH_RESERVE_VIOLATION
    await prisma.transaction.create({
      data: {
        user_id: tenant.userId,
        primary_account_id: tenant.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3450.00'),
        transaction_date: new Date('2026-11-07T00:00:00.000Z'),
        description: 'Drain Checking',
        allocation_lines: {
          create: [{ target_account_id: tenant.accounts.wallet.id, amount: new Prisma.Decimal('3450.00') }]
        }
      }
    });
    await assertRejectedDuplicate(repay1000.id, 422, 'MINIMUM_CASH_RESERVE_VIOLATION');
  });

  it('TEST-FAV-03-LIVE-CASH-LOAN (Live PG16): verifies INSUFFICIENT_FUNDS, valid cash transfer duplication, ACCOUNT_ARCHIVED, RECOVERY_EXCEEDS_RECEIVABLE, and 404 cross-tenant/invalid source in PostgreSQL', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }

    const tenantA = await createIsolatedTenant('dup_cash_loan_a');
    const tenantB = await createIsolatedTenant('dup_cash_loan_b');

    // 1. Valid cash transfer duplication (2000.00 from Checking 10000 -> Wallet 1000)
    const xfer = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('2000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Move to Wallet',
        is_favorite: true,
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.wallet.id, amount: new Prisma.Decimal('2000.00') }]
        }
      },
      include: { allocation_lines: true }
    });

    const dupXferRes = await request(app)
      .post(`/api/transactions/${xfer.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({ transaction_date: '2026-11-06' });
    expect(dupXferRes.status).toBe(201);
    expect(dupXferRes.body.data.transaction.id).not.toBe(xfer.id);
    expect(dupXferRes.body.data.transaction.is_favorite).toBe(false);
    expect(dupXferRes.body.data.transaction.allocations[0].id).not.toBe(xfer.allocation_lines[0].id);

    // Aggregate cash balance conserved (11000.00), total_income & total_expense remain 0.00 (BR-02)
    const sumAfterXfer = (
      await request(app).get('/api/reports/summary').set('Cookie', tenantA.cookie)
    ).body.data;
    expect(sumAfterXfer.bank_balance).toBe(11000);
    expect(sumAfterXfer.total_income).toBe(0);
    expect(sumAfterXfer.total_expense).toBe(0);

    // 2. INSUFFICIENT_FUNDS on outgoing cash transfer (Checking now has 6000.00; transfer 5000.00 leaves 1000.00 -> duplicating 5000.00 fails)
    const bigXfer = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('5000.00'),
        transaction_date: new Date('2026-11-07T00:00:00.000Z'),
        description: 'Big Transfer',
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.wallet.id, amount: new Prisma.Decimal('5000.00') }]
        }
      }
    });
    const txCountBeforeInsuff = await prisma.transaction.count({ where: { user_id: tenantA.userId } });
    const insuffRes = await request(app)
      .post(`/api/transactions/${bigXfer.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({});
    expect(insuffRes.status).toBe(422);
    expect(insuffRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.transaction.count({ where: { user_id: tenantA.userId } })).toBe(txCountBeforeInsuff);

    // 3. RECOVERY_EXCEEDS_RECEIVABLE on LOAN_GIVEN recovery
    // Disburse 1000.00 loan given, recover 700.00 (remaining receivable = 300.00) -> duplicating 700.00 recovery fails
    await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-08T00:00:00.000Z'),
        description: 'Loan to Friend',
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.loanGiven.id, amount: new Prisma.Decimal('1000.00') }]
        }
      }
    });
    const recovery700 = await prisma.transaction.create({
      data: {
        user_id: tenantA.userId,
        primary_account_id: tenantA.accounts.checking.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('700.00'),
        transaction_date: new Date('2026-11-09T00:00:00.000Z'),
        description: 'Partial Recovery',
        allocation_lines: {
          create: [{ target_account_id: tenantA.accounts.loanGiven.id, amount: new Prisma.Decimal('700.00') }]
        }
      }
    });
    const txCountBeforeRec = await prisma.transaction.count({ where: { user_id: tenantA.userId } });
    const exceedRecRes = await request(app)
      .post(`/api/transactions/${recovery700.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({});
    expect(exceedRecRes.status).toBe(422);
    expect(exceedRecRes.body.error.code).toBe('RECOVERY_EXCEEDS_RECEIVABLE');
    expect(await prisma.transaction.count({ where: { user_id: tenantA.userId } })).toBe(txCountBeforeRec);

    // 4. ACCOUNT_ARCHIVED blocks duplicate
    await prisma.account.update({
      where: { id: tenantA.accounts.wallet.id },
      data: { is_archived: true }
    });
    const archRes = await request(app)
      .post(`/api/transactions/${xfer.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({});
    expect(archRes.status).toBe(422);
    expect(archRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 5. Nonexistent & foreign-user source transaction -> 404 NOT_FOUND (BR-01)
    const missingRes = await request(app)
      .post('/api/transactions/00000000-0000-0000-0000-000000000000/duplicate')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantA.cookie)
      .send({});
    expect(missingRes.status).toBe(404);
    expect(missingRes.body.error.code).toBe('NOT_FOUND');

    const crossRes = await request(app)
      .post(`/api/transactions/${xfer.id}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', tenantB.cookie)
      .send({});
    expect(crossRes.status).toBe(404);
    expect(crossRes.body.error.code).toBe('NOT_FOUND');
  });
});
