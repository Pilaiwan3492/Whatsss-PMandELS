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
  resetMockTransactions,
  MOCK_UUIDS,
  useMockUuidAccounts
} from '../fixtures/mockPrisma.js';

vi.mock('../../src/prisma.js', () => {
  const mockPrismaObj: any = {
    $transaction: vi.fn(async (callback) => {
      return callback(mockPrismaObj);
    }),
    $queryRaw: vi.fn(async () => []),
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
            )
              continue;

            if (data.is_opening_locked !== undefined) {
              a.is_opening_locked = data.is_opening_locked;
            }
            if (data.updated_at) {
              a.updated_at = data.updated_at;
            }
            count++;
          }
          return { count };
        })
      },
      transaction: {
        create: vi.fn(async ({ data }) => {
          const tx = {
            id: `txn-xfer-${mockTransactions.length + 1}`,
            user_id: data.user_id,
            primary_account_id: data.primary_account_id,
            form: data.form,
            total_amount: new Prisma.Decimal(data.total_amount.toString()),
            transaction_date: data.transaction_date,
            description: data.description,
            is_favorite: false,
            created_at: new Date(),
            updated_at: new Date()
          };
          mockTransactions.push(tx);
          return tx;
        }),
        aggregate: vi.fn(async ({ where }) => {
          const matching = mockTransactions.filter((t) => {
            if (where?.user_id && t.user_id !== where.user_id) return false;
            if (where?.primary_account_id) {
              if (typeof where.primary_account_id === 'string') {
                if (t.primary_account_id !== where.primary_account_id) return false;
              } else if (where.primary_account_id.in) {
                if (!where.primary_account_id.in.includes(t.primary_account_id)) return false;
              }
            }
            if (where?.form && t.form !== where.form) return false;
            return true;
          });
          if (matching.length === 0) return { _sum: { total_amount: null } };
          const sum = matching.reduce(
            (acc, t) => acc.add(new Prisma.Decimal(t.total_amount.toString())),
            new Prisma.Decimal('0.00')
          );
          return { _sum: { total_amount: sum } };
        }),
        groupBy: vi.fn(async ({ where }) => {
          const matching = mockTransactions.filter((t) => {
            if (where?.user_id && t.user_id !== where.user_id) return false;
            if (
              where?.primary_account_id?.in &&
              !where.primary_account_id.in.includes(t.primary_account_id)
            )
              return false;
            if (where?.form && t.form !== where.form) return false;
            return true;
          });
          const map = new Map<string, Prisma.Decimal>();
          for (const t of matching) {
            const key = `${t.primary_account_id}:::${t.form}`;
            const prev = map.get(key) || new Prisma.Decimal('0.00');
            map.set(key, prev.add(new Prisma.Decimal(t.total_amount.toString())));
          }
          const rows: any[] = [];
          for (const [k, sum] of map.entries()) {
            const [primary_account_id, form] = k.split(':::');
            rows.push({
              primary_account_id,
              form,
              _sum: { total_amount: sum }
            });
          }
          return rows;
        })
      },
      allocationLine: {
        create: vi.fn(async ({ data }) => {
          const line = {
            id: `alloc-xfer-${mockAllocationLines.length + 1}`,
            transaction_id: data.transaction_id,
            target_account_id: data.target_account_id,
            amount: new Prisma.Decimal(data.amount.toString()),
            notes: data.notes ?? null
          };
          mockAllocationLines.push(line);
          return line;
        }),
        findMany: vi.fn(async ({ where }) => {
          return mockAllocationLines
            .filter((line) => {
              const tx = mockTransactions.find((t) => t.id === line.transaction_id);
              const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
              if (where?.transaction?.user_id && tx?.user_id !== where.transaction.user_id)
                return false;
              if (where?.transaction?.form && tx?.form !== where.transaction.form) return false;
              if (where?.target_account?.type && targetAcc?.type !== where.target_account.type)
                return false;
              return true;
            })
            .map((line) => {
              const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
              return {
                ...line,
                target_account: targetAcc ? { name: targetAcc.name, type: targetAcc.type } : null
              };
            });
        }),
        groupBy: vi.fn(async ({ where }) => {
          const matching = mockAllocationLines.filter((line) => {
            const tx = mockTransactions.find((t) => t.id === line.transaction_id);
            const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
            const primaryAcc = mockAccounts.find((a) => a.id === tx?.primary_account_id);

            if (
              where?.target_account_id?.in &&
              !where.target_account_id.in.includes(line.target_account_id)
            )
              return false;
            if (where?.target_account?.type && targetAcc?.type !== where.target_account.type)
              return false;
            if (where?.target_account?.user_id && targetAcc?.user_id !== where.target_account.user_id)
              return false;
            if (where?.transaction?.user_id && tx?.user_id !== where.transaction.user_id)
              return false;
            if (where?.transaction?.form && tx?.form !== where.transaction.form) return false;
            if (
              where?.transaction?.primary_account?.type &&
              primaryAcc?.type !== where.transaction.primary_account.type
            )
              return false;
            return true;
          });
          const map = new Map<string, Prisma.Decimal>();
          for (const l of matching) {
            const prev = map.get(l.target_account_id) || new Prisma.Decimal('0.00');
            map.set(l.target_account_id, prev.add(new Prisma.Decimal(l.amount.toString())));
          }
          const rows: any[] = [];
          for (const [target_account_id, sum] of map.entries()) {
            rows.push({
              target_account_id,
              _sum: { amount: sum }
            });
          }
          return rows;
        }),
        aggregate: vi.fn(async ({ where }) => {
          const matching = mockAllocationLines.filter((line) => {
            const tx = mockTransactions.find((t) => t.id === line.transaction_id);
            const targetAcc = mockAccounts.find((a) => a.id === line.target_account_id);
            const primaryAcc = mockAccounts.find((a) => a.id === tx?.primary_account_id);

            if (where?.target_account_id) {
              if (typeof where.target_account_id === 'string') {
                if (line.target_account_id !== where.target_account_id) return false;
              } else if (where.target_account_id.in) {
                if (!where.target_account_id.in.includes(line.target_account_id)) return false;
              }
            }
            if (where?.target_account?.type && targetAcc?.type !== where.target_account.type)
              return false;
            if (where?.target_account?.user_id && targetAcc?.user_id !== where.target_account.user_id)
              return false;
            if (where?.transaction?.user_id && tx?.user_id !== where.transaction.user_id)
              return false;
            if (where?.transaction?.form && tx?.form !== where.transaction.form) return false;
            if (
              where?.transaction?.primary_account?.type &&
              primaryAcc?.type !== where.transaction.primary_account.type
            )
              return false;
            return true;
          });
          if (matching.length === 0) return { _sum: { amount: null } };
          const sum = matching.reduce(
            (acc, l) => acc.add(new Prisma.Decimal(l.amount.toString())),
            new Prisma.Decimal('0.00')
          );
          return { _sum: { amount: sum } };
        })
      }
  };
  return { prisma: mockPrismaObj };
});

import { app } from '../../src/app.js';
import { prisma } from '../../src/prisma.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';
const DEMO_SAVINGS_UUID = '11111111-1111-4111-8111-111111111106';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign({ userId, username, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any
  });
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

describe('Feature F-11: Internal Cash Transfer (WP-08, FR-13, BR-02, AC-11-1..4)', () => {
  const userACookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');
  const adminCookie = createAuthCookie('admin-uuid', 'admin_demo', 'ADMIN');

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();
    useMockUuidAccounts();

    // Seed Checking Bank (10,000.00) and Savings Bank (2,000.00) for user_demo
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    checking.opening_balance = new Prisma.Decimal('10000.00');
    checking.is_opening_locked = false;

    mockAccounts.push({
      id: DEMO_SAVINGS_UUID,
      user_id: 'user-a-uuid',
      name: 'Savings Bank',
      normalized_name: 'savings bank',
      type: 'CASH',
      subtype: 'DEFAULT',
      opening_balance: new Prisma.Decimal('2000.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date('2026-11-01T00:00:05.000Z'),
      updated_at: new Date('2026-11-01T00:00:05.000Z')
    });

    vi.clearAllMocks();
  });

  it('TEST-XFER-01: transfers 3000.00 THB from Checking Bank (10000.00) to Savings Bank (2000.00), updating balances to 7000.00 and 5000.00 and locking both opening balances (AC-11-1, FR-13)', async () => {
    const res = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 3000.00,
        transaction_date: '2026-11-10',
        description: 'Monthly Savings Transfer'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated_from_cash_balance).toBe('7000.00');
    expect(res.body.data.updated_to_cash_balance).toBe('5000.00');
    expect(res.body.data.transaction.form).toBe('PAYMENT_CHARGE');
    expect(res.body.data.transaction.primary_account_id).toBe(MOCK_UUIDS.DEMO_CHECKING);
    expect(res.body.data.transaction.allocations).toHaveLength(1);
    expect(res.body.data.transaction.allocations[0].target_account_id).toBe(DEMO_SAVINGS_UUID);

    // Verify both accounts are locked
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    const savings = mockAccounts.find((a) => a.id === DEMO_SAVINGS_UUID)!;
    expect(checking.is_opening_locked).toBe(true);
    expect(savings.is_opening_locked).toBe(true);

    // Verify GET /api/accounts reflects dynamic current_balance on both accounts
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', userACookie);
    expect(accRes.status).toBe(200);
    const checkingInList = accRes.body.data.accounts.find(
      (a: any) => a.id === MOCK_UUIDS.DEMO_CHECKING
    );
    const savingsInList = accRes.body.data.accounts.find((a: any) => a.id === DEMO_SAVINGS_UUID);
    expect(checkingInList.current_balance).toBe(7000.00);
    expect(savingsInList.current_balance).toBe(5000.00);
  });

  it('TEST-XFER-02: conserves aggregate bank_balance (12000.00 THB) and adds 0.00 to total_income and total_expense in GET /api/reports/summary (AC-11-2, BR-02)', async () => {
    const beforeSummary = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(beforeSummary.status).toBe(200);
    expect(beforeSummary.body.data.bank_balance).toBe(12000.00);
    expect(beforeSummary.body.data.total_income).toBe(0.00);
    expect(beforeSummary.body.data.total_expense).toBe(0.00);

    const xferRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 3000.00,
        transaction_date: '2026-11-10',
        description: 'Internal Transfer'
      });
    expect(xferRes.status).toBe(201);

    const afterSummary = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(afterSummary.status).toBe(200);
    expect(afterSummary.body.data.bank_balance).toBe(12000.00);
    expect(afterSummary.body.data.total_income).toBe(0.00);
    expect(afterSummary.body.data.total_expense).toBe(0.00);
  });

  it('TEST-XFER-03: rejects same-account transfers, non-CASH account transfers, archived accounts, and invalid amount/date/description with zero DB writes (AC-11-3)', async () => {
    // (a) Same account transfer -> 400 SAME_ACCOUNT_TRANSFER
    const sameRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 500.00,
        transaction_date: '2026-11-10'
      });
    expect(sameRes.status).toBe(400);
    expect(sameRes.body.error.code).toBe('SAME_ACCOUNT_TRANSFER');

    // (b) Non-CASH destination (EXPENSE or LOAN_TAKEN) -> 400 INVALID_ACCOUNT_TYPE
    const nonCashRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.DEMO_DINING,
        amount: 500.00,
        transaction_date: '2026-11-10'
      });
    expect(nonCashRes.status).toBe(400);
    expect(nonCashRes.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    // (c) Invalid amounts: 0.00, 100.123, "1e3" -> 400 INVALID_AMOUNT
    for (const badAmt of [0.00, -100, 100.123, '1e3']) {
      const badAmtRes = await request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: DEMO_SAVINGS_UUID,
          amount: badAmt,
          transaction_date: '2026-11-10'
        });
      expect(badAmtRes.status).toBe(400);
      expect(badAmtRes.body.error.code).toBe('INVALID_AMOUNT');
    }

    // (d) Invalid date "2026-02-30" or description > 255 chars
    const badDateRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 500.00,
        transaction_date: '2026-02-30'
      });
    expect(badDateRes.status).toBe(400);
    expect(badDateRes.body.error.code).toBe('INVALID_TRANSACTION_DATE');

    const badDescRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 500.00,
        transaction_date: '2026-11-10',
        description: 'x'.repeat(256)
      });
    expect(badDescRes.status).toBe(400);
    expect(badDescRes.body.error.code).toBe('INVALID_DESCRIPTION');

    // (e) Archived account guard -> 422 ACCOUNT_ARCHIVED
    const savings = mockAccounts.find((a) => a.id === DEMO_SAVINGS_UUID)!;
    savings.is_archived = true;
    const archivedRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 500.00,
        transaction_date: '2026-11-10'
      });
    expect(archivedRes.status).toBe(422);
    expect(archivedRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    expect(mockTransactions).toHaveLength(0);
  });

  it('TEST-XFER-04: rejects transfer exceeding source CASH balance with 422 INSUFFICIENT_FUNDS and zero records written (AC-11-3)', async () => {
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    checking.opening_balance = new Prisma.Decimal('1000.00');

    const res = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 1500.00,
        transaction_date: '2026-11-10'
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockTransactions).toHaveLength(0);
    expect(checking.is_opening_locked).toBe(false);
  });

  it('TEST-XFER-05: rejects cross-tenant transfers with 404 NOT_FOUND (BR-01) and ADMIN requests with 403 Forbidden (BR-10) (AC-11-4)', async () => {
    // (a) user_demo attempts to transfer to user_other's CASH account -> 404 NOT_FOUND
    const crossToRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.OTHER_CHECKING,
        amount: 500.00,
        transaction_date: '2026-11-10'
      });
    expect(crossToRes.status).toBe(404);
    expect(crossToRes.body.error.code).toBe('NOT_FOUND');

    // (b) admin_demo attempts transfer -> 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN
    const adminRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', adminCookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 500.00,
        transaction_date: '2026-11-10'
      });
    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
    expect(mockTransactions).toHaveLength(0);
  });

  it('TEST-XFER-06: serializes concurrent transfers under row locks (acquireAccountRowLocks) preventing negative balance and deadlocks on bidirectional transfers (AC-11-3)', async () => {
    // Serialize $transaction callbacks via a mutex to simulate PostgreSQL SELECT ... FOR UPDATE row lock serialization
    let mutex = Promise.resolve();
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: any) => {
      const prev = mutex;
      let release!: () => void;
      mutex = new Promise<void>((r) => {
        release = r;
      });
      await prev;
      try {
        return await callback(prisma);
      } finally {
        release();
      }
    }) as any);

    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    const savings = mockAccounts.find((a) => a.id === DEMO_SAVINGS_UUID)!;
    checking.opening_balance = new Prisma.Decimal('2000.00');
    savings.opening_balance = new Prisma.Decimal('0.00');

    // (a) Two concurrent 1500.00 THB transfers from Checking (2000.00) to Savings (0.00)
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: DEMO_SAVINGS_UUID,
          amount: 1500.00,
          transaction_date: '2026-11-10'
        }),
      request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: DEMO_SAVINGS_UUID,
          amount: 1500.00,
          transaction_date: '2026-11-10'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const failed = res1.status === 422 ? res1 : res2;
    expect(failed.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockTransactions).toHaveLength(1);

    // (b) Bidirectional transfer Checking (now 500.00) -> Savings (1500.00) of 200.00 and Savings -> Checking of 400.00
    const [bi1, bi2] = await Promise.all([
      request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: DEMO_SAVINGS_UUID,
          amount: 200.00,
          transaction_date: '2026-11-10'
        }),
      request(app)
        .post('/api/transactions/transfer')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: DEMO_SAVINGS_UUID,
          to_account_id: MOCK_UUIDS.DEMO_CHECKING,
          amount: 400.00,
          transaction_date: '2026-11-10'
        })
    ]);

    expect(bi1.status).toBe(201);
    expect(bi2.status).toBe(201);

    // Total cash across Checking (500 - 200 + 400 = 700) and Savings (1500 + 200 - 400 = 1300) remains 2000.00
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(summaryRes.body.data.bank_balance).toBe(2000.00);
  });
});
