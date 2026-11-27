import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env.js';
import {
  findMockUser,
  mockTransactions,
  resetMockAccounts,
  resetMockTransactions
} from '../fixtures/mockPrisma.js';

const mockAuditLogs: any[] = [];

vi.mock('../../src/prisma.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }) => findMockUser(where))
      },
      transaction: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            mockTransactions.find((t) => {
              if (where?.id && t.id !== where.id) return false;
              if (where?.user_id && t.user_id !== where.user_id) return false;
              return true;
            }) || null
          );
        })
      },
      transactionAuditLog: {
        findMany: vi.fn(async ({ where }: any) => {
          return mockAuditLogs
            .filter((log) => {
              if (where?.transaction_id && log.transaction_id !== where.transaction_id) return false;
              if (where?.user_id && log.user_id !== where.user_id) return false;
              return true;
            })
            .sort((a, b) => {
              const seqDiff = Number(b.sequence_number) - Number(a.sequence_number);
              if (seqDiff !== 0) return seqDiff;
              const timeDiff = b.created_at.getTime() - a.created_at.getTime();
              if (timeDiff !== 0) return timeDiff;
              return b.id.localeCompare(a.id);
            });
        })
      }
    }
  };
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

describe('Integration Test: Transaction Audit History (F-18, TEST-AUDIT-01, TEST-AUDIT-04, TEST-AUDIT-05)', () => {
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
    mockAuditLogs.length = 0;

    mockTransactions.push({
      id: 'txn-audit-1',
      user_id: 'user-a-uuid',
      primary_account_id: 'acc-demo-checking',
      form: 'RECEIVE_MONEY',
      total_amount: 25000 as any,
      transaction_date: new Date('2026-11-02'),
      description: 'Salary adjusted',
      created_at: new Date('2026-11-02T10:00:00Z')
    });

    const sameTimestamp = new Date('2026-11-05T12:00:00.000Z');
    mockAuditLogs.push(
      {
        id: 'log-uuid-zzz',
        sequence_number: BigInt(1),
        transaction_id: 'txn-audit-1',
        user_id: 'user-a-uuid',
        action: 'CORRECTED',
        previous_snapshot: { total_amount: '20000.00', transaction_date: '2026-11-02', description: 'Salary', allocations: [] },
        new_snapshot: { total_amount: '22000.00', transaction_date: '2026-11-02', description: 'Salary + bonus', allocations: [] },
        created_at: sameTimestamp
      },
      {
        id: 'log-uuid-aaa',
        sequence_number: BigInt(2),
        transaction_id: 'txn-audit-1',
        user_id: 'user-a-uuid',
        action: 'CORRECTED',
        previous_snapshot: { total_amount: '22000.00', transaction_date: '2026-11-02', description: 'Salary + bonus', allocations: [] },
        new_snapshot: { total_amount: '25000.00', transaction_date: '2026-11-02', description: 'Salary adjusted', allocations: [] },
        created_at: sameTimestamp
      }
    );
  });

  it('TEST-AUDIT-01: returns immutable audit logs ordered deterministically in reverse chronological order (sequence_number DESC) even on identical timestamps', async () => {
    const res = await request(app)
      .get('/api/transactions/txn-audit-1/audit-history')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction_id).toBe('txn-audit-1');
    expect(res.body.data.audit_logs).toHaveLength(2);
    expect(res.body.data.audit_logs[0].sequence_number).toBe(2);
    expect(res.body.data.audit_logs[0].new_snapshot.total_amount).toBe('25000.00');
    expect(res.body.data.audit_logs[1].sequence_number).toBe(1);
    expect(res.body.data.audit_logs[1].new_snapshot.total_amount).toBe('22000.00');
  });

  it('TEST-AUDIT-04: rejects cross-tenant audit history access (404 NOT_FOUND) and ADMIN access (403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN)', async () => {
    const crossTenantRes = await request(app)
      .get('/api/transactions/txn-audit-1/audit-history')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', otherUserCookie);

    expect(crossTenantRes.status).toBe(404);
    expect(crossTenantRes.body.error.code).toBe('NOT_FOUND');

    const adminRes = await request(app)
      .get('/api/transactions/txn-audit-1/audit-history')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', adminCookie);

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('ADMIN_FINANCIAL_ACCESS_FORBIDDEN');
  });

  it('TEST-AUDIT-05 (API): rejects PUT/PATCH/DELETE on audit-history and audit-history/:logId while preserving all snapshots', async () => {
    for (const path of [
      '/api/transactions/txn-audit-1/audit-history',
      '/api/transactions/txn-audit-1/audit-history/log-uuid-aaa'
    ]) {
      const putRes = await request(app)
        .put(path)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userDemoCookie)
        .send({});
      expect([404, 405]).toContain(putRes.status);

      const patchRes = await request(app)
        .patch(path)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userDemoCookie)
        .send({});
      expect([404, 405]).toContain(patchRes.status);

      const deleteRes = await request(app)
        .delete(path)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', userDemoCookie);
      expect([404, 405]).toContain(deleteRes.status);
    }

    // Re-query to prove both audit logs remain intact
    const verifyRes = await request(app)
      .get('/api/transactions/txn-audit-1/audit-history')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', userDemoCookie);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.audit_logs).toHaveLength(2);
  });
});
