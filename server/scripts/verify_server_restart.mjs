import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(SERVER_DIR, '../docs/sprints/sprint-1/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Enforces comprehensive database safety invariants before any script activity (Priority 1, Safety Rule).
 * Strictly requires the connected database to be "whatsss_test" on an authorized local/container host.
 * Rejects "whatsss_db" (development database) and any production/unapproved database immediately.
 * Sanitizes error messages to prevent leaking credentials or connection strings.
 */
export function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    throw new Error('FATAL: DATABASE_URL environment variable is required.');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: NODE_ENV is set to "production". Live test scripts are strictly forbidden in production.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('FATAL: DATABASE_URL is not a valid URL.');
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error(`FATAL: Unsupported database protocol "${protocol}". Expected "postgresql:" or "postgres:".`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedHosts = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'];
  if (!allowedHosts.includes(hostname)) {
    throw new Error(`FATAL: Live DB operations are restricted to local/container test instances. Host "${hostname}" is not permitted.`);
  }

  const dbName = parsedUrl.pathname.replace(/^\//, '').toLowerCase();
  if (!dbName) {
    throw new Error('FATAL: DATABASE_URL does not specify a database name.');
  }

  const forbiddenKeywords = ['prod', 'production', 'live', 'staging', 'dev', 'development'];
  for (const keyword of forbiddenKeywords) {
    if (dbName.includes(keyword)) {
      throw new Error(`FATAL: Database name contains forbidden keyword "${keyword}".`);
    }
  }

  if (dbName === 'whatsss_db') {
    throw new Error(
      'FATAL: Database name "whatsss_db" is the development database, not an isolated test database. ' +
      'This script only supports the dedicated test database "whatsss_test".'
    );
  }

  if (dbName !== 'whatsss_test') {
    throw new Error(`FATAL: Database name "${dbName}" is not the authorized test database. Expected exact match: "whatsss_test".`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  } else {
    try {
      execSync(`pkill -P ${pid} 2>/dev/null || true; kill -9 ${pid} 2>/dev/null || true`, { stdio: 'ignore' });
    } catch {}
  }
}

async function terminateAndVerifyProcess(pid, timeoutMs = 7000) {
  if (!pid || !isProcessRunning(pid)) return;

  await killProcessTree(pid);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return;
    }
    await sleep(200);
  }

  // Second aggressive kill attempt if still active
  await killProcessTree(pid);
  await sleep(300);

  if (isProcessRunning(pid)) {
    throw new Error(`Process with PID ${pid} could not be terminated and is still running after ${timeoutMs}ms.`);
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, {
        headers: { Origin: 'http://localhost:5173' }
      });
      return true;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Timeout waiting for server at ${url} after ${timeoutMs}ms`);
}

async function waitForServerDown(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      await sleep(200);
    } catch {
      return true;
    }
  }
  throw new Error(`Server at ${url} is still responding after ${timeoutMs}ms; termination verification failed.`);
}

const spawnedProcesses = [];

function spawnServerProcess(port) {
  const distIndex = path.resolve(SERVER_DIR, 'dist/index.js');
  const tsxCli = path.resolve(SERVER_DIR, 'node_modules/tsx/dist/cli.mjs');
  const args = fs.existsSync(distIndex) ? [distIndex] : [tsxCli, 'src/index.ts'];

  const proc = spawn(process.execPath, args, {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  spawnedProcesses.push(proc);
  return proc;
}

async function main() {
  console.log('======================================================================');
  console.log('   STARTING REAL BACKEND SERVER PROCESS RESTART VERIFICATION');
  console.log('======================================================================\n');

  // Step 1: Enforce Database Guard BEFORE any connections or mutations
  console.log('[STEP 1] Validating database safety guard...');
  assertTestDatabase();
  console.log('[STEP 1] Database guard passed: connected to isolated test database "whatsss_test".\n');

  const PORT = process.env.RESTART_TEST_PORT || '5099';
  const BASE_URL = `http://localhost:${PORT}`;

  let prisma = null;
  let browser = null;
  let testUser = null;
  let testAccounts = null;
  const createdTxnIds = [];
  let demoUserInitialSnapshot = null;

  try {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } }
    });

    // Verify DB connectivity
    await prisma.$queryRaw`SELECT 1`;

    // Step 2: Capture initial user_demo baseline to verify data isolation
    console.log('[STEP 2] Verifying and capturing baseline of user_demo (data isolation check)...');
    const demoUser = await prisma.user.findUnique({
      where: { username: 'user_demo' },
      include: {
        accounts: { orderBy: { id: 'asc' } },
        transactions: { select: { id: true }, orderBy: { id: 'asc' } }
      }
    });

    if (demoUser) {
      demoUserInitialSnapshot = {
        userId: demoUser.id,
        txnCount: demoUser.transactions.length,
        transactionIds: demoUser.transactions.map((t) => t.id).sort(),
        accountIds: demoUser.accounts.map((a) => a.id).sort(),
        accounts: demoUser.accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          opening_balance: a.opening_balance.toFixed(2),
          is_opening_locked: a.is_opening_locked
        }))
      };
      console.log(`[STEP 2] user_demo baseline captured (${demoUserInitialSnapshot.txnCount} transactions, ${demoUserInitialSnapshot.accounts.length} accounts).`);
    } else {
      console.log('[STEP 2] user_demo not present in test database; skipping demo user baseline check.');
    }

    // Provision dedicated isolated Test User and Accounts for WP-06 Restart Script atomically
    console.log('[STEP 2] Provisioning isolated test tenant and accounts atomically...');
    const uniqueToken = `restart_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const username = `test_restart_${uniqueToken}`;
    const rawPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const { user: createdTestUser, checkingAcc, ccAcc, salaryAcc, diningAcc, groceryAcc } = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username,
          email: `${username}@whatsss.test`,
          password_hash: passwordHash,
          role: 'USER',
          is_active: true
        }
      });

      const cb = await tx.account.create({
        data: {
          user_id: u.id,
          name: 'Checking Bank',
          type: 'CASH',
          opening_balance: new Prisma.Decimal('0.00'),
          is_opening_locked: false
        }
      });

      const cc = await tx.account.create({
        data: {
          user_id: u.id,
          name: 'Visa Credit Card',
          type: 'LOAN_TAKEN',
          opening_balance: new Prisma.Decimal('0.00'),
          is_opening_locked: false
        }
      });

      const sal = await tx.account.create({
        data: {
          user_id: u.id,
          name: 'Salary',
          type: 'INCOME',
          opening_balance: new Prisma.Decimal('0.00'),
          is_opening_locked: false
        }
      });

      const din = await tx.account.create({
        data: {
          user_id: u.id,
          name: 'Dining',
          type: 'EXPENSE',
          opening_balance: new Prisma.Decimal('0.00'),
          is_opening_locked: false
        }
      });

      const gro = await tx.account.create({
        data: {
          user_id: u.id,
          name: 'Grocery',
          type: 'EXPENSE',
          opening_balance: new Prisma.Decimal('0.00'),
          is_opening_locked: false
        }
      });

      return { user: u, checkingAcc: cb, ccAcc: cc, salaryAcc: sal, diningAcc: din, groceryAcc: gro };
    });

    testUser = createdTestUser;
    testAccounts = { checkingAcc, ccAcc, salaryAcc, diningAcc, groceryAcc };
    console.log(`[STEP 2] Isolated test user created atomically: ${username} with 5 dedicated financial accounts.\n`);

    // Step 3: Start Server Process 1
    console.log(`[STEP 3] Spawning Backend Server Process 1 on port ${PORT}...`);
    const proc1 = spawnServerProcess(PORT);
    const pid1 = proc1.pid;
    console.log(`[STEP 3] Server Process 1 spawned with PID: ${pid1}`);

    await waitForServer(`${BASE_URL}/api/accounts`);
    console.log(`[STEP 3] Server Process 1 is listening and responsive on ${BASE_URL}\n`);

    // Step 4: Login as the isolated test user
    console.log(`[STEP 4] Authenticating as ${username} on Process 1...`);
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        username,
        password: rawPassword
      })
    });

    const loginJson = await loginRes.json();
    if (!loginJson.success) {
      throw new Error(`Login failed for isolated user: ${JSON.stringify(loginJson)}`);
    }
    const setCookie = loginRes.headers.get('set-cookie');
    if (!setCookie) throw new Error('No set-cookie returned from login');
    const tokenCookie = setCookie.split(';')[0];
    console.log(`[STEP 4] Authenticated successfully. Auth Cookie: ${tokenCookie.substring(0, 25)}...\n`);

    // Step 5: Execute Golden Domain Journey on Process 1
    console.log('[STEP 5] Executing Golden Domain Journey on Server Process 1:');

    // 5.1: Opening Balance 10,000 THB
    console.log('  5.1 PATCH /api/accounts/:id/opening-balance (10,000.00 THB)...');
    const opRes = await fetch(`${BASE_URL}/api/accounts/${checkingAcc.id}/opening-balance`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: tokenCookie,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({ opening_balance: 10000.00 })
    });
    const opJson = await opRes.json();
    if (!opJson.success) throw new Error(`Opening balance failed: ${JSON.stringify(opJson)}`);
    console.log('      -> Success. Checking Bank opening balance set to 10,000.00 THB');

    // 5.2: Income 20,000 THB
    console.log('  5.2 POST /api/transactions/income (20,000.00 THB Salary)...');
    const incRes = await fetch(`${BASE_URL}/api/transactions/income`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: tokenCookie,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        primary_account_id: checkingAcc.id,
        income_account_id: salaryAcc.id,
        total_amount: '20000.00',
        transaction_date: '2026-11-02',
        description: 'November Salary Inflow'
      })
    });
    const incJson = await incRes.json();
    if (!incJson.success) throw new Error(`Income failed: ${JSON.stringify(incJson)}`);
    const incTxId = incJson?.data?.transaction?.id || incJson?.data?.id;
    if (incTxId) createdTxnIds.push(incTxId);
    console.log('      -> Success. Recorded 20,000.00 THB Salary Income');

    // 5.3: Expense 3,000 THB Split Purchase
    console.log('  5.3 POST /api/transactions/expense (3,000.00 THB Split Dining/Grocery)...');
    const expRes = await fetch(`${BASE_URL}/api/transactions/expense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: tokenCookie,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        primary_account_id: ccAcc.id,
        total_amount: '3000.00',
        transaction_date: '2026-11-03',
        description: 'Weekend Dining & Grocery',
        allocations: [
          { target_account_id: diningAcc.id, amount: '1000.00', notes: 'Dinner' },
          { target_account_id: groceryAcc.id, amount: '2000.00', notes: 'Weekly grocery' }
        ]
      })
    });
    const expJson = await expRes.json();
    if (!expJson.success) throw new Error(`Expense failed: ${JSON.stringify(expJson)}`);
    const expTxId = expJson?.data?.transaction?.id || expJson?.data?.id;
    if (expTxId) createdTxnIds.push(expTxId);
    console.log('      -> Success. Recorded 3,000.00 THB CC Split Purchase');

    // 5.4: Repayment 3,000 THB
    console.log('  5.4 POST /api/transactions/repayment (3,000.00 THB Full Repayment)...');
    const repRes = await fetch(`${BASE_URL}/api/transactions/repayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: tokenCookie,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        from_account_id: checkingAcc.id,
        to_account_id: ccAcc.id,
        amount: '3000.00',
        transaction_date: '2026-11-04',
        description: 'Full Credit Card Debt Repayment'
      })
    });
    const repJson = await repRes.json();
    if (!repJson.success) throw new Error(`Repayment failed: ${JSON.stringify(repJson)}`);
    const repTxId = repJson?.data?.transaction?.id || repJson?.data?.id;
    if (repTxId) createdTxnIds.push(repTxId);
    console.log('      -> Success. Recorded 3,000.00 THB CC Repayment\n');

    // Step 6: Query Pre-Restart State
    console.log('[STEP 6] Querying Pre-Restart State from Server Process 1 (PID: ' + pid1 + ')...');
    const preSumRes = await fetch(`${BASE_URL}/api/reports/summary`, {
      headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
    });
    const preSummary = (await preSumRes.json()).data;

    const preTxRes = await fetch(`${BASE_URL}/api/transactions`, {
      headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
    });
    const preTransactions = (await preTxRes.json()).data.transactions;
    for (const t of preTransactions) {
      if (!createdTxnIds.includes(t.id)) createdTxnIds.push(t.id);
    }

    console.log('--- PRE-RESTART METRICS (Process 1, PID: ' + pid1 + ') ---');
    console.log(`Bank Balance:     ${preSummary.bank_balance} THB (Expected: 27000.00)`);
    console.log(`Credit Card Debt: ${preSummary.credit_debt} THB (Expected: 0.00)`);
    console.log(`Total Income:     ${preSummary.total_income} THB (Expected: 20000.00)`);
    console.log(`Total Expense:    ${preSummary.total_expense} THB (Expected: 3000.00)`);
    console.log(`Dining:           ${preSummary.category_breakdown.Dining} THB (Expected: 1000.00)`);
    console.log(`Grocery:          ${preSummary.category_breakdown.Grocery} THB (Expected: 2000.00)`);
    console.log(`Transactions:     ${preTransactions.length} (Expected: 3)`);
    const preAllocCount = preTransactions.reduce((acc, t) => acc + (t.allocation_lines?.length || 0), 0);
    console.log(`Allocation Lines: ${preAllocCount} (Expected: 4)\n`);

    // Optional Puppeteer Pre-Restart Screenshots
    if (process.env.ENABLE_SCREENSHOTS === 'true') {
      try {
        console.log('[SCREENSHOT] Attempting Pre-Restart Screenshot Capture...');
        const puppeteer = (await import('puppeteer-core')).default;
        browser = await puppeteer.launch({
          executablePath: process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 960 });
        await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
        await page.type('input[type="text"]', username);
        await page.type('input[type="password"]', rawPassword);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_01_dashboard_pre.png') });

        await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_02_history_pre.png') });
        console.log('[SCREENSHOT] Pre-restart screenshots captured successfully.');
      } catch (shotErr) {
        console.warn(`[SCREENSHOT] Puppeteer pre-restart screenshot skipped: ${shotErr.message}`);
      }
    }

    // Step 7: STOP Backend Server Process 1
    console.log(`[STEP 7] Stopping Backend Server Process 1 (PID: ${pid1})...`);
    await terminateAndVerifyProcess(pid1);
    await waitForServerDown(`${BASE_URL}/api/accounts`);
    console.log(`[STEP 7] Verified Server Process 1 (PID: ${pid1}) is completely terminated.\n`);

    // Step 8: START Backend Server Process 2 (NO DB RESEEDING!)
    console.log('[STEP 8] Spawning Backend Server Process 2 (WITHOUT touching or re-seeding database)...');
    const proc2 = spawnServerProcess(PORT);
    const pid2 = proc2.pid;
    console.log(`[STEP 8] Server Process 2 spawned with NEW PID: ${pid2} (Different PID verified: ${pid2 !== pid1})`);

    await waitForServer(`${BASE_URL}/api/accounts`);
    console.log(`[STEP 8] Server Process 2 is up and listening on ${BASE_URL}\n`);

    // Step 9: Query Post-Restart State from Process 2
    console.log('[STEP 9] Querying Post-Restart State from Server Process 2 (PID: ' + pid2 + ')...');
    const postSumRes = await fetch(`${BASE_URL}/api/reports/summary`, {
      headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
    });
    const postSummary = (await postSumRes.json()).data;

    const postTxRes = await fetch(`${BASE_URL}/api/transactions`, {
      headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
    });
    const postTransactions = (await postTxRes.json()).data.transactions;

    console.log('--- POST-RESTART METRICS (Process 2, PID: ' + pid2 + ') ---');
    console.log(`Bank Balance:     ${postSummary.bank_balance} THB (Expected: 27000.00)`);
    console.log(`Credit Card Debt: ${postSummary.credit_debt} THB (Expected: 0.00)`);
    console.log(`Total Income:     ${postSummary.total_income} THB (Expected: 20000.00)`);
    console.log(`Total Expense:    ${postSummary.total_expense} THB (Expected: 3000.00)`);
    console.log(`Dining:           ${postSummary.category_breakdown.Dining} THB (Expected: 1000.00)`);
    console.log(`Grocery:          ${postSummary.category_breakdown.Grocery} THB (Expected: 2000.00)`);
    console.log(`Transactions:     ${postTransactions.length} (Expected: 3)`);
    const postAllocCount = postTransactions.reduce((acc, t) => acc + (t.allocation_lines?.length || 0), 0);
    console.log(`Allocation Lines: ${postAllocCount} (Expected: 4)\n`);

    // Optional Puppeteer Post-Restart Screenshots
    if (process.env.ENABLE_SCREENSHOTS === 'true' && browser) {
      try {
        console.log('[SCREENSHOT] Attempting Post-Restart Screenshot Capture...');
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();
        await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_03_dashboard_post.png') });

        await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_04_history_post.png') });
        console.log('[SCREENSHOT] Post-restart screenshots captured successfully.');
      } catch (shotErr) {
        console.warn(`[SCREENSHOT] Puppeteer post-restart screenshot skipped: ${shotErr.message}`);
      }
    }

    // Step 10: Assertion Comparison Matrix
    console.log('======================================================================');
    console.log('                  VERIFICATION COMPARISON MATRIX                      ');
    console.log('======================================================================');
    console.log(`Metric                     | Pre-Restart (P1:${pid1}) | Post-Restart (P2:${pid2}) | Match?`);
    console.log('---------------------------|-----------------------|------------------------|-------');

    const checks = [
      ['Bank Balance (THB)', preSummary.bank_balance, postSummary.bank_balance, 27000],
      ['Credit Debt (THB)', preSummary.credit_debt, postSummary.credit_debt, 0],
      ['Total Income (THB)', preSummary.total_income, postSummary.total_income, 20000],
      ['Total Expense (THB)', preSummary.total_expense, postSummary.total_expense, 3000],
      ['Dining Breakdown (THB)', preSummary.category_breakdown.Dining, postSummary.category_breakdown.Dining, 1000],
      ['Grocery Breakdown (THB)', preSummary.category_breakdown.Grocery, postSummary.category_breakdown.Grocery, 2000],
      ['Transactions Count', preTransactions.length, postTransactions.length, 3],
      ['Allocation Lines Count', preAllocCount, postAllocCount, 4]
    ];

    let allPassed = true;
    for (const [name, preVal, postVal, expected] of checks) {
      const isIdentical = String(preVal) === String(postVal) && Number(postVal) === Number(expected);
      if (!isIdentical) allPassed = false;
      const matchMark = isIdentical ? 'PASS' : 'FAIL';
      console.log(`${name.padEnd(26)} | ${String(preVal).padEnd(21)} | ${String(postVal).padEnd(22)} | ${matchMark}`);
    }
    console.log('---------------------------|-----------------------|------------------------|-------');

    if (allPassed) {
      console.log('\n>>> RESULT: SUCCESS! REAL SERVER PROCESS RESTART PERSISTENCE CONFIRMED! <<<');
    } else {
      throw new Error('Verification failed: Pre and post restart values do not match expected values.');
    }

    // Step 11: Assert user_demo remained completely unmodified (Data Isolation Verification)
    if (demoUserInitialSnapshot && prisma) {
      console.log('\n[DATA ISOLATION] Asserting user_demo remained 100% untouched (exact ID & attribute match)...');
      const currentDemo = await prisma.user.findUnique({
        where: { username: 'user_demo' },
        include: {
          accounts: { orderBy: { id: 'asc' } },
          transactions: { select: { id: true }, orderBy: { id: 'asc' } }
        }
      });
      if (currentDemo) {
        if (currentDemo.transactions.length !== demoUserInitialSnapshot.txnCount) {
          throw new Error(`DATA ISOLATION VIOLATION: user_demo transaction count changed from ${demoUserInitialSnapshot.txnCount} to ${currentDemo.transactions.length}!`);
        }

        const currentTxnIds = currentDemo.transactions.map((t) => t.id).sort();
        if (
          currentTxnIds.length !== demoUserInitialSnapshot.transactionIds.length ||
          currentTxnIds.some((id, idx) => id !== demoUserInitialSnapshot.transactionIds[idx])
        ) {
          throw new Error(`DATA ISOLATION VIOLATION: user_demo transaction IDs set altered! Baseline: [${demoUserInitialSnapshot.transactionIds.join(', ')}], Current: [${currentTxnIds.join(', ')}]`);
        }

        const currentAccIds = currentDemo.accounts.map((a) => a.id).sort();
        if (
          currentAccIds.length !== demoUserInitialSnapshot.accountIds.length ||
          currentAccIds.some((id, idx) => id !== demoUserInitialSnapshot.accountIds[idx])
        ) {
          throw new Error(`DATA ISOLATION VIOLATION: user_demo account IDs set altered! Baseline: [${demoUserInitialSnapshot.accountIds.join(', ')}], Current: [${currentAccIds.join(', ')}]`);
        }

        for (const baseAcc of demoUserInitialSnapshot.accounts) {
          const curAcc = currentDemo.accounts.find((a) => a.id === baseAcc.id);
          if (!curAcc) throw new Error(`DATA ISOLATION VIOLATION: user_demo account ${baseAcc.name} (${baseAcc.id}) missing!`);
          if (curAcc.name !== baseAcc.name) throw new Error(`DATA ISOLATION VIOLATION: user_demo account name changed for ${baseAcc.id}!`);
          if (curAcc.type !== baseAcc.type) throw new Error(`DATA ISOLATION VIOLATION: user_demo account type changed for ${baseAcc.name}!`);
          if (curAcc.opening_balance.toFixed(2) !== baseAcc.opening_balance) {
            throw new Error(`DATA ISOLATION VIOLATION: user_demo opening_balance changed from ${baseAcc.opening_balance} to ${curAcc.opening_balance.toFixed(2)}!`);
          }
          if (curAcc.is_opening_locked !== baseAcc.is_opening_locked) {
            throw new Error(`DATA ISOLATION VIOLATION: user_demo lock flag changed from ${baseAcc.is_opening_locked} to ${curAcc.is_opening_locked}!`);
          }
        }
      }
      console.log('[DATA ISOLATION] Verified: user_demo accounts, transactions, and exact IDs were 100% untouched!');
    }
  } finally {
    console.log('\n======================================================================');
    console.log('                 TEARDOWN & RESTORATION CLEANUP                       ');
    console.log('======================================================================');

    let cleanupFailed = false;
    const cleanupErrors = [];

    // 1. Close browser if opened
    if (browser) {
      try {
        console.log('[CLEANUP] Closing Puppeteer browser instance...');
        await browser.close();
        console.log('[CLEANUP] Puppeteer browser instance closed.');
      } catch (bErr) {
        console.error('[CLEANUP FAILURE] Failed to close browser cleanly:', bErr.message);
        cleanupFailed = true;
        cleanupErrors.push(`Browser close failed: ${bErr.message}`);
      }
    }

    // 2. Kill and verify all spawned server processes
    for (const p of spawnedProcesses) {
      if (p && p.pid) {
        try {
          console.log(`[CLEANUP] Terminating and verifying spawned backend server process (PID: ${p.pid})...`);
          await terminateAndVerifyProcess(p.pid);
          console.log(`[CLEANUP] Verified backend server process (PID: ${p.pid}) is stopped.`);
        } catch (procErr) {
          console.error(`[CLEANUP FAILURE] Failed to terminate server process (PID: ${p.pid}):`, procErr.message);
          cleanupFailed = true;
          cleanupErrors.push(`Process termination failed (PID: ${p.pid}): ${procErr.message}`);
        }
      }
    }

    // 3. Atomically delete isolated test fixtures
    if (testUser && prisma) {
      console.log(`[CLEANUP] Deleting isolated test fixtures for ${testUser.username}...`);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.allocationLine.deleteMany({
            where: {
              OR: [
                { transaction_id: { in: createdTxnIds } },
                { transaction: { user_id: testUser.id } },
                { target_account: { user_id: testUser.id } }
              ]
            }
          });
          await tx.transaction.deleteMany({
            where: {
              OR: [
                { id: { in: createdTxnIds } },
                { user_id: testUser.id }
              ]
            }
          });
          await tx.account.deleteMany({
            where: { user_id: testUser.id }
          });
          await tx.user.delete({
            where: { id: testUser.id }
          });
        });
        console.log(`[CLEANUP] Isolated test fixtures for ${testUser.username} removed completely.`);
      } catch (cleanErr) {
        console.error('[CLEANUP FAILURE] Could not cleanly remove test fixtures:', cleanErr.message);
        cleanupFailed = true;
        cleanupErrors.push(`Fixture deletion failed: ${cleanErr.message}`);
      }
    }

    // 4. Disconnect prisma client
    if (prisma) {
      try {
        console.log('[CLEANUP] Closing Prisma database connection...');
        await prisma.$disconnect();
        console.log('[CLEANUP] Prisma database connection closed.');
      } catch (prismaErr) {
        console.error('[CLEANUP FAILURE] Failed to disconnect Prisma cleanly:', prismaErr.message);
        cleanupFailed = true;
        cleanupErrors.push(`Prisma disconnect failed: ${prismaErr.message}`);
      }
    }

    if (cleanupFailed) {
      console.error('\n>>> SCRIPT CLEANUP FAILED! The following cleanup steps encountered errors: <<<');
      for (const err of cleanupErrors) {
        console.error(`  - ${err}`);
      }
      process.exitCode = 1;
      throw new Error(`Script cleanup failed across ${cleanupErrors.length} step(s): ${cleanupErrors.join('; ')}`);
    } else {
      console.log('[CLEANUP] All cleanup and teardown steps completed cleanly.\n');
    }
  }
}

main().catch((err) => {
  console.error('\nERROR OCCURRED DURING RESTART VERIFICATION:', err.message || err);
  process.exit(1);
});
