import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import {
  mockAccounts,
  mockUsers,
  mockTransactions,
  mockAllocationLines,
  resetMockAccounts,
  resetMockTransactions,
  resetMockUsers,
  useMockUuidAccounts,
  findMockUser,
  MOCK_UUIDS,
  MockTransactionRecord,
  MockAllocationLineRecord
} from '../fixtures/mockPrisma.js';

// Setup Mock Prisma for Transaction History integration tests
vi.mock('../../src/prisma.js', () => {
  const txClient = {
    user: {
      findFirst: vi.fn(async ({ where }) => {
        if (where?.OR) {
          for (const cond of where.OR) {
            const u = findMockUser(cond);
            if (u) return u;
          }
        }
        return findMockUser(where);
      }),
      findUnique: vi.fn(async ({ where }) => findMockUser(where))
    },
    account: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          mockAccounts.find((a) => {
            if (where?.id && a.id !== where.id) return false;
            if (where?.user_id && a.user_id !== where.user_id) return false;
            return true;
          }) || null
        );
      }),
      findMany: vi.fn(async ({ where }) => {
        return mockAccounts.filter((a) => {
          if (where?.user_id && a.user_id !== where.user_id) return false;
          return true;
        });
      })
    },
    transaction: {
      findMany: vi.fn(async ({ where, include, orderBy }) => {
        let results = mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          return true;
        });

        // Ordering by transaction_date desc, created_at desc
        results.sort((a, b) => {
          const dateDiff = new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        if (include) {
          return results.map((t) => {
            const primaryAcc = mockAccounts.find((a) => a.id === t.primary_account_id);
            const lines = mockAllocationLines
              .filter((l) => l.transaction_id === t.id)
              .map((l) => {
                const targetAcc = mockAccounts.find((a) => a.id === l.target_account_id);
                return {
                  ...l,
                  target_account: targetAcc
                    ? { id: targetAcc.id, name: targetAcc.name, type: targetAcc.type }
                    : null
                };
              });

            return {
              ...t,
              primary_account: primaryAcc
                ? { id: primaryAcc.id, name: primaryAcc.name, type: primaryAcc.type }
                : null,
              allocation_lines: lines
            };
          });
        }

        return results;
      })
    },
    allocationLine: {
      findMany: vi.fn(async ({ where }) => {
        return mockAllocationLines.filter((l) => {
          if (where?.transaction_id && l.transaction_id !== where.transaction_id) return false;
          return true;
        });
      })
    }
  };

  return {
    prisma: txClient
  };
});

describe('Integration Test: Transaction History API (WP-06, Feature F-09)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-minimum-32-chars-long!!';

  let demoUserToken: string;
  let otherUserToken: string;
  let adminToken: string;

  beforeEach(() => {
    resetMockUsers();
    resetMockAccounts();
    resetMockTransactions();
    useMockUuidAccounts();

    const demoUser = mockUsers[0]; // user-a-uuid
    const otherUser = mockUsers[1]; // user-b-uuid
    const adminUser = mockUsers[2]; // admin-uuid

    demoUserToken = jwt.sign(
      { userId: demoUser.id, username: demoUser.username, role: demoUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    otherUserToken = jwt.sign(
      { userId: otherUser.id, username: otherUser.username, role: otherUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { userId: adminUser.id, username: adminUser.username, role: adminUser.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('Security Boundaries (BR-01, BR-09, BR-10)', () => {
    it('rejects unauthenticated requests to GET /api/transactions with 401 Unauthorized (BR-09, TEST-SEC-02)', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects administrator access to GET /api/transactions with 403 Forbidden (BR-10, TEST-SEC-03)', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
      expect(res.body.data).toBeUndefined();
    });

    it('returns empty transaction array when user has recorded zero transactions', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${demoUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transactions).toEqual([]);
    });

    it('enforces tenancy isolation: user cannot see foreign transactions (BR-01, TEST-SEC-01)', async () => {
      // Seed a transaction for other user
      const otherTxn: MockTransactionRecord = {
        id: 'tx-other-1',
        user_id: 'user-b-uuid',
        primary_account_id: MOCK_UUIDS.OTHER_CHECKING,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('5000.00'),
        transaction_date: new Date('2026-11-05T00:00:00.000Z'),
        description: 'Other user salary',
        created_at: new Date('2026-11-05T10:00:00.000Z')
      };
      mockTransactions.push(otherTxn);

      const otherLine: MockAllocationLineRecord = {
        id: 'line-other-1',
        transaction_id: 'tx-other-1',
        target_account_id: MOCK_UUIDS.OTHER_SALARY,
        amount: new Prisma.Decimal('5000.00'),
        notes: null
      };
      mockAllocationLines.push(otherLine);

      // Query as demo user -> should be empty
      const demoRes = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${demoUserToken}`);

      expect(demoRes.status).toBe(200);
      expect(demoRes.body.data.transactions).toHaveLength(0);

      // Query as other user -> returns 1 transaction
      const otherRes = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${otherUserToken}`);

      expect(otherRes.status).toBe(200);
      expect(otherRes.body.data.transactions).toHaveLength(1);
      expect(otherRes.body.data.transactions[0].id).toBe('tx-other-1');
    });
  });

  describe('TEST-HIST-01: Golden Domain Journey Transaction History (AC-09-1, FR-11)', () => {
    beforeEach(() => {
      // Seed Golden Domain Journey Transactions for user_demo (user-a-uuid):
      // Txn 1: Salary (2026-11-02) - RECEIVE_MONEY 20,000 THB, 1 allocation line
      const tx1: MockTransactionRecord = {
        id: 'txn-golden-1',
        user_id: 'user-a-uuid',
        primary_account_id: MOCK_UUIDS.DEMO_CHECKING,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-02T00:00:00.000Z'),
        description: 'Salary November',
        created_at: new Date('2026-11-02T08:00:00.000Z')
      };
      const line1: MockAllocationLineRecord = {
        id: 'alloc-golden-1',
        transaction_id: 'txn-golden-1',
        target_account_id: MOCK_UUIDS.DEMO_SALARY,
        amount: new Prisma.Decimal('20000.00'),
        notes: 'Monthly Salary'
      };

      // Txn 2: CC Purchase (2026-11-03) - PAYMENT_CHARGE 3,000 THB, 2 allocation lines (Dining 1k, Grocery 2k)
      const tx2: MockTransactionRecord = {
        id: 'txn-golden-2',
        user_id: 'user-a-uuid',
        primary_account_id: MOCK_UUIDS.DEMO_CC,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-03T00:00:00.000Z'),
        description: 'Weekend Dining & Grocery',
        created_at: new Date('2026-11-03T12:00:00.000Z')
      };
      const line2: MockAllocationLineRecord = {
        id: 'alloc-golden-2',
        transaction_id: 'txn-golden-2',
        target_account_id: MOCK_UUIDS.DEMO_DINING,
        amount: new Prisma.Decimal('1000.00'),
        notes: 'Dinner with friends'
      };
      const line3: MockAllocationLineRecord = {
        id: 'alloc-golden-3',
        transaction_id: 'txn-golden-2',
        target_account_id: MOCK_UUIDS.DEMO_GROCERY,
        amount: new Prisma.Decimal('2000.00'),
        notes: 'Weekly grocery'
      };

      // Txn 3: CC Repayment (2026-11-04) - PAYMENT_CHARGE 3,000 THB, 1 allocation line
      const tx3: MockTransactionRecord = {
        id: 'txn-golden-3',
        user_id: 'user-a-uuid',
        primary_account_id: MOCK_UUIDS.DEMO_CHECKING,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-04T00:00:00.000Z'),
        description: 'Full CC Debt Settlement',
        created_at: new Date('2026-11-04T15:00:00.000Z')
      };
      const line4: MockAllocationLineRecord = {
        id: 'alloc-golden-4',
        transaction_id: 'txn-golden-3',
        target_account_id: MOCK_UUIDS.DEMO_CC,
        amount: new Prisma.Decimal('3000.00'),
        notes: 'Repay full CC balance'
      };

      mockTransactions.push(tx1, tx2, tx3);
      mockAllocationLines.push(line1, line2, line3, line4);
    });

    it('AC-09-1: returns exactly 3 recorded transactions and 4 allocation lines total', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${demoUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const transactions = res.body.data.transactions;
      expect(transactions).toBeInstanceOf(Array);
      expect(transactions).toHaveLength(3);

      // Verify total allocation lines across all transactions equals 4
      const totalAllocationLines = transactions.reduce(
        (count: number, tx: any) => count + tx.allocation_lines.length,
        0
      );
      expect(totalAllocationLines).toBe(4);
    });

    it('returns transactions in chronological descending order (transaction_date DESC, created_at DESC)', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${demoUserToken}`);

      const transactions = res.body.data.transactions;

      // Txn 3 (2026-11-04) -> Txn 2 (2026-11-03) -> Txn 1 (2026-11-02)
      expect(transactions[0].id).toBe('txn-golden-3');
      expect(transactions[0].transaction_date).toBe('2026-11-04');
      expect(transactions[0].total_amount).toBe(3000.00);

      expect(transactions[1].id).toBe('txn-golden-2');
      expect(transactions[1].transaction_date).toBe('2026-11-03');
      expect(transactions[1].total_amount).toBe(3000.00);

      expect(transactions[2].id).toBe('txn-golden-1');
      expect(transactions[2].transaction_date).toBe('2026-11-02');
      expect(transactions[2].total_amount).toBe(20000.00);
    });

    it('includes primary account details and target account metadata on split allocation lines', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Cookie', `token=${demoUserToken}`);

      const transactions = res.body.data.transactions;

      // Inspect Txn 2 (Split CC Purchase)
      const purchaseTxn = transactions.find((t: any) => t.id === 'txn-golden-2');
      expect(purchaseTxn).toBeDefined();
      expect(purchaseTxn.primary_account).toEqual({
        id: MOCK_UUIDS.DEMO_CC,
        name: 'Visa Credit Card',
        type: 'LOAN_TAKEN'
      });
      expect(purchaseTxn.form).toBe('PAYMENT_CHARGE');
      expect(purchaseTxn.allocation_lines).toHaveLength(2);

      const diningLine = purchaseTxn.allocation_lines.find(
        (l: any) => l.target_account.name === 'Dining'
      );
      expect(diningLine).toBeDefined();
      expect(diningLine.amount).toBe(1000.00);
      expect(diningLine.target_account.type).toBe('EXPENSE');

      const groceryLine = purchaseTxn.allocation_lines.find(
        (l: any) => l.target_account.name === 'Grocery'
      );
      expect(groceryLine).toBeDefined();
      expect(groceryLine.amount).toBe(2000.00);
      expect(groceryLine.target_account.type).toBe('EXPENSE');

      // Inspect Txn 3 (Repayment)
      const repaymentTxn = transactions.find((t: any) => t.id === 'txn-golden-3');
      expect(repaymentTxn).toBeDefined();
      expect(repaymentTxn.primary_account.type).toBe('CASH');
      expect(repaymentTxn.allocation_lines).toHaveLength(1);
      expect(repaymentTxn.allocation_lines[0].target_account.type).toBe('LOAN_TAKEN');
      expect(repaymentTxn.allocation_lines[0].target_account.name).toBe('Visa Credit Card');
    });
  });
});
