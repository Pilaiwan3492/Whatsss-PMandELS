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
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: vi.fn(async ({ where }) => findMockUser(where))
    },
    account: {
      findFirst: vi.fn(async ({ where }: any) => {
        return (
          mockAccounts.find((a) => {
            if (where?.id && a.id !== where.id) return false;
            if (where?.user_id && a.user_id !== where.user_id) return false;
            return true;
          }) || null
        );
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const acc = mockAccounts.find((a) => a.id === where.id);
        if (!acc) return null;
        if (data.is_archived !== undefined) acc.is_archived = data.is_archived;
        if (data.updated_at !== undefined) acc.updated_at = data.updated_at;
        return acc;
      })
    },
    transaction: {
      aggregate: vi.fn(async ({ where }: any) => {
        const sum = mockTransactions
          .filter((t) => {
            if (where?.user_id && t.user_id !== where.user_id) return false;
            if (where?.primary_account_id && t.primary_account_id !== where.primary_account_id) return false;
            if (where?.form && t.form !== where.form) return false;
            return true;
          })
          .reduce((acc, t) => acc.add(new Prisma.Decimal(t.total_amount.toString())), new Prisma.Decimal('0.00'));
        return { _sum: { total_amount: sum } };
      })
    },
    allocationLine: {
      aggregate: vi.fn(async ({ where }: any) => {
        const sum = mockAllocationLines
          .filter((line) => {
            const tx = mockTransactions.find((t) => t.id === line.transaction_id);
            const target = mockAccounts.find((a) => a.id === line.target_account_id);
            const primary = tx ? mockAccounts.find((a) => a.id === tx.primary_account_id) : undefined;
            if (!tx || !target || !primary) return false;
            if (where?.target_account_id && line.target_account_id !== where.target_account_id) return false;
            if (where?.target_account?.type && target.type !== where.target_account.type) return false;
            if (where?.target_account?.user_id && target.user_id !== where.target_account.user_id) return false;
            if (where?.transaction?.user_id && tx.user_id !== where.transaction.user_id) return false;
            if (where?.transaction?.form && tx.form !== where.transaction.form) return false;
            if (where?.transaction?.primary_account?.type && primary.type !== where.transaction.primary_account.type) {
              return false;
            }
            if (
              where?.transaction?.primary_account?.user_id &&
              primary.user_id !== where.transaction.primary_account.user_id
            ) {
              return false;
            }
            return true;
          })
          .reduce((acc, line) => acc.add(new Prisma.Decimal(line.amount.toString())), new Prisma.Decimal('0.00'));
        return { _sum: { amount: sum } };
      })
    }
  };
  return { prisma: mockPrisma };
});

import { app } from '../../src/app.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

function makeAuthCookie(user: { id: string; username: string; role: string }) {
  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
  return `token=${token}`;
}

function seedGoldenState() {
  // Income 20000 -> Checking Bank balance becomes 20000 (then -3000 repay = 17000)
  mockTransactions.push({
    id: 'tx-income-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-checking',
    form: 'RECEIVE_MONEY',
    total_amount: new Prisma.Decimal('20000.00'),
    transaction_date: new Date('2026-11-02'),
    description: 'Salary',
    created_at: new Date('2026-11-02T10:00:00Z')
  });

  // CC purchase 3000 + CC repayment 3000 -> Visa CC debt is 0.00
  mockTransactions.push({
    id: 'tx-expense-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-cc',
    form: 'PAYMENT_CHARGE',
    total_amount: new Prisma.Decimal('3000.00'),
    transaction_date: new Date('2026-11-03'),
    description: 'Purchase',
    created_at: new Date('2026-11-03T12:00:00Z')
  });
  mockTransactions.push({
    id: 'tx-repay-1',
    user_id: 'user-a-uuid',
    primary_account_id: 'acc-demo-checking',
    form: 'PAYMENT_CHARGE',
    total_amount: new Prisma.Decimal('3000.00'),
    transaction_date: new Date('2026-11-04'),
    description: 'Repayment',
    created_at: new Date('2026-11-04T15:00:00Z')
  });
  mockAllocationLines.push({
    id: 'line-repay-1',
    transaction_id: 'tx-repay-1',
    target_account_id: 'acc-demo-cc',
    amount: new Prisma.Decimal('3000.00'),
    notes: null
  });
}

describe('Integration Test: Account Archival & Unarchival (F-18, TEST-AUDIT-02, TEST-AUDIT-04)', () => {
  const userDemoCookie = makeAuthCookie({
    id: 'user-a-uuid',
    username: 'user_demo',
    role: 'USER'
  });
  const otherUserCookie = makeAuthCookie({
    id: 'user-b-uuid',
    username: 'user_other',
    role: 'USER'
  });
  const adminCookie = makeAuthCookie({
    id: 'admin-uuid',
    username: 'admin_demo',
    role: 'ADMIN'
  });

  beforeEach(() => {
    resetMockAccounts();
    resetMockTransactions();
    seedGoldenState();
  });

  it('TEST-AUDIT-02: rejects archiving CASH, LOAN_TAKEN, and LOAN_GIVEN accounts with non-zero balance/debt/receivable (422 ACCOUNT_BALANCE_NON_ZERO)', async () => {
    // 1. CASH Checking Bank has balance 17000.00
    const cashRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: true });

    expect(cashRes.status).toBe(422);
    expect(cashRes.body.error.code).toBe('ACCOUNT_BALANCE_NON_ZERO');

    // 2. LOAN_TAKEN account with 500.00 opening debt -> rejected
    mockAccounts.push({
      id: 'acc-loan-taken-nonzero',
      user_id: 'user-a-uuid',
      name: 'Car Loan',
      normalized_name: 'car loan',
      type: 'LOAN_TAKEN',
      subtype: 'GENERAL_LOAN',
      opening_balance: new Prisma.Decimal('500.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date(),
      updated_at: new Date()
    });

    const loanTakenRes = await request(app)
      .patch('/api/accounts/acc-loan-taken-nonzero/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: true });

    expect(loanTakenRes.status).toBe(422);
    expect(loanTakenRes.body.error.code).toBe('ACCOUNT_BALANCE_NON_ZERO');

    // 3. LOAN_GIVEN account with 250.00 opening receivable -> rejected
    mockAccounts.push({
      id: 'acc-loan-given-nonzero',
      user_id: 'user-a-uuid',
      name: 'Friend Bob',
      normalized_name: 'friend bob',
      type: 'LOAN_GIVEN',
      subtype: 'DEFAULT',
      opening_balance: new Prisma.Decimal('250.00'),
      is_opening_locked: false,
      is_archived: false,
      created_at: new Date(),
      updated_at: new Date()
    });

    const loanGivenRes = await request(app)
      .patch('/api/accounts/acc-loan-given-nonzero/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: true });

    expect(loanGivenRes.status).toBe(422);
    expect(loanGivenRes.body.error.code).toBe('ACCOUNT_BALANCE_NON_ZERO');
  });

  it('TEST-AUDIT-04: allows archiving and unarchiving zero-balance LOAN_TAKEN, CASH, and EXPENSE accounts', async () => {
    // Visa Credit Card has 0.00 debt after 3000.00 purchase + 3000.00 repayment
    const archiveCcRes = await request(app)
      .patch('/api/accounts/acc-demo-cc/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: true });

    expect(archiveCcRes.status).toBe(200);
    expect(archiveCcRes.body.data.account.is_archived).toBe(true);

    // Unarchive Visa Credit Card
    const unarchiveCcRes = await request(app)
      .patch('/api/accounts/acc-demo-cc/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: false });

    expect(unarchiveCcRes.status).toBe(200);
    expect(unarchiveCcRes.body.data.account.is_archived).toBe(false);

    // Archive EXPENSE category (always allowed)
    const archiveExpenseRes = await request(app)
      .patch('/api/accounts/acc-demo-dining/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: true });

    expect(archiveExpenseRes.status).toBe(200);
    expect(archiveExpenseRes.body.data.account.is_archived).toBe(true);
  });

  it('validates archive flag, tenant isolation (BR-01), and admin exclusion (BR-10)', async () => {
    const badFlagRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: 'yes' });

    expect(badFlagRes.status).toBe(400);
    expect(badFlagRes.body.error.code).toBe('INVALID_ARCHIVE_FLAG');

    const foreignRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', otherUserCookie)
      .send({ is_archived: true });

    expect(foreignRes.status).toBe(404);

    const adminRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', adminCookie)
      .send({ is_archived: true });

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
  });
});
