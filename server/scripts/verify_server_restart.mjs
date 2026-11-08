import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient, Prisma } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(SERVER_DIR, '../docs/sprints/sprint-1/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Enforces database safety invariants before any script activity (Priority 1, Safety Rule).
 * Strictly requires the connected database to be "whatsss_test".
 * Rejects "whatsss_db" (development database) and any production/unapproved database immediately.
 */
export function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${databaseUrl}`);
  }

  const databaseName = parsedUrl.pathname.replace(/^\//, '');

  if (databaseName !== 'whatsss_test') {
    throw new Error(
      `Unsafe database: "${databaseName}". This script only supports "whatsss_test".`
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NODE_ENV is set to "production". Execution is strictly forbidden.');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

let prismaClientInstance = null;
const spawnedProcesses = [];
const createdTxnIds = [];
const accountSnapshots = [];

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

  // Step 1: Enforce Database Guard
  console.log('[STEP 1] Validating database safety guard...');
  assertTestDatabase();
  console.log('[STEP 1] Database guard passed: connected to isolated test database "whatsss_test".\n');

  const PORT = process.env.RESTART_TEST_PORT || '5099';
  const BASE_URL = `http://localhost:${PORT}`;

  prismaClientInstance = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } }
  });

  // Verify DB connectivity
  await prismaClientInstance.$queryRaw`SELECT 1`;

  // Step 2: Snapshot and prepare fixtures
  console.log('[STEP 2] Inspecting test fixtures and taking account snapshots...');
  const user = await prismaClientInstance.user.findUnique({
    where: { username: 'user_demo' },
    include: { accounts: true }
  });

  if (!user) {
    throw new Error('user_demo not found in whatsss_test. Please run npm run prisma:seed on whatsss_test first.');
  }

  for (const a of user.accounts) {
    accountSnapshots.push({
      id: a.id,
      name: a.name,
      opening_balance: a.opening_balance,
      is_opening_locked: a.is_opening_locked
    });
  }

  // Clear any stale transactions on whatsss_test from previous runs to ensure clean baseline
  const staleTxns = await prismaClientInstance.transaction.findMany({
    where: { user_id: user.id },
    select: { id: true }
  });
  if (staleTxns.length > 0) {
    console.log(`[STEP 2] Cleaning up ${staleTxns.length} stale transactions from prior tests on whatsss_test...`);
    await prismaClientInstance.allocationLine.deleteMany({
      where: { transaction: { user_id: user.id } }
    });
    await prismaClientInstance.transaction.deleteMany({
      where: { user_id: user.id }
    });
  }

  // Unlock accounts for opening balance configuration
  await prismaClientInstance.account.updateMany({
    where: { user_id: user.id },
    data: { is_opening_locked: false }
  });

  console.log(`[STEP 2] Snapshotted ${accountSnapshots.length} accounts. Fixture state prepared.\n`);

  try {
    // Step 3: Start Server Process 1
    console.log(`[STEP 3] Spawning Backend Server Process 1 on port ${PORT}...`);
    const proc1 = spawnServerProcess(PORT);
    const pid1 = proc1.pid;
    console.log(`[STEP 3] Server Process 1 spawned with PID: ${pid1}`);

    await waitForServer(`${BASE_URL}/api/accounts`);
    console.log(`[STEP 3] Server Process 1 is listening and responsive on ${BASE_URL}\n`);

    // Step 4: Login as user_demo
    console.log('[STEP 4] Authenticating as user_demo on Process 1...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        username: 'user_demo',
        password: 'Password123!'
      })
    });

    const loginJson = await loginRes.json();
    if (!loginJson.success) {
      throw new Error(`Login failed: ${JSON.stringify(loginJson)}`);
    }
    const setCookie = loginRes.headers.get('set-cookie');
    if (!setCookie) throw new Error('No set-cookie returned from login');
    const tokenCookie = setCookie.split(';')[0];
    console.log(`[STEP 4] Authenticated successfully. Auth Cookie: ${tokenCookie.substring(0, 25)}...\n`);

    // Step 5: Fetch Accounts
    console.log('[STEP 5] Fetching accounts for user_demo...');
    const accRes = await fetch(`${BASE_URL}/api/accounts`, {
      headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
    });
    const accJson = await accRes.json();
    const accounts = accJson.data.accounts;

    const checkingAcc = accounts.find((a) => a.name === 'Checking Bank');
    const ccAcc = accounts.find((a) => a.name === 'Visa Credit Card');
    const salaryAcc = accounts.find((a) => a.name === 'Salary');
    const diningAcc = accounts.find((a) => a.name === 'Dining');
    const groceryAcc = accounts.find((a) => a.name === 'Grocery');

    console.log(`Checking Bank ID: ${checkingAcc.id}`);
    console.log(`Visa Credit Card ID: ${ccAcc.id}`);
    console.log(`Salary ID: ${salaryAcc.id}`);
    console.log(`Dining ID: ${diningAcc.id}`);
    console.log(`Grocery ID: ${groceryAcc.id}\n`);

    // Step 6: Execute Golden Domain Journey
    console.log('[STEP 6] Executing Golden Domain Journey on Server Process 1:');

    // 6.1: Opening Balance 10,000 THB
    console.log('  6.1 PATCH /api/accounts/:id/opening-balance (10,000.00 THB)...');
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

    // 6.2: Income 20,000 THB
    console.log('  6.2 POST /api/transactions/income (20,000.00 THB Salary)...');
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

    // 6.3: Expense 3,000 THB Split Purchase
    console.log('  6.3 POST /api/transactions/expense (3,000.00 THB Split Dining/Grocery)...');
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

    // 6.4: Repayment 3,000 THB
    console.log('  6.4 POST /api/transactions/repayment (3,000.00 THB Full Repayment)...');
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

    // Step 7: Query Pre-Restart State
    console.log('[STEP 7] Querying Pre-Restart State from Server Process 1 (PID: ' + pid1 + ')...');
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
        const browser = await puppeteer.launch({
          executablePath: process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 960 });
        await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
        await page.type('input[type="text"]', 'user_demo');
        await page.type('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_01_dashboard_pre.png') });

        await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_02_history_pre.png') });
        await browser.close();
        console.log('[SCREENSHOT] Pre-restart screenshots captured successfully.');
      } catch (shotErr) {
        console.warn(`[SCREENSHOT] Puppeteer pre-restart screenshot skipped: ${shotErr.message}`);
      }
    }

    // Step 8: STOP Backend Server Process 1
    console.log(`[STEP 8] Stopping Backend Server Process 1 (PID: ${pid1})...`);
    await killProcessTree(pid1);
    await waitForServerDown(`${BASE_URL}/api/accounts`);
    console.log(`[STEP 8] Verified Server Process 1 (PID: ${pid1}) is completely terminated.\n`);

    // Step 9: START Backend Server Process 2 (NO DB RESEEDING!)
    console.log('[STEP 9] Spawning Backend Server Process 2 (WITHOUT touching or re-seeding database)...');
    const proc2 = spawnServerProcess(PORT);
    const pid2 = proc2.pid;
    console.log(`[STEP 9] Server Process 2 spawned with NEW PID: ${pid2} (Different PID verified: ${pid2 !== pid1})`);

    await waitForServer(`${BASE_URL}/api/accounts`);
    console.log(`[STEP 9] Server Process 2 is up and listening on ${BASE_URL}\n`);

    // Step 10: Query Post-Restart State from Process 2
    console.log('[STEP 10] Querying Post-Restart State from Server Process 2 (PID: ' + pid2 + ')...');
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
    if (process.env.ENABLE_SCREENSHOTS === 'true') {
      try {
        console.log('[SCREENSHOT] Attempting Post-Restart Screenshot Capture...');
        const puppeteer = (await import('puppeteer-core')).default;
        const browser = await puppeteer.launch({
          executablePath: process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 960 });
        await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
        await page.type('input[type="text"]', 'user_demo');
        await page.type('input[type="password"]', 'Password123!');
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_03_dashboard_post.png') });

        await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle0' });
        await sleep(600);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'restart_04_history_post.png') });
        await browser.close();
        console.log('[SCREENSHOT] Post-restart screenshots captured successfully.');
      } catch (shotErr) {
        console.warn(`[SCREENSHOT] Puppeteer post-restart screenshot skipped: ${shotErr.message}`);
      }
    }

    // Step 11: Assertion Comparison Matrix
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
  } finally {
    console.log('\n======================================================================');
    console.log('                 TEARDOWN & RESTORATION CLEANUP                       ');
    console.log('======================================================================');

    // 1. Delete created transactions
    if (createdTxnIds.length > 0 && prismaClientInstance) {
      console.log(`[CLEANUP] Deleting ${createdTxnIds.length} created Golden Journey transactions...`);
      try {
        await prismaClientInstance.allocationLine.deleteMany({
          where: { transaction_id: { in: createdTxnIds } }
        });
        await prismaClientInstance.transaction.deleteMany({
          where: { id: { in: createdTxnIds } }
        });
        console.log('[CLEANUP] Transactions and allocation lines deleted.');
      } catch (err) {
        console.error('[CLEANUP ERROR] Failed to clean transactions:', err.message);
      }
    }

    // 2. Restore account snapshot values
    if (accountSnapshots.length > 0 && prismaClientInstance) {
      console.log(`[CLEANUP] Restoring ${accountSnapshots.length} accounts to initial baseline...`);
      for (const s of accountSnapshots) {
        try {
          await prismaClientInstance.account.update({
            where: { id: s.id },
            data: {
              opening_balance: s.opening_balance,
              is_opening_locked: s.is_opening_locked
            }
          });
        } catch (err) {
          console.error(`[CLEANUP ERROR] Failed to restore account ${s.name}:`, err.message);
        }
      }
      console.log('[CLEANUP] Account snapshots restored.');
    }

    // 3. Kill all spawned server processes
    for (const p of spawnedProcesses) {
      if (p && !p.killed) {
        console.log(`[CLEANUP] Terminating spawned backend server process (PID: ${p.pid})...`);
        await killProcessTree(p.pid);
      }
    }

    // 4. Disconnect prisma client
    if (prismaClientInstance) {
      await prismaClientInstance.$disconnect();
      console.log('[CLEANUP] Prisma database connection closed.');
    }

    console.log('[CLEANUP] Cleanup and restoration completed cleanly.\n');
  }
}

main().catch((err) => {
  console.error('\nERROR OCCURRED DURING RESTART VERIFICATION:', err.message || err);
  process.exit(1);
});
