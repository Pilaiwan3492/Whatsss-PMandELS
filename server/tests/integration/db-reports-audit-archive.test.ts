import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { seed, seedStandardAccountsForUser } from '../../prisma/seed.js';
import { assertTestDatabase, executeCleanupsSafely } from '../fixtures/testDbGuard.js';

describe('Integration Test: PostgreSQL 16 Live Database Category Reports, Audit History & Account Archival (WP-12, F-17, F-18)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';

  const cleanupCallbacks: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) return;
    assertTestDatabase(databaseUrl, { isCI, allowLiveDb });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    isDbConnected = true;
    await seed(prisma);
  });

  afterEach(async () => {
    if (!isDbConnected) return;
    await executeCleanupsSafely(cleanupCallbacks);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  async function createIsolatedTenant(prefix: string) {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const user = await prisma.user.create({
      data: {
        username: `${prefix}_${suffix}`,
        email: `${prefix}_${suffix}@whatsss.test`,
        password_hash: passwordHash,
        role: 'USER',
        is_active: true
      }
    });

    await seedStandardAccountsForUser(prisma, user);
    const accountsList = await prisma.account.findMany({ where: { user_id: user.id } });
    const byName = (n: string) => accountsList.find((a) => a.name === n)!;

    cleanupCallbacks.push(async () => {
      await prisma.transactionAuditLog.deleteMany({ where: { user_id: user.id } }).catch(() => {});
      await prisma.allocationLine.deleteMany({ where: { transaction: { user_id: user.id } } });
      await prisma.transaction.deleteMany({ where: { user_id: user.id } });
      await prisma.account.deleteMany({ where: { user_id: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ username: user.username, password: 'Password123!' });
    const cookie = (loginRes.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    return {
      user,
      cookie,
      accounts: {
        checking: byName('Checking Bank'),
        cc: byName('Visa Credit Card'),
        salary: byName('Salary'),
        dining: byName('Dining'),
        grocery: byName('Grocery')
      }
    };
  }

  it('TEST-REP-CAT-LIVE-01: computes period category spending in Live PG16 excluding income, transfers, repayments & loans', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }
    const tenant = await createIsolatedTenant('rep_cat');

    const savings = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Savings Bank',
        normalized_name: 'savings bank',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00')
      }
    });
    const loanGiven = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Friend Loan',
        normalized_name: 'friend loan',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00')
      }
    });
    const genLoan = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Personal Loan',
        normalized_name: 'personal loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('0.00')
      }
    });

    await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.accounts.checking.id,
        income_account_id: tenant.accounts.salary.id,
        total_amount: '20000.00',
        transaction_date: '2026-11-01',
        description: 'Salary'
      });

    await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.accounts.cc.id,
        total_amount: '3000.00',
        transaction_date: '2026-11-05',
        description: 'Dining + Grocery',
        allocations: [
          { target_account_id: tenant.accounts.dining.id, amount: '1000.00' },
          { target_account_id: tenant.accounts.grocery.id, amount: '2000.00' }
        ]
      });

    await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.accounts.checking.id,
        to_account_id: tenant.accounts.cc.id,
        amount: '3000.00',
        transaction_date: '2026-11-06',
        description: 'CC Repay'
      });

    await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.accounts.checking.id,
        to_account_id: savings.id,
        amount: '2000.00',
        transaction_date: '2026-11-07',
        description: 'Transfer'
      });

    await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.accounts.checking.id,
        to_account_id: loanGiven.id,
        amount: '1000.00',
        transaction_date: '2026-11-08',
        description: 'Loan given'
      });

    await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: genLoan.id,
        to_account_id: tenant.accounts.checking.id,
        amount: '1500.00',
        transaction_date: '2026-11-09',
        description: 'Loan borrowing'
      });

    const res = await request(app)
      .get('/api/reports/categories?startDate=2026-11-01&endDate=2026-11-30')
      .set('Cookie', tenant.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.period).toEqual({ start_date: '2026-11-01', end_date: '2026-11-30' });
    expect(res.body.data.total_expense).toBe('3000.00');
    expect(res.body.data.categories).toEqual([
      {
        category_id: tenant.accounts.grocery.id,
        category_name: 'Grocery',
        total_amount: '2000.00',
        percentage: '66.67',
        transaction_count: 1
      },
      {
        category_id: tenant.accounts.dining.id,
        category_name: 'Dining',
        total_amount: '1000.00',
        percentage: '33.33',
        transaction_count: 1
      }
    ]);
  });

  it('TEST-AUDIT-01 & TEST-AUDIT-05 (Live PG16): returns audit history in reverse sequence_number order and blocks direct DB mutation/parent deletion', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }
    const tenant = await createIsolatedTenant('audit_hist');

    const incRes = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.accounts.checking.id,
        income_account_id: tenant.accounts.salary.id,
        total_amount: '20000.00',
        transaction_date: '2026-11-02',
        description: 'Salary'
      });
    const txnId = incRes.body.data.transaction.id;

    await request(app)
      .put(`/api/transactions/${txnId}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        total_amount: '22000.00',
        transaction_date: '2026-11-02',
        description: 'Salary + 2k',
        allocations: [{ target_account_id: tenant.accounts.salary.id, amount: '22000.00' }]
      });

    await request(app)
      .put(`/api/transactions/${txnId}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        total_amount: '25000.00',
        transaction_date: '2026-11-02',
        description: 'Salary + 5k',
        allocations: [{ target_account_id: tenant.accounts.salary.id, amount: '25000.00' }]
      });

    const histRes = await request(app)
      .get(`/api/transactions/${txnId}/audit-history`)
      .set('Cookie', tenant.cookie);

    expect(histRes.status).toBe(200);
    expect(histRes.body.data.audit_logs).toHaveLength(2);
    expect(histRes.body.data.audit_logs[0].new_snapshot.total_amount).toBe('25000.00');
    expect(histRes.body.data.audit_logs[1].new_snapshot.total_amount).toBe('22000.00');
    expect(histRes.body.data.audit_logs[0].sequence_number).toBeGreaterThan(
      histRes.body.data.audit_logs[1].sequence_number
    );

    // Parent transaction delete blocked by onDelete: Restrict
    await expect(prisma.transaction.delete({ where: { id: txnId } })).rejects.toThrow();

    // Direct audit log update & delete blocked by PostgreSQL immutability trigger
    await expect(
      prisma.transactionAuditLog.update({
        where: { id: histRes.body.data.audit_logs[0].id },
        data: { action: 'TAMPERED' }
      })
    ).rejects.toThrow();
    await expect(
      prisma.transactionAuditLog.delete({ where: { id: histRes.body.data.audit_logs[0].id } })
    ).rejects.toThrow();

    // Re-query audit history to confirm all 2 original records remain completely intact
    const verifyRes = await request(app)
      .get(`/api/transactions/${txnId}/audit-history`)
      .set('Cookie', tenant.cookie);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.audit_logs).toHaveLength(2);
    expect(verifyRes.body.data.audit_logs[0].action).toBe('CORRECTED');
  });

  it('TEST-AUDIT-03 (Live PG16): rejects all 8 transaction workflows referencing archived accounts (422 ACCOUNT_ARCHIVED) with zero writes and intact history', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }
    const tenant = await createIsolatedTenant('audit_arch_guard');

    // Seed active income + CC expense so historical reports & duplicate baseline exist
    const incRes = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.accounts.checking.id,
        income_account_id: tenant.accounts.salary.id,
        total_amount: '10000.00',
        transaction_date: '2026-11-01',
        description: 'Initial Salary'
      });
    const salaryTxnId = incRes.body.data.transaction.id;

    // Create zero-balance accounts across types to archive
    const archivedCash = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Archived Cash',
        normalized_name: 'archived cash',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_archived: true
      }
    });
    const archivedCC = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Archived CC',
        normalized_name: 'archived cc',
        type: 'LOAN_TAKEN',
        subtype: 'CREDIT_CARD',
        opening_balance: new Prisma.Decimal('0.00'),
        is_archived: true
      }
    });
    const archivedExpense = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Archived Expense',
        normalized_name: 'archived expense',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_archived: true
      }
    });
    const archivedIncome = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Archived Income',
        normalized_name: 'archived income',
        type: 'INCOME',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_archived: true
      }
    });
    const archivedLoanGiven = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Archived Loan Given',
        normalized_name: 'archived loan given',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_archived: true
      }
    });
    const archivedGenLoan = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Archived Gen Loan',
        normalized_name: 'archived gen loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('0.00'),
        is_archived: true
      }
    });

    const initialTxnCount = await prisma.transaction.count({ where: { user_id: tenant.user.id } });

    // 1. Income with archived CASH
    const incArch = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: archivedCash.id,
        income_account_id: tenant.accounts.salary.id,
        total_amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(incArch.status).toBe(422);
    expect(incArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 2. Split Expense with archived EXPENSE on split line 2
    const expArch = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        primary_account_id: tenant.accounts.cc.id,
        total_amount: '600.00',
        transaction_date: '2026-11-05',
        allocations: [
          { target_account_id: tenant.accounts.dining.id, amount: '300.00' },
          { target_account_id: archivedExpense.id, amount: '300.00' }
        ]
      });
    expect(expArch.status).toBe(422);
    expect(expArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 3. CC Repayment with archived CC
    const repayArch = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.accounts.checking.id,
        to_account_id: archivedCC.id,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(repayArch.status).toBe(422);
    expect(repayArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 4. Transfer with archived destination CASH
    const xferArch = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.accounts.checking.id,
        to_account_id: archivedCash.id,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(xferArch.status).toBe(422);
    expect(xferArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 5. Loan Given with archived LOAN_GIVEN
    const lgArch = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: tenant.accounts.checking.id,
        to_account_id: archivedLoanGiven.id,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(lgArch.status).toBe(422);
    expect(lgArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 6. General Loan Borrowing with archived GENERAL_LOAN
    const glArch = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        from_account_id: archivedGenLoan.id,
        to_account_id: tenant.accounts.checking.id,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(glArch.status).toBe(422);
    expect(glArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 7. Correction referencing archived INCOME account
    const corrArch = await request(app)
      .put(`/api/transactions/${salaryTxnId}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({
        total_amount: '10000.00',
        transaction_date: '2026-11-01',
        allocations: [{ target_account_id: archivedIncome.id, amount: '10000.00' }]
      });
    expect(corrArch.status).toBe(422);
    expect(corrArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // 8. Archive Salary category, then Duplicate salaryTxnId -> 422 ACCOUNT_ARCHIVED
    await request(app)
      .patch(`/api/accounts/${tenant.accounts.salary.id}/archive`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({ is_archived: true });

    const dupArch = await request(app)
      .post(`/api/transactions/${salaryTxnId}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', tenant.cookie)
      .send({});
    expect(dupArch.status).toBe(422);
    expect(dupArch.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // Zero new transactions written & historical summary still readable
    expect(await prisma.transaction.count({ where: { user_id: tenant.user.id } })).toBe(initialTxnCount);
    const sumRes = await request(app).get('/api/reports/summary').set('Cookie', tenant.cookie);
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.data.bank_balance).toBe(10000);
  });

  it('TEST-AUDIT-06 (Live PG16): serializes concurrent Archive vs Income on zero-balance CASH account under FOR UPDATE locks', async (ctx) => {
    if (!isCI && !allowLiveDb) {
      ctx.skip();
      return;
    }
    const tenant = await createIsolatedTenant('audit_conc');

    const savings = await prisma.account.create({
      data: {
        user_id: tenant.user.id,
        name: 'Savings Vault',
        normalized_name: 'savings vault',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false
      }
    });

    const [archiveRes, incomeRes] = await Promise.all([
      request(app)
        .patch(`/api/accounts/${savings.id}/archive`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', tenant.cookie)
        .send({ is_archived: true }),
      request(app)
        .post('/api/transactions/income')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', tenant.cookie)
        .send({
          primary_account_id: savings.id,
          income_account_id: tenant.accounts.salary.id,
          total_amount: '1000.00',
          transaction_date: '2026-11-05',
          description: 'Concurrent Deposit'
        })
    ]);

    const accAfter = await request(app)
      .get(`/api/accounts/${savings.id}`)
      .set('Cookie', tenant.cookie);

    if (archiveRes.status === 200) {
      expect(incomeRes.status).toBe(422);
      expect(incomeRes.body.error.code).toBe('ACCOUNT_ARCHIVED');
      expect(accAfter.body.data.account.is_archived).toBe(true);
      expect(Number(accAfter.body.data.account.current_balance)).toBe(0);
    } else {
      expect(archiveRes.status).toBe(422);
      expect(archiveRes.body.error.code).toBe('ACCOUNT_BALANCE_NON_ZERO');
      expect(incomeRes.status).toBe(201);
      expect(accAfter.body.data.account.is_archived).toBe(false);
      expect(Number(accAfter.body.data.account.current_balance)).toBe(1000);
    }
  });
});
