import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockAccounts,
  resetMockAccounts,
  mockTransactions,
  mockAllocationLines,
  resetMockTransactions,
  MockTransactionRecord,
  MockAllocationLineRecord,
  MOCK_UUIDS,
  useMockUuidAccounts
} from '../fixtures/mockPrisma.js';

const TRUSTED_ORIGIN = 'http://localhost:5173';

function createAuthCookie(userId: string, username: string, role: 'USER' | 'ADMIN'): string {
  const token = jwt.sign(
    { userId, username, role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

// Setup Mock Prisma for income integration tests
vi.mock('../../src/prisma.js', () => {
  const txClient = {
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
      findMany: vi.fn(async ({ where, select, orderBy }) => {
        let list = mockAccounts.filter((a) => {
          if (where?.user_id && a.user_id !== where.user_id) return false;
          if (where?.id?.in && !where.id.in.includes(a.id)) return false;
          return true;
        });
        if (orderBy?.created_at === 'asc') {
          list = [...list].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
        }
        if (select?.id && select?.is_opening_locked) {
          return list.map((a) => ({ id: a.id, is_opening_locked: a.is_opening_locked }));
        }
        return list;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const a of mockAccounts) {
          if (typeof where?.id === 'string' && a.id !== where.id) continue;
          if (where?.id?.in && !where.id.in.includes(a.id)) continue;
          if (where?.user_id && a.user_id !== where.user_id) continue;
          if (where?.is_opening_locked !== undefined && a.is_opening_locked !== where.is_opening_locked) {
            continue;
          }
          if (data.is_opening_locked !== undefined) {
            a.is_opening_locked = data.is_opening_locked;
          }
          if (data.opening_balance !== undefined) {
            a.opening_balance = new Prisma.Decimal(data.opening_balance.toString());
          }
          a.updated_at = new Date();
          count++;
        }
        return { count };
      })
    },
    transaction: {
      create: vi.fn(async ({ data }) => {
        const record: MockTransactionRecord = {
          id: `txn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          user_id: data.user_id,
          primary_account_id: data.primary_account_id,
          form: data.form,
          total_amount: new Prisma.Decimal(data.total_amount.toString()),
          transaction_date: data.transaction_date,
          description: data.description || null,
          created_at: new Date()
        };
        mockTransactions.push(record);
        return record;
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matches = mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          if (typeof where?.primary_account_id === 'string' && t.primary_account_id !== where.primary_account_id) {
            return false;
          }
          if (where?.primary_account_id?.in && !where.primary_account_id.in.includes(t.primary_account_id)) {
            return false;
          }
          if (where?.form && t.form !== where.form) return false;
          return true;
        });

        const zero = new Prisma.Decimal('0.00');
        const sumVal = matches.reduce((sum, t) => sum.add(t.total_amount), zero);
        return { _sum: { total_amount: matches.length > 0 ? sumVal : null } };
      }),
      groupBy: vi.fn(async ({ where, by }) => {
        const matches = mockTransactions.filter((t) => {
          if (where?.user_id && t.user_id !== where.user_id) return false;
          if (where?.primary_account_id?.in && !where.primary_account_id.in.includes(t.primary_account_id)) {
            return false;
          }
          return true;
        });

        const groups = new Map<string, { primary_account_id: string; form: string; sum: Prisma.Decimal }>();

        for (const t of matches) {
          const key = `${t.primary_account_id}__${t.form}`;
          if (!groups.has(key)) {
            groups.set(key, {
              primary_account_id: t.primary_account_id,
              form: t.form,
              sum: new Prisma.Decimal(t.total_amount.toString())
            });
          } else {
            const g = groups.get(key)!;
            g.sum = g.sum.add(t.total_amount);
          }
        }

        return Array.from(groups.values()).map((g) => ({
          primary_account_id: g.primary_account_id,
          form: g.form,
          _sum: { total_amount: g.sum }
        }));
      })
    },
    allocationLine: {
      create: vi.fn(async ({ data }) => {
        const record: MockAllocationLineRecord = {
          id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          transaction_id: data.transaction_id,
          target_account_id: data.target_account_id,
          amount: new Prisma.Decimal(data.amount.toString()),
          notes: data.notes || null
        };
        mockAllocationLines.push(record);
        return record;
      }),
      aggregate: vi.fn(async ({ where }) => {
        const matches = mockAllocationLines.filter((al) => {
          const parentTxn = mockTransactions.find((t) => t.id === al.transaction_id);
          if (!parentTxn) return false;
          if (where?.transaction?.user_id && parentTxn.user_id !== where.transaction.user_id) {
            return false;
          }
          if (where?.transaction?.form && parentTxn.form !== where.transaction.form) {
            return false;
          }
          const targetAcc = mockAccounts.find((a) => a.id === al.target_account_id);
          if (!targetAcc) return false;
          if (where?.target_account?.type && targetAcc.type !== where.target_account.type) {
            return false;
          }
          if (where?.target_account?.user_id && targetAcc.user_id !== where.target_account.user_id) {
            return false;
          }
          return true;
        });

        const zero = new Prisma.Decimal('0.00');
        const sumVal = matches.reduce((sum, al) => sum.add(al.amount), zero);
        return { _sum: { amount: matches.length > 0 ? sumVal : null } };
      })
    }
  };

  const prismaMock = {
    $transaction: vi.fn(async (callback) => {
      return callback(txClient);
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
      findUnique: vi.fn(async ({ where }) => findMockUser(where))
    },
    account: txClient.account,
    transaction: txClient.transaction,
    allocationLine: txClient.allocationLine
  };

  return { prisma: prismaMock };
});

// Import app after mocking prisma
import { app } from '../../src/app.js';

describe('Integration Test: Income Transaction Processing (WP-03)', () => {
  const userACookie = createAuthCookie('user-a-uuid', 'user_demo', 'USER');
  const userBCookie = createAuthCookie('user-b-uuid', 'user_other', 'USER');
  const adminCookie = createAuthCookie('admin-uuid', 'admin_demo', 'ADMIN');

  const CHECKING_ID = MOCK_UUIDS.DEMO_CHECKING;
  const CC_ID = MOCK_UUIDS.DEMO_CC;
  const SALARY_ID = MOCK_UUIDS.DEMO_SALARY;
  const DINING_ID = MOCK_UUIDS.DEMO_DINING;
  const OTHER_CHECKING_ID = MOCK_UUIDS.OTHER_CHECKING;
  const OTHER_SALARY_ID = MOCK_UUIDS.OTHER_SALARY;
  const ADMIN_CHECKING_ID = MOCK_UUIDS.ADMIN_CHECKING;
  const ADMIN_SALARY_ID = MOCK_UUIDS.ADMIN_SALARY;

  beforeEach(() => {
    resetMockAccounts();
    useMockUuidAccounts();
    resetMockTransactions();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. TEST-INC-01: Successful Income Creation & Dynamic Ledger Updates
  // -------------------------------------------------------------------------
  describe('TEST-INC-01: Successful Income Creation (AC-04-1, BR-03, FR-06)', () => {
    it('records salary of 20000.00 THB on date 2026-11-06 into Checking Bank, creates 1 allocation, locks opening balance, and updates cash balance to 30000.00', async () => {
      // Setup initial opening balance of 10,000.00 THB on Checking Bank
      const checking = mockAccounts.find((a) => a.id === CHECKING_ID)!;
      checking.opening_balance = new Prisma.Decimal('10000.00');
      checking.is_opening_locked = false;

      const payload = {
        primary_account_id: CHECKING_ID,
        total_amount: '20000.00',
        transaction_date: '2026-11-06',
        income_account_id: SALARY_ID,
        description: 'Monthly Salary'
      };

      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.transaction).toBeDefined();
      expect(data.transaction.primary_account_id).toBe(CHECKING_ID);
      expect(data.transaction.form).toBe('RECEIVE_MONEY');
      expect(data.transaction.total_amount).toBe('20000.00');
      expect(data.transaction.transaction_date).toBe('2026-11-06');
      expect(data.transaction.description).toBe('Monthly Salary');

      // Exactly 1 allocation line targeting Salary
      expect(data.transaction.allocations).toHaveLength(1);
      expect(data.transaction.allocations[0].target_account_id).toBe(SALARY_ID);
      expect(data.transaction.allocations[0].amount).toBe('20000.00');
      expect(data.transaction.allocations[0].notes).toBe('Monthly Salary');

      // Cash balance updated from 10,000.00 to 30,000.00
      expect(data.updated_balance.account_id).toBe(CHECKING_ID);
      expect(data.updated_balance.current_balance).toBe('30000.00');

      // Opening balance on Checking Bank must be locked
      expect(checking.is_opening_locked).toBe(true);

      // Verify GET /api/accounts dynamically derives current_balance
      const accountsRes = await request(app)
        .get('/api/accounts')
        .set('Cookie', userACookie);

      expect(accountsRes.status).toBe(200);
      const accountsData = accountsRes.body.data.accounts;
      const checkingInList = accountsData.find((a: any) => a.id === CHECKING_ID);
      expect(checkingInList.opening_balance).toBe(10000.00);
      expect(checkingInList.current_balance).toBe(30000.00);
      expect(checkingInList.is_opening_locked).toBe(true);

      // Verify GET /api/reports/summary reflects updated bank balance and income summary
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.bank_balance).toBe(30000.00);
      expect(summaryRes.body.data.total_income).toBe(20000.00);
      expect(summaryRes.body.data.total_expense).toBe(0.00);
      expect(summaryRes.body.data.credit_debt).toBe(0.00);
    });

    it('accepts numeric total_amount and normalizes to 2-decimal string', async () => {
      const payload = {
        primary_account_id: CHECKING_ID,
        total_amount: 5000.5,
        transaction_date: '2026-11-06',
        income_account_id: SALARY_ID,
        description: 'Bonus'
      };

      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.transaction.total_amount).toBe('5000.50');
      expect(res.body.data.transaction.allocations[0].amount).toBe('5000.50');
    });

    it('handles repeated income transactions idempotently without lock failure', async () => {
      const checking = mockAccounts.find((a) => a.id === CHECKING_ID)!;
      checking.opening_balance = new Prisma.Decimal('1000.00');

      // First income
      await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '2000.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(checking.is_opening_locked).toBe(true);

      // Second income on already locked account
      const res2 = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '3000.00',
          transaction_date: '2026-11-07',
          income_account_id: SALARY_ID
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.updated_balance.current_balance).toBe('6000.00');
    });
  });

  // -------------------------------------------------------------------------
  // 2. TEST-INC-02: Input Validation Failures
  // -------------------------------------------------------------------------
  describe('TEST-INC-02: Input Validation Rejections (AC-04-2)', () => {
    it('rejects missing amount with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
      expect(mockTransactions).toHaveLength(0);
    });

    it('rejects zero amount with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '0.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects negative amount with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '-100.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects non-numeric amount with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: 'abc',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects amounts with more than 2 decimal places with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.123',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects amounts exceeding 9999999999.99 with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '10000000000.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects exponent notation with 400 INVALID_TRANSACTION_AMOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '1e3',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_AMOUNT');
    });

    it('rejects missing date with 400 INVALID_TRANSACTION_DATE', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.00',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_DATE');
    });

    it('rejects malformed date with 400 INVALID_TRANSACTION_DATE', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.00',
          transaction_date: 'not-a-date',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TRANSACTION_DATE');
    });

    it('rejects date with trailing characters or timestamps with 400 INVALID_TRANSACTION_DATE', async () => {
      const invalidDates = [
        '2026-11-06T12:00:00Z',
        '2026-11-06-extra',
        '2026-11-06 12:00',
        '2026/11/06'
      ];

      for (const d of invalidDates) {
        const res = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: '100.00',
            transaction_date: d,
            income_account_id: SALARY_ID
          });

        expect(res.status, `Expected 400 for date ${d}`).toBe(400);
        expect(res.body.error.code).toBe('INVALID_TRANSACTION_DATE');
      }
    });

    it('rejects invalid leap year date 2026-02-29 and accepts valid leap year date 2024-02-29', async () => {
      // 2026 is not a leap year -> reject
      const resNonLeap = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.00',
          transaction_date: '2026-02-29',
          income_account_id: SALARY_ID
        });

      expect(resNonLeap.status).toBe(400);
      expect(resNonLeap.body.error.code).toBe('INVALID_TRANSACTION_DATE');

      // 2024 is a leap year -> accept
      const resLeap = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.00',
          transaction_date: '2024-02-29',
          income_account_id: SALARY_ID
        });

      expect(resLeap.status).toBe(201);
      expect(resLeap.body.data.transaction.transaction_date).toBe('2024-02-29');
    });

    it('strictly rejects date with leading, trailing, or internal whitespace per canonical YYYY-MM-DD contract', async () => {
      const whitespaceDates = [
        ' 2026-11-06',
        '2026-11-06 ',
        ' 2026-11-06 ',
        '\t2026-11-06',
        '2026-11-06\n',
        '2026- 11-06',
        '2026-11- 06'
      ];
      for (const d of whitespaceDates) {
        const res = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: '100.00',
            transaction_date: d,
            income_account_id: SALARY_ID
          });
        expect(res.status, `Expected 400 for whitespace date "${d}"`).toBe(400);
        expect(res.body.error.code).toBe('INVALID_TRANSACTION_DATE');
      }
    });

    it('rejects malformed account IDs with 400 INVALID_ACCOUNT_ID before database lookup', async () => {
      const malformedIds = [
        '',
        '   ',
        'invalid!id@#$',
        '12345',
        'not-a-uuid-format'
      ];

      for (const badId of malformedIds) {
        const res = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: badId,
            total_amount: '100.00',
            transaction_date: '2026-11-06',
            income_account_id: SALARY_ID
          });

        expect(res.status, `Expected 400 for primary_account_id "${badId}"`).toBe(400);
        expect(res.body.error.code).toBe('INVALID_ACCOUNT_ID');
      }
    });

    it('rejects fixture-style account IDs with HTTP 400 INVALID_ACCOUNT_ID (strict UUID enforcement)', async () => {
      const fixtureIds = ['acc-demo-checking', 'acc-demo-salary', 'acc-user-1', 'acc-12345'];
      for (const fid of fixtureIds) {
        // Test primary_account_id
        const resPrimary = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: fid,
            total_amount: '100.00',
            transaction_date: '2026-11-06',
            income_account_id: SALARY_ID
          });
        expect(resPrimary.status, `Expected 400 for primary fixture ID "${fid}"`).toBe(400);
        expect(resPrimary.body.error.code).toBe('INVALID_ACCOUNT_ID');

        // Test income_account_id
        const resIncome = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: '100.00',
            transaction_date: '2026-11-06',
            income_account_id: fid
          });
        expect(resIncome.status, `Expected 400 for income fixture ID "${fid}"`).toBe(400);
        expect(resIncome.body.error.code).toBe('INVALID_ACCOUNT_ID');
      }
    });

    it('strictly rejects account IDs with leading or trailing whitespace per canonical UUID contract', async () => {
      const whitespaceUuids = [
        ` ${CHECKING_ID}`,
        `${CHECKING_ID} `,
        `  ${CHECKING_ID}  `,
        `\t${CHECKING_ID}`,
        `${CHECKING_ID}\n`
      ];

      for (const badUuid of whitespaceUuids) {
        // Test primary_account_id with whitespace
        const resPrimary = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: badUuid,
            total_amount: '100.00',
            transaction_date: '2026-11-06',
            income_account_id: SALARY_ID
          });
        expect(resPrimary.status, `Expected 400 for primary_account_id with whitespace "${badUuid}"`).toBe(400);
        expect(resPrimary.body.error.code).toBe('INVALID_ACCOUNT_ID');

        // Test income_account_id with whitespace
        const resIncome = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: '100.00',
            transaction_date: '2026-11-06',
            income_account_id: badUuid
          });
        expect(resIncome.status, `Expected 400 for income_account_id with whitespace "${badUuid}"`).toBe(400);
        expect(resIncome.body.error.code).toBe('INVALID_ACCOUNT_ID');
      }
    });

    it('distinguishes malformed ID (400 INVALID_ACCOUNT_ID) from non-existent valid UUID (404 NOT_FOUND)', async () => {
      // 1. Malformed ID -> 400
      const malformedRes = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: 'not-a-valid-uuid-1234',
          total_amount: '100.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(malformedRes.status).toBe(400);
      expect(malformedRes.body.error.code).toBe('INVALID_ACCOUNT_ID');

      // 2. Syntactically valid UUID that does not exist in DB -> 404 NOT_FOUND
      const nonExistentUuid = 'a0000000-0000-4000-8000-000000000000';
      const notFoundRes = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: nonExistentUuid,
          total_amount: '100.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.error.code).toBe('NOT_FOUND');
      expect(notFoundRes.body.error.message).toContain('Primary account not found');
    });

    it('rejects descriptions exceeding 255 characters with 400 INVALID_DESCRIPTION', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID,
          description: 'A'.repeat(256)
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_DESCRIPTION');
    });

    it('rejects wrong primary account type (LOAN_TAKEN) with 400 INVALID_PRIMARY_ACCOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CC_ID, // Visa Credit Card (LOAN_TAKEN)
          total_amount: '100.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRIMARY_ACCOUNT');
    });

    it('rejects wrong income category account type (EXPENSE) with 400 INVALID_INCOME_ACCOUNT', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '100.00',
          transaction_date: '2026-11-06',
          income_account_id: DINING_ID // Dining (EXPENSE)
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INCOME_ACCOUNT');
    });
  });

  // -------------------------------------------------------------------------
  // 3. TEST-OPEN-04: End-to-End Account Lock Integration (AC-03-3)
  // -------------------------------------------------------------------------
  describe('TEST-OPEN-04: End-to-End Account Lock Integration (AC-03-3)', () => {
    it('locks opening balance upon income transaction commit, causing subsequent PATCH opening-balance to return 422', async () => {
      const checking = mockAccounts.find((a) => a.id === CHECKING_ID)!;
      checking.opening_balance = new Prisma.Decimal('5000.00');
      checking.is_opening_locked = false;

      // 1. Before transaction: updating opening balance succeeds
      const patch1 = await request(app)
        .patch(`/api/accounts/${CHECKING_ID}/opening-balance`)
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ opening_balance: 10000.00 });

      expect(patch1.status).toBe(200);
      expect(checking.opening_balance.toString()).toBe('10000');

      // 2. Commit income transaction
      const incomeRes = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '20000.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(incomeRes.status).toBe(201);
      expect(checking.is_opening_locked).toBe(true);

      // 3. Subsequent opening balance update is blocked with 422 OPENING_BALANCE_LOCKED
      const patch2 = await request(app)
        .patch(`/api/accounts/${CHECKING_ID}/opening-balance`)
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({ opening_balance: 15000.00 });

      expect(patch2.status).toBe(422);
      expect(patch2.body.error.code).toBe('OPENING_BALANCE_LOCKED');
      // Balance remains unmodified
      expect(checking.opening_balance.toString()).toBe('10000');
    });
  });

  // -------------------------------------------------------------------------
  // 4. TEST-SEC-01: Multi-Tenant Data Isolation (BR-01)
  // -------------------------------------------------------------------------
  describe('TEST-SEC-01: Tenant Isolation (BR-01)', () => {
    it('returns 404 when User A attempts to record income into User B cash account', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: OTHER_CHECKING_ID, // Owned by User B
          total_amount: '1000.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockTransactions).toHaveLength(0);
    });

    it('returns 404 when User A attempts to target User B income account', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '1000.00',
          transaction_date: '2026-11-06',
          income_account_id: OTHER_SALARY_ID // Owned by User B
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(mockTransactions).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. TEST-SEC-03: Admin Financial Access Exclusion (BR-10)
  // -------------------------------------------------------------------------
  describe('TEST-SEC-03: Admin Role Boundary Exclusion (BR-10)', () => {
    it('returns 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN when Admin attempts to call POST /api/transactions/income', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', adminCookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: ADMIN_CHECKING_ID,
          total_amount: '1000.00',
          transaction_date: '2026-11-06',
          income_account_id: ADMIN_SALARY_ID
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
      expect(mockTransactions).toHaveLength(0);
    });

    it('returns 401 UNAUTHORIZED when unauthenticated client calls POST /api/transactions/income', async () => {
      const res = await request(app)
        .post('/api/transactions/income')
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '1000.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Decimal Precision Boundary Tests (TEST-INC-DECIMAL)
  // -------------------------------------------------------------------------
  describe('TEST-INC-DECIMAL: Decimal Boundary Precision', () => {
    const boundaryValues = ['0.01', '0.29', '100.10', '9999999999.99'];

    for (const val of boundaryValues) {
      it(`accepts and preserves exact decimal value ${val}`, async () => {
        const res = await request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: val,
            transaction_date: '2026-11-06',
            income_account_id: SALARY_ID
          });

        expect(res.status).toBe(201);
        expect(res.body.data.transaction.total_amount).toBe(val);
        expect(res.body.data.transaction.allocations[0].amount).toBe(val);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 7. TEST-INC-ATOM: Transaction Atomicity & Rollback Verification
  // -------------------------------------------------------------------------
  describe('TEST-INC-ATOM: Transaction Atomicity & Rollback', () => {
    it('rolls back completely if an error occurs during allocation creation', async () => {
      const checking = mockAccounts.find((a) => a.id === CHECKING_ID)!;
      checking.is_opening_locked = false;

      // Mock allocationLine.create to throw
      const { prisma } = await import('../../src/prisma.js');
      const origAllocCreate = (prisma.allocationLine as any).create;
      (prisma.allocationLine as any).create = vi.fn().mockRejectedValue(new Error('Database disk full'));

      const res = await request(app)
        .post('/api/transactions/income')
        .set('Cookie', userACookie)
        .set('Origin', TRUSTED_ORIGIN)
        .send({
          primary_account_id: CHECKING_ID,
          total_amount: '1000.00',
          transaction_date: '2026-11-06',
          income_account_id: SALARY_ID
        });

      expect(res.status).toBe(500);
      (prisma.allocationLine as any).create = origAllocCreate;
    });
  });

  // -------------------------------------------------------------------------
  // 8. TEST-INC-CONCURRENT: Concurrent Requests
  // -------------------------------------------------------------------------
  describe('TEST-INC-CONCURRENT: Concurrent Income Submissions', () => {
    it('handles concurrent income requests safely without balance corruption', async () => {
      const checking = mockAccounts.find((a) => a.id === CHECKING_ID)!;
      checking.opening_balance = new Prisma.Decimal('1000.00');
      checking.is_opening_locked = false;

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: '500.00',
            transaction_date: '2026-11-06',
            income_account_id: SALARY_ID
          }),
        request(app)
          .post('/api/transactions/income')
          .set('Cookie', userACookie)
          .set('Origin', TRUSTED_ORIGIN)
          .send({
            primary_account_id: CHECKING_ID,
            total_amount: '700.00',
            transaction_date: '2026-11-06',
            income_account_id: SALARY_ID
          })
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(checking.is_opening_locked).toBe(true);

      // Verify summary has total income 1200.00 and bank balance 2200.00
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.body.data.bank_balance).toBe(2200.00);
      expect(summaryRes.body.data.total_income).toBe(1200.00);
    });

    it('retries safely and succeeds when initial attempt encounters an ACCOUNT_LOCK_CONCURRENCY_CONFLICT race', async () => {
      const checking = mockAccounts.find((a) => a.id === CHECKING_ID)!;
      checking.opening_balance = new Prisma.Decimal('1000.00');
      checking.is_opening_locked = false;

      // Mock accountLock.service lockAccounts to throw once with ACCOUNT_LOCK_CONCURRENCY_CONFLICT, then succeed
      const { lockAccounts, AccountLockError } = await import('../../src/services/accountLock.service.js');
      let callCount = 0;

      // Import the income.service recordIncome directly
      const { recordIncome } = await import('../../src/services/income.service.js');
      const { prisma } = await import('../../src/prisma.js');

      // Create a wrapped prisma client where the first transaction call fails with concurrency conflict inside lockAccounts
      const original$transaction = prisma.$transaction;
      (prisma as any).$transaction = vi.fn(async (cb: any) => {
        callCount++;
        if (callCount === 1) {
          throw new AccountLockError(
            'Concurrency conflict: expected to lock 1 account(s), but updated 0. Aborting transaction.',
            'ACCOUNT_LOCK_CONCURRENCY_CONFLICT'
          );
        }
        return original$transaction(cb);
      });

      const result = await recordIncome('user-a-uuid', {
        primary_account_id: CHECKING_ID,
        total_amount: '2500.00',
        transaction_date: '2026-11-06',
        income_account_id: SALARY_ID
      });

      expect(result).toBeDefined();
      expect(result.transaction.total_amount).toBe('2500.00');
      expect(callCount).toBe(2); // Attempt 1 threw concurrency conflict; attempt 2 succeeded

      // Restore original $transaction
      (prisma as any).$transaction = original$transaction;
    });

    it('excludes non-income transaction forms (e.g. PAYMENT_CHARGE) from total_income in summary report', async () => {
      // 1. Manually insert a transaction with form PAYMENT_CHARGE targeting an income account
      const txnRecord: MockTransactionRecord = {
        id: 'txn-non-income-test',
        user_id: 'user-a-uuid',
        primary_account_id: CHECKING_ID,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('750.00'),
        transaction_date: new Date('2026-11-06'),
        description: 'Payment Charge test',
        created_at: new Date()
      };
      mockTransactions.push(txnRecord);
      mockAllocationLines.push({
        id: 'alloc-non-income-test',
        transaction_id: txnRecord.id,
        target_account_id: SALARY_ID,
        amount: new Prisma.Decimal('750.00'),
        notes: null
      });

      // 2. Query summary report
      const summaryRes = await request(app)
        .get('/api/reports/summary')
        .set('Cookie', userACookie);

      expect(summaryRes.status).toBe(200);
      // total_income must strictly exclude PAYMENT_CHARGE transactions even if allocated to an income account
      expect(summaryRes.body.data.total_income).toBe(0.00);
    });
  });
});
