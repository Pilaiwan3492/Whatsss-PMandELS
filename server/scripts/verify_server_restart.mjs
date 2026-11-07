import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.resolve(SERVER_DIR, '../docs/sprints/sprint-1/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        headers: { Origin: 'http://localhost:5173' }
      });
      // Any response (even 401/404) means server is actively listening
      return true;
    } catch {
      await sleep(300);
    }
  }
  throw new Error(`Timeout waiting for server at ${url}`);
}

async function killProcessTree(pid) {
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
  } catch (err) {
    // Process might have already exited
  }
}

async function run() {
  console.log('======================================================================');
  console.log('   STARTING REAL BACKEND SERVER PROCESS RESTART VERIFICATION');
  console.log('======================================================================\n');

  // Step 0: Ensure fresh seed on whatsss_db
  console.log('[STEP 0] Seeding whatsss_db database to pristine baseline...');
  execSync('npm run prisma:seed', { cwd: SERVER_DIR, stdio: 'inherit' });
  console.log('[STEP 0] Database seeded.\n');

  // Step 1: Start Server Process 1
  console.log('[STEP 1] Spawning Backend Server Process 1...');
  const proc1 = spawn('node', ['dist/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: '5000', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const pid1 = proc1.pid;
  console.log(`[STEP 1] Server Process 1 spawned with PID: ${pid1}`);

  proc1.stdout.on('data', (d) => {
    // console.log(`[P1 STDOUT] ${d.toString().trim()}`);
  });
  proc1.stderr.on('data', (d) => {
    // console.error(`[P1 STDERR] ${d.toString().trim()}`);
  });

  await waitForServer('http://localhost:5000/api/accounts');
  console.log(`[STEP 1] Server Process 1 is listening and responsive on http://localhost:5000\n`);

  // Step 2: Login as user_demo
  console.log('[STEP 2] Authenticating as user_demo on Process 1...');
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
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
  console.log(`[STEP 2] Authenticated successfully. Auth Cookie: ${tokenCookie.substring(0, 25)}...\n`);

  // Step 3: Fetch Accounts
  console.log('[STEP 3] Fetching accounts for user_demo...');
  const accRes = await fetch('http://localhost:5000/api/accounts', {
    headers: {
      Cookie: tokenCookie,
      Origin: 'http://localhost:5173'
    }
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

  // Step 4: Execute Golden Domain Journey
  console.log('[STEP 4] Executing Golden Domain Journey on Server Process 1:');

  // Step 4.1: Opening Balance 10,000 THB
  console.log('  4.1 PATCH /api/accounts/:id/opening-balance (10,000.00 THB)...');
  const opRes = await fetch(`http://localhost:5000/api/accounts/${checkingAcc.id}/opening-balance`, {
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

  // Step 4.2: Income 20,000 THB
  console.log('  4.2 POST /api/transactions/income (20,000.00 THB Salary)...');
  const incRes = await fetch('http://localhost:5000/api/transactions/income', {
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
  console.log('      -> Success. Recorded 20,000.00 THB Salary Income');

  // Step 4.3: Expense 3,000 THB Split Purchase
  console.log('  4.3 POST /api/transactions/expense (3,000.00 THB Split Dining/Grocery)...');
  const expRes = await fetch('http://localhost:5000/api/transactions/expense', {
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
  console.log('      -> Success. Recorded 3,000.00 THB CC Split Purchase');

  // Step 4.4: Repayment 3,000 THB
  console.log('  4.4 POST /api/transactions/repayment (3,000.00 THB Full Repayment)...');
  const repRes = await fetch('http://localhost:5000/api/transactions/repayment', {
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
  console.log('      -> Success. Recorded 3,000.00 THB CC Repayment\n');

  // Step 5: Query Pre-Restart State
  console.log('[STEP 5] Querying Pre-Restart State from Server Process 1 (PID: ' + pid1 + ')...');
  const preSumRes = await fetch('http://localhost:5000/api/reports/summary', {
    headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
  });
  const preSummary = (await preSumRes.json()).data;

  const preTxRes = await fetch('http://localhost:5000/api/transactions', {
    headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
  });
  const preTransactions = (await preTxRes.json()).data.transactions;

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

  // Step 6: Puppeteer Pre-Restart Screenshots
  console.log('[STEP 6] Capturing Pre-Restart Screenshots via Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

  // Dashboard Pre-Restart
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
  await sleep(600);
  const shot1 = path.join(SCREENSHOT_DIR, 'restart_01_dashboard_pre.png');
  await page.screenshot({ path: shot1 });
  console.log(`Captured: ${shot1}`);

  // Transaction History Pre-Restart
  await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle0' });
  await sleep(600);
  const shot2 = path.join(SCREENSHOT_DIR, 'restart_02_history_pre.png');
  await page.screenshot({ path: shot2 });
  console.log(`Captured: ${shot2}\n`);

  // Step 7: STOP Backend Server Process 1
  console.log(`[STEP 7] Stopping Backend Server Process 1 (PID: ${pid1})...`);
  await killProcessTree(pid1);
  await sleep(1500);

  // Verify server is down
  let isDown = false;
  try {
    await fetch('http://localhost:5000/api/accounts');
  } catch {
    isDown = true;
  }
  console.log(`[STEP 7] Verified Server Process 1 is terminated. Port 5000 down: ${isDown}\n`);

  // Step 8: START Backend Server Process 2 (NO DB RESEEDING!)
  console.log('[STEP 8] Spawning Backend Server Process 2 (WITHOUT touching or re-seeding database)...');
  const proc2 = spawn('node', ['dist/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: '5000', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const pid2 = proc2.pid;
  console.log(`[STEP 8] Server Process 2 spawned with NEW PID: ${pid2} (Different PID verified: ${pid2 !== pid1})`);

  await waitForServer('http://localhost:5000/api/accounts');
  console.log(`[STEP 8] Server Process 2 is up and listening on http://localhost:5000\n`);

  // Step 9: Query Post-Restart State from Process 2
  console.log('[STEP 9] Querying Post-Restart State from Server Process 2 (PID: ' + pid2 + ')...');
  const postSumRes = await fetch('http://localhost:5000/api/reports/summary', {
    headers: { Cookie: tokenCookie, Origin: 'http://localhost:5173' }
  });
  const postSummary = (await postSumRes.json()).data;

  const postTxRes = await fetch('http://localhost:5000/api/transactions', {
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

  // Step 10: Puppeteer Post-Restart Screenshots
  console.log('[STEP 10] Capturing Post-Restart Screenshots via Puppeteer...');
  // Dashboard Post-Restart
  await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle0' });
  await sleep(600);
  const shot3 = path.join(SCREENSHOT_DIR, 'restart_03_dashboard_post.png');
  await page.screenshot({ path: shot3 });
  console.log(`Captured: ${shot3}`);

  // Transaction History Post-Restart
  await page.goto('http://localhost:5173/transactions', { waitUntil: 'networkidle0' });
  await sleep(600);
  const shot4 = path.join(SCREENSHOT_DIR, 'restart_04_history_post.png');
  await page.screenshot({ path: shot4 });
  console.log(`Captured: ${shot4}\n`);

  await browser.close();

  // Clean up Process 2
  await killProcessTree(pid2);
  console.log(`[CLEANUP] Process 2 (PID: ${pid2}) closed cleanly.\n`);

  // Step 11: Assertion Comparison
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
    throw new Error('Verification failed: Pre and post restart values do not match expected!');
  }
}

run().catch((err) => {
  console.error('\nERROR OCCURRED DURING RESTART VERIFICATION:', err);
  process.exit(1);
});
