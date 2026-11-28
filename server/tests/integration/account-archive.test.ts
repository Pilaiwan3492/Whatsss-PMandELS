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

describe('Integration Test: Account Archival & Unarchival Lifecycle (F-18, TEST-AUDIT-02, TEST-AUDIT-04B)', () => {
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
  });

  it('TEST-AUDIT-02: enforces zero-balance archival preconditions and archive/unarchive lifecycle across all 5 account types', async () => {
    // Prepare zero and non-zero fixtures across all 5 types + both LOAN_TAKEN subtypes
    mockAccounts.push(
      {
        id: 'acc-cash-zero',
        user_id: 'user-a-uuid',
        name: 'Zero Cash Vault',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-cash-nonzero',
        user_id: 'user-a-uuid',
        name: 'Funded Cash',
        type: 'CASH',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('1500.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-cc-nonzero',
        user_id: 'user-a-uuid',
        name: 'Card Debt NonZero',
        type: 'LOAN_TAKEN',
        subtype: 'CREDIT_CARD',
        opening_balance: new Prisma.Decimal('2000.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-genloan-zero',
        user_id: 'user-a-uuid',
        name: 'General Loan Zero',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-genloan-nonzero',
        user_id: 'user-a-uuid',
        name: 'General Loan NonZero',
        type: 'LOAN_TAKEN',
        subtype: 'GENERAL_LOAN',
        opening_balance: new Prisma.Decimal('800.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-loangiven-zero',
        user_id: 'user-a-uuid',
        name: 'Receivable Zero',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('0.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'acc-loangiven-nonzero',
        user_id: 'user-a-uuid',
        name: 'Receivable NonZero',
        type: 'LOAN_GIVEN',
        subtype: 'DEFAULT',
        opening_balance: new Prisma.Decimal('2500.00'),
        is_opening_locked: false,
        is_archived: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    // 1. Reject non-zero CASH, LOAN_TAKEN (CREDIT_CARD & GENERAL_LOAN), LOAN_GIVEN
    for (const id of ['acc-cash-nonzero', 'acc-cc-nonzero', 'acc-genloan-nonzero', 'acc-loangiven-nonzero']) {
      const failRes = await request(app)
        .patch(`/api/accounts/${id}/archive`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userDemoCookie)
        .send({ is_archived: true });
      expect(failRes.status).toBe(422);
      expect(failRes.body.error.code).toBe('ACCOUNT_BALANCE_NON_ZERO');
      expect(mockAccounts.find((a) => a.id === id)!.is_archived).toBe(false);
    }

    // 2. Archive and Unarchive zero-balance CASH, LOAN_TAKEN/CREDIT_CARD, LOAN_TAKEN/GENERAL_LOAN, LOAN_GIVEN, INCOME, EXPENSE
    for (const id of [
      'acc-cash-zero',
      'acc-demo-cc',
      'acc-genloan-zero',
      'acc-loangiven-zero',
      'acc-demo-salary',
      'acc-demo-dining'
    ]) {
      const archRes = await request(app)
        .patch(`/api/accounts/${id}/archive`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userDemoCookie)
        .send({ is_archived: true });
      expect(archRes.status).toBe(200);
      expect(archRes.body.data.account.is_archived).toBe(true);
      expect(archRes.body.data.account.current_balance).toBe(0);
      expect(mockAccounts.find((a) => a.id === id)!.is_archived).toBe(true);

      const unarchRes = await request(app)
        .patch(`/api/accounts/${id}/archive`)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userDemoCookie)
        .send({ is_archived: false });
      expect(unarchRes.status).toBe(200);
      expect(unarchRes.body.data.account.is_archived).toBe(false);
      expect(mockAccounts.find((a) => a.id === id)!.is_archived).toBe(false);
    }
  });

  it('TEST-AUDIT-04B: validates archive payload (INVALID_ARCHIVE_PAYLOAD), tenant isolation (404 NOT_FOUND), and admin exclusion (403)', async () => {
    const badFlagRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie)
      .send({ is_archived: 'yes' });

    expect(badFlagRes.status).toBe(400);
    expect(badFlagRes.body.error.code).toBe('INVALID_ARCHIVE_PAYLOAD');

    const foreignRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', otherUserCookie)
      .send({ is_archived: true });

    expect(foreignRes.status).toBe(404);
    expect(foreignRes.body.error.code).toBe('NOT_FOUND');

    const adminRes = await request(app)
      .patch('/api/accounts/acc-demo-checking/archive')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', adminCookie)
      .send({ is_archived: true });

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
  });
});
