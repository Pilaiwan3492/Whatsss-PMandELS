# Lab 6 — Sprint 1 User Acceptance Testing (UAT) & Defect Management

> **Product:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Members:**  
> - **Aphichaya Klinhual** (Student ID: `67070503447`, GitHub: [`@Apichaya251400`](https://github.com/Apichaya251400)) — *Product Team Lead (Issue #37: Parts A & D)*  
> - **Pilaiwan Churdchu** (Student ID: `67070503492`, GitHub: [`@Pilaiwan3492`](https://github.com/Pilaiwan3492)) — *Independent UAT Lead & Defect Manager (Issue #38: Parts B & C + Retest Sign-off)*  
> **Repository:** [`https://github.com/Pilaiwan3492/Whatsss-PMandELS`](https://github.com/Pilaiwan3492/Whatsss-PMandELS)  
> **Reference Staging Branch:** [`staging-lab5`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/tree/staging-lab5)  
> **Baseline Release (`main`) Commit SHA:** `ba2f9dd43d8ed620d4b27820d43bee243d2e3d4d` (`ba2f9dd`)  
> **Verified Serving Application Image Commit SHA:** `f160f256af24635cdc602b676a7cf8822fbbceb8` (`f160f25`)  
> **Deployed Cloud Run Revision:** `whatsss-00020-65k` (Region: `asia-southeast1`, Project: `cpe334-whatsss-pmandels`, 100% Traffic)  
> **Public Service URL (Cloud Run):** [`https://whatsss-sipqw4logq-as.a.run.app`](https://whatsss-sipqw4logq-as.a.run.app)  
> **Document Status:** `PRODUCT-TEAM UAT HANDOFF READY` — Prepared for independent partner UAT execution.

---

## Part A — Product Team: UAT Preparation and Handoff

### A1. Agreed Sprint 1 Scope and Traceability

#### In Scope (Delivered Sprint 1 Golden Vertical Slice: `F-01` through `F-09`)
The assessed UAT scope is strictly the delivered Sprint 1 functionality defined in our frozen Sprint 1 contract:
* **`F-01` Authentication & Session Lifecycle (`FR-01`, `FR-02`, `NFR-SEC-01`, `BR-09`):** User login (`POST /api/auth/login`), current session identity/role verification (`GET /api/auth/me`), and logout (`POST /api/auth/logout`) using `HttpOnly`, `SameSite=Lax`, `Secure` JWT cookies.
* **`F-02` Server-Side Authorization & Privacy Guards (`BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`):** Unauthenticated requests rejected (`401 Unauthorized`); platform administrators (`ADMIN`) strictly denied access to personal financial ledgers (`403 Forbidden` per `BR-10`); cross-tenant access to another user's accounts or transactions concealed (`404 Not Found` per `BR-01`); CSRF Origin validation (`403 CSRF_ORIGIN_REJECTED`).
* **`F-03` Account Opening Balance Lifecycle (`FR-05`, `BR-02`, `NFR-DATA-01`):** Setting initial starting balance on eligible unlocked accounts (`PATCH /api/accounts/:id/opening-balance`), excluding opening balances from income/expense summaries (`BR-02`), and atomic permanent locking (`is_opening_locked = true`, UI badge `Opening balance locked`) upon committing the first referencing transaction (`422 OPENING_BALANCE_LOCKED` on subsequent attempts).
* **`F-04` Income Transaction Processing (`FR-06`, `BR-03`, `NFR-DATA-01`):** Recording salary/income into a `CASH` account (`POST /api/transactions/income`), increasing cash balance and total income summary, and atomically locking the receiving bank account's opening balance.
* **`F-05` & `F-06` Credit Card Purchase & Multiple Allocations Engine (`FR-07`, `FR-08`, `BR-04`, `BR-05`, `BR-06`):** Recording purchases charged to a `LOAN_TAKEN` credit card account (`POST /api/transactions/expense`) with multi-line expense category splits (e.g., `Dining` + `Grocery`). Enforces exact mathematical equality $\sum \text{allocations.amount} = \text{total\_amount}$ (`422 ALLOCATION_SUM_MISMATCH` if unbalanced per `BR-06`) and distinct allocation categories (`400 DUPLICATE_ALLOCATION_ACCOUNT`).
* **`F-07` Credit Card Repayment Engine (`FR-09`, `BR-07`, `BR-08`):** Settling credit card debt from a `CASH` bank account (`POST /api/transactions/repayment`). Atomically decreases bank cash balance and credit card debt (`BR-07`), rejects repayments exceeding current debt (`422 REPAYMENT_EXCEEDS_DEBT`) or available bank funds (`422 INSUFFICIENT_FUNDS`), and strictly excludes debt repayment from total expense summaries (`BR-08`).
* **`F-08` Balance & Financial Summary Engine (`FR-10`, `BR-02`, `BR-08`):** Real-time calculation (`GET /api/reports/summary`) of `Checking Bank Balance`, `Credit Card Debt`, `Total Income`, `Total Expenses`, and `Expense Category Breakdown`.
* **`F-09` Transaction History Persistence (`FR-11`, `NFR-DATA-01`):** Chronological transaction ledger (`GET /api/transactions` on `/transactions` and top 5 recent transactions on `/dashboard`) with allocation category tags, persisting across browser sessions and Cloud Run container restarts in Cloud SQL PostgreSQL 16.

#### Out of Scope (Deferred to Sprints 2 and 3 — Not Evaluated for Sprint 1 Acceptance)
* **Sprint 2 Features:** Custom Account Creation & Management (`F-10`), Internal Cash Transfers (`F-11`), Loan Given & General Loan Taken (`F-12`, `F-13`), Favorite/Duplicate Transactions (`F-14`), Search & Filtering (`F-15`), Transaction Corrections/Editing (`F-16`), Platform User Directory & Governance (`F-19`).
* **Sprint 3 Features:** Category Spending Charts & Reports (`F-17`), Audited Correction History & Archival (`F-18`).

#### Authoritative Source References
* Sprint 1 Scope Agreement: [`docs/sprints/sprint-1/scope.md`](../sprints/sprint-1/scope.md)
* Sprint 1 Feature Engineering Contracts: [`docs/sprints/sprint-1/feature-contracts.md`](../sprints/sprint-1/feature-contracts.md)
* Sprint 1 Test Data & Seed Specification: [`docs/sprints/sprint-1/test-data.md`](../sprints/sprint-1/test-data.md)
* Sprint 1 Software Test Specification: [`docs/sprints/sprint-1/test-specification.md`](../sprints/sprint-1/test-specification.md)
* Lab 5 Deployment & Cloud Run Guide: [`docs/labs/lab-05/deployment.md`](../labs/lab-05/deployment.md)

---

### A2. Release, Roles, Synthetic Data, and Safe Handoff

#### 1. Deployed Release Environment (Provided Before Execution)
| Parameter | Verified Value |
|---|---|
| **Public Application URL** | `https://whatsss-sipqw4logq-as.a.run.app` |
| **Health & Readiness Probes** | `GET /api/health` (`200 OK`) \| `GET /api/ready` (`200 OK`, `"database":"connected"`) |
| **Main Release Commit SHA** | `ba2f9dd43d8ed620d4b27820d43bee243d2e3d4d` (`ba2f9dd`) |
| **Serving Container Commit SHA** | `f160f256af24635cdc602b676a7cf8822fbbceb8` (verified via `/api/health` `commitSha`) |
| **Active Cloud Run Revision** | `whatsss-00020-65k` (`asia-southeast1`) |
| **Database Backing** | Google Cloud SQL for PostgreSQL 16 (`whatsss-sql`, `db-f1-micro`, Enterprise edition) |

> **Preflight Check for UAT Testers:** Before running test cases, open `https://whatsss-sipqw4logq-as.a.run.app/api/health` and `https://whatsss-sipqw4logq-as.a.run.app/api/ready` in a clean browser profile (Incognito/InPrivate) to confirm HTTP 200 and record the `commitSha` and timestamp. If the service is unreachable or the version cannot be identified, stop and record `BLOCKED`.

#### 2. Safe Test Accounts (Credentials Delivered Privately — Never in Git or PDF)
Account passwords are stored in GCP Secret Manager (`whatsss-demo-password` and `whatsss-admin-password`) and transmitted to the partner UAT Team **exclusively via private handoff channel (Discord DM / LEB2 private message)**. Never include plaintext passwords, JWT cookies, or secret values in screenshots or reports.

| Account Label | Cloud Run Username (`NODE_ENV=production`) | Local Dev Username | Role | Purpose in UAT Cases |
|:---:|:---:|:---:|:---:|---|
| **`USER-DEMO`** | `user_demo` | `user_demo` | `USER` | Primary evaluator account for normal financial journey, split expense validation, opening balance lock check, and persistence testing (`UAT-S1-01`, `02`, `03`, `05`, `06`). |
| **`ADMIN-DEMO`** | `admin` | `admin_demo` | `ADMIN` | Platform administrator account used to verify role segregation and denial of access to personal financial ledgers (`BR-10`, HTTP `403 Forbidden` in `UAT-S1-04`). |
| **`USER-OTHER`** | *(Foreign UUID probe on Cloud Run)* | `user_other` | `USER` | Secondary isolated user identity used to verify cross-tenant ownership isolation (`BR-01`, HTTP `404 Not Found` in `UAT-S1-04`). |

#### 3. Seeded Synthetic Financial Accounts for `USER-DEMO` (on `/accounts`)
| Account Name | Account Type | UI Section on `/accounts` | Domain Role | Fresh Seed Initial Balance |
|---|:---:|---|---|---:|
| **`Checking Bank`** | `CASH` | Cash & Liquid Accounts | Primary liquid bank account for opening balance, salary deposits, and credit card repayments | `0.00 THB` (or `10,000.00 THB` after opening balance setup) |
| **`Visa Credit Card`** | `LOAN_TAKEN` | Credit Cards & Liabilities | Liability credit card account for recording purchases and tracking outstanding debt | `0.00 THB` |
| **`Salary`** | `INCOME` | Income Categories | Income category account for salary inflows | Flow Category |
| **`Dining`** | `EXPENSE` | Expense Categories | Expense category account for restaurant/meal split allocations | Flow Category |
| **`Grocery`** | `EXPENSE` | Expense Categories | Expense category account for supermarket/household split allocations | Flow Category |

#### 4. Data Setup, Sequence Declaration & Delta Calculation Rule
* **Recommended Execution Sequence:** Execute `UAT-S1-06` $\rightarrow$ `UAT-S1-01` $\rightarrow$ `UAT-S1-02` $\rightarrow$ `UAT-S1-03` $\rightarrow$ `UAT-S1-05` $\rightarrow$ `UAT-S1-04`.
* **Handling Existing Live Cloud SQL Data (Baseline vs. Delta Verification):**
  - Because the live Cloud Run database persists records from Lab 5 verification (`C-04` and `C-05`), `USER-DEMO` on the live deployment may already start with pre-existing committed transactions (e.g., `Checking Bank Balance = 32,000.00 THB`, `Credit Card Debt = 0.00 THB`, `Total Income = 25,000.00 THB`, `Total Expenses = 3,000.00 THB`, and `Checking Bank` showing status `Opening balance locked`).
  - **How to Verify Explicitly:** Before executing `UAT-S1-01`, record the 4 initial summary card figures on `/dashboard` as $(B_0, D_0, I_0, E_0)$. Every transaction in `UAT-S1-01` produces an exact, deterministic mathematical delta $(\Delta B, \Delta D, \Delta I, \Delta E)$ stated in the test case table below. Both fresh-baseline figures and additive delta formulas are explicitly provided so testers need zero verbal explanation.

---

### A3. Executable UAT Cases (Manual End-User Actions)

---

#### `UAT-S1-01` — Normal Domain Journey: Income Inflow, Multi-Split Credit Card Purchase & Full Debt Repayment
* **Category:** Normal Domain Journey (Mandatory Category 1)
* **Linked Requirements & ACs:** `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08`, `F-09`; `FR-05`–`FR-11`; `BR-02`–`BR-08`; `AC-03-1`, `AC-04-1`, `AC-05-1`, `AC-06-1`, `AC-07-1`, `AC-07-2`, `AC-08-1`, `AC-09-1`.
* **Role / Account:** `USER-DEMO` (`user_demo`)
* **Preconditions:** Authenticated as `USER-DEMO` at `https://whatsss-sipqw4logq-as.a.run.app/dashboard`. Record the 4 starting summary cards before Step 1:
  - Initial Checking Bank Balance $B_0$ (e.g., `0.00 THB` on fresh DB, or `32,000.00 THB` on live DB)
  - Initial Credit Card Debt $D_0$ (e.g., `0.00 THB`)
  - Initial Total Income $I_0$ (e.g., `0.00 THB` on fresh DB, or `25,000.00 THB` on live DB)
  - Initial Total Expenses $E_0$ (e.g., `0.00 THB` on fresh DB, or `3,000.00 THB` on live DB)
* **Synthetic Inputs:**
  - *Step 1 (If `Checking Bank` is unlocked on `/accounts`):* Opening Balance = `10000.00` THB. *(If `Checking Bank` already shows the `Opening balance locked` badge because prior transactions exist on the live DB, observe the badge and proceed directly to Step 2).*
  - *Step 2 (Income Transaction):* Destination Cash Account = `Checking Bank`, Income Category = `Salary`, Amount (THB) = `20000.00`, Transaction Date = `2026-11-17`, Description = `UAT-S1-01 Monthly Salary`.
  - *Step 3 (Split Credit Card Purchase):* Credit Card = `Visa Credit Card`, Total Amount = `3000.00`, Transaction Date = `2026-11-17`, Description = `UAT-S1-01 Split Purchase`, Allocation 01: Expense Category = `Dining`, Amount (THB) = `1000.00`, Notes = `UAT Dinner`; Allocation 02: Expense Category = `Grocery`, Amount (THB) = `2000.00`, Notes = `UAT Supermarket`.
  - *Step 4 (Credit Card Repayment):* Pay From (Source Cash Account) = `Checking Bank`, Settle Debt For (Target Credit Card) = `Visa Credit Card`, Repayment Amount (THB) = `3000.00`, Transaction Date = `2026-11-17`, Description = `UAT-S1-01 Full Card Settlement`.
* **Numbered User Actions:**
  1. Log in as `USER-DEMO` (`user_demo`). On `/dashboard`, record initial summary cards $(B_0, D_0, I_0, E_0)$. Click **Accounts** in the top navbar (or click `+ Record Income`) to navigate to `/accounts` (`Financial Accounts`). If the `Checking Bank` card has an active **Set Opening Balance** button, click it, enter `10000.00`, and click **Save Opening Balance** ($B_0$ becomes `10,000.00 THB`, while `Total Income` and `Total Expenses` remain `0.00 THB` per `BR-02`).
  2. On `/accounts`, click the green **Record Income** button. In the **Record Income Transaction** modal:
     - Confirm **Destination Cash Account** is `Checking Bank` and **Income Category** is `Salary`.
     - Enter **Amount (THB)** = `20000.00`, **Transaction Date** = `2026-11-17`, **Description** = `UAT-S1-01 Monthly Salary`, and submit.
     - Observe `Checking Bank` Current Balance on `/accounts` increases by `+฿20,000.00` and its Status badge changes to **`Opening balance locked`**.
  3. On `/accounts`, click the blue **Record Purchase** button. In the **Record Purchase** modal:
     - Confirm **Credit Card** is `Visa Credit Card`.
     - Enter **Total Amount** = `3000.00`, **Transaction Date** = `2026-11-17`, **Description** = `UAT-S1-01 Split Purchase`.
     - Under **02 — Expense Breakdown (Expense Allocations)**:
       - In **Allocation 01**: Confirm **Expense Category** is `Dining`, enter **Amount (THB)** = `1000.00`, **Notes** = `UAT Dinner`.
       - In **Allocation 02**: Confirm **Expense Category** is `Grocery`, enter **Amount (THB)** = `2000.00`, **Notes** = `UAT Supermarket`.
     - Verify the **Allocation Summary** panel displays badge **`Balanced`**, `Total Purchase: ฿3000.00`, `Allocated: ฿3000.00`, `Remaining: ฿0.00`, and status text `✓ Fully allocated: ฿3000.00 of ฿3000.00. Ready to record.`
     - Click **Record Purchase** to submit. Observe `Visa Credit Card` Current Debt increases by `+฿3,000.00`.
  4. On `/accounts`, click the **Pay Credit Card** button at the top (or **Pay Debt** on the `Visa Credit Card` card). In the **Credit Card Repayment** modal:
     - Confirm **Pay From (Source Cash Account)** is `Checking Bank` and **Settle Debt For (Target Credit Card)** is `Visa Credit Card`.
     - Click the quick-action button **Pay Full Debt (฿3,000.00)** (or enter `3000.00` in **Repayment Amount (THB)**), set **Transaction Date** = `2026-11-17`, **Description** = `UAT-S1-01 Full Card Settlement`.
     - Verify the live preview card displays `New Bank Balance` reduced by `3,000.00 THB` and `New Credit Debt: 0.00 THB (Fully Settled)`.
     - Click **Confirm Repayment**.
  5. Click **Dashboard** (`/dashboard`) and **History** (`/transactions`) in the top navbar to inspect the 4 Summary Metric Cards, Expense Category Breakdown, and Transaction History table.
* **Specific Expected Results (Explicit Balance & Money Movement Math):**
  | Step | Operation | Checking Bank Balance ($B$) | Credit Card Debt ($D$) | Total Income ($I$) | Total Expenses ($E$) | Fresh Baseline Expected (`B0=10,000`) | Live DB Expected (`B0=32,000, I0=25,000, E0=3,000`) |
  |:---:|---|---|---|---|---|---|---|
  | **Init** | Pre-test Baseline | $B_0$ | $D_0$ | $I_0$ | $E_0$ | Bank `10,000.00`, Debt `0.00`, Inc `0.00`, Exp `0.00` | Bank `32,000.00`, Debt `0.00`, Inc `25,000.00`, Exp `3,000.00` |
  | **Step 2** | Salary `+20,000.00` | $B_0 + 20,000.00$ | $D_0$ | $I_0 + 20,000.00$ | $E_0$ | Bank `30,000.00`, Debt `0.00`, Inc `20,000.00`, Exp `0.00` | Bank `52,000.00`, Debt `0.00`, Inc `45,000.00`, Exp `3,000.00` |
  | **Step 3** | CC Split Purchase `+3,000.00` (`1,000` Dining + `2,000` Grocery) | $B_0 + 20,000.00$ | $D_0 + 3,000.00$ | $I_0 + 20,000.00$ | $E_0 + 3,000.00$ | Bank `30,000.00`, Debt `3,000.00`, Inc `20,000.00`, Exp `3,000.00` | Bank `52,000.00`, Debt `3,000.00`, Inc `45,000.00`, Exp `6,000.00` |
  | **Step 4** | CC Repayment `-3,000.00` (Excluded from Expense per `BR-08`) | $B_0 + 17,000.00$ | $D_0 + 0.00$ | $I_0 + 20,000.00$ | $E_0 + 3,000.00$ | **Bank `27,000.00`, Debt `0.00`, Inc `20,000.00`, Exp `3,000.00`** | **Bank `49,000.00`, Debt `0.00`, Inc `45,000.00`, Exp `6,000.00`** |
  - All 3 new transactions (`UAT-S1-01 Monthly Salary`, `UAT-S1-01 Split Purchase` with `Dining` and `Grocery` allocations, and `UAT-S1-01 Full Card Settlement`) appear in the Transaction History table on `/transactions` and `/dashboard`.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-02` — Business-Rule & Boundary Case: Unbalanced Split Rejection (`BR-06`), Duplicate Category Rejection (`AC-06-3`), and Over-Repayment Rejection (`AC-07-4`)
* **Category:** Business-Rule or Boundary Case (Mandatory Category 2)
* **Linked Requirements & ACs:** `F-05`, `F-06`, `F-07`; `FR-07`, `FR-08`, `FR-09`; `BR-04`, `BR-05`, `BR-06`, `BR-07`; `AC-05-3`, `AC-06-2`, `AC-06-3`, `AC-07-4`, `AC-07-6`.
* **Role / Account:** `USER-DEMO` (`user_demo`)
* **Preconditions:** Authenticated as `USER-DEMO` on `/accounts`. Record current balances $(B_{\text{before}}, D_{\text{before}}, I_{\text{before}}, E_{\text{before}})$.
* **Synthetic Inputs:**
  - *Sub-check 2A (Unbalanced Split — `BR-06` / `AC-06-2`):* Total Amount = `1500.00`, Allocation 01 (`Dining`) = `500.00`, Allocation 02 (`Grocery`) = `500.00` (Allocated = `1,000.00 != 1,500.00`, Remaining = `500.00`).
  - *Sub-check 2B (Over-Allocated Split — `BR-06`):* Total Amount = `1500.00`, Allocation 01 (`Dining`) = `1000.00`, Allocation 02 (`Grocery`) = `800.00` (Allocated = `1,800.00 > 1,500.00`, Over-allocated by `300.00`).
  - *Sub-check 2C (Duplicate Category — `AC-06-3`):* Total Amount = `1000.00`, Allocation 01 (`Dining`) = `400.00`, Allocation 02 (`Dining` again) = `600.00` (Sum is balanced at `1,000.00`, allowing button click to trigger duplicate category check).
  - *Sub-check 2D (Repayment Exceeding Debt / Zero-Debt Boundary — `AC-07-4`):* Attempt to repay `500.00 THB` when Credit Card Debt is `0.00 THB` (or enter $D_{\text{before}} + 500.00$).
* **Numbered User Actions:**
  1. On `/accounts`, click **Record Purchase**. Enter **Total Amount** = `1500.00`, set **Allocation 01** (`Dining`) = `500.00` and **Allocation 02** (`Grocery`) = `500.00`. Observe the **Allocation Summary** badge (`Incomplete`), status message (`⚠ Allocate the remaining ฿500.00 to continue.`), and confirm the **Record Purchase** submit button is disabled.
  2. Change **Allocation 01** to `1000.00` and **Allocation 02** to `800.00` (Total still `1500.00`). Observe the badge changes to **`Over-allocated`**, status message displays `✕ Over-allocated by ฿300.00. Total allocations exceed purchase amount.`, and the **Record Purchase** submit button remains disabled.
  3. Change **Total Amount** to `1000.00`. Set **Allocation 01** Category = `Dining`, Amount = `400.00`, and change **Allocation 02** Category = `Dining` (same category), Amount = `600.00`. Because $400 + 600 = 1000$, click the enabled **Record Purchase** submit button. Observe the error alert displayed at the top of the modal: **`Each allocation line must use a distinct expense category.`** Click **Cancel** to close the modal.
  4. On `/accounts`, click **Pay Credit Card**. Enter `500.00` (or an amount strictly exceeding current debt $D_{\text{before}} + 500.00$) in **Repayment Amount (THB)**. Observe the validation state (`Confirm Repayment` button disabled and/or red warning `Exceeds debt`). Click **Cancel**.
  5. Navigate to `/dashboard` and `/transactions` to verify that none of the rejected attempts modified balances or created a transaction.
* **Specific Expected Results:**
  - **Sub-checks 2A & 2B (`BR-06`):** Under-allocated (`Incomplete`) and over-allocated (`Over-allocated`) splits are blocked with explicit remaining/excess baht amounts and disabled submission (`422 ALLOCATION_SUM_MISMATCH` if sent to API).
  - **Sub-check 2C (`AC-06-3`):** Selecting duplicate expense categories (`Dining` twice) is rejected with error banner `Each allocation line must use a distinct expense category.` (`400 DUPLICATE_ALLOCATION_ACCOUNT` on API).
  - **Sub-check 2D (`AC-07-4`):** Repayment exceeding outstanding credit card debt is prevented/rejected (`422 REPAYMENT_EXCEEDS_DEBT`).
  - **Zero State Mutation:** All account balances and transaction history counts remain identical to $(B_{\text{before}}, D_{\text{before}}, I_{\text{before}}, E_{\text{before}})$.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-03` — Business-Rule & Immutability Case: Opening Balance Permanent Lock After First Transaction (`F-03`, `BR-02`, `AC-03-3`)
* **Category:** Business-Rule / State Immutability Case
* **Linked Requirements & ACs:** `F-03`; `FR-05`; `BR-02`; `AC-03-3`, `AC-03-4`.
* **Role / Account:** `USER-DEMO` (`user_demo`)
* **Preconditions:** `USER-DEMO` has at least one committed transaction referencing `Checking Bank` (true after `UAT-S1-01`).
* **Synthetic Inputs:** Attempted new opening balance = `99999.00` THB on locked `Checking Bank`.
* **Numbered User Actions:**
  1. Logged in as `USER-DEMO`, navigate to `/accounts` (`Financial Accounts`).
  2. Locate the **Checking Bank** card under `Cash & Liquid Accounts`. Inspect the `Status:` field at the bottom of the card.
  3. Confirm that the **Set Opening Balance** button is gone and replaced by the gray badge **`Opening balance locked`**.
  4. *(Optional API-level corroboration via Browser DevTools Console `F12` while on `https://whatsss-sipqw4logq-as.a.run.app/accounts`):* Execute a direct `PATCH` request to attempt modifying the locked opening balance:
     ```javascript
     fetch('/api/accounts', { credentials: 'include' })
       .then(r => r.json())
       .then(async d => {
         const bank = d.data.accounts.find(a => a.name === 'Checking Bank');
         const res = await fetch(`/api/accounts/${bank.id}/opening-balance`, {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           credentials: 'include',
           body: JSON.stringify({ opening_balance: 99999.00 })
         });
         console.log('HTTP Status:', res.status, await res.json());
       });
     ```
* **Specific Expected Results:**
  - In the `/accounts` UI, `Checking Bank` displays `Status: Opening balance locked` and provides no UI button to alter the opening balance after the first transaction (`AC-03-3`).
  - The direct API `PATCH /api/accounts/:id/opening-balance` request is rejected with HTTP **`422 Unprocessable Entity`** and error code **`OPENING_BALANCE_LOCKED`** (`"Opening balance cannot be updated after the first transaction."`).
  - `Checking Bank` balance, `Total Income`, and `Total Expenses` remain untouched.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-04` — Forbidden Role & Ownership Case: Administrator Financial Denial (`BR-10`) & Cross-User Isolation (`BR-01`)
* **Category:** Forbidden Role / Ownership Case (Mandatory Category 3)
* **Linked Requirements & ACs:** `F-02`; `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`; `AC-02-1`, `AC-02-2`, `AC-02-3`.
* **Role / Account:** `ADMIN-DEMO` (Cloud Run username: **`admin`**, local dev username: `admin_demo`, role `ADMIN`) and `USER-DEMO` (`user_demo`, role `USER`).
* **Preconditions:** `USER-DEMO` has existing financial accounts and transactions on the deployed service. Tester has credentials for `ADMIN-DEMO` (`admin`) from private handoff.
* **Synthetic Inputs:**
  - Login as `ADMIN-DEMO` (`admin`).
  - Direct navigation to `/dashboard`, `/accounts`, and `/transactions`, plus direct `GET` probes to `/api/accounts`, `/api/transactions`, and `/api/reports/summary`.
  - Foreign/non-owned account UUID probe `00000000-0000-4000-8000-000000000999` while logged in as `USER-DEMO`.
* **Numbered User Actions:**
  1. If logged in as `USER-DEMO`, click **Logout** in the top navbar.
  2. On `/login`, sign in using the `ADMIN-DEMO` administrator account (Username: **`admin`** on Cloud Run, password from private handoff).
  3. Observe that the application automatically routes to `/access-denied` displaying the **Access Forbidden (403)** page (`Security Policy (BR-10)`), and the top navbar shows `Signed in as: admin` with a red `ADMIN` badge and **no** links to `Dashboard`, `Accounts`, or `History`.
  4. Manually enter `https://whatsss-sipqw4logq-as.a.run.app/dashboard` and `https://whatsss-sipqw4logq-as.a.run.app/accounts` in the browser address bar. Confirm both redirect to `/access-denied` (`Access Forbidden (403)`) without rendering any financial numbers.
  5. Open Browser DevTools (`F12` $\rightarrow$ Console) while logged in as `admin` and verify backend enforcement on all financial APIs:
     ```javascript
     Promise.all([
       fetch('/api/accounts', { credentials: 'include' }).then(async r => ({ endpoint: '/api/accounts', status: r.status, code: (await r.json())?.error?.code })),
       fetch('/api/transactions', { credentials: 'include' }).then(async r => ({ endpoint: '/api/transactions', status: r.status, code: (await r.json())?.error?.code })),
       fetch('/api/reports/summary', { credentials: 'include' }).then(async r => ({ endpoint: '/api/reports/summary', status: r.status, code: (await r.json())?.error?.code }))
     ]).then(console.table);
     ```
  6. Click **Logout**, log back in as `USER-DEMO` (`user_demo`), open DevTools Console (`F12`), and attempt to update a foreign/non-owned account UUID:
     ```javascript
     fetch('/api/accounts/00000000-0000-4000-8000-000000000999/opening-balance', {
       method: 'PATCH',
       headers: { 'Content-Type': 'application/json' },
       credentials: 'include',
       body: JSON.stringify({ opening_balance: 5000 })
     }).then(async r => console.log('Foreign Account Probe:', r.status, await r.json()));
     ```
* **Specific Expected Results:**
  - **Administrator Denial (`BR-10` / `AC-02-2`):** Logging in as `admin` displays `/access-denied` (`Access Forbidden (403)`). All 3 backend endpoints (`/api/accounts`, `/api/transactions`, `/api/reports/summary`) return HTTP **`403 Forbidden`** with zero financial data leaked.
  - **Cross-Tenant Ownership Isolation (`BR-01` / `AC-02-3`):** Probing a non-owned/foreign account UUID as `user_demo` returns HTTP **`404 Not Found`** (`NOT_FOUND`), concealing foreign data and leaving `user_demo`'s balances unchanged.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-05` — State, History & Persistence Case: Ledger Survival Across Logout, Browser Closure & Fresh Session
* **Category:** State / History / Persistence Case (Mandatory Category 4)
* **Linked Requirements & ACs:** `F-01`, `F-08`, `F-09`; `FR-01`, `FR-10`, `FR-11`, `NFR-DATA-01`; `AC-01-5`, `AC-08-1`, `AC-09-1`, `AC-09-2`.
* **Role / Account:** `USER-DEMO` (`user_demo`)
* **Preconditions:** `UAT-S1-01` has been completed. Record the exact post-`UAT-S1-01` summary figures $(B_1, D_1, I_1, E_1)$ on `/dashboard` and the top 3 transaction rows on `/transactions` (`History`).
* **Synthetic Inputs:** None (verifies durability of state committed in `UAT-S1-01`).
* **Numbered User Actions:**
  1. On `/dashboard` and `/transactions` (`History`) as `USER-DEMO`, capture screenshots of the 4 Summary Metric Cards and the Transaction History table showing the 3 records created in `UAT-S1-01`.
  2. Click **Logout** in the top navigation bar. Confirm redirect to `/login`.
  3. Close the browser window completely. Open a brand-new browser window, navigate to `https://whatsss-sipqw4logq-as.a.run.app/dashboard` while logged out, and verify it redirects to `/login` without exposing cached financial data.
  4. Log in again as `USER-DEMO` (`user_demo`).
  5. Perform a hard page reload (`Ctrl+F5` / `Cmd+Shift+R`) on `/dashboard` and navigate to `/transactions` (`History`) to inspect all summary cards and transaction rows.
* **Specific Expected Results:**
  - All 4 summary figures after fresh login and hard reload match $(B_1, D_1, I_1, E_1)$ to the exact satang/decimal (e.g., `27,000.00 THB` on fresh baseline or `49,000.00 THB` on live DB after `UAT-S1-01`).
  - All 3 transactions recorded in `UAT-S1-01` (`UAT-S1-01 Monthly Salary` `+20,000.00 THB`, `UAT-S1-01 Split Purchase` `3,000.00 THB` with `Dining: 1,000.00` and `Grocery: 2,000.00` splits, and `UAT-S1-01 Full Card Settlement` `3,000.00 THB`) persist intact in chronological order without duplication or data loss.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-06` — Authentication & Session Security: Invalid Login Rejection & Unauthenticated Access Gate
* **Category:** Authentication & Security Boundary Case (`F-01`, `F-02`)
* **Linked Requirements & ACs:** `F-01`, `F-02`; `FR-01`, `FR-02`, `BR-09`, `NFR-SEC-01`; `AC-01-1`, `AC-01-2`, `AC-01-5`, `AC-02-1`.
* **Role / Account:** Unauthenticated visitor $\rightarrow$ `USER-DEMO` (`user_demo`).
* **Preconditions:** Clean logged-out browser session at `https://whatsss-sipqw4logq-as.a.run.app/login`.
* **Synthetic Inputs:**
  - Wrong password attempt: Username = `user_demo`, Password = `WrongPassword_UAT_999!`
  - Valid login attempt: Username = `user_demo`, Password = `<private_handoff_password>`
* **Numbered User Actions:**
  1. In a logged-out browser, navigate directly to `https://whatsss-sipqw4logq-as.a.run.app/dashboard` and `https://whatsss-sipqw4logq-as.a.run.app/accounts`. Observe automatic redirect to `/login`.
  2. On `/login`, enter Username `user_demo` and Password `WrongPassword_UAT_999!`, then click **Sign In**.
  3. Observe the error alert and verify the user remains on `/login`.
  4. Enter valid `USER-DEMO` credentials and click **Sign In**. Observe navigation to `/dashboard` and the user identity in the top navbar (`Signed in as: user_demo` with blue `USER` badge).
* **Specific Expected Results:**
  - Unauthenticated navigation to `/dashboard` or `/accounts` redirects to `/login` (`AC-02-1`).
  - Invalid password returns HTTP `401 Unauthorized` (`INVALID_CREDENTIALS`) and displays a clear error alert without leaking sensitive details (`AC-01-2`).
  - Valid credentials return HTTP `200 OK`, set an `HttpOnly` cookie, and load `/dashboard` (`AC-01-1`, `AC-01-3`).
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

### A4. Requirement-to-Case Coverage Index

| Sprint 1 Feature / Rule | Functional Requirements & Business Rules | Acceptance Criteria Covered | Mapped UAT Case ID(s) |
|---|---|---|---|
| **`F-01` Authentication & Session** | `FR-01`, `FR-02`, `BR-09`, `NFR-SEC-01` | `AC-01-1`, `AC-01-2`, `AC-01-3`, `AC-01-5` | `UAT-S1-01`, `UAT-S1-05`, `UAT-S1-06` |
| **`F-02` Authorization & Privacy** | `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02` | `AC-02-1`, `AC-02-2`, `AC-02-3` | `UAT-S1-04`, `UAT-S1-06` |
| **`F-03` Opening Balance & Lock** | `FR-05`, `BR-02`, `NFR-DATA-01` | `AC-03-1`, `AC-03-2`, `AC-03-3`, `AC-03-4` | `UAT-S1-01`, `UAT-S1-03` |
| **`F-04` Income Transaction** | `FR-06`, `BR-03`, `NFR-DATA-01` | `AC-04-1`, `AC-04-2` | `UAT-S1-01` |
| **`F-05` Credit Card Purchase** | `FR-07`, `BR-04`, `NFR-DATA-01` | `AC-05-1`, `AC-05-2`, `AC-05-3` | `UAT-S1-01`, `UAT-S1-02` |
| **`F-06` Multiple Allocations** | `FR-08`, `BR-05`, `BR-06` | `AC-06-1`, `AC-06-2`, `AC-06-3` | `UAT-S1-01`, `UAT-S1-02` |
| **`F-07` Credit Card Repayment** | `FR-09`, `BR-07`, `BR-08` | `AC-07-1`, `AC-07-2`, `AC-07-4`, `AC-07-6` | `UAT-S1-01`, `UAT-S1-02` |
| **`F-08` Balance & Summary** | `FR-10`, `BR-02`, `BR-08` | `AC-08-1` | `UAT-S1-01`, `UAT-S1-05` |
| **`F-09` Transaction History** | `FR-11`, `NFR-DATA-01` | `AC-09-1`, `AC-09-2` | `UAT-S1-01`, `UAT-S1-05` |

---

## Part B — Independent UAT Execution (Other Team's Product)

> *Note: Section to be populated under Issue #38 (`@Pilaiwan3492` & `@Apichaya251400`) upon receiving the paired Product Team's UAT handoff packet.*

* **Partner Product Team / Theme:** `TO RECORD UPON PARTNER HANDOFF`
* **Partner Team Members:** `TO RECORD UPON PARTNER HANDOFF`
* **Partner Repository URL:** `TO RECORD UPON PARTNER HANDOFF`
* **Partner Deployed Application URL:** `TO RECORD UPON PARTNER HANDOFF`
* **Partner Tested Release / Commit SHA:** `TO RECORD UPON PARTNER HANDOFF`
* **Independent UAT Testers (Our Team — Both Students Participate):**
  - Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`)
  - Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)

### B1. Partner UAT Execution Log Template

| Case ID | Linked Req / AC | Tester Name | Date / Time (ICT) | Tested Version / SHA | Inputs Used | Actual Observed Result (Never Copy Expected Text) | Outcome (`PASS` / `FAIL` / `BLOCKED`) | Evidence ID |
|:---:|---|---|:---:|:---:|---|---|:---:|:---:|
| `TBD` | `TBD` | Pilaiwan / Aphichaya | `TBD` | `TBD` | `TBD` | *Awaiting partner handoff and live execution* | `NOT RUN` | `B-EV-01` |

---

## Part C — Defect Reporting and Product-Team Triage

### C1. Outgoing Defect Reports (Filed Against Partner Team's Application)
* **Current Status:** `AWAITING PARTNER UAT EXECUTION` *(Not equivalent to "no defects found"; will be updated immediately following Part B execution).*
* **Required Fields per Defect Report:** Issue ID/URL, Partner Product Team, Reporter (`@Pilaiwan3492` / `@Apichaya251400`), Tested Version/SHA, Linked UAT Case/AC, Preconditions & Synthetic Data, Numbered Reproduction Steps, Expected Result, Actual Observed Result, Severity (`Critical` / `Major` / `Minor` justified by user impact), and Supporting Screenshot Evidence ID.

### C2. Incoming Findings Triage Register (Received on Whatsss-PMandELS)
* **Current Status:** `AWAITING PARTNER EXECUTION OF WHATSSS UAT PLAN` *(Will be updated with all received findings, or explicitly recorded as `None` if zero defects are reported).*

| Finding / Issue ID | Linked UAT Case / AC | Reporter | Summary of Reported Behavior | Classification (`Accepted Defect` / `Duplicate` / `Not-a-Defect` / `Enhancement`) | Severity (`Critical` / `Major` / `Minor`) | Rationale Tied to Sprint 1 Contract & Evidence | Owner | Fix Status & Disposition |
|:---:|:---:|---|---|:---:|:---:|---|---|:---:|
| `TBD` | `TBD` | Partner UAT Team | *Awaiting incoming partner UAT findings* | `TBD` | `TBD` | `TBD` | `@Apichaya251400` | `TBD` |

* **Triage Policy:**
  - **Critical / Major Accepted Defects:** Block Sprint 1 acceptance; must be fixed via the RED $\rightarrow$ GREEN engineering workflow in Part D, redeployed to Cloud Run, and independently re-tested by the partner UAT Team.
  - **Minor Accepted Defects:** Must either be fixed and re-tested or explicitly accepted by the partner UAT Team as documented known limitations.
  - **Duplicates:** Linked directly to the primary Issue ID.
  - **Not-a-Defect / Enhancements:** Must be justified with concrete evidence against the frozen Sprint 1 contract (`docs/sprints/sprint-1/feature-contracts.md`). Never relabel a broken Sprint 1 requirement as an enhancement.

---

## Part D — Defect Resolution, Regression (RED/GREEN) and Independent Acceptance

### D1. Engineering Workflow for Accepted Defects (or Section 3.5 Controlled Exercise)
For every accepted defect resolved in this lab (or for a TA-approved controlled defect exercise on an isolated branch if the live Sprint 1 release has zero natural defects per Lab 6 Handout Section 3.5):
1. **Issue & Branch Traceability:** Link the defect Issue to a dedicated fix branch created from `staging-lab5`.
2. **Regression Test — Reproduce Failure (`RED`):**
   - Write an automated test in `server/tests/` or `client/src/` asserting the required Sprint 1 behavior.
   - Run the test against the defective commit and capture the failing command, commit SHA, and actual terminal output (`FAIL`).
3. **Implementation Fix & Verification (`GREEN`):**
   - Correct the application logic.
   - Re-run the exact same reproduction test and capture the passing output (`PASS`).
4. **Full Regression Suite Verification:**
   - Execute the repository verification commands to prove zero regressions:
     ```bash
     # Backend unit & integration tests (Vitest + Supertest)
     cd server && npm test && npm run build

     # Frontend unit & component tests + production bundle build (Vitest + Vite)
     cd ../client && npm test && npm run build

     # Deployment script unit tests
     bash deploy/tests/test-deploy.sh
     bash deploy/tests/test-release.sh
     ```
5. **Teammate PR Review, CI & Cloud Run Redeployment:**
   - Open a Pull Request into `staging-lab5`, obtain substantive review and approval from `@Pilaiwan3492` (enforcing Rule R-09 Zero Self-Merge), and pass the `test-and-docker` CI gate.
   - Promote `staging-lab5` $\rightarrow$ `main` via reviewed Release PR to trigger `.github/workflows/deploy.yml`, rolling out the new Cloud Run revision and passing post-deployment smoke tests (`deploy/smoke_test.py`).
6. **Independent Partner Retest:**
   - Provide the updated Cloud Run revision and commit SHA to the partner UAT Team to re-execute the failed test case(s) and confirm closure.

> **Important Safeguard (Lab 6 Section 3.5):** If the partner UAT Team finds no natural defect in our deployed Sprint 1 release, we will obtain their documented `Accepted` sign-off on the healthy release first, and request a controlled defect exercise on an **isolated branch** (never deliberately breaking the live assessed `main` deployment).

### D2. Independent Sprint 1 UAT Acceptance Decision (For Whatsss-PMandELS)
*To be completed and confirmed **only** by the independent Partner UAT Team after initial testing and any required re-testing:*

* **Final UAT Decision:** `[ ] Accepted` \| `[ ] Accepted with explicitly documented minor limitations` \| `[ ] Not Accepted`
* **Partner UAT Team & Tester Names:** `TO RECORD UPON PARTNER SIGN-OFF`
* **Tested Application URL:** `https://whatsss-sipqw4logq-as.a.run.app`
* **Accepted Release Commit SHA & Cloud Run Revision:** `TO RECORD UPON PARTNER SIGN-OFF`
* **Date / Time of Sign-Off (ICT):** `TO RECORD UPON PARTNER SIGN-OFF`
* **Summary of Executed Cases & Pass/Fail Counts:** `TO RECORD UPON PARTNER SIGN-OFF`
* **Documented Minor Limitations (if any):** `None recorded yet`

---

## 5. Version Index, Evidence Register, Contributions & AI-Use Declaration

### 5.1 Version Traceability Table

| Lifecycle Stage | Branch / Environment | Git Commit SHA / Revision | Status & Notes |
|---|---|---|---|
| **Sprint 1 Code Baseline** | `sprint-1` | `2002ad088e739b90072f129838e6a096f6f4bf87` | Frozen Sprint 1 implementation baseline (`F-01`–`F-09`) |
| **Lab 5 Production Release (`main`)** | `main` / `staging-lab5` | `ba2f9dd43d8ed620d4b27820d43bee243d2e3d4d` | Merged Lab 5 release & CI/CD pipeline baseline |
| **Initial Tested Cloud Run Deployment** | Cloud Run (`asia-southeast1`) | Revision `whatsss-00020-65k` (Image SHA `f160f256af24635cdc602b676a7cf8822fbbceb8`) | Active 100% traffic serving revision at UAT handoff |
| **Defective Commit(s) (if any)** | `TBD` | `TBD` | To be recorded in Part C/D |
| **Regression Test (`RED`) & Fix (`GREEN`) Commit** | `TBD` | `TBD` | To be recorded in Part D |
| **Corrected `main` Release & Cloud Run Revision** | `TBD` | `TBD` | To be recorded in Part D after retest |

### 5.2 Evidence Register Index

| Evidence ID | Lab 6 Part | Artifact / Description | Tested Version / Revision | Status |
|:---:|:---:|---|---|:---:|
| **`A-EV-01`** | Part A | Live `/api/health` and `/api/ready` (`200 OK`, `database: connected`) preflight check on `https://whatsss-sipqw4logq-as.a.run.app` | `whatsss-00020-65k` (`f160f25`) | Ready |
| **`A-EV-02`** | Part A | Seeded accounts (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`) and safe handoff package (`docs/labs/lab-06/uat-plan.md`) | `ba2f9dd` | Ready |
| **`B-EV-01`..`XX`** | Part B | Screenshots & execution logs of our team independently testing the partner team's deployed Sprint 1 release | Partner Release `TBD` | Pending Partner Handoff |
| **`C-EV-01`..`XX`** | Part C | Outgoing defect reports to partner team and incoming findings triage table for Whatsss | `TBD` | Pending Execution |
| **`D-EV-01`..`XX`** | Part D | Automated regression test failure (`RED`), fix (`GREEN`), PR review, CI run, Cloud Run redeployment, and partner retest | `TBD` | Pending Triage |
| **`D-EV-FINAL`** | Part D | Signed/recorded independent Sprint 1 UAT acceptance decision from partner UAT Team | `TBD` | Pending Sign-Off |

### 5.3 Team Contribution Table

| Team Member | Student ID | GitHub Handle | Primary Lab 6 Responsibilities |
|---|:---:|:---:|---|
| **Aphichaya Klinhual** | `67070503447` | `@Apichaya251400` | **Issue #37 (Product Team Lead):** Authored Sprint 1 UAT Test Plan & Safe Handoff (`UAT-S1-01`–`06` in `docs/labs/lab-06/uat-plan.md`); prepared test account fixtures; co-executed partner UAT cases in Part B; responsible for Part D RED/GREEN regression tests, bugfix implementation, and Cloud Run redeployment; reviewed Issue #38 PR. |
| **Pilaiwan Churdchu** | `67070503492` | `@Pilaiwan3492` | **Issue #38 (Independent UAT Lead & Defect Manager):** Reviewed & approved Issue #37 UAT Plan PR; led Part B independent UAT execution on partner team's deployment; authored Part C outgoing defect reports and incoming triage register; verified independent retest sign-off and compiled final Lab 6 submission PDF. |

### 5.4 AI-Use Declaration
AI assistance (Antigravity AI coding assistant) was used to help structure the Sprint 1 UAT test plan template, cross-reference requirement/acceptance-criteria IDs from our repository's Sprint 1 specifications (`docs/sprints/sprint-1/`), and format markdown tables. Both students (`Aphichaya Klinhual` and `Pilaiwan Churdchu`) independently verified all test steps, balance formulas, deployed URLs, and revision states against the live Cloud Run service, and are solely responsible for executing live UAT sessions, recording genuine test outcomes, triaging defects, and obtaining independent acceptance sign-offs. No execution outcomes or partner sign-offs were fabricated or generated by AI.
