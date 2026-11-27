import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  mockUsers,
  findMockUser,
  resetMockUsers,
  mockAccounts,
  mockTransactions,
  mockAllocationLines,
  resetMockAccounts,
  resetMockTransactions,
  DEMO_PASSWORD
} from '../fixtures/mockPrisma.js';

const mockAuditLogs: any[] = [];
let failNextAuditInsert = false;
let failNextUserLookup = false;

vi.mock('../../src/prisma.js', () => {
  const mockPrismaObj: any = {
    $transaction: vi.fn(async (callback) => {
      // Snapshot state for rollback simulation on error (TEST-CORR-03, 04, 06, 07)
      const txSnapshot = mockTransactions.map((t) => ({
        ...t,
        total_amount: new Prisma.Decimal(t.total_amount.toString())
      }));
      const allocSnapshot = mockAllocationLines.map((l) => ({
        ...l,
        amount: new Prisma.Decimal(l.amount.toString())
      }));
      const auditSnapshot = mockAuditLogs.map((a) => ({ ...a }));
      const accLockSnapshot = mockAccounts.map((a) => ({ id: a.id, is_opening_locked: a.is_opening_locked }));
      try {
        return await callback(mockPrismaObj);
      } catch (err) {
        mockTransactions.length = 0;
        mockTransactions.push(...txSnapshot);
        mockAllocationLines.length = 0;
        mockAllocationLines.push(...allocSnapshot);
        mockAuditLogs.length = 0;
        mockAuditLogs.push(...auditSnapshot);
        for (const snap of accLockSnapshot) {
          const acc = mockAccounts.find((a) => a.id === snap.id);
          if (acc) acc.is_opening_locked = snap.is_opening_locked;
        }
        throw err;
      }
    }),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM "transactions"')) {
        const txId = values[0];
        const uId = values[1];
        const found = mockTransactions.find((t) => t.id === txId && t.user_id === uId);
        return found ? [{ id: found.id }] : [];
      }
      return [];
    }),
    user: {
      findFirst: vi.fn(async ({ where }) => {
        if (where?.OR) {
          for (const cond of where.OR) {
            const u = findMockUser(cond);
            if (u) return u;
          }
        }
        return null;
      }),
      findUnique: vi.fn(async ({ where }) => {
        if (failNextUserLookup) {
          failNextUserLookup = false;
          throw new Error('ECONNREFUSED: PostgreSQL unavailable');
        }
        return findMockUser(where);
      }),
      findMany: vi.fn(async ({ where, select }) => {
        const filtered = mockUsers
          .filter((u) => {
            if (where?.role && u.role !== where.role) return false;
            if (where?.is_active !== undefined && u.is_active !== where.is_active) return false;
            return true;
          })
          .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        if (!select) return filtered;
        return filtered.map((u: any) => {
          const out: any = {};
          for (const [k, v] of Object.entries(select)) {
            if (v) out[k] = u[k];
          }
          return out;
        });
      }),
      count: vi.fn(async ({ where }) => {
        return mockUsers.filter((u) => {
          if (where?.role && u.role !== where.role) return false;
          if (where?.is_active !== undefined && u.is_active !== where.is_active) return false;
          return true;
        }).length;
      }),
      update: vi.fn(async ({ where, data, select }) => {
        const u: any = mockUsers.find((usr) => usr.id === where.id);
        if (!u) throw new Error('User not found');
        if (data.is_active !== undefined) u.is_active = data.is_active;
        u.updated_at = new Date();
        if (!select) return u;
        const out: any = {};
        for (const [k, v] of Object.entries(select)) {
          if (v) out[k] = u[k];
        }
        return out;
      })
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
      findFirst: vi.fn(async ({ where }) => {
        const found = mockTransactions.find((t) => {
          if (where?.id && t.id !== where.id) return false;
          if (where?.user_id && t.user_id !== where.user_id) return false;
          return true;
        });
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
          primary_account: primaryAccount,
          allocation_lines: lines
        };
      }),
      update: vi.fn(async ({ where, data }) => {
        const found = mockTransactions.find((t) => t.id === where.id);
        if (!found) throw new Error('Transaction not found');
        if (data.total_amount !== undefined) {
          found.total_amount = new Prisma.Decimal(data.total_amount.toString());
        }
        if (data.transaction_date !== undefined) found.transaction_date = data.transaction_date;
        if (data.description !== undefined) found.description = data.description;
        found.updated_at = new Date();
        return found;
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matching = mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          if (where?.primary_account_id) {
            if (typeof where.primary_account_id === 'string' && t.primary_account_id !== where.primary_account_id) {
              return false;
            }
            if (where.primary_account_id.in && !where.primary_account_id.in.includes(t.primary_account_id)) {
              return false;
            }
          }
          if (where?.form && t.form !== where.form) return false;
          if (where?.id?.not && t.id === where.id.not) return false;
          return true;
        });
        if (matching.length === 0) return { _sum: { total_amount: null } };
        const sum = matching.reduce(
          (acc, t) => acc.add(new Prisma.Decimal(t.total_amount.toString())),
          new Prisma.Decimal('0.00')
        );
        return { _sum: { total_amount: sum } };
      })
    },
    allocationLine: {
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        for (let i = mockAllocationLines.length - 1; i >= 0; i--) {
          if (mockAllocationLines[i].transaction_id === where.transaction_id) {
            mockAllocationLines.splice(i, 1);
            count++;
          }
        }
        return { count };
      }),
      create: vi.fn(async ({ data }) => {
        const line = {
          id: `alloc-corr-${mockAllocationLines.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
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
          if (where?.transaction_id?.not && line.transaction_id === where.transaction_id.not) return false;
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
      create: vi.fn(async ({ data }) => {
        if (failNextAuditInsert) {
          failNextAuditInsert = false;
          throw new Error('Simulated audit log persistence failure');
        }
        const entry = {
          id: `audit-${mockAuditLogs.length + 1}`,
          sequence_number: BigInt(mockAuditLogs.length + 1),
          ...data,
          created_at: new Date()
        };
        mockAuditLogs.push(entry);
        return entry;
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

describe('WP-11 Integration Suite: F-16 Transaction Corrections + F-19 Admin Governance (Issue #59)', () => {
  const userDemoToken = makeToken({ id: 'user-a-uuid', username: 'user_demo', role: 'USER' });
  const userOtherToken = makeToken({ id: 'user-b-uuid', username: 'user_other', role: 'USER' });
  const adminToken = makeToken({ id: 'admin-uuid', username: 'admin_demo', role: 'ADMIN' });

  beforeEach(() => {
    resetMockUsers();
    resetMockAccounts();
    resetMockTransactions();
    mockAuditLogs.length = 0;
    failNextAuditInsert = false;
    failNextUserLookup = false;

    const cc = mockAccounts.find((a) => a.id === 'acc-demo-cc');
    if (cc) cc.subtype = 'CREDIT_CARD';
  });

  // ============================================================================
  // F-16: TRANSACTION CORRECTIONS
  // ============================================================================

  it('TEST-CORR-01: corrects income amount & description, recalculates summary, and creates 1 TransactionAuditLog snapshot', async () => {
    const bank = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
    bank.opening_balance = new Prisma.Decimal('10000.00');

    mockTransactions.push({
      id: 'txn-inc-1',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      transaction_date: new Date('2026-11-02T00:00:00.000Z'),
      description: 'Original Salary',
      created_at: new Date('2026-11-02T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-inc-1',
      transaction_id: 'txn-inc-1',
      target_account_id: 'acc-demo-salary',
      amount: new Prisma.Decimal('20000.00'),
      notes: 'Salary'
    });

    const res = await request(app)
      .put('/api/transactions/txn-inc-1')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '25000.00',
        transaction_date: '2026-11-02',
        description: 'Adjusted Salary',
        allocations: [{ target_account_id: 'acc-demo-salary', amount: '25000.00', notes: 'Updated' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction.total_amount).toBe('25000.00');
    expect(res.body.data.transaction.description).toBe('Adjusted Salary');

    // Summary recalculates Bank = 35000.00, total_income = 25000.00
    const sumRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.data.bank_balance).toBe(35000);
    expect(sumRes.body.data.total_income).toBe(25000);

    // 1 audit log created with previous & new snapshots
    expect(mockAuditLogs).toHaveLength(1);
    expect(mockAuditLogs[0].action).toBe('CORRECTED');
    expect(mockAuditLogs[0].previous_snapshot.total_amount).toBe('20000.00');
    expect(mockAuditLogs[0].new_snapshot.total_amount).toBe('25000.00');
  });

  it('TEST-CORR-02: corrects split CC purchase allocations and recalculates CC debt & total_expense', async () => {
    mockTransactions.push({
      id: 'txn-cc-2',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-cc',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      transaction_date: new Date('2026-11-03T00:00:00.000Z'),
      description: 'Split Purchase',
      created_at: new Date('2026-11-03T12:00:00.000Z')
    });
    mockAllocationLines.push(
      {
        id: 'alloc-d',
        transaction_id: 'txn-cc-2',
        target_account_id: 'acc-demo-dining',
        amount: new Prisma.Decimal('1000.00'),
        notes: 'Dining'
      },
      {
        id: 'alloc-g',
        transaction_id: 'txn-cc-2',
        target_account_id: 'acc-demo-grocery',
        amount: new Prisma.Decimal('2000.00'),
        notes: 'Grocery'
      }
    );

    const res = await request(app)
      .put('/api/transactions/txn-cc-2')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '3500.00',
        transaction_date: '2026-11-03',
        description: 'Corrected Split Purchase',
        allocations: [
          { target_account_id: 'acc-demo-dining', amount: '1500.00', notes: 'Dining updated' },
          { target_account_id: 'acc-demo-grocery', amount: '2000.00', notes: 'Grocery' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.data.transaction.total_amount).toBe('3500.00');

    const sumRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(sumRes.body.data.credit_debt).toBe(3500);
    expect(sumRes.body.data.total_expense).toBe(3500);
    expect(mockAuditLogs).toHaveLength(1);
  });

  it('TEST-CORR-03: rejects unbalanced allocations (422 ALLOCATION_SUM_MISMATCH) and duplicate targets (400 DUPLICATE_ALLOCATION_ACCOUNT) with 0 audit logs', async () => {
    mockTransactions.push({
      id: 'txn-cc-3',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-cc',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('3000.00'),
      transaction_date: new Date('2026-11-03T00:00:00.000Z'),
      description: 'Split Purchase',
      created_at: new Date('2026-11-03T12:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-3',
      transaction_id: 'txn-cc-3',
      target_account_id: 'acc-demo-dining',
      amount: new Prisma.Decimal('3000.00'),
      notes: 'Dining'
    });

    const mismatchRes = await request(app)
      .put('/api/transactions/txn-cc-3')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '3500.00',
        transaction_date: '2026-11-03',
        allocations: [
          { target_account_id: 'acc-demo-dining', amount: '1000.00' },
          { target_account_id: 'acc-demo-grocery', amount: '2000.00' }
        ]
      });
    expect(mismatchRes.status).toBe(422);
    expect(mismatchRes.body.error.code).toBe('ALLOCATION_SUM_MISMATCH');
    expect(mockAuditLogs).toHaveLength(0);

    const dupRes = await request(app)
      .put('/api/transactions/txn-cc-3')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '3000.00',
        transaction_date: '2026-11-03',
        allocations: [
          { target_account_id: 'acc-demo-dining', amount: '1500.00' },
          { target_account_id: 'acc-demo-dining', amount: '1500.00' }
        ]
      });
    expect(dupRes.status).toBe(400);
    expect(dupRes.body.error.code).toBe('DUPLICATE_ALLOCATION_ACCOUNT');
    expect(mockAuditLogs).toHaveLength(0);
  });

  it('TEST-CORR-04: rejects correction causing negative cash (422 INSUFFICIENT_FUNDS) or violating BR-07 v1.1 (422 MIN_REPAYMENT_NOT_MET) with rollback', async () => {
    const bank = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
    bank.opening_balance = new Prisma.Decimal('2000.00');

    // Income 3000 -> Bank 5000, Cash Expense 4000 -> Bank 1000
    mockTransactions.push(
      {
        id: 'txn-inc-4',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'Income',
        created_at: new Date('2026-11-01T08:00:00.000Z')
      },
      {
        id: 'txn-cash-spend-4',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('4000.00'),
        transaction_date: new Date('2026-11-02T00:00:00.000Z'),
        description: 'Cash Spend',
        created_at: new Date('2026-11-02T08:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      {
        id: 'alloc-inc-4',
        transaction_id: 'txn-inc-4',
        target_account_id: 'acc-demo-salary',
        amount: new Prisma.Decimal('3000.00'),
        notes: null
      },
      {
        id: 'alloc-spend-4',
        transaction_id: 'txn-cash-spend-4',
        target_account_id: 'acc-demo-dining',
        amount: new Prisma.Decimal('4000.00'),
        notes: null
      }
    );

    // (a) Reducing income 3000 -> 500 leaves Bank at -1500 -> 422 INSUFFICIENT_FUNDS
    const negCashRes = await request(app)
      .put('/api/transactions/txn-inc-4')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '500.00',
        transaction_date: '2026-11-01',
        allocations: [{ target_account_id: 'acc-demo-salary', amount: '500.00' }]
      });
    expect(negCashRes.status).toBe(422);
    expect(negCashRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockAuditLogs).toHaveLength(0);
    expect(mockTransactions.find((t) => t.id === 'txn-inc-4')!.total_amount.toFixed(2)).toBe('3000.00');

    // (b) CC purchase 3000 + CC repayment 600 -> correcting repayment to 400 (< 500 floor) -> 422 MIN_REPAYMENT_NOT_MET
    bank.opening_balance = new Prisma.Decimal('10000.00');
    mockTransactions.push(
      {
        id: 'txn-cc-chg-4',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-cc',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-03T00:00:00.000Z'),
        description: 'CC Charge',
        created_at: new Date('2026-11-03T08:00:00.000Z')
      },
      {
        id: 'txn-cc-rep-4',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('600.00'),
        transaction_date: new Date('2026-11-04T00:00:00.000Z'),
        description: 'CC Repay',
        created_at: new Date('2026-11-04T08:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      {
        id: 'alloc-cc-chg-4',
        transaction_id: 'txn-cc-chg-4',
        target_account_id: 'acc-demo-grocery',
        amount: new Prisma.Decimal('3000.00'),
        notes: null
      },
      {
        id: 'alloc-cc-rep-4',
        transaction_id: 'txn-cc-rep-4',
        target_account_id: 'acc-demo-cc',
        amount: new Prisma.Decimal('600.00'),
        notes: null
      }
    );

    const minFloorRes = await request(app)
      .put('/api/transactions/txn-cc-rep-4')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '400.00',
        transaction_date: '2026-11-04',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '400.00' }]
      });
    expect(minFloorRes.status).toBe(422);
    expect(minFloorRes.body.error.code).toBe('MIN_REPAYMENT_NOT_MET');
    expect(mockAuditLogs).toHaveLength(0);
    expect(mockTransactions.find((t) => t.id === 'txn-cc-rep-4')!.total_amount.toFixed(2)).toBe('600.00');
  });

  it('TEST-CORR-05: rejects cross-tenant correction with 404 NOT_FOUND (BR-01) and ADMIN with 403 (BR-10)', async () => {
    mockTransactions.push({
      id: 'txn-other-5',
      user_id: 'user-b-uuid',
      primary_account_id: 'acc-other-checking',
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-01T00:00:00.000Z'),
      description: 'Other User Txn',
      created_at: new Date('2026-11-01T08:00:00.000Z')
    });

    const crossRes = await request(app)
      .put('/api/transactions/txn-other-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '2000.00',
        transaction_date: '2026-11-01',
        allocations: [{ target_account_id: 'acc-demo-salary', amount: '2000.00' }]
      });
    expect(crossRes.status).toBe(404);
    expect(crossRes.body.error.code).toBe('NOT_FOUND');

    const adminRes = await request(app)
      .put('/api/transactions/txn-other-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({
        total_amount: '2000.00',
        transaction_date: '2026-11-01',
        allocations: [{ target_account_id: 'acc-demo-salary', amount: '2000.00' }]
      });
    expect(adminRes.status).toBe(403);
  });

  it('TEST-CORR-06: rolls back transaction update completely if TransactionAuditLog insert fails (mutual atomicity)', async () => {
    mockTransactions.push({
      id: 'txn-atom-6',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      transaction_date: new Date('2026-11-02T00:00:00.000Z'),
      description: 'Original',
      created_at: new Date('2026-11-02T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-atom-6',
      transaction_id: 'txn-atom-6',
      target_account_id: 'acc-demo-salary',
      amount: new Prisma.Decimal('20000.00'),
      notes: 'Original note'
    });

    failNextAuditInsert = true;

    const res = await request(app)
      .put('/api/transactions/txn-atom-6')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '25000.00',
        transaction_date: '2026-11-02',
        description: 'Should Roll Back',
        allocations: [{ target_account_id: 'acc-demo-salary', amount: '25000.00' }]
      });

    expect(res.status).toBe(500);
    // Original transaction and allocation retained intact
    expect(mockTransactions.find((t) => t.id === 'txn-atom-6')!.total_amount.toFixed(2)).toBe('20000.00');
    expect(mockTransactions.find((t) => t.id === 'txn-atom-6')!.description).toBe('Original');
    expect(mockAuditLogs).toHaveLength(0);
  });

  it('TEST-CORR-07: serializes sequential/concurrent corrections with chaining snapshots and rejects archived target account (422 ACCOUNT_ARCHIVED)', async () => {
    mockTransactions.push({
      id: 'txn-conc-7',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('20000.00'),
      transaction_date: new Date('2026-11-02T00:00:00.000Z'),
      description: 'Salary',
      created_at: new Date('2026-11-02T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-conc-7',
      transaction_id: 'txn-conc-7',
      target_account_id: 'acc-demo-salary',
      amount: new Prisma.Decimal('20000.00'),
      notes: null
    });

    // (a) Sequential / concurrent updates chain previous_snapshot -> new_snapshot
    const [r1, r2] = await Promise.all([
      request(app)
        .put('/api/transactions/txn-conc-7')
        .set('Origin', config.clientUrl)
        .set('Cookie', [`token=${userDemoToken}`])
        .send({
          total_amount: '22000.00',
          transaction_date: '2026-11-02',
          allocations: [{ target_account_id: 'acc-demo-salary', amount: '22000.00' }]
        }),
      request(app)
        .put('/api/transactions/txn-conc-7')
        .set('Origin', config.clientUrl)
        .set('Cookie', [`token=${userDemoToken}`])
        .send({
          total_amount: '25000.00',
          transaction_date: '2026-11-02',
          allocations: [{ target_account_id: 'acc-demo-salary', amount: '25000.00' }]
        })
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(mockAuditLogs).toHaveLength(2);
    expect(mockAuditLogs[1].previous_snapshot.total_amount).toBe(mockAuditLogs[0].new_snapshot.total_amount);

    // (b) Archived category account rejected with 422 ACCOUNT_ARCHIVED
    const dining = mockAccounts.find((a) => a.id === 'acc-demo-dining')!;
    dining.is_archived = true;

    mockTransactions.push({
      id: 'txn-arch-7',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-cc',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-03T00:00:00.000Z'),
      description: 'Groceries',
      created_at: new Date('2026-11-03T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-arch-7',
      transaction_id: 'txn-arch-7',
      target_account_id: 'acc-demo-grocery',
      amount: new Prisma.Decimal('1000.00'),
      notes: null
    });

    const archRes = await request(app)
      .put('/api/transactions/txn-arch-7')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-03',
        allocations: [{ target_account_id: 'acc-demo-dining', amount: '1000.00' }]
      });
    expect(archRes.status).toBe(422);
    expect(archRes.body.error.code).toBe('ACCOUNT_ARCHIVED');
  });

  // ============================================================================
  // F-19: PLATFORM USER DIRECTORY & ACCESS GOVERNANCE
  // ============================================================================

  it('TEST-ADMIN-01: GET /api/admin/users returns user directory with zero password_hash or financial fields (BR-10, NFR-SEC-01)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', [`token=${adminToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(3);

    for (const u of res.body.data.users) {
      expect(Object.keys(u).sort()).toEqual([
        'created_at',
        'email',
        'id',
        'is_active',
        'role',
        'username'
      ]);
      expect(u.password_hash).toBeUndefined();
      expect(u.updated_at).toBeUndefined();
      expect(u.accounts).toBeUndefined();
      expect(u.transactions).toBeUndefined();
      expect(u.balance).toBeUndefined();
    }
  });

  it('TEST-ADMIN-02: PATCH /api/admin/users/:id/status toggles is_active false and back to true', async () => {
    const disableRes = await request(app)
      .patch('/api/admin/users/user-b-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_active: false });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.user.is_active).toBe(false);
    expect(Object.keys(disableRes.body.data.user).sort()).toEqual([
      'email',
      'id',
      'is_active',
      'role',
      'updated_at',
      'username'
    ]);
    expect(disableRes.body.data.user.created_at).toBeUndefined();
    expect(disableRes.body.data.user.password_hash).toBeUndefined();
    expect(disableRes.body.data.user.accounts).toBeUndefined();

    const enableRes = await request(app)
      .patch('/api/admin/users/user-b-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_active: true });

    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.user.is_active).toBe(true);
    expect(Object.keys(enableRes.body.data.user).sort()).toEqual([
      'email',
      'id',
      'is_active',
      'role',
      'updated_at',
      'username'
    ]);
  });

  it('TEST-ADMIN-03: disabled user is rejected with 403 ACCOUNT_DISABLED on existing JWT cookie AND fresh login; re-enabling restores access', async () => {
    // Disable user_other
    const disableRes = await request(app)
      .patch('/api/admin/users/user-b-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_active: false });
    expect(disableRes.status).toBe(200);

    // (a) Existing unexpired JWT cookie rejected with 403 ACCOUNT_DISABLED
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`token=${userOtherToken}`]);
    expect(meRes.status).toBe(403);
    expect(meRes.body.error.code).toBe('ACCOUNT_DISABLED');

    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', [`token=${userOtherToken}`]);
    expect(accRes.status).toBe(403);
    expect(accRes.body.error.code).toBe('ACCOUNT_DISABLED');

    // (b) Fresh login rejected with 403 ACCOUNT_DISABLED and no session cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', config.clientUrl)
      .send({ username: 'user_other', password: DEMO_PASSWORD });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error.code).toBe('ACCOUNT_DISABLED');
    expect(loginRes.headers['set-cookie']).toBeUndefined();

    // Re-enable restores access
    await request(app)
      .patch('/api/admin/users/user-b-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_active: true });

    const meRestored = await request(app)
      .get('/api/auth/me')
      .set('Cookie', [`token=${userOtherToken}`]);
    expect(meRestored.status).toBe(200);
  });

  it('TEST-ADMIN-04: rejects USER calling /api/admin/users with 403 ADMIN_ONLY_ENDPOINT and unauthenticated with 401', async () => {
    const userGet = await request(app)
      .get('/api/admin/users')
      .set('Cookie', [`token=${userDemoToken}`]);
    expect(userGet.status).toBe(403);
    expect(userGet.body.error.code).toBe('ADMIN_ONLY_ENDPOINT');

    const userPatch = await request(app)
      .patch('/api/admin/users/user-b-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({ is_active: false });
    expect(userPatch.status).toBe(403);
    expect(userPatch.body.error.code).toBe('ADMIN_ONLY_ENDPOINT');

    const unauth = await request(app).get('/api/admin/users');
    expect(unauth.status).toBe(401);
  });

  it('TEST-ADMIN-05: blocks ADMIN self-deactivation (422 CANNOT_DEACTIVATE_SELF) and preserves BR-10 financial barriers (403)', async () => {
    const selfDisable = await request(app)
      .patch('/api/admin/users/admin-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_active: false });
    expect(selfDisable.status).toBe(422);
    expect(selfDisable.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');

    for (const path of ['/api/accounts', '/api/transactions', '/api/reports/summary']) {
      const finRes = await request(app)
        .get(path)
        .set('Cookie', [`token=${adminToken}`]);
      expect(finRes.status).toBe(403);
      expect(finRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    }
  });

  it('TEST-ADMIN-06: authGuard fails closed with 503 AUTH_STATE_UNVERIFIABLE when DB lookup throws error', async () => {
    failNextUserLookup = true;

    const res = await request(app)
      .get('/api/accounts')
      .set('Cookie', [`token=${userDemoToken}`]);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_STATE_UNVERIFIABLE');
  });

  // ============================================================================
  // ADDITIONAL REVIEW FIX TESTS (Tasks 1, 2, 8)
  // ============================================================================

  it('TEST-CORR-LOCK-01: locks opening balance of newly referenced account on correction and rolls back lock on failure (Task 1)', async () => {
    const grocery = mockAccounts.find((a) => a.id === 'acc-demo-grocery')!;
    grocery.is_opening_locked = false;

    mockTransactions.push({
      id: 'txn-lock-test',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-cc',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-05T00:00:00.000Z'),
      description: 'Dining only',
      created_at: new Date('2026-11-05T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-lock-1',
      transaction_id: 'txn-lock-test',
      target_account_id: 'acc-demo-dining',
      amount: new Prisma.Decimal('1000.00'),
      notes: null
    });

    // Failed correction (audit insert failure) must NOT leave grocery locked
    failNextAuditInsert = true;
    const failRes = await request(app)
      .put('/api/transactions/txn-lock-test')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-05',
        allocations: [{ target_account_id: 'acc-demo-grocery', amount: '1000.00' }]
      });
    expect(failRes.status).toBe(500);
    expect(grocery.is_opening_locked).toBe(false);

    // Valid correction introducing grocery locks grocery's opening balance
    const okRes = await request(app)
      .put('/api/transactions/txn-lock-test')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-05',
        allocations: [{ target_account_id: 'acc-demo-grocery', amount: '1000.00' }]
      });
    expect(okRes.status).toBe(200);
    expect(grocery.is_opening_locked).toBe(true);
  });

  it('TEST-CORR-BR07-01: prevents multi-allocation BR-07 v1.1 bypass, enforces exact floor/reserve/debt rules, and allows ordinary multi-allocation CASH expenses (Task 2)', async () => {
    const bank = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
    bank.opening_balance = new Prisma.Decimal('5000.00');

    // Seed CC charge 3000.00 and CC repayment 1000.00
    mockTransactions.push(
      {
        id: 'txn-cc-chg-br07',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-cc',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-03T00:00:00.000Z'),
        description: 'CC Charge',
        created_at: new Date('2026-11-03T08:00:00.000Z')
      },
      {
        id: 'txn-cc-rep-br07',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-04T00:00:00.000Z'),
        description: 'CC Repay',
        created_at: new Date('2026-11-04T08:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      {
        id: 'alloc-cc-chg-br07',
        transaction_id: 'txn-cc-chg-br07',
        target_account_id: 'acc-demo-grocery',
        amount: new Prisma.Decimal('3000.00'),
        notes: null
      },
      {
        id: 'alloc-cc-rep-br07',
        transaction_id: 'txn-cc-rep-br07',
        target_account_id: 'acc-demo-cc',
        amount: new Prisma.Decimal('1000.00'),
        notes: null
      }
    );

    // 1. Multi-allocation mixing Credit Card Repayment (100.00) + Expense (500.00) MUST be rejected (400 INVALID_ACCOUNT_TYPE)
    const mixRes = await request(app)
      .put('/api/transactions/txn-cc-rep-br07')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '600.00',
        transaction_date: '2026-11-04',
        allocations: [
          { target_account_id: 'acc-demo-cc', amount: '100.00' },
          { target_account_id: 'acc-demo-dining', amount: '500.00' }
        ]
      });
    expect(mixRes.status).toBe(400);
    expect(mixRes.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    // 2. Repayment exceeding debt (3500 > 3000) -> 422 REPAYMENT_EXCEEDS_DEBT
    const exceedRes = await request(app)
      .put('/api/transactions/txn-cc-rep-br07')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '3500.00',
        transaction_date: '2026-11-04',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '3500.00' }]
      });
    expect(exceedRes.status).toBe(422);
    expect(exceedRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');

    // 3. Partial repayment leaving < 100.00 cash reserve -> 422 MINIMUM_CASH_RESERVE_VIOLATION
    bank.opening_balance = new Prisma.Decimal('1050.00');
    const reserveRes = await request(app)
      .put('/api/transactions/txn-cc-rep-br07')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-04',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '1000.00' }]
      });
    expect(reserveRes.status).toBe(422);
    expect(reserveRes.body.error.code).toBe('MINIMUM_CASH_RESERVE_VIOLATION');

    // 4. Repayment equal to exact minimum floor (500.00 on 3000.00 debt, cash = 1050.00 -> leaves 550.00 >= 100.00) succeeds
    const minOkRes = await request(app)
      .put('/api/transactions/txn-cc-rep-br07')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '500.00',
        transaction_date: '2026-11-04',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '500.00' }]
      });
    expect(minOkRes.status).toBe(200);

    // 5. Ordinary multi-allocation CASH expense (Dining 200 + Grocery 100 = 300) is NOT treated as repayment and succeeds
    mockTransactions.push({
      id: 'txn-cash-exp-br07',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('200.00'),
      transaction_date: new Date('2026-11-05T00:00:00.000Z'),
      description: 'Cash lunch',
      created_at: new Date('2026-11-05T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-cash-exp-br07',
      transaction_id: 'txn-cash-exp-br07',
      target_account_id: 'acc-demo-dining',
      amount: new Prisma.Decimal('200.00'),
      notes: null
    });

    const cashExpRes = await request(app)
      .put('/api/transactions/txn-cash-exp-br07')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '300.00',
        transaction_date: '2026-11-05',
        allocations: [
          { target_account_id: 'acc-demo-dining', amount: '200.00' },
          { target_account_id: 'acc-demo-grocery', amount: '100.00' }
        ]
      });
    expect(cashExpRes.status).toBe(200);
  });

  it('TEST-CORR-SUBTYPE-01: explicitly validates LOAN_TAKEN subtypes (CREDIT_CARD, GENERAL_LOAN) and rejects DEFAULT, undefined, and unknown subtypes', async () => {
    const bank = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
    bank.opening_balance = new Prisma.Decimal('10000.00');

    // Add GENERAL_LOAN, DEFAULT, undefined, and unknown LOAN_TAKEN accounts
    mockAccounts.push(
      {
        id: 'acc-demo-gl',
        user_id: 'user-a-uuid',
        name: 'General Loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('2000.00'),
        is_opening_locked: true,
        created_at: new Date('2026-11-01T00:00:00.000Z')
      },
      {
        id: 'acc-demo-lt-default',
        user_id: 'user-a-uuid',
        name: 'Legacy Default Loan',
        type: 'LOAN_TAKEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('2000.00'),
        is_opening_locked: true,
        created_at: new Date('2026-11-01T00:00:00.000Z')
      },
      {
        id: 'acc-demo-lt-undef',
        user_id: 'user-a-uuid',
        name: 'Undefined Subtype Loan',
        type: 'LOAN_TAKEN',
        subtype: undefined,
        opening_balance: new Prisma.Decimal('2000.00'),
        is_opening_locked: true,
        created_at: new Date('2026-11-01T00:00:00.000Z')
      },
      {
        id: 'acc-demo-lt-unknown',
        user_id: 'user-a-uuid',
        name: 'Unknown Subtype Loan',
        type: 'LOAN_TAKEN',
        subtype: 'CRYPTO_LOAN' as any,
        opening_balance: new Prisma.Decimal('2000.00'),
        is_opening_locked: true,
        created_at: new Date('2026-11-01T00:00:00.000Z')
      }
    );

    mockTransactions.push({
      id: 'txn-gl-rep-sub',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'PAYMENT_CHARGE',
      total_amount: new Prisma.Decimal('300.00'),
      transaction_date: new Date('2026-11-04T00:00:00.000Z'),
      description: 'GL Repay',
      created_at: new Date('2026-11-04T08:00:00.000Z')
    });
    mockAllocationLines.push({
      id: 'alloc-gl-rep-sub',
      transaction_id: 'txn-gl-rep-sub',
      target_account_id: 'acc-demo-gl',
      amount: new Prisma.Decimal('300.00'),
      notes: null
    });

    // 1. Explicit GENERAL_LOAN repayment correction < 500 THB succeeds (exempt from BR-07 v1.1)
    const glOk = await request(app)
      .put('/api/transactions/txn-gl-rep-sub')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '200.00',
        transaction_date: '2026-11-04',
        allocations: [{ target_account_id: 'acc-demo-gl', amount: '200.00' }]
      });
    expect(glOk.status).toBe(200);

    // 2. DEFAULT, undefined, and unknown LOAN_TAKEN subtypes MUST all be rejected with 400 INVALID_ACCOUNT_SUBTYPE
    for (const badTargetId of ['acc-demo-lt-default', 'acc-demo-lt-undef', 'acc-demo-lt-unknown']) {
      const badRes = await request(app)
        .put('/api/transactions/txn-gl-rep-sub')
        .set('Origin', config.clientUrl)
        .set('Cookie', [`token=${userDemoToken}`])
        .send({
          total_amount: '600.00',
          transaction_date: '2026-11-04',
          allocations: [{ target_account_id: badTargetId, amount: '600.00' }]
        });
      expect(badRes.status).toBe(400);
      expect(badRes.body.error.code).toBe('INVALID_ACCOUNT_SUBTYPE');
    }
  });

  it('TEST-CORR-BAL-01: recalculates balances for original, replacement, and removed allocations across CASH, LOAN_TAKEN, and LOAN_GIVEN with full rollback', async () => {
    const bank = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
    bank.opening_balance = new Prisma.Decimal('10000.00');

    mockAccounts.push(
      {
        id: 'acc-demo-savings',
        user_id: 'user-a-uuid',
        name: 'Savings Cash',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        created_at: new Date('2026-11-01T00:00:00.000Z')
      },
      {
        id: 'acc-demo-lg',
        user_id: 'user-a-uuid',
        name: 'Friend Loan',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        created_at: new Date('2026-11-01T00:00:00.000Z')
      }
    );

    // 1. CASH: Transfer 1000 Checking -> Savings, then spend 800 from Savings.
    // Reassigning transfer allocation from Savings -> Dining leaves Savings at -800 -> 422 INSUFFICIENT_FUNDS + rollback
    mockTransactions.push(
      {
        id: 'txn-bal-xfer',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-02T00:00:00.000Z'),
        description: 'Fund Savings',
        created_at: new Date('2026-11-02T08:00:00.000Z')
      },
      {
        id: 'txn-bal-sav-spend',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-savings',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('800.00'),
        transaction_date: new Date('2026-11-03T00:00:00.000Z'),
        description: 'Spend Savings',
        created_at: new Date('2026-11-03T08:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      { id: 'al-bx-1', transaction_id: 'txn-bal-xfer', target_account_id: 'acc-demo-savings', amount: new Prisma.Decimal('1000.00'), notes: null },
      { id: 'al-bx-2', transaction_id: 'txn-bal-sav-spend', target_account_id: 'acc-demo-dining', amount: new Prisma.Decimal('800.00'), notes: null }
    );

    const cashFail = await request(app)
      .put('/api/transactions/txn-bal-xfer')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-02',
        allocations: [{ target_account_id: 'acc-demo-dining', amount: '1000.00' }]
      });
    expect(cashFail.status).toBe(422);
    expect(cashFail.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockAuditLogs).toHaveLength(0);

    // 2. LOAN_GIVEN: Disburse 1500, recover 1000. Reducing disbursement to 500 -> 422 RECOVERY_EXCEEDS_RECEIVABLE + rollback
    mockTransactions.push(
      {
        id: 'txn-bal-lg-disb',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('1500.00'),
        transaction_date: new Date('2026-11-04T00:00:00.000Z'),
        description: 'Loan Given',
        created_at: new Date('2026-11-04T08:00:00.000Z')
      },
      {
        id: 'txn-bal-lg-rec',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('1000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Loan Recovery',
        created_at: new Date('2026-11-05T08:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      { id: 'al-blg-1', transaction_id: 'txn-bal-lg-disb', target_account_id: 'acc-demo-lg', amount: new Prisma.Decimal('1500.00'), notes: null },
      { id: 'al-blg-2', transaction_id: 'txn-bal-lg-rec', target_account_id: 'acc-demo-lg', amount: new Prisma.Decimal('1000.00'), notes: null }
    );

    const lgFail = await request(app)
      .put('/api/transactions/txn-bal-lg-disb')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '500.00',
        transaction_date: '2026-11-04',
        allocations: [{ target_account_id: 'acc-demo-lg', amount: '500.00' }]
      });
    expect(lgFail.status).toBe(422);
    expect(lgFail.body.error.code).toBe('RECOVERY_EXCEEDS_RECEIVABLE');
    expect(mockAuditLogs).toHaveLength(0);
    expect(mockTransactions.find((t) => t.id === 'txn-bal-lg-disb')!.total_amount.toFixed(2)).toBe('1500.00');
  });

  it('TEST-CORR-CC-REPAY-01: verifies CC repayment correction (increase, decrease, below min, exceed debt, below cash reserve, Card A -> Card B target change) with summary & audit consistency', async () => {
    const bank = mockAccounts.find((a) => a.id === 'acc-demo-checking')!;
    bank.opening_balance = new Prisma.Decimal('1500.00');

    mockAccounts.push({
      id: 'acc-demo-cc-b',
      user_id: 'user-a-uuid',
      name: 'Mastercard B',
      type: 'LOAN_TAKEN',
      subtype: 'CREDIT_CARD',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: true,
      created_at: new Date('2026-11-01T00:00:00.000Z')
    });

    // Card A charge 3000, Card B charge 2000, initial repayment on Card A = 800
    // After initial state: Cash = 1500 - 800 = 700, Card A debt = 2200, Card B debt = 2000
    mockTransactions.push(
      {
        id: 'txn-cc-a-chg',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-cc',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'Card A Charge',
        created_at: new Date('2026-11-01T08:00:00.000Z')
      },
      {
        id: 'txn-cc-b-chg',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-cc-b',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('2000.00'),
        transaction_date: new Date('2026-11-01T00:00:00.000Z'),
        description: 'Card B Charge',
        created_at: new Date('2026-11-01T09:00:00.000Z')
      },
      {
        id: 'txn-cc-repay-5',
        user_id: 'user-a-uuid',
        primary_account_id: 'acc-demo-checking',
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('800.00'),
        transaction_date: new Date('2026-11-02T00:00:00.000Z'),
        description: 'Repay Card A',
        created_at: new Date('2026-11-02T08:00:00.000Z')
      }
    );
    mockAllocationLines.push(
      { id: 'al-ca', transaction_id: 'txn-cc-a-chg', target_account_id: 'acc-demo-dining', amount: new Prisma.Decimal('3000.00'), notes: null },
      { id: 'al-cb', transaction_id: 'txn-cc-b-chg', target_account_id: 'acc-demo-grocery', amount: new Prisma.Decimal('2000.00'), notes: null },
      { id: 'al-cr', transaction_id: 'txn-cc-repay-5', target_account_id: 'acc-demo-cc', amount: new Prisma.Decimal('800.00'), notes: 'Initial Card A' }
    );

    // 1. Increase repayment 800 -> 1200 (preRepaymentDebt=3000, Cash left=300 >= 100) -> 200 OK
    const incRes = await request(app)
      .put('/api/transactions/txn-cc-repay-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1200.00',
        transaction_date: '2026-11-02',
        description: 'Repay Card A Increased',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '1200.00', notes: 'Increased' }]
      });
    expect(incRes.status).toBe(200);
    expect(incRes.body.data.transaction.total_amount).toBe('1200.00');
    expect(incRes.body.data.transaction.allocations).toEqual([
      expect.objectContaining({ target_account_id: 'acc-demo-cc', amount: '1200.00' })
    ]);
    expect(mockAuditLogs[0].previous_snapshot.total_amount).toBe('800.00');
    expect(mockAuditLogs[0].new_snapshot.total_amount).toBe('1200.00');

    // 2a. Decrease repayment 1200 -> 600 (>= 500 min floor, Cash left=900) -> 200 OK
    const decOkRes = await request(app)
      .put('/api/transactions/txn-cc-repay-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '600.00',
        transaction_date: '2026-11-02',
        description: 'Repay Card A Decreased',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '600.00', notes: 'Decreased' }]
      });
    expect(decOkRes.status).toBe(200);
    expect(mockAuditLogs[1].previous_snapshot.total_amount).toBe('1200.00');
    expect(mockAuditLogs[1].new_snapshot.total_amount).toBe('600.00');

    // 2b. Decrease repayment below minimum floor (600 -> 400 < 500) -> 422 MIN_REPAYMENT_NOT_MET + rollback
    const decMinFail = await request(app)
      .put('/api/transactions/txn-cc-repay-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '400.00',
        transaction_date: '2026-11-02',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '400.00' }]
      });
    expect(decMinFail.status).toBe(422);
    expect(decMinFail.body.error.code).toBe('MIN_REPAYMENT_NOT_MET');
    expect(mockAuditLogs).toHaveLength(2);

    // 3. Repayment exceeding outstanding debt (3100 > 3000 preRepaymentDebt, no double-count!) -> 422 REPAYMENT_EXCEEDS_DEBT
    const exceedRes = await request(app)
      .put('/api/transactions/txn-cc-repay-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '3100.00',
        transaction_date: '2026-11-02',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '3100.00' }]
      });
    expect(exceedRes.status).toBe(422);
    expect(exceedRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');
    expect(mockAuditLogs).toHaveLength(2);

    // 4. Cash balance falling below minimum reserve (1450 leaves 50 < 100 reserve on 3000 debt) -> 422 MINIMUM_CASH_RESERVE_VIOLATION
    const reserveFail = await request(app)
      .put('/api/transactions/txn-cc-repay-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1450.00',
        transaction_date: '2026-11-02',
        allocations: [{ target_account_id: 'acc-demo-cc', amount: '1450.00' }]
      });
    expect(reserveFail.status).toBe(422);
    expect(reserveFail.body.error.code).toBe('MINIMUM_CASH_RESERVE_VIOLATION');
    expect(mockAuditLogs).toHaveLength(2);

    // 5. Change repayment target from Credit Card A -> Credit Card B (amount 1000) -> 200 OK
    const swapRes = await request(app)
      .put('/api/transactions/txn-cc-repay-5')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${userDemoToken}`])
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-02',
        description: 'Repay Card B Instead',
        allocations: [{ target_account_id: 'acc-demo-cc-b', amount: '1000.00', notes: 'Swapped to Card B' }]
      });
    expect(swapRes.status).toBe(200);
    expect(swapRes.body.data.transaction.allocations).toEqual([
      expect.objectContaining({ target_account_id: 'acc-demo-cc-b', amount: '1000.00' })
    ]);
    expect(mockAuditLogs).toHaveLength(3);
    expect(mockAuditLogs[2].previous_snapshot.allocations[0].target_account_id).toBe('acc-demo-cc');
    expect(mockAuditLogs[2].new_snapshot.allocations[0].target_account_id).toBe('acc-demo-cc-b');

    // Verify account summary: Cash = 500, Card A debt = 3000 (restored), Card B debt = 1000 (reduced), total credit_debt = 4000
    const summaryRes = await request(app).get('/api/reports/summary').set('Cookie', [`token=${userDemoToken}`]);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(500);
    expect(summaryRes.body.data.credit_debt).toBe(4000);
  });

  it('TEST-ADMIN-LAST-01: prevents deactivating the last active ADMIN while allowing deactivation when another active ADMIN exists (Task 8)', async () => {
    // Add a second active admin
    mockUsers.push({
      id: 'admin-2-uuid',
      username: 'admin_second',
      email: 'admin_second@whatsss.local',
      password_hash: mockUsers[2].password_hash,
      role: 'ADMIN',
      is_active: true,
      created_at: new Date('2026-11-02T00:00:00.000Z'),
      updated_at: new Date('2026-11-02T00:00:00.000Z')
    });

    // Deactivating admin-2 while admin-uuid is active succeeds (2 -> 1 active admins)
    const okDisable = await request(app)
      .patch('/api/admin/users/admin-2-uuid/status')
      .set('Origin', config.clientUrl)
      .set('Cookie', [`token=${adminToken}`])
      .send({ is_active: false });
    expect(okDisable.status).toBe(200);
    expect(okDisable.body.data.user.is_active).toBe(false);

    // Calling service directly simulating another caller trying to disable the last remaining active admin
    const { updateUserAccessStatus } = await import('../../src/services/admin.service.js');
    const { prisma } = await import('../../src/prisma.js');
    await expect(
      updateUserAccessStatus('system-other-admin', 'admin-uuid', { is_active: false }, prisma)
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'CANNOT_DEACTIVATE_LAST_ADMIN'
    });
  });
});
