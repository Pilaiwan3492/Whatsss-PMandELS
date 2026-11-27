import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockAccounts,
  mockAllocationLines,
  mockTransactions,
  resetMockAccounts,
  resetMockTransactions
} from '../fixtures/mockPrisma.js';

vi.mock('../../src/prisma.js', () => {
  const mockPrisma: any = {
    $transaction: vi.fn(async (callback: any) => callback(mockPrisma)),
    $queryRaw: vi.fn(async () => [{ id: IDS.TX_EXISTING }]),
    user: {
      findUnique: vi.fn(async ({ where }) => findMockUser(where))
    },
    account: {
      findMany: vi.fn(async ({ where }: any) => {
        return mockAccounts.filter((a) => {
          if (where?.user_id && a.user_id !== where.user_id) return false;
          if (where?.id?.in && !where.id.in.includes(a.id)) return false;
          return true;
        });
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          mockAccounts.find((a) => {
            if (where?.id && a.id !== where.id) return false;
            if (where?.user_id && a.user_id !== where.user_id) return false;
            return true;
          }) || null
        );
      })
    },
    transaction: {
      findFirst: vi.fn(async ({ where }: any) => {
        const found = mockTransactions.find((t) => {
          if (where?.id && t.id !== where.id) return false;
          if (where?.user_id && t.user_id !== where.user_id) return false;
          return true;
        });
        if (!found) return null;
        return {
          ...found,
          primary_account: mockAccounts.find((a) => a.id === found.primary_account_id)!,
          allocation_lines: mockAllocationLines
            .filter((l) => l.transaction_id === found.id)
            .map((l) => ({
              ...l,
              target_account: mockAccounts.find((a) => a.id === l.target_account_id)!
            }))
        };
      }),
      aggregate: vi.fn(async () => ({ _sum: { total_amount: new Prisma.Decimal('0.00') } })),
      create: vi.fn(async () => {
        throw new Error('Should not create transaction when account is archived');
      })
    },
    allocationLine: {
      aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } }))
    }
  };
  return { prisma: mockPrisma };
});

import { app } from '../../src/app.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

const IDS = {
  CHECKING: '22222222-2222-4222-8222-222222222201',
  CC: '22222222-2222-4222-8222-222222222204',
  SALARY: '22222222-2222-4222-8222-222222222202',
  DINING: '22222222-2222-4222-8222-222222222203',
  ARCH_CASH: '22222222-2222-4222-8222-222222222211',
  ARCH_CC: '22222222-2222-4222-8222-222222222212',
  ARCH_EXP: '22222222-2222-4222-8222-222222222213',
  ARCH_LG: '22222222-2222-4222-8222-222222222214',
  ARCH_GL: '22222222-2222-4222-8222-222222222215',
  TX_EXISTING: '33333333-3333-4333-8333-333333333301'
};

function makeAuthCookie(user: { id: string; username: string; role: string }) {
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
  return `token=${token}`;
}

describe('Integration Test: Archived Account Guards Across All Transaction Workflows (F-18, TEST-AUDIT-03)', () => {
  const userCookie = makeAuthCookie({
    id: 'user-a-uuid',
    username: 'user_demo',
    role: 'USER'
  });

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();

    mockAccounts.push(
      {
        id: IDS.CHECKING,
        user_id: 'user-a-uuid',
        name: 'Active Checking',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('10000.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.CC,
        user_id: 'user-a-uuid',
        name: 'Active CC',
        type: 'LOAN_TAKEN',
        subtype: 'CREDIT_CARD',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.SALARY,
        user_id: 'user-a-uuid',
        name: 'Active Salary',
        type: 'INCOME',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.DINING,
        user_id: 'user-a-uuid',
        name: 'Active Dining',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.ARCH_CASH,
        user_id: 'user-a-uuid',
        name: 'Archived Cash',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.ARCH_CC,
        user_id: 'user-a-uuid',
        name: 'Archived CC',
        type: 'LOAN_TAKEN',
        subtype: 'CREDIT_CARD',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.ARCH_EXP,
        user_id: 'user-a-uuid',
        name: 'Archived Expense',
        type: 'EXPENSE',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.ARCH_LG,
        user_id: 'user-a-uuid',
        name: 'Archived Loan Given',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: IDS.ARCH_GL,
        user_id: 'user-a-uuid',
        name: 'Archived Gen Loan',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    mockTransactions.push({
      id: IDS.TX_EXISTING,
      user_id: 'user-a-uuid',
      primary_account_id: IDS.ARCH_CASH,
      form: 'RECEIVE_MONEY',
      total_amount: new Prisma.Decimal('1000.00'),
      transaction_date: new Date('2026-11-01'),
      description: 'Old salary',
      created_at: new Date()
    });
    mockAllocationLines.push({
      id: '44444444-4444-4444-8444-444444444401',
      transaction_id: IDS.TX_EXISTING,
      target_account_id: IDS.SALARY,
      amount: new Prisma.Decimal('1000.00'),
      notes: null
    });
  });

  it('TEST-AUDIT-03: rejects Income, Expense (split line 2), CC Repayment, Transfer, Loan Given, General Loan Borrowing, Duplicate, and Correction with 422 ACCOUNT_ARCHIVED', async () => {
    const inc = await request(app)
      .post('/api/transactions/income')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        primary_account_id: IDS.ARCH_CASH,
        income_account_id: IDS.SALARY,
        total_amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(inc.status).toBe(422);
    expect(inc.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const exp = await request(app)
      .post('/api/transactions/expense')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        primary_account_id: IDS.CC,
        total_amount: '600.00',
        transaction_date: '2026-11-05',
        allocations: [
          { target_account_id: IDS.DINING, amount: '300.00' },
          { target_account_id: IDS.ARCH_EXP, amount: '300.00' }
        ]
      });
    expect(exp.status).toBe(422);
    expect(exp.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const repay = await request(app)
      .post('/api/transactions/repayment')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        from_account_id: IDS.CHECKING,
        to_account_id: IDS.ARCH_CC,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(repay.status).toBe(422);
    expect(repay.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const xfer = await request(app)
      .post('/api/transactions/transfer')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        from_account_id: IDS.CHECKING,
        to_account_id: IDS.ARCH_CASH,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(xfer.status).toBe(422);
    expect(xfer.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const lg = await request(app)
      .post('/api/transactions/loan-given')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        from_account_id: IDS.CHECKING,
        to_account_id: IDS.ARCH_LG,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(lg.status).toBe(422);
    expect(lg.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const gl = await request(app)
      .post('/api/transactions/loan-borrowing')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        from_account_id: IDS.ARCH_GL,
        to_account_id: IDS.CHECKING,
        amount: '500.00',
        transaction_date: '2026-11-05'
      });
    expect(gl.status).toBe(422);
    expect(gl.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const dup = await request(app)
      .post(`/api/transactions/${IDS.TX_EXISTING}/duplicate`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({});
    expect(dup.status).toBe(422);
    expect(dup.body.error.code).toBe('ACCOUNT_ARCHIVED');

    const corr = await request(app)
      .put(`/api/transactions/${IDS.TX_EXISTING}`)
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userCookie)
      .send({
        total_amount: '1000.00',
        transaction_date: '2026-11-01',
        allocations: [{ target_account_id: IDS.SALARY, amount: '1000.00' }]
      });
    expect(corr.status).toBe(422);
    expect(corr.body.error.code).toBe('ACCOUNT_ARCHIVED');
  });
});
