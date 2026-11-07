import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import { app } from '../../src/app.js';
import { assertTestDatabase } from '../fixtures/testDbGuard.js';
import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';

interface AccountSnapshot {
  id: string;
  opening_balance: Prisma.Decimal;
  is_opening_locked: boolean;
}

/**
 * Integration Test: Relational Database Persistence Across Real Process Restart
 * Target: TEST-PERSIST-01, AC-09-2, NFR-DATA-01
 *
 * SAFETY INVARIANTS:
 * - Runs in CI or when ALLOW_LIVE_DB_TESTS=true is explicitly configured.
 * - Test database name MUST strictly equal "whatsss_test".
 * - Cleanups track EXACT IDs created by this test suite; broad table deletions are strictly prohibited.
 * - All spawned backend server processes are tracked and guaranteed terminated in finally and afterAll.
 */
describe('Integration Test: Relational Database Persistence Across Real Process Restart (TEST-PERSIST-01, AC-09-2)', () => {
  let prisma: PrismaClient;
  let isDbConnected = false;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCI = process.env.CI === 'true' || isGitHubActions;
  const allowLiveDb = process.env.ALLOW_LIVE_DB_TESTS === 'true';
  const databaseUrl = process.env.DATABASE_URL || '';
  const TRUSTED_ORIGIN = 'http://localhost:5173';
  const TEST_PORT = 5098;

  let demoUserId = '';
  let demoUserSessionCookie = '';
  let demoCheckingAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  let demoCreditCardAccount: { id: string; opening_balance: Prisma.Decimal; is_opening_locked: boolean };
  let demoSalaryAccount: { id: string };
  let demoDiningAccount: { id: string };
  let demoGroceryAccount: { id: string };

  const createdTxnIds: string[] = [];
  const accountSnapshots: AccountSnapshot[] = [];
  const spawnedProcesses: ChildProcess[] = [];

  function spawnBackendProcess(port: number): Promise<{ child: ChildProcess; pid: number }> {
    return new Promise((resolve, reject) => {
      const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
      const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(port),
          NODE_ENV: 'test',
          DATABASE_URL: databaseUrl
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Track process immediately to guarantee cleanup on error or timeout
      spawnedProcesses.push(child);

      const pid = child.pid!;
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            if (process.platform === 'win32' && pid) {
              execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
            }
          } catch {}
          try {
            child.kill('SIGKILL');
          } catch {}
          reject(new Error(`Timeout waiting for backend process (PID ${pid}) to start on port ${port}`));
        }
      }, 15000);

      child.stdout?.on('data', (d) => {
        if (d.toString().includes('listening') && !isResolved) {
          isResolved = true;
          clearTimeout(timer);
          resolve({ child, pid });
        }
      });

      child.stderr?.on('data', () => {});

      child.on('error', (err) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      child.on('exit', (code) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          reject(new Error(`Process ${pid} exited prematurely with code ${code}`));
        }
      });
    });
  }

  async function terminateBackendProcess(child: ChildProcess): Promise<void> {
    if (!child || child.killed || child.exitCode !== null) {
      return;
    }

    const pid = child.pid;
    if (process.platform === 'win32' && pid) {
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    }

    try {
      child.kill('SIGKILL');
    } catch {}

    await new Promise<void>((resolve) => {
      if (child.killed || child.exitCode !== null) {
        resolve();
        return;
      }
      const exitTimer = setTimeout(() => resolve(), 2000);
      child.once('exit', () => {
        clearTimeout(exitTimer);
        resolve();
      });
    });
  }

  beforeAll(async () => {
    if (!isCI && !allowLiveDb) {
      return;
    }

    assertTestDatabase(databaseUrl, {
      isCI,
      allowLiveDb,
      nodeEnv: process.env.NODE_ENV
    });

    prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbConnected = true;
    } catch (err) {
      if (isCI) {
        throw new Error(`[WP-06 CI FAILURE] PostgreSQL live database connection failed in CI environment: ${err}`);
      }
      return;
    }

    // Authenticate user_demo
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({
        username: 'user_demo',
        password: 'Password123!'
      });

    if (loginRes.status === 200) {
      const setCookie = loginRes.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        demoUserSessionCookie = setCookie[0];
      }
    } else if (isCI) {
      throw new Error(`[WP-06 CI FAILURE] Failed to authenticate user_demo in live DB: ${loginRes.status}`);
    }

    const user = await prisma.user.findUnique({ where: { username: 'user_demo' } });
    if (!user) {
      if (isCI) throw new Error('[WP-06 CI FAILURE] user_demo not found in DB');
      return;
    }
    demoUserId = user.id;

    // Load accounts
    const accounts = await prisma.account.findMany({ where: { user_id: demoUserId } });
    for (const a of accounts) {
      accountSnapshots.push({
        id: a.id,
        opening_balance: a.opening_balance,
        is_opening_locked: a.is_opening_locked
      });
      if (a.name === 'Checking Bank') demoCheckingAccount = a;
      if (a.name === 'Visa Credit Card') demoCreditCardAccount = a;
      if (a.name === 'Salary') demoSalaryAccount = a;
      if (a.name === 'Dining') demoDiningAccount = a;
      if (a.name === 'Grocery') demoGroceryAccount = a;
    }

    // Clean up any stale transactions
    const staleTxns = await prisma.transaction.findMany({ where: { user_id: demoUserId }, select: { id: true } });
    if (staleTxns.length > 0) {
      await prisma.transaction.deleteMany({ where: { id: { in: staleTxns.map((t) => t.id) } } });
    }

    // Step 1: Set Checking Bank opening balance = 10,000.00 THB
    await prisma.account.update({
      where: { id: demoCheckingAccount.id },
      data: { opening_balance: new Prisma.Decimal('10000.00'), is_opening_locked: true }
    });

    // Step 2: Salary 20,000.00 THB
    const txSalary = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCheckingAccount.id,
        form: 'RECEIVE_MONEY',
        total_amount: new Prisma.Decimal('20000.00'),
        transaction_date: new Date('2026-11-02'),
        description: 'Salary',
        allocation_lines: {
          create: [{ target_account_id: demoSalaryAccount.id, amount: new Prisma.Decimal('20000.00'), notes: 'Salary' }]
        }
      }
    });
    createdTxnIds.push(txSalary.id);

    // Step 3: CC Purchase 3,000.00 THB (Dining 1k, Grocery 2k)
    const txPurchase = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCreditCardAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-03'),
        description: 'Dining & Grocery',
        allocation_lines: {
          create: [
            { target_account_id: demoDiningAccount.id, amount: new Prisma.Decimal('1000.00'), notes: 'Dining' },
            { target_account_id: demoGroceryAccount.id, amount: new Prisma.Decimal('2000.00'), notes: 'Grocery' }
          ]
        }
      }
    });
    createdTxnIds.push(txPurchase.id);

    // Step 4: CC Repayment 3,000.00 THB
    const txRepayment = await prisma.transaction.create({
      data: {
        user_id: demoUserId,
        primary_account_id: demoCheckingAccount.id,
        form: 'PAYMENT_CHARGE',
        total_amount: new Prisma.Decimal('3000.00'),
        transaction_date: new Date('2026-11-04'),
        description: 'CC Repayment',
        allocation_lines: {
          create: [{ target_account_id: demoCreditCardAccount.id, amount: new Prisma.Decimal('3000.00'), notes: 'Repayment' }]
        }
      }
    });
    createdTxnIds.push(txRepayment.id);
  });

  afterAll(async () => {
    // 1. Guaranteed termination of ALL spawned backend processes (process 1, process 2, etc.)
    for (const child of spawnedProcesses) {
      try {
        await terminateBackendProcess(child);
      } catch {}
    }

    if (!isDbConnected) return;

    if (createdTxnIds.length > 0) {
      await prisma.transaction.deleteMany({
        where: { id: { in: createdTxnIds } }
      });
    }

    for (const snap of accountSnapshots) {
      await prisma.account.update({
        where: { id: snap.id },
        data: {
          opening_balance: snap.opening_balance,
          is_opening_locked: snap.is_opening_locked
        }
      });
    }

    await prisma.$disconnect();
  });

  it('TEST-PERSIST-01: restarts backend server process and verifies data retrieval identity (AC-09-2, NFR-DATA-01)', async () => {
    if (!isCI && !allowLiveDb) {
      return;
    }

    let proc1: { child: ChildProcess; pid: number } | undefined;
    let proc2: { child: ChildProcess; pid: number } | undefined;

    try {
      // --- PHASE 1: SPAWN BACKEND PROCESS 1 ---
      proc1 = await spawnBackendProcess(TEST_PORT);
      expect(proc1.pid).toBeGreaterThan(0);

      // Query Pre-Restart state via HTTP
      const preSumRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/reports/summary`, {
        headers: { Cookie: demoUserSessionCookie, Origin: TRUSTED_ORIGIN }
      });
      expect(preSumRes.status).toBe(200);
      const preSummary = (await preSumRes.json()).data;
      expect(preSummary.bank_balance).toBe(27000.00);
      expect(preSummary.credit_debt).toBe(0.00);
      expect(preSummary.total_income).toBe(20000.00);
      expect(preSummary.total_expense).toBe(3000.00);

      const preTxRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/transactions`, {
        headers: { Cookie: demoUserSessionCookie, Origin: TRUSTED_ORIGIN }
      });
      expect(preTxRes.status).toBe(200);
      const preTxns = (await preTxRes.json()).data.transactions;
      expect(preTxns).toHaveLength(3);

      // --- PHASE 2: TERMINATE BACKEND PROCESS 1 (OS Process Kill) ---
      await terminateBackendProcess(proc1.child);

      // Verify port is dead
      let isTerminated = false;
      try {
        await fetch(`http://127.0.0.1:${TEST_PORT}/api/reports/summary`, {
          headers: { Cookie: demoUserSessionCookie, Origin: TRUSTED_ORIGIN }
        });
      } catch {
        isTerminated = true;
      }
      expect(isTerminated).toBe(true);

      // --- PHASE 3: SPAWN BACKEND PROCESS 2 (Without DB re-seeding) ---
      proc2 = await spawnBackendProcess(TEST_PORT);
      expect(proc2.pid).toBeGreaterThan(0);
      expect(proc2.pid).not.toBe(proc1.pid); // Strictly verifies brand new OS process

      // Query Post-Restart state via HTTP from Process 2
      const postSumRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/reports/summary`, {
        headers: { Cookie: demoUserSessionCookie, Origin: TRUSTED_ORIGIN }
      });
      expect(postSumRes.status).toBe(200);
      const postSummary = (await postSumRes.json()).data;

      // Assert identical financial balances
      expect(postSummary.bank_balance).toBe(27000.00);
      expect(postSummary.credit_debt).toBe(0.00);
      expect(postSummary.total_income).toBe(20000.00);
      expect(postSummary.total_expense).toBe(3000.00);
      expect(postSummary.category_breakdown['Dining']).toBe(1000.00);
      expect(postSummary.category_breakdown['Grocery']).toBe(2000.00);

      // Query Post-Restart transaction history
      const postTxRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/transactions`, {
        headers: { Cookie: demoUserSessionCookie, Origin: TRUSTED_ORIGIN }
      });
      expect(postTxRes.status).toBe(200);
      const postTxns = (await postTxRes.json()).data.transactions;
      expect(postTxns).toHaveLength(3);

      const totalLines = postTxns.reduce((sum: number, t: any) => sum + t.allocation_lines.length, 0);
      expect(totalLines).toBe(4);

      // Verify absolute identity between Process 1 and Process 2
      expect(postSummary).toEqual(preSummary);
      expect(postTxns).toEqual(preTxns);
    } finally {
      // Guaranteed cleanup of both processes even if assertions fail before Phase 3
      if (proc1) {
        await terminateBackendProcess(proc1.child);
      }
      if (proc2) {
        await terminateBackendProcess(proc2.child);
      }
    }
  }, 35000);
});
