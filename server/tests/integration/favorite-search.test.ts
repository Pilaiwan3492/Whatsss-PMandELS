import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockAccounts,
  mockTransactions,
  mockAllocationLines,
  resetMockAccounts,
  resetMockTransactions
} from '../fixtures/mockPrisma.js';

const mockAuditLogs: any[] = [];

function getMatchesFilter(t: any, where: any): boolean {
  if (!where) return true;
  if (where.user_id && t.user_id !== where.user_id) return false;
  if (where.id) {
    if (typeof where.id === 'string' && t.id !== where.id) return false;
    if (where.id.in && !where.id.in.includes(t.id)) return false;
  }
  if (where.primary_account_id) {
    if (typeof where.primary_account_id === 'string' && t.primary_account_id !== where.primary_account_id) {
      return false;
    }
    if (where.primary_account_id.in && !where.primary_account_id.in.includes(t.primary_account_id)) {
      return false;
    }
  }
  if (where.form && t.form !== where.form) return false;
  if (where.is_favorite !== undefined && Boolean(t.is_favorite) !== where.is_favorite) return false;
  if (where.transaction_date) {
    const txTime = new Date(t.transaction_date).getTime();
    if (where.transaction_date.gte && txTime < new Date(where.transaction_date.gte).getTime()) return false;
    if (where.transaction_date.lte && txTime > new Date(where.transaction_date.lte).getTime()) return false;
  }
  if (where.primary_account) {
    const primaryAcc = mockAccounts.find((a) => a.id === t.primary_account_id);
    if (!primaryAcc) return false;
    if (where.primary_account.type && primaryAcc.type !== where.primary_account.type) return false;
    if (where.primary_account.user_id && primaryAcc.user_id !== where.primary_account.user_id) return false;
    if (where.primary_account.name?.contains) {
      if (!primaryAcc.name.toLowerCase().includes(where.primary_account.name.contains.toLowerCase())) return false;
    }
  }
  if (where.description?.contains) {
    if (!(t.description || '').toLowerCase().includes(where.description.contains.toLowerCase())) return false;
  }
  if (where.allocation_lines?.some) {
    const cond = where.allocation_lines.some;
    const lines = mockAllocationLines.filter((l) => l.transaction_id === t.id);
    const matched = lines.some((line) => {
      const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
      if (cond.target_account_id && line.target_account_id !== cond.target_account_id) return false;
      if (cond.notes?.contains) {
        if (!(line.notes || '').toLowerCase().includes(cond.notes.contains.toLowerCase())) return false;
      }
      if (cond.target_account) {
        if (!targetAcc) return false;
        if (cond.target_account.type && targetAcc.type !== cond.target_account.type) return false;
        if (cond.target_account.subtype && (targetAcc.subtype || 'DEFAULT') !== cond.target_account.subtype) {
          return false;
        }
        if (cond.target_account.name?.contains) {
          if (!targetAcc.name.toLowerCase().includes(cond.target_account.name.contains.toLowerCase())) {
            return false;
          }
        }
        if (cond.target_account.OR) {
          const orOk = cond.target_account.OR.some((sub: any) => {
            if (sub.type && targetAcc.type !== sub.type) return false;
            if (sub.subtype && (targetAcc.subtype || 'DEFAULT') !== sub.subtype) return false;
            return true;
          });
          if (!orOk) return false;
        }
      }
      return true;
    });
    if (!matched) return false;
  }
  if (where.AND) {
    const list = Array.isArray(where.AND) ? where.AND : [where.AND];
    if (!list.every((sub: any) => getMatchesFilter(t, sub))) return false;
  }
  if (where.OR) {
    if (!where.OR.some((sub: any) => getMatchesFilter(t, sub))) return false;
  }
  return true;
}

vi.mock('../../src/prisma.js', () => {
  const mockPrismaObj: any = {
    $transaction: vi.fn(async (callback) => {
      return callback(mockPrismaObj);
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = Array.isArray(strings) ? strings.join(' ') : String(strings);
      if (sql.includes('FROM "transactions"')) {
        const txId = values[0];
        const uId = values[1];
        const found = mockTransactions.find((t) => t.id === txId && t.user_id === uId);
        return found ? [{ id: found.id }] : [];
      }
      return [];
    }),
    user: {
      findUnique: vi.fn(async ({ where }) => findMockUser(where))
    },
    account: {
      findMany: vi.fn(async ({ where }) => {
        return mockAccounts.filter((a) => {
          if (where?.user_id && a.user_id !== where.user_id) return false;
          if (where?.id?.in && !where.id.in.includes(a.id)) return false;
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }) => {
        return (
          mockAccounts.find((a) => {
            if (where?.id && a.id !== where.id) return false;
            if (where?.user_id && a.user_id !== where.user_id) return false;
            return true;
          }) || null
        );
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const a of mockAccounts) {
          if (typeof where?.id === 'string' && a.id !== where.id) continue;
          if (where?.id?.in && !where.id.in.includes(a.id)) continue;
          if (where?.user_id && a.user_id !== where.user_id) continue;
          if (
            where?.is_opening_locked !== undefined &&
            a.is_opening_locked !== where.is_opening_locked
          ) {
            continue;
          }
          if (data.is_opening_locked !== undefined) a.is_opening_locked = data.is_opening_locked;
          if (data.updated_at) a.updated_at = data.updated_at;
          count++;
        }
        return { count };
      })
    },
    transaction: {
      findMany: vi.fn(async ({ where }) => {
        return mockTransactions
          .filter((t) => getMatchesFilter(t, where))
          .sort((a, b) => {
            const dDiff = new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
            if (dDiff !== 0) return dDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          })
          .map((t) => {
            const primaryAccount = mockAccounts.find((a) => a.id === t.primary_account_id)!;
            const lines = mockAllocationLines
              .filter((l) => l.transaction_id === t.id)
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((l) => {
                const targetAccount = mockAccounts.find((a) => a.id === l.target_account_id)!;
                return {
                  ...l,
                  target_account: targetAccount
                };
              });
            return {
              ...t,
              is_favorite: Boolean(t.is_favorite),
              primary_account: primaryAccount,
              allocation_lines: lines
            };
          });
      }),
      findFirst: vi.fn(async ({ where }) => {
        const found = mockTransactions.find((t) => getMatchesFilter(t, where));
        if (!found) return null;
        const primaryAccount = mockAccounts.find((a) => a.id === found.primary_account_id)!;
        const lines = mockAllocationLines
          .filter((l) => l.transaction_id === found.id)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((l) => ({
            ...l,
            target_account: mockAccounts.find((a) => a.id === l.target_account_id)!
          }));
        return {
          ...found,
          is_favorite: Boolean(found.is_favorite),
          primary_account: primaryAccount,
          allocation_lines: lines
        };
      }),
      update: vi.fn(async ({ where, data }) => {
        const found = mockTransactions.find((t) => t.id === where.id);
        if (!found) throw new Error('Record not found');
        if (data.is_favorite !== undefined) found.is_favorite = data.is_favorite;
        found.updated_at = new Date();
        const primaryAccount = mockAccounts.find((a) => a.id === found.primary_account_id)!;
        const lines = mockAllocationLines
          .filter((l) => l.transaction_id === found.id)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((l) => ({
            ...l,
            target_account: mockAccounts.find((a) => a.id === l.target_account_id)!
          }));
        return {
          ...found,
          is_favorite: Boolean(found.is_favorite),
          primary_account: primaryAccount,
          allocation_lines: lines
        };
      }),
      create: vi.fn(async ({ data }) => {
        const now = new Date();
        const tx = {
          id: `txn-dup-${mockTransactions.length + 1}`,
          user_id: data.user_id,
          primary_account_id: data.primary_account_id,
          form: data.form,
          total_amount: new Prisma.Decimal(data.total_amount.toString()),
          transaction_date: data.transaction_date,
          description: data.description ?? null,
          is_favorite: data.is_favorite ?? false,
          created_at: now,
          updated_at: now
        };
        mockTransactions.push(tx);
        return tx;
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matching = mockTransactions.filter((t) => getMatchesFilter(t, where));
        if (matching.length === 0) return { _sum: { total_amount: null } };
        const sum = matching.reduce(
          (acc, t) => acc.add(new Prisma.Decimal(t.total_amount.toString())),
          new Prisma.Decimal('0.00')
        );
        return { _sum: { total_amount: sum } };
      })
    },
    allocationLine: {
      create: vi.fn(async ({ data }) => {
        const line = {
          id: `alloc-dup-${mockAllocationLines.length + 1}`,
          transaction_id: data.transaction_id,
          target_account_id: data.target_account_id,
          amount: new Prisma.Decimal(data.amount.toString()),
          notes: data.notes ?? null
        };
        mockAllocationLines.push(line);
        return line;
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matching = mockAllocationLines.filter((line) => {
          const tx = mockTransactions.find((t) => t.id === line.transaction_id);
          const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
          const primaryAcc = mockAccounts.find((a) => a.id === tx?.primary_account_id);
          if (where?.target_account_id) {
            if (typeof where.target_account_id === 'string' && line.target_account_id !== where.target_account_id) {
              return false;
            }
            if (where.target_account_id.in && !where.target_account_id.in.includes(line.target_account_id)) {
              return false;
            }
          }
          if (where?.target_account?.type && targetAcc?.type !== where.target_account.type) return false;
          if (where?.target_account?.user_id && targetAcc?.user_id !== where.target_account.user_id) return false;
          if (where?.transaction?.user_id && tx?.user_id !== where.transaction.user_id) return false;
          if (where?.transaction?.form && tx?.form !== where.transaction.form) return false;
          if (where?.transaction?.primary_account?.type && primaryAcc?.type !== where.transaction.primary_account.type) {
            return false;
          }
          if (
            where?.transaction?.primary_account?.user_id &&
            primaryAcc?.user_id !== where.transaction.primary_account.user_id
          ) {
            return false;
          }
          return true;
        });
        if (matching.length === 0) return { _sum: { amount: null } };
        const sum = matching.reduce(
          (acc, l) => acc.add(new Prisma.Decimal(l.amount.toString())),
          new Prisma.Decimal('0.00')
        );
        return { _sum: { amount: sum } };
      }),
      findMany: vi.fn(async ({ where }) => {
        return mockAllocationLines
          .filter((line) => {
            const tx = mockTransactions.find((t) => t.id === line.transaction_id);
            const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
            if (where?.transaction?.user_id && tx?.user_id !== where.transaction.user_id) return false;
            if (where?.transaction?.form && tx?.form !== where.transaction.form) return false;
            if (where?.target_account?.type && targetAcc?.type !== where.target_account.type) return false;
            return true;
          })
          .map((line) => {
            const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
            return {
              ...line,
              target_account: targetAcc ? { name: targetAcc.name, type: targetAcc.type } : null
            };
          });
      })
    },
    transactionAuditLog: {
      findMany: vi.fn(async ({ where }) => {
        return mockAuditLogs.filter((l) => !where?.transaction_id || l.transaction_id === where.transaction_id);
      })
    }
  };
  return { prisma: mockPrismaObj };
});

import { app } from '../../src/app.js';

function makeToken(user: { id: string; username: string; role: 'USER' | 'ADMIN' }) {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
}

describe('WP-10 Integration Suite: F-14 Favorite & Duplicate + F-15 Search & Filtering (Issue #58)', () => {
  const userDemoToken = makeToken({ id: 'user-a-uuid', username: 'user_demo', role: 'USER' });
  const userOtherToken = makeToken({ id: 'user-b-uuid', username: 'user_other', role: 'USER' });
  const adminToken = makeToken({ id: 'admin-uuid', username: 'admin_demo', role: 'ADMIN' });

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();
    mockAuditLogs.length = 0;

    // Ensure Visa Credit Card has subtype CREDIT_CARD
    const cc = mockAccounts.find((a) => a.id === 'acc-demo-cc');
    if (cc) cc.subtype = 'CREDIT_CARD';

    // Add extra Sprint 2 accounts for transfer and loan tests
    mockAccounts.push(
      {
        id: 'acc-demo-wallet',
        user_id: 'user-a-uuid',
        name: 'Cash Wallet',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date('2026-11-01T00:00:05.000Z'),
        updated_at: new Date('2026-11-01T00:00:05.000Z')
      },
      {
        id: 'acc-demo-loan-given',
        user_id: 'user-a-uuid',
        name: 'Friend Loan',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date('2026-11-01T00:00:06.000Z'),
        updated_at: new Date('2026-11-01T00:00:06.000Z')
      },
      {
        id: 'acc-demo-general-loan',
        user_id: 'user-a-uuid',
        name: 'Car Loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date('2026-11-01T00:00:07.000Z'),
        updated_at: new Date('2026-11-01T00:00:07.000Z')
      }
    );
  });

  function seedBaseTransactions() {
    mockTransactions.push(
      {
        id: 'txn-salary-1',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'Monthly Salary',
        is_favorite: false,
        created_at: new Date('2026-11-01T08:00:00.000Z'),
        updated_at: new Date('2026-11-01T08:00:00.000Z')
      },
      {
        id: 'txn-cc-split-2',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-cc',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-10T00:00:00.000Z'),
        description: 'Supermarket Split Trip',
        is_favorite: true,
        created_at: new Date('2026-11-10T12:00:00.000Z'),
        updated_at: new Date('2026-11-10T12:00:00.000Z')
      },
      {
        id: 'txn-other-user-1',
        user_id: 'user-b-uuid',
        primary_account_id: 'acc-other-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('5000.00'),
        transaction_date: new Date('2026-11-10T00:00:00.000Z'),
        description: 'Secret Supermarket Bonus',
        is_favorite: true,
        created_at: new Date('2026-11-10T09:00:00.000Z'),
        updated_at: new Date('2026-11-10T09:00:00.000Z')
      }
    );

    mockAllocationLines.push(
      {
        id: 'alloc-sal-1',
        transaction_id: 'txn-salary-1',
        target_account_id: 'acc-demo-salary',
        amount: new Prisma.Decimal('20000.00'),
        notes: 'Nov salary'
      },
      {
        id: 'alloc-cc-dining',
        transaction_id: 'txn-cc-split-2',
        target_account_id: 'acc-demo-dining',
        amount: new Prisma.Decimal('1000.00'),
        notes: 'Dinner at food court'
      },
      {
        id: 'alloc-cc-grocery',
        transaction_id: 'txn-cc-split-2',
        target_account_id: 'acc-demo-grocery',
        amount: new Prisma.Decimal('2000.00'),
        notes: 'Weekly groceries'
      },
      {
        id: 'alloc-other-1',
        transaction_id: 'txn-other-user-1',
        target_account_id: 'acc-other-checking',
        amount: new Prisma.Decimal('5000.00'),
        notes: 'Private note'
      }
    );
  }

  // ============================================================================
  // F-14: FAVORITE & DUPLICATE TRANSACTIONS
  // ============================================================================

  it('TEST-FAV-01: toggles is_favorite true/false, persists in GET /api/transactions, rejects non-boolean with 400 INVALID_FAVORITE_FLAG', async () => {
    seedBaseTransactions();

    const favTrue = await request(app)
      .patch('/api/transactions/txn-salary-1/favorite')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({ is_favorite: true });

    expect(favTrue.status).toBe(200);
    expect(favTrue.body.success).toBe(true);
    expect(favTrue.body.data.transaction.id).toBe('txn-salary-1');
    expect(favTrue.body.data.transaction.is_favorite).toBe(true);

    // Verify persisted in GET /api/transactions
    const listRes = await request(app)
      .get('/api/transactions')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(listRes.status).toBe(200);
    const salaryTxn = listRes.body.data.transactions.find((t: any) => t.id === 'txn-salary-1');
    expect(salaryTxn.is_favorite).toBe(true);

    // Toggle back to false
    const favFalse = await request(app)
      .patch('/api/transactions/txn-salary-1/favorite')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({ is_favorite: false });

    expect(favFalse.status).toBe(200);
    expect(favFalse.body.data.transaction.is_favorite).toBe(false);

    // Non-boolean payload
    const badRes = await request(app)
      .patch('/api/transactions/txn-salary-1/favorite')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({ is_favorite: 'yes' });

    expect(badRes.status).toBe(400);
    expect(badRes.body.error.code).toBe('INVALID_FAVORITE_FLAG');
  });

  it('TEST-FAV-02: duplicates split CC purchase with distinct id, fresh timestamps, is_favorite=false, 0 copied audit logs, and updated summary', async () => {
    seedBaseTransactions();
    mockAuditLogs.push({
      id: 'audit-1',
      transaction_id: 'txn-cc-split-2',
      user_id: 'user-a-uuid',
      action: 'CORRECTED',
      previous_snapshot: { total_amount: '2500.00' },
      new_snapshot: { total_amount: '3000.00' },
      created_at: new Date('2026-11-10T13:00:00.000Z')
    });

    const dupRes = await request(app)
      .post('/api/transactions/txn-cc-split-2/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({ transaction_date: '2026-11-15' });

    expect(dupRes.status).toBe(201);
    expect(dupRes.body.success).toBe(true);
    const newTx = dupRes.body.data.transaction;
    expect(newTx.id).not.toBe('txn-cc-split-2');
    expect(newTx.is_favorite).toBe(false);
    expect(newTx.transaction_date).toBe('2026-11-15');
    expect(newTx.total_amount).toBe('3000.00');
    expect(newTx.allocations).toHaveLength(2);
    expect(newTx.allocations[0].id).not.toBe('alloc-cc-dining');
    expect(newTx.allocations[1].id).not.toBe('alloc-cc-grocery');
    expect(new Date(newTx.created_at).getTime()).toBeGreaterThan(
      new Date('2026-11-10T12:00:00.000Z').getTime()
    );

    // 0 copied audit logs on duplicated transaction
    const copiedLogs = mockAuditLogs.filter((l) => l.transaction_id === newTx.id);
    expect(copiedLogs).toHaveLength(0);

    // Summary reflects +3000.00 CC debt and +3000.00 total_expense
    const sumRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.data.credit_debt).toBe(6000);
    expect(sumRes.body.data.total_expense).toBe(6000);
  });

  it('TEST-FAV-03: enforces live domain re-validation (BR-07 v1.1, INSUFFICIENT_FUNDS, ACCOUNT_ARCHIVED) on duplicate with zero DB writes', async () => {
    seedBaseTransactions();

    // Seed a CC repayment of 3000.00 (clears the 3000.00 CC debt to 0.00)
    mockTransactions.push({
      id: 'txn-cc-repay-3',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      transaction_date: new Date('2026-11-12T00:00:00.000Z'),
      description: 'Full CC Payoff',
      is_favorite: false,
      created_at: new Date('2026-11-12T10:00:00.000Z'),
      updated_at: new Date('2026-11-12T10:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-cc-repay-3',
      transaction_id: 'txn-cc-repay-3',
      target_account_id: 'acc-demo-cc',
      amount: new Prisma.Decimal('3000.00'),
      notes: 'Repay'
    });

    const countBefore = mockTransactions.length;

    // (a) Duplicate CC repayment when remaining debt is 0.00 -> 422 ZERO_OUTSTANDING_DEBT
    const zeroDebtRes = await request(app)
      .post('/api/transactions/txn-cc-repay-3/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(zeroDebtRes.status).toBe(422);
    expect(zeroDebtRes.body.error.code).toBe('ZERO_OUTSTANDING_DEBT');
    expect(mockTransactions.length).toBe(countBefore);

    // (b) Add 1000.00 debt -> duplicating 3000.00 repayment exceeds 1000.00 debt -> 422 REPAYMENT_EXCEEDS_DEBT
    mockTransactions.push({
      id: 'txn-cc-small-charge',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-cc',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-13T00:00:00.000Z'),
      description: 'Small Charge',
      is_favorite: false,
      created_at: new Date('2026-11-13T10:00:00.000Z'),
      updated_at: new Date('2026-11-13T10:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-cc-small-charge',
      transaction_id: 'txn-cc-small-charge',
      target_account_id: 'acc-demo-dining',
      amount: new Prisma.Decimal('1000.00'),
      notes: 'Small'
    });

    const countBeforeExceed = mockTransactions.length;
    const exceedRes = await request(app)
      .post('/api/transactions/txn-cc-repay-3/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(exceedRes.status).toBe(422);
    expect(exceedRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');
    expect(mockTransactions.length).toBe(countBeforeExceed);

    // (c1) Add 7000.00 more debt (total 8000.00 -> min repayment 800.00), duplicate a 500.00 repayment -> 422 MIN_REPAYMENT_NOT_MET
    mockTransactions.push(
      {
        id: 'txn-cc-big-charge',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-cc',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('7500.00'),
        transaction_date: new Date('2026-11-14T00:00:00.000Z'),
        description: 'Big Charge',
        is_favorite: false,
        created_at: new Date('2026-11-14T10:00:00.000Z'),
        updated_at: new Date('2026-11-14T10:00:00.000Z')
      },
      {
        id: 'txn-cc-repay-500',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('500.00'),
        transaction_date: new Date('2026-11-14T00:00:00.000Z'),
        description: 'Partial 500',
        is_favorite: false,
        created_at: new Date('2026-11-14T11:00:00.000Z'),
        updated_at: new Date('2026-11-14T11:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      {
        id: 'alloc-cc-big-charge',
        transaction_id: 'txn-cc-big-charge',
        target_account_id: 'acc-demo-grocery',
        amount: new Prisma.Decimal('7500.00'),
        notes: 'Big'
      },
      {
        id: 'alloc-cc-repay-500',
        transaction_id: 'txn-cc-repay-500',
        target_account_id: 'acc-demo-cc',
        amount: new Prisma.Decimal('500.00'),
        notes: 'Repay 500'
      }
    );
    // Remaining debt = 1000 + 7500 - 500 = 8000.00 -> min = 800.00 -> 500 < 800
    const countBeforeMin = mockTransactions.length;
    const minRes = await request(app)
      .post('/api/transactions/txn-cc-repay-500/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(minRes.status).toBe(422);
    expect(minRes.body.error.code).toBe('MIN_REPAYMENT_NOT_MET');
    expect(mockTransactions.length).toBe(countBeforeMin);

    // (c2) Partial repayment cash reserve violation (< 100.00 left)
    // Checking currently has 20000 - 3000 - 500 = 16500.00. Drain 15550.00 via transfer to wallet -> checking = 950.00.
    // Debt = 8000.00, duplicate a 900.00 partial repayment -> leaves 50.00 < 100.00 -> MINIMUM_CASH_RESERVE_VIOLATION
    mockTransactions.push(
      {
        id: 'txn-xfer-drain',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('14650.00'),
        transaction_date: new Date('2026-11-15T00:00:00.000Z'),
        description: 'Drain to Wallet',
        is_favorite: false,
        created_at: new Date('2026-11-15T08:00:00.000Z'),
        updated_at: new Date('2026-11-15T08:00:00.000Z')
      },
      {
        id: 'txn-cc-repay-900',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('900.00'),
        transaction_date: new Date('2026-11-15T00:00:00.000Z'),
        description: 'Partial 900',
        is_favorite: false,
        created_at: new Date('2026-11-15T09:00:00.000Z'),
        updated_at: new Date('2026-11-15T09:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      {
        id: 'alloc-xfer-drain',
        transaction_id: 'txn-xfer-drain',
        target_account_id: 'acc-demo-wallet',
        amount: new Prisma.Decimal('14650.00'),
        notes: 'Transfer'
      },
      {
        id: 'alloc-cc-repay-900',
        transaction_id: 'txn-cc-repay-900',
        target_account_id: 'acc-demo-cc',
        amount: new Prisma.Decimal('900.00'),
        notes: 'Repay 900'
      }
    );
    // Now Checking = 16500 - 14650 - 900 = 950.00, Debt = 8000 - 900 = 7100.00 (min = 710.00).
    // Duplicating 900.00 leaves 50.00 < 100.00 -> MINIMUM_CASH_RESERVE_VIOLATION
    const countBeforeReserve = mockTransactions.length;
    const reserveRes = await request(app)
      .post('/api/transactions/txn-cc-repay-900/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(reserveRes.status).toBe(422);
    expect(reserveRes.body.error.code).toBe('MINIMUM_CASH_RESERVE_VIOLATION');
    expect(mockTransactions.length).toBe(countBeforeReserve);

    // (d) Duplicate cash transfer (14650.00) when Checking only has 950.00 -> 422 INSUFFICIENT_FUNDS
    const xferRes = await request(app)
      .post('/api/transactions/txn-xfer-drain/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(xferRes.status).toBe(422);
    expect(xferRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockTransactions.length).toBe(countBeforeReserve);

    // (e) Archived target account blocks duplicate with 422 ACCOUNT_ARCHIVED
    const diningAcc = mockAccounts.find((a) => a.id === 'acc-demo-dining');
    if (diningAcc) diningAcc.is_archived = true;

    const archivedRes = await request(app)
      .post('/api/transactions/txn-cc-split-2/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(archivedRes.status).toBe(422);
    expect(archivedRes.body.error.code).toBe('ACCOUNT_ARCHIVED');
    expect(mockTransactions.length).toBe(countBeforeReserve);
  });

  it('TEST-FAV-04: rejects cross-tenant favorite/duplicate with 404 NOT_FOUND (BR-01) and ADMIN with 403 (BR-10)', async () => {
    seedBaseTransactions();

    const crossFav = await request(app)
      .patch('/api/transactions/txn-other-user-1/favorite')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({ is_favorite: true });
    expect(crossFav.status).toBe(404);
    expect(crossFav.body.error.code).toBe('NOT_FOUND');

    const crossDup = await request(app)
      .post('/api/transactions/txn-other-user-1/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({});
    expect(crossDup.status).toBe(404);
    expect(crossDup.body.error.code).toBe('NOT_FOUND');

    const adminFav = await request(app)
      .patch('/api/transactions/txn-salary-1/favorite')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_favorite: true });
    expect(adminFav.status).toBe(403);

    const adminDup = await request(app)
      .post('/api/transactions/txn-salary-1/duplicate')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({});
    expect(adminDup.status).toBe(403);
  });

  // ============================================================================
  // F-15: TRANSACTION SEARCH & MULTI-CRITERIA FILTERING
  // ============================================================================

  it('TEST-SRCH-01: filters GET /api/transactions by inclusive startDate and endDate', async () => {
    seedBaseTransactions();
    mockTransactions.push({
      id: 'txn-nov-20',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-20T00:00:00.000Z'),
      description: 'Bonus',
      is_favorite: false,
      created_at: new Date('2026-11-20T08:00:00.000Z'),
      updated_at: new Date('2026-11-20T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-nov-20',
      transaction_id: 'txn-nov-20',
      target_account_id: 'acc-demo-salary',
      amount: new Prisma.Decimal('1000.00'),
      notes: 'Bonus'
    });

    const res = await request(app)
      .get('/api/transactions?startDate=2026-11-05&endDate=2026-11-15')
      .set('Cookie', [`token=${userDemoToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.data.transactions).toHaveLength(1);
    expect(res.body.data.transactions[0].id).toBe('txn-cc-split-2');
  });

  it('TEST-SRCH-02: rejects inverted date range (startDate > endDate) or malformed dates with 400 INVALID_DATE_RANGE', async () => {
    seedBaseTransactions();

    const inverted = await request(app)
      .get('/api/transactions?startDate=2026-11-20&endDate=2026-11-01')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(inverted.status).toBe(400);
    expect(inverted.body.error.code).toBe('INVALID_DATE_RANGE');

    const malformed = await request(app)
      .get('/api/transactions?startDate=invalid-date')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_DATE_RANGE');

    const fakeDate = await request(app)
      .get('/api/transactions?endDate=2026-02-30')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(fakeDate.status).toBe(400);
    expect(fakeDate.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('TEST-SRCH-03: filters by accountId, categoryId, form, favorite, and combined criteria', async () => {
    seedBaseTransactions();

    const byCat = await request(app)
      .get('/api/transactions?categoryId=acc-demo-dining')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(byCat.status).toBe(200);
    expect(byCat.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-cc-split-2']);

    const byAccAndForm = await request(app)
      .get('/api/transactions?accountId=acc-demo-cc&form=PAYMENT_CHARGE&favorite=true')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(byAccAndForm.status).toBe(200);
    expect(byAccAndForm.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-cc-split-2']);

    const favFalse = await request(app)
      .get('/api/transactions?favorite=false')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(favFalse.status).toBe(200);
    expect(favFalse.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-salary-1']);
  });

  it('TEST-SRCH-04: filters by case-insensitive keyword q across description, allocation notes, and account name', async () => {
    seedBaseTransactions();

    // Match description
    const qDesc = await request(app)
      .get('/api/transactions?q=supermarket')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(qDesc.status).toBe(200);
    expect(qDesc.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-cc-split-2']);

    // Match allocation notes
    const qNotes = await request(app)
      .get('/api/transactions?q=FOOD%20COURT')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(qNotes.status).toBe(200);
    expect(qNotes.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-cc-split-2']);

    // Match account name
    const qAcc = await request(app)
      .get('/api/transactions?q=checking%20bank')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(qAcc.status).toBe(200);
    expect(qAcc.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-salary-1']);
  });

  it('TEST-SRCH-05: returns empty array with zero cross-tenant leakage when filtering by another user accountId/keyword (BR-01)', async () => {
    seedBaseTransactions();

    const res = await request(app)
      .get('/api/transactions?accountId=acc-other-checking&q=Secret')
      .set('Cookie', [`token=${userDemoToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.data.transactions).toEqual([]);
  });

  it('TEST-SRCH-06: filters by semantic type (INCOME, EXPENSE, REPAYMENT, TRANSFER, LOAN) and rejects invalid filter params with 400 INVALID_FILTER_PARAM', async () => {
    seedBaseTransactions();

    // Add REPAYMENT, TRANSFER, and LOAN transactions
    mockTransactions.push(
      {
        id: 'txn-repay-type',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-11T00:00:00.000Z'),
        description: 'CC Repay',
        is_favorite: false,
        created_at: new Date('2026-11-11T10:00:00.000Z'),
        updated_at: new Date('2026-11-11T10:00:00.000Z')
      },
      {
        id: 'txn-xfer-type',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('500.00'),
        transaction_date: new Date('2026-11-12T00:00:00.000Z'),
        description: 'Wallet Topup',
        is_favorite: false,
        created_at: new Date('2026-11-12T10:00:00.000Z'),
        updated_at: new Date('2026-11-12T10:00:00.000Z')
      },
      {
        id: 'txn-loan-given-type',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('2000.00'),
        transaction_date: new Date('2026-11-13T00:00:00.000Z'),
        description: 'Lent to Friend',
        is_favorite: false,
        created_at: new Date('2026-11-13T10:00:00.000Z'),
        updated_at: new Date('2026-11-13T10:00:00.000Z')
      },
      {
        id: 'txn-loan-taken-type',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('5000.00'),
        transaction_date: new Date('2026-11-14T00:00:00.000Z'),
        description: 'Car Loan Borrowed',
        is_favorite: false,
        created_at: new Date('2026-11-14T10:00:00.000Z'),
        updated_at: new Date('2026-11-14T10:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      {
        id: 'alloc-repay-type',
        transaction_id: 'txn-repay-type',
        target_account_id: 'acc-demo-cc',
        amount: new Prisma.Decimal('1000.00'),
        notes: 'Repay'
      },
      {
        id: 'alloc-xfer-type',
        transaction_id: 'txn-xfer-type',
        target_account_id: 'acc-demo-wallet',
        amount: new Prisma.Decimal('500.00'),
        notes: 'Transfer'
      },
      {
        id: 'alloc-loan-given-type',
        transaction_id: 'txn-loan-given-type',
        target_account_id: 'acc-demo-loan-given',
        amount: new Prisma.Decimal('2000.00'),
        notes: 'Loan'
      },
      {
        id: 'alloc-loan-taken-type',
        transaction_id: 'txn-loan-taken-type',
        target_account_id: 'acc-demo-general-loan',
        amount: new Prisma.Decimal('5000.00'),
        notes: 'Borrow'
      }
    );

    const incomeRes = await request(app).get('/api/transactions?type=INCOME').set('Cookie', [`token=${userDemoToken}`]);
    expect(incomeRes.status).toBe(200);
    expect(incomeRes.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-salary-1']);

    const expenseRes = await request(app).get('/api/transactions?type=EXPENSE').set('Cookie', [`token=${userDemoToken}`]);
    expect(expenseRes.status).toBe(200);
    expect(expenseRes.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-cc-split-2']);

    const repayRes = await request(app).get('/api/transactions?type=REPAYMENT').set('Cookie', [`token=${userDemoToken}`]);
    expect(repayRes.status).toBe(200);
    expect(repayRes.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-repay-type']);

    const xferRes = await request(app).get('/api/transactions?type=TRANSFER').set('Cookie', [`token=${userDemoToken}`]);
    expect(xferRes.status).toBe(200);
    expect(xferRes.body.data.transactions.map((t: any) => t.id)).toEqual(['txn-xfer-type']);

    const loanRes = await request(app).get('/api/transactions?type=LOAN').set('Cookie', [`token=${userDemoToken}`]);
    expect(loanRes.status).toBe(200);
    expect(loanRes.body.data.transactions.map((t: any) => t.id)).toEqual([
      'txn-loan-taken-type',
      'txn-loan-given-type'
    ]);

    // Invalid filter params
    const badType = await request(app).get('/api/transactions?type=INVALID_TYPE').set('Cookie', [`token=${userDemoToken}`]);
    expect(badType.status).toBe(400);
    expect(badType.body.error.code).toBe('INVALID_FILTER_PARAM');

    const badForm = await request(app).get('/api/transactions?form=INVALID_FORM').set('Cookie', [`token=${userDemoToken}`]);
    expect(badForm.status).toBe(400);
    expect(badForm.body.error.code).toBe('INVALID_FILTER_PARAM');

    const badFav = await request(app).get('/api/transactions?favorite=maybe').set('Cookie', [`token=${userDemoToken}`]);
    expect(badFav.status).toBe(400);
    expect(badFav.body.error.code).toBe('INVALID_FILTER_PARAM');
  });
});
