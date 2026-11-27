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
          id: `txn-loan-${mockTransactions.length + 1}`,
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
          id: `alloc-loan-${mockAllocationLines.length + 1}`,
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
const FRIEND_LOAN_UUID = '11111111-1111-4111-8111-111111111107';
const OTHER_FRIEND_LOAN_UUID = '22222222-2222-4222-8222-222222222207';
const PERSONAL_LOAN_UUID = '11111111-1111-4111-8111-111111111108';
const OTHER_PERSONAL_LOAN_UUID = '22222222-2222-4222-8222-222222222208';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign({ userId, username, role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any
  });
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

describe('Work Package WP-09: Peer Lending (F-12) & General Borrowing (F-13) (Issue #57)', () => {
  const userACookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');
  const adminCookie = createAuthCookie('admin-uuid', 'admin_demo', 'ADMIN');

  beforeEach(() => {
    resetMockAccounts();
    useMockUuidAccounts();
    resetMockTransactions();
    vi.clearAllMocks();

    // Configure Checking Bank with 10000.00 THB opening balance
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING);
    if (checking) {
      checking.opening_balance = new Prisma.Decimal('10000.00');
      checking.is_opening_locked = false;
      checking.is_archived = false;
    }

    // Add Friend Loan (LOAN_GIVEN) for user_demo
    mockAccounts.push({
      id: FRIEND_LOAN_UUID,
      user_id: 'user-a-uuid',
      name: 'Friend Loan',
      normalized_name: 'friend loan',
      type: 'LOAN_GIVEN',
      subtype: 'DEFAULT',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date('2026-11-01T00:05:00Z'),
      updated_at: new Date('2026-11-01T00:05:00Z')
    });

    // Add Personal Loan (LOAN_TAKEN, subtype: 'GENERAL_LOAN') for user_demo
    mockAccounts.push({
      id: PERSONAL_LOAN_UUID,
      user_id: 'user-a-uuid',
      name: 'Personal Loan',
      normalized_name: 'personal loan',
      type: 'LOAN_TAKEN',
      subtype: 'GENERAL_LOAN',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date('2026-11-01T00:06:00Z'),
      updated_at: new Date('2026-11-01T00:06:00Z')
    });

    // Add foreign accounts for user_other
    mockAccounts.push({
      id: OTHER_FRIEND_LOAN_UUID,
      user_id: 'user-b-uuid',
      name: 'Other Friend Loan',
      normalized_name: 'other friend loan',
      type: 'LOAN_GIVEN',
      subtype: 'DEFAULT',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date('2026-11-01T00:05:00Z'),
      updated_at: new Date('2026-11-01T00:05:00Z')
    });

    mockAccounts.push({
      id: OTHER_PERSONAL_LOAN_UUID,
      user_id: 'user-b-uuid',
      name: 'Other Personal Loan',
      normalized_name: 'other personal loan',
      type: 'LOAN_TAKEN',
      subtype: 'GENERAL_LOAN',
      opening_balance: new Prisma.Decimal('0.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date('2026-11-01T00:06:00Z'),
      updated_at: new Date('2026-11-01T00:06:00Z')
    });
  });

  // =========================================================================
  // Feature F-12: Peer Lending — Loan Given & Recovery (TEST-LOAN-GIVEN-01..05)
  // =========================================================================

  it('TEST-LOAN-GIVEN-01: disburses 2500.00 THB from Checking Bank (10000.00) to Friend Loan (0.00), updates CASH to 7500.00 and receivable to 2500.00, locks opening balances, and keeps total_expense at 0.00 (AC-12-1, FR-14, BR-08)', async () => {
    const res = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 2500.00,
        transaction_date: '2026-11-12',
        description: 'Lent to friend for emergency'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated_cash_balance).toBe('7500.00');
    expect(res.body.data.updated_receivable).toBe('2500.00');
    expect(res.body.data.transaction.form).toBe('PAYMENT_CHARGE');
    expect(res.body.data.transaction.primary_account_id).toBe(MOCK_UUIDS.DEMO_CHECKING);
    expect(res.body.data.transaction.allocations[0].target_account_id).toBe(FRIEND_LOAN_UUID);

    // Verify account balances and opening balance locks via GET /api/accounts
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', userACookie);
    expect(accRes.status).toBe(200);
    const checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === MOCK_UUIDS.DEMO_CHECKING);
    const friendLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === FRIEND_LOAN_UUID);
    expect(checkingAcc.current_balance).toBe(7500.00);
    expect(friendLoanAcc.current_balance).toBe(2500.00);
    expect(checkingAcc.is_opening_locked).toBe(true);
    expect(friendLoanAcc.is_opening_locked).toBe(true);

    // Verify GET /api/reports/summary: total_expense and total_income remain 0.00 (BR-08)
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(7500.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
  });

  it('TEST-LOAN-GIVEN-02: recovers partial (1000.00) then remaining (1500.00) loan receivable into Checking Bank, restoring CASH to 10000.00 and receivable to 0.00 while total_income remains 0.00 (AC-12-2, FR-14, BR-08)', async () => {
    // Prerequisite: Disburse 2500.00 THB
    const disburseRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 2500.00,
        transaction_date: '2026-11-12',
        description: 'Initial loan given'
      });
    expect(disburseRes.status).toBe(201);

    // 1. Partial recovery of 1000.00 THB
    const rec1 = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: FRIEND_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 1000.00,
        transaction_date: '2026-11-15',
        description: 'Partial loan repayment received'
      });
    expect(rec1.status).toBe(201);
    expect(rec1.body.data.updated_cash_balance).toBe('8500.00');
    expect(rec1.body.data.updated_receivable).toBe('1500.00');
    expect(rec1.body.data.transaction.form).toBe('RECEIVE_MONEY');
    expect(rec1.body.data.transaction.primary_account_id).toBe(MOCK_UUIDS.DEMO_CHECKING);
    expect(rec1.body.data.transaction.allocations[0].target_account_id).toBe(FRIEND_LOAN_UUID);

    // 2. Final recovery of 1500.00 THB
    const rec2 = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: FRIEND_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 1500.00,
        transaction_date: '2026-11-18',
        description: 'Final loan repayment received'
      });
    expect(rec2.status).toBe(201);
    expect(rec2.body.data.updated_cash_balance).toBe('10000.00');
    expect(rec2.body.data.updated_receivable).toBe('0.00');

    // Verify GET /api/accounts and GET /api/reports/summary (BR-08)
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', userACookie);
    const checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === MOCK_UUIDS.DEMO_CHECKING);
    const friendLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === FRIEND_LOAN_UUID);
    expect(checkingAcc.current_balance).toBe(10000.00);
    expect(friendLoanAcc.current_balance).toBe(0.00);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(summaryRes.body.data.bank_balance).toBe(10000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-LOAN-GIVEN-03: rejects insufficient cash disbursement (422 INSUFFICIENT_FUNDS), over-recovery (422 RECOVERY_EXCEEDS_RECEIVABLE), zero-receivable recovery (422 ZERO_OUTSTANDING_RECEIVABLE), archived accounts (422 ACCOUNT_ARCHIVED), and invalid payloads (400) with zero database writes (AC-12-3)', async () => {
    // (a) Disburse 15000.00 when CASH = 10000.00 -> 422 INSUFFICIENT_FUNDS
    const insuffRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 15000.00,
        transaction_date: '2026-11-12'
      });
    expect(insuffRes.status).toBe(422);
    expect(insuffRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockTransactions).toHaveLength(0);

    // (c) Recover 100.00 when receivable is 0.00 -> 422 ZERO_OUTSTANDING_RECEIVABLE
    const zeroRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: FRIEND_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 100.00,
        transaction_date: '2026-11-12'
      });
    expect(zeroRecRes.status).toBe(422);
    expect(zeroRecRes.body.error.code).toBe('ZERO_OUTSTANDING_RECEIVABLE');
    expect(mockTransactions).toHaveLength(0);

    // Disburse 2500.00 THB so receivable = 2500.00
    await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 2500.00,
        transaction_date: '2026-11-12'
      });
    expect(mockTransactions).toHaveLength(1);

    // (b) Recover 3000.00 when receivable = 2500.00 -> 422 RECOVERY_EXCEEDS_RECEIVABLE
    const overRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: FRIEND_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 3000.00,
        transaction_date: '2026-11-13'
      });
    expect(overRecRes.status).toBe(422);
    expect(overRecRes.body.error.code).toBe('RECOVERY_EXCEEDS_RECEIVABLE');
    expect(mockTransactions).toHaveLength(1);

    // (d) Invalid amounts (0, 10.123, "1e2"), invalid date ("2026-13-01"), description > 255 chars -> 400
    for (const badAmount of [0, -50, 10.123, '1e2']) {
      const badAmtRes = await request(app)
        .post('/api/transactions/loan-given')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: FRIEND_LOAN_UUID,
          amount: badAmount,
          transaction_date: '2026-11-12'
        });
      expect(badAmtRes.status).toBe(400);
      expect(badAmtRes.body.error.code).toBe('INVALID_AMOUNT');
    }

    const badDateRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 100.00,
        transaction_date: '2026-13-01'
      });
    expect(badDateRes.status).toBe(400);
    expect(badDateRes.body.error.code).toBe('INVALID_TRANSACTION_DATE');

    const badDescRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 100.00,
        transaction_date: '2026-11-12',
        description: 'X'.repeat(256)
      });
    expect(badDescRes.status).toBe(400);
    expect(badDescRes.body.error.code).toBe('INVALID_DESCRIPTION');

    // (e) Archived Account Guard -> 422 ACCOUNT_ARCHIVED
    const friendLoan = mockAccounts.find((a) => a.id === FRIEND_LOAN_UUID)!;
    friendLoan.is_archived = true;

    const archivedGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 100.00,
        transaction_date: '2026-11-12'
      });
    expect(archivedGiveRes.status).toBe(422);
    expect(archivedGiveRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const archivedRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: FRIEND_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 100.00,
        transaction_date: '2026-11-12'
      });
    expect(archivedRecRes.status).toBe(422);
    expect(archivedRecRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    friendLoan.is_archived = false;
    expect(mockTransactions).toHaveLength(1);
  });

  it('TEST-LOAN-GIVEN-04: enforces tenancy isolation (404 NOT_FOUND on foreign accounts), account type checks (400 INVALID_ACCOUNT_TYPE), and ADMIN financial exclusion (403 Forbidden) (AC-12-4, BR-01, BR-10)', async () => {
    // (a) Cross-tenant target on loan-given and loan-recovery -> 404 NOT_FOUND
    const foreignGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: OTHER_FRIEND_LOAN_UUID,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(foreignGiveRes.status).toBe(404);
    expect(foreignGiveRes.body.error.code).toBe('NOT_FOUND');

    const foreignRecRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: OTHER_FRIEND_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(foreignRecRes.status).toBe(404);
    expect(foreignRecRes.body.error.code).toBe('NOT_FOUND');

    // (b) Non-LOAN_GIVEN target on loan-given or non-LOAN_GIVEN source on loan-recovery -> 400 INVALID_ACCOUNT_TYPE
    const wrongTypeGive = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.DEMO_DINING,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(wrongTypeGive.status).toBe(400);
    expect(wrongTypeGive.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    const wrongTypeRec = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_SALARY,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(wrongTypeRec.status).toBe(400);
    expect(wrongTypeRec.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    // (c) ADMIN blocked with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN
    const adminGiveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', adminCookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(adminGiveRes.status).toBe(403);
    expect(adminGiveRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
  });

  it('TEST-LOAN-GIVEN-05: serializes concurrent loan-recovery requests under sorted row locks so only 1 succeeds when total exceeds receivable and receivable never becomes negative (AC-12-3)', async () => {
    // Set Friend Loan opening receivable = 2000.00 THB
    const friendLoan = mockAccounts.find((a) => a.id === FRIEND_LOAN_UUID)!;
    friendLoan.opening_balance = new Prisma.Decimal('2000.00');

    // Serialize $transaction callbacks to simulate PostgreSQL SELECT ... FOR UPDATE row locking
    let txQueue = Promise.resolve();
    (prisma.$transaction as any).mockImplementation((cb: any) => {
      const next = txQueue.then(() => cb(prisma));
      txQueue = next.catch(() => {});
      return next;
    });

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/loan-recovery')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: FRIEND_LOAN_UUID,
          to_account_id: MOCK_UUIDS.DEMO_CHECKING,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent Recovery 1'
        }),
      request(app)
        .post('/api/transactions/loan-recovery')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: FRIEND_LOAN_UUID,
          to_account_id: MOCK_UUIDS.DEMO_CHECKING,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent Recovery 2'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.data.updated_receivable).toBe('500.00');
    expect(successRes.body.data.updated_cash_balance).toBe('11500.00');
    expect(failedRes.body.error.code).toBe('RECOVERY_EXCEEDS_RECEIVABLE');
    expect(mockTransactions).toHaveLength(1);
  });

  // =========================================================================
  // Feature F-13: General Borrowing — Loan Taken & Repayment (TEST-LOAN-TAKEN-01..05)
  // =========================================================================

  it('TEST-LOAN-TAKEN-01: records 4000.00 THB borrowed from Personal Loan (GENERAL_LOAN, debt = 0.00) into Checking Bank (5000.00), increasing CASH to 9000.00 and debt to 4000.00 while total_income remains 0.00 (AC-13-1, FR-15, BR-08)', async () => {
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    checking.opening_balance = new Prisma.Decimal('5000.00');

    const res = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: PERSONAL_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 4000.00,
        transaction_date: '2026-11-12',
        description: 'Education loan disbursement'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated_cash_balance).toBe('9000.00');
    expect(res.body.data.updated_debt).toBe('4000.00');
    expect(res.body.data.transaction.form).toBe('RECEIVE_MONEY');
    expect(res.body.data.transaction.primary_account_id).toBe(MOCK_UUIDS.DEMO_CHECKING);
    expect(res.body.data.transaction.allocations[0].target_account_id).toBe(PERSONAL_LOAN_UUID);

    // Verify GET /api/accounts and GET /api/reports/summary (BR-08)
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', userACookie);
    const checkingAcc = accRes.body.data.accounts.find((a: any) => a.id === MOCK_UUIDS.DEMO_CHECKING);
    const personalLoanAcc = accRes.body.data.accounts.find((a: any) => a.id === PERSONAL_LOAN_UUID);
    expect(checkingAcc.current_balance).toBe(9000.00);
    expect(personalLoanAcc.current_balance).toBe(4000.00);
    expect(checkingAcc.is_opening_locked).toBe(true);
    expect(personalLoanAcc.is_opening_locked).toBe(true);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(summaryRes.body.data.bank_balance).toBe(9000.00);
    expect(summaryRes.body.data.credit_debt).toBe(4000.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
  });

  it('TEST-LOAN-TAKEN-02: repays general loan principal with amounts below the 500.00 THB credit-card floor (200.00 THB) and leaving < 100.00 THB cash (50.00 THB remaining), decreasing CASH and debt while total_expense remains 0.00 (AC-13-2, FR-15, BR-08)', async () => {
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    checking.opening_balance = new Prisma.Decimal('0.00');

    // Borrow 4000.00 THB -> CASH = 4000.00, Personal Loan debt = 4000.00
    const borrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: PERSONAL_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 4000.00,
        transaction_date: '2026-11-12'
      });
    expect(borrowRes.status).toBe(201);

    // 1. Repay 200.00 THB (< 500.00 THB credit card minimum floor) -> 201 Created!
    const repay1 = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 200.00,
        transaction_date: '2026-11-15',
        description: 'Small general loan principal installment'
      });
    expect(repay1.status).toBe(201);
    expect(repay1.body.data.updated_cash_balance).toBe('3800.00');
    expect(repay1.body.data.updated_debt).toBe('3800.00');

    // 2. Repay 3750.00 THB (partial repayment leaving 50.00 THB cash, which is < 100.00 THB credit card reserve) -> 201 Created!
    const repay2 = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 3750.00,
        transaction_date: '2026-11-16',
        description: 'Partial repayment leaving 50 THB cash'
      });
    expect(repay2.status).toBe(201);
    expect(repay2.body.data.updated_cash_balance).toBe('50.00');
    expect(repay2.body.data.updated_debt).toBe('50.00');

    // 3. Full repayment of remaining 50.00 THB general loan debt -> debt and cash return to 0.00
    const repay3 = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 50.00,
        transaction_date: '2026-11-17',
        description: 'Full final general loan principal settlement'
      });
    expect(repay3.status).toBe(201);
    expect(repay3.body.data.updated_cash_balance).toBe('0.00');
    expect(repay3.body.data.updated_debt).toBe('0.00');

    // Verify GET /api/reports/summary: total_expense remains 0.00 (BR-08) and debt is 0.00
    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(summaryRes.body.data.bank_balance).toBe(0.00);
    expect(summaryRes.body.data.credit_debt).toBe(0.00);
    expect(summaryRes.body.data.total_expense).toBe(0.00);
    expect(summaryRes.body.data.total_income).toBe(0.00);
  });

  it('TEST-LOAN-TAKEN-03: rejects general loan over-repayment (422 REPAYMENT_EXCEEDS_DEBT), zero-debt repayment (422 ZERO_OUTSTANDING_DEBT), insufficient cash (422 INSUFFICIENT_FUNDS), archived accounts (422 ACCOUNT_ARCHIVED), and invalid payloads (400) with zero database writes (AC-13-3)', async () => {
    // (b) Repay 100.00 when general loan debt is 0.00 -> 422 ZERO_OUTSTANDING_DEBT
    const zeroDebtRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 100.00,
        transaction_date: '2026-11-12'
      });
    expect(zeroDebtRes.status).toBe(422);
    expect(zeroDebtRes.body.error.code).toBe('ZERO_OUTSTANDING_DEBT');
    expect(mockTransactions).toHaveLength(0);

    // Configure Personal Loan debt = 4000.00, Checking Bank cash = 1000.00
    const personalLoan = mockAccounts.find((a) => a.id === PERSONAL_LOAN_UUID)!;
    personalLoan.opening_balance = new Prisma.Decimal('4000.00');
    const checking = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING)!;
    checking.opening_balance = new Prisma.Decimal('1000.00');

    // (a) Repay 5000.00 on 4000.00 debt -> 422 REPAYMENT_EXCEEDS_DEBT
    const overRepayRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 5000.00,
        transaction_date: '2026-11-12'
      });
    expect(overRepayRes.status).toBe(422);
    expect(overRepayRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');
    expect(mockTransactions).toHaveLength(0);

    // (c) Repay 3000.00 on 4000.00 debt when CASH = 1000.00 -> 422 INSUFFICIENT_FUNDS
    const insuffRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 3000.00,
        transaction_date: '2026-11-12'
      });
    expect(insuffRes.status).toBe(422);
    expect(insuffRes.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(mockTransactions).toHaveLength(0);

    // (d) Invalid amounts/dates/descriptions -> 400
    for (const badAmount of [0, -100, 25.999, '1e3']) {
      const badAmtRes = await request(app)
        .post('/api/transactions/loan-repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: PERSONAL_LOAN_UUID,
          amount: badAmount,
          transaction_date: '2026-11-12'
        });
      expect(badAmtRes.status).toBe(400);
      expect(badAmtRes.body.error.code).toBe('INVALID_AMOUNT');
    }

    const badDateRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: PERSONAL_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 500.00,
        transaction_date: '2026-02-30'
      });
    expect(badDateRes.status).toBe(400);
    expect(badDateRes.body.error.code).toBe('INVALID_TRANSACTION_DATE');

    // (e) Archived Account Guard -> 422 ACCOUNT_ARCHIVED
    personalLoan.is_archived = true;
    const archivedBorrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: PERSONAL_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(archivedBorrowRes.status).toBe(422);
    expect(archivedBorrowRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const archivedRepayRes = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 500.00,
        transaction_date: '2026-11-12'
      });
    expect(archivedRepayRes.status).toBe(422);
    expect(archivedRepayRes.body.error.code).toBe('ACCOUNT_ARCHIVED');

    personalLoan.is_archived = false;
    expect(mockTransactions).toHaveLength(0);
  });

  it('TEST-LOAN-TAKEN-04: enforces strict domain separation between Credit Cards (F-07, subtype CREDIT_CARD) and General Loans (F-13, subtype GENERAL_LOAN) with 400 INVALID_ACCOUNT_TYPE (AC-13-4, BR-07 v1.1)', async () => {
    const personalLoan = mockAccounts.find((a) => a.id === PERSONAL_LOAN_UUID)!;
    personalLoan.opening_balance = new Prisma.Decimal('4000.00');
    const visaCard = mockAccounts.find((a) => a.id === MOCK_UUIDS.DEMO_CC)!;
    visaCard.opening_balance = new Prisma.Decimal('3000.00');

    // (a) Submitting Personal Loan (subtype: GENERAL_LOAN) to Credit Card Repayment POST /api/transactions/repayment (F-07) -> 400 INVALID_ACCOUNT_TYPE
    const generalToCcRepay = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 1000.00,
        transaction_date: '2026-11-12'
      });
    expect(generalToCcRepay.status).toBe(400);
    expect(generalToCcRepay.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    // (b) Submitting Visa Credit Card (subtype: CREDIT_CARD) to General Loan POST /api/transactions/loan-repayment or loan-borrowing (F-13) -> 400 INVALID_ACCOUNT_TYPE
    const ccToGeneralRepay = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.DEMO_CC,
        amount: 1000.00,
        transaction_date: '2026-11-12'
      });
    expect(ccToGeneralRepay.status).toBe(400);
    expect(ccToGeneralRepay.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    const ccToGeneralBorrow = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CC,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 1000.00,
        transaction_date: '2026-11-12'
      });
    expect(ccToGeneralBorrow.status).toBe(400);
    expect(ccToGeneralBorrow.body.error.code).toBe('INVALID_ACCOUNT_TYPE');

    // Also verify cross-tenant 404 on loan-borrowing / loan-repayment
    const foreignBorrow = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: OTHER_PERSONAL_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 1000.00,
        transaction_date: '2026-11-12'
      });
    expect(foreignBorrow.status).toBe(404);
    expect(foreignBorrow.body.error.code).toBe('NOT_FOUND');

    expect(mockTransactions).toHaveLength(0);
  });

  it('TEST-LOAN-TAKEN-05: serializes concurrent general loan repayment requests under sorted row locks so only 1 succeeds when total exceeds debt and general loan debt never becomes negative (AC-13-3)', async () => {
    const personalLoan = mockAccounts.find((a) => a.id === PERSONAL_LOAN_UUID)!;
    personalLoan.opening_balance = new Prisma.Decimal('2000.00');

    let txQueue = Promise.resolve();
    (prisma.$transaction as any).mockImplementation((cb: any) => {
      const next = txQueue.then(() => cb(prisma));
      txQueue = next.catch(() => {});
      return next;
    });

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/transactions/loan-repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: PERSONAL_LOAN_UUID,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent General Loan Repayment 1'
        }),
      request(app)
        .post('/api/transactions/loan-repayment')
        .set('Origin', TRUSTED_ORIGIN)
        .set('Content-Type', 'application/json')
        .set('Cookie', userACookie)
        .send({
          from_account_id: MOCK_UUIDS.DEMO_CHECKING,
          to_account_id: PERSONAL_LOAN_UUID,
          amount: 1500.00,
          transaction_date: '2026-11-15',
          description: 'Concurrent General Loan Repayment 2'
        })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 422]);

    const successRes = res1.status === 201 ? res1 : res2;
    const failedRes = res1.status === 422 ? res1 : res2;

    expect(successRes.body.data.updated_debt).toBe('500.00');
    expect(successRes.body.data.updated_cash_balance).toBe('8500.00');
    expect(failedRes.body.error.code).toBe('REPAYMENT_EXCEEDS_DEBT');
    expect(mockTransactions).toHaveLength(1);
  });

  it('Multi-Workflow Ledger & Report Consistency Regression: executes Income (F-04), CC Purchase (F-05), CC Repayment (F-07 / BR-07 v1.1), Internal Cash Transfer (F-11 / BR-02), Loan Given & Recovery (F-12 / BR-08), and General Loan Borrowing & Repayment (F-13 / BR-08) without double counting and verifies /api/accounts matches /api/reports/summary', async () => {
    const DEMO_SAVINGS_UUID = '11111111-1111-4111-8111-111111111109';
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
      created_at: new Date('2026-11-01T00:07:00Z'),
      updated_at: new Date('2026-11-01T00:07:00Z')
    });

    // 1. Income: +20000.00 into Checking (10000 + 20000 = 30000)
    const incRes = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        primary_account_id: MOCK_UUIDS.DEMO_CHECKING,
        income_account_id: MOCK_UUIDS.DEMO_SALARY,
        total_amount: '20000.00',
        transaction_date: '2026-11-01',
        description: 'Monthly Salary'
      });
    expect(incRes.status).toBe(201);

    // 2. Credit Card Purchase: 3000.00 on Visa Credit Card for Dining
    const expRes = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        primary_account_id: MOCK_UUIDS.DEMO_CC,
        total_amount: '3000.00',
        transaction_date: '2026-11-02',
        description: 'Dining Purchase',
        allocations: [{ target_account_id: MOCK_UUIDS.DEMO_DINING, amount: '3000.00' }]
      });
    expect(expRes.status).toBe(201);

    // 3. Credit Card Repayment (BR-07 v1.1): 400.00 rejected with 422 MIN_REPAYMENT_NOT_MET, 1000.00 accepted
    const badCcRepay = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.DEMO_CC,
        amount: 400.00,
        transaction_date: '2026-11-03'
      });
    expect(badCcRepay.status).toBe(422);
    expect(badCcRepay.body.error.code).toBe('MIN_REPAYMENT_NOT_MET');

    const ccRepay = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: MOCK_UUIDS.DEMO_CC,
        amount: 1000.00,
        transaction_date: '2026-11-03'
      });
    expect(ccRepay.status).toBe(201);

    // 4. Internal Cash Transfer: 4000.00 Checking -> Savings (Checking = 25000, Savings = 6000)
    const xferRes = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 4000.00,
        transaction_date: '2026-11-04'
      });
    expect(xferRes.status).toBe(201);

    // 5. Loan Given (2500.00 from Checking) & Partial Recovery (1000.00 into Savings)
    // -> Checking = 22500, Savings = 7000, Friend Loan Receivable = 1500
    const giveRes = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: FRIEND_LOAN_UUID,
        amount: 2500.00,
        transaction_date: '2026-11-05'
      });
    expect(giveRes.status).toBe(201);

    const recRes = await request(app)
      .post('/api/transactions/loan-recovery')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: FRIEND_LOAN_UUID,
        to_account_id: DEMO_SAVINGS_UUID,
        amount: 1000.00,
        transaction_date: '2026-11-06'
      });
    expect(recRes.status).toBe(201);

    // 6. General Loan Borrowing (5000.00 into Checking) & Partial Repayment (1200.00 from Checking)
    // -> Checking = 26300, Savings = 7000, Personal Loan Debt = 3800, Visa CC Debt = 2000
    const borrowRes = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: PERSONAL_LOAN_UUID,
        to_account_id: MOCK_UUIDS.DEMO_CHECKING,
        amount: 5000.00,
        transaction_date: '2026-11-07'
      });
    expect(borrowRes.status).toBe(201);

    const genRepay = await request(app)
      .post('/api/transactions/loan-repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .set('Cookie', userACookie)
      .send({
        from_account_id: MOCK_UUIDS.DEMO_CHECKING,
        to_account_id: PERSONAL_LOAN_UUID,
        amount: 1200.00,
        transaction_date: '2026-11-08'
      });
    expect(genRepay.status).toBe(201);

    // 7. Cross-verify GET /api/accounts and GET /api/reports/summary
    const accRes = await request(app)
      .get('/api/accounts')
      .set('Cookie', userACookie);
    expect(accRes.status).toBe(200);
    const accs = accRes.body.data.accounts as Array<any>;

    const checkingAcc = accs.find((a) => a.id === MOCK_UUIDS.DEMO_CHECKING);
    const savingsAcc = accs.find((a) => a.id === DEMO_SAVINGS_UUID);
    const friendLoanAcc = accs.find((a) => a.id === FRIEND_LOAN_UUID);
    const personalLoanAcc = accs.find((a) => a.id === PERSONAL_LOAN_UUID);
    const visaCardAcc = accs.find((a) => a.id === MOCK_UUIDS.DEMO_CC);

    expect(checkingAcc.current_balance).toBe(26300.00);
    expect(savingsAcc.current_balance).toBe(7000.00);
    expect(friendLoanAcc.current_balance).toBe(1500.00);
    expect(personalLoanAcc.current_balance).toBe(3800.00);
    expect(visaCardAcc.current_balance).toBe(2000.00);

    const summaryRes = await request(app)
      .get('/api/reports/summary')
      .set('Cookie', userACookie);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.bank_balance).toBe(checkingAcc.current_balance + savingsAcc.current_balance);
    expect(summaryRes.body.data.bank_balance).toBe(33300.00);
    expect(summaryRes.body.data.credit_debt).toBe(visaCardAcc.current_balance + personalLoanAcc.current_balance);
    expect(summaryRes.body.data.credit_debt).toBe(5800.00);
    expect(summaryRes.body.data.total_income).toBe(20000.00);
    expect(summaryRes.body.data.total_expense).toBe(3000.00);
  });
});
