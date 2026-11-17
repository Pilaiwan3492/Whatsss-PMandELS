# Lab 6 — Sprint 1 User Acceptance Testing (UAT) & Defect Management

> **Product:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Members:**  
> - **Aphichaya Klinhual** (Student ID: `67070503447`, GitHub: [`@Apichaya251400`](https://github.com/Apichaya251400)) — *Product Team Lead (Issue #37: Parts A & D)*  
> - **Pilaiwan Churdchu** (Student ID: `67070503492`, GitHub: [`@Pilaiwan3492`](https://github.com/Pilaiwan3492)) — *Independent UAT Lead & Defect Manager (Issue #38: Parts B & C + Retest Sign-off)*  
> **Repository:** [`https://github.com/Pilaiwan3492/Whatsss-PMandELS`](https://github.com/Pilaiwan3492/Whatsss-PMandELS)  
> **Reference Staging Branch:** [`staging-lab5`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/tree/staging-lab5)  
> **Baseline Release (`main`) Commit SHA:** `ba2f9dd43d8ed620d4b27820d43bee243d2e3d4d` (`ba2f9dd`)  
> **Last Known Serving Application Image Commit SHA (Handoff Baseline):** `f160f256af24635cdc602b676a7cf8822fbbceb8` (`f160f25`)  
> **Deployed Cloud Run Revision (Handoff Baseline):** `whatsss-00020-65k` (Region: `asia-southeast1`, Project: `cpe334-whatsss-pmandels`, 100% Traffic)  
> **Public Service URL (Cloud Run):** [`https://whatsss-sipqw4logq-as.a.run.app`](https://whatsss-sipqw4logq-as.a.run.app)  
> **Document Status:** `PRODUCT-TEAM UAT HANDOFF DRAFT` — Independent UAT execution and preflight evidence capture pending.

---

## Part A — Product Team: UAT Preparation and Handoff

### A1. Agreed Sprint 1 Scope and Traceability

#### In Scope (Delivered Sprint 1 Golden Vertical Slice: `F-01` through `F-09`)
The assessed UAT scope is strictly the delivered Sprint 1 functionality defined in our frozen Sprint 1 contract:
* **`F-01` Authentication & Session Lifecycle (`FR-01`, `FR-02`, `NFR-SEC-01`, `BR-09`):** User login (`POST /api/auth/login`), current session identity/role verification (`GET /api/auth/me`), and logout (`POST /api/auth/logout`) using `HttpOnly`, `SameSite=Lax`, `Secure` JWT cookies.
* **`F-02` Server-Side Authorization & Privacy Guards (`BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`):** Unauthenticated requests rejected (`401 Unauthorized`); platform administrators (`ADMIN`) strictly denied access to personal financial ledgers (`403 Forbidden` per `BR-10`); cross-tenant access to another user's accounts or transactions concealed (`404 Not Found` per `BR-01`); CSRF Origin validation (`403 CSRF_ORIGIN_REJECTED` per `AC-02-4`).
* **`F-03` Account Opening Balance Lifecycle (`FR-05`, `BR-02`, `NFR-DATA-01`):** Setting initial starting balance on eligible unlocked accounts (`PATCH /api/accounts/:id/opening-balance`), excluding opening balances from income/expense summaries (`BR-02`), and atomic permanent locking (`is_opening_locked = true`, UI badge `Opening balance locked`) upon committing the first referencing transaction (`422 OPENING_BALANCE_LOCKED` on subsequent attempts).
* **`F-04` Income Transaction Processing (`FR-06`, `BR-03`, `NFR-DATA-01`):** Recording salary/income into a `CASH` account (`POST /api/transactions/income`), increasing cash balance and total income summary, validating positive amounts and required dates (`400 Bad Request` on invalid inputs per `AC-04-2`), and atomically locking the receiving bank account's opening balance.
* **`F-05` & `F-06` Credit Card Purchase & Multiple Allocations Engine (`FR-07`, `FR-08`, `BR-04`, `BR-05`, `BR-06`):** Recording purchases charged to a `LOAN_TAKEN` credit card account (`POST /api/transactions/expense`) with multi-line expense category splits (e.g., `Dining` + `Grocery`). Enforces required primary account (`AC-05-2`), positive valid amounts (`AC-05-3`), exact mathematical equality $\sum \text{allocations.amount} = \text{total\_amount}$ (`422 ALLOCATION_SUM_MISMATCH` if unbalanced per `BR-06`), and distinct allocation categories (`400 DUPLICATE_ALLOCATION_ACCOUNT` per `AC-06-3`).
* **`F-07` Credit Card Repayment Engine (`FR-09`, `BR-07`, `BR-08`):** Settling credit card debt from a `CASH` bank account (`POST /api/transactions/repayment`). Atomically decreases bank cash balance and credit card debt (`BR-07`), rejects repayments exceeding current debt (`422 REPAYMENT_EXCEEDS_DEBT` per `AC-07-4`), insufficient bank funds (`422 INSUFFICIENT_FUNDS` per `AC-07-5`), or invalid/non-positive amounts (`400 INVALID_AMOUNT` per `AC-07-6`), and strictly excludes debt repayment from total expense summaries (`BR-08`).
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
| Parameter | Last Known / Handoff Baseline |
|---|---|
| **Public Application URL** | `https://whatsss-sipqw4logq-as.a.run.app` |
| **Health & Readiness Probes** | `GET /api/health` (expected `200 OK`) \| `GET /api/ready` (expected `200 OK`, `"database":"connected"`) |
| **Main Release Commit SHA** | `ba2f9dd43d8ed620d4b27820d43bee243d2e3d4d` (`ba2f9dd`) |
| **Serving Container Commit SHA** | `f160f256af24635cdc602b676a7cf8822fbbceb8` (last known baseline; to be re-verified via `/api/health` `commitSha` at preflight) |
| **Active Cloud Run Revision** | `whatsss-00020-65k` (`asia-southeast1`) |
| **Database Backing** | Google Cloud SQL for PostgreSQL 16 (`whatsss-sql`, `db-f1-micro`, Enterprise edition) |

> **Handoff Baseline Note:** These values represent the last known handoff baseline and must be re-verified during the preflight session before UAT execution (`A-EV-01` and `A-EV-02` remain `Pending Evidence` in Section `5.2` until live preflight evidence is captured).
>
> **Preflight Check for UAT Testers:** Before running test cases, open `https://whatsss-sipqw4logq-as.a.run.app/api/health` and `https://whatsss-sipqw4logq-as.a.run.app/api/ready` in a clean browser profile (Incognito/InPrivate) to confirm HTTP 200 and record the actual `commitSha` and timestamp. If the service is unreachable or the version cannot be identified, stop and record `BLOCKED`.

#### 2. Safe Test Accounts (Credentials Delivered Privately — Never in Git or PDF)
Account passwords are stored in GCP Secret Manager and transmitted to the partner UAT Team **exclusively via private handoff channel (Discord DM / LEB2 private message)**. Never include plaintext passwords, JWT cookies, or secret values in screenshots or reports.

| Account Label | Username (Local / Staging) | Username (Cloud Run Production) | Role | Environment Availability & Verification Requirement |
|:---:|:---:|:---:|:---:|---|
| **`USER-A` (`USER-DEMO`)** | `user_demo` | `user_demo` | `USER` | Seeded in Local/Staging and Cloud Run when `SEED_DEMO_DATA=true`. **Must be verified present on Cloud Run (with its 5 standard accounts) during preflight before starting UAT** (`UAT-S1-01`–`06`). |
| **`USER-B` (`USER-OTHER`)** | `user_other` | `user_other` *(not seeded by default in `NODE_ENV=production`; must be verified or provisioned before UAT)* | `USER` | Seeded automatically only in Local/Staging (`NODE_ENV !== 'production'`). **Must be verified to exist with its 5 standard accounts in the target UAT environment—or provisioned per Section `A2.4`—before executing `UAT-S1-04` cross-user isolation.** Never claim User B exists on Cloud Run without verification evidence. |
| **`ADMIN-DEMO`** | `admin_demo` | `admin` | `ADMIN` | Seeded in Local/Staging (`admin_demo`) and Cloud Run (`admin`). **Must be verified present during preflight** to test role segregation and denial of access to personal financial ledgers (`BR-10`, HTTP `403 Forbidden` in `UAT-S1-04`). |

#### 3. Seeded Synthetic Financial Accounts (Expected per Provisioned `USER`)
Each `USER` account is expected to have its own isolated set of 5 standard accounts under distinct `user_id` ownership when successfully provisioned. The availability of `user_demo`, `user_other`, and their respective accounts must be verified separately in each target environment before UAT:

| Account Name | Account Type | UI Section on `/accounts` | Domain Role | Fresh Seed Initial Balance ($B_{\text{pre}}$) |
|---|:---:|---|---|---:|
| **`Checking Bank`** | `CASH` | Cash & Liquid Accounts | Primary liquid bank account for opening balance, salary deposits, and credit card repayments | `0.00 THB` (`is_opening_locked = false`) |
| **`Visa Credit Card`** | `LOAN_TAKEN` | Credit Cards & Liabilities | Liability credit card account for recording purchases and tracking outstanding debt | `0.00 THB` (`is_opening_locked = false`) |
| **`Salary`** | `INCOME` | Income Categories | Income category account for salary inflows | Flow Category (`0.00 THB`) |
| **`Dining`** | `EXPENSE` | Expense Categories | Expense category account for restaurant/meal split allocations | Flow Category (`0.00 THB`) |
| **`Grocery`** | `EXPENSE` | Expense Categories | Expense category account for supermarket/household split allocations | Flow Category (`0.00 THB`) |

---

### A2.4 Test Data Lifecycle and Reset/Cleanup Procedure

#### A. Test Data Preparation & Fixture Separation
1. **Test Users & Roles (Must Be Verified per Target Environment):**
   - **User A (`user_demo`, Role: `USER`):** Primary UAT financial user; verify before UAT that `user_demo` and its 5 standard accounts (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`) exist on the target environment (Cloud Run / Staging / Local).
   - **User B (`user_other`, Role: `USER`):** Secondary UAT financial user required for cross-user isolation testing (`UAT-S1-04` Sub-check 4B) and dedicated boundary fixture testing (`UAT-S1-02` Sub-check 2D). Because `server/prisma/seed.ts` only seeds `user_other` automatically when `NODE_ENV !== 'production'`, the Product Team must verify whether `user_other` and its 5 standard accounts exist in the target UAT environment prior to testing, and if absent, provision `user_other` and its 5 accounts using `provisionDemoAccounts` before starting UAT. Do not claim or assume User B's accounts exist on Cloud Run without verification evidence.
   - **Admin (`admin` on Cloud Run / `admin_demo` on Local/Staging, Role: `ADMIN`):** Administrative user possessing zero financial accounts (`BR-10`).
2. **Fixture Separation (Lab 5 Historical Data vs. Lab 6 UAT Data):**
   - **Fresh Seeded Database (Local / Isolated UAT Staging):** All accounts start at $B_{\text{pre}} = 0.00\text{ THB}$, $D_0 = 0.00\text{ THB}$, $I_0 = 0.00\text{ THB}$, $E_0 = 0.00\text{ THB}$, `is_opening_locked = false`, and `0` transactions.
   - **Existing Live Cloud Run Database (`https://whatsss-sipqw4logq-as.a.run.app`):** Retains historical verification records from Lab 5 (`C-04` and `C-05`) on `user_demo`, where Opening Balance (`10,000.00 THB`) was already locked (`is_opening_locked = true`) and pre-test starting balances are $B_0 = 32,000.00\text{ THB}$, $D_0 = 0.00\text{ THB}$, $I_0 = 25,000.00\text{ THB}$, $E_0 = 3,000.00\text{ THB}$.
   - **Dedicated Over-Repayment Fixture (`UAT-S1-02` Sub-check 2D):** Uses an isolated account state with `Checking Bank Balance = 5,000.00 THB` and `Visa Credit Card Debt = 3,000.00 THB` (can be prepared on a fresh reset or on `user_other` / dedicated UAT account so it does not conflict with `UAT-S1-01`).

#### B. Baseline Verification (Mandatory Pre-Run Gate)
Before executing any UAT test case, the tester must verify and record:
1. **Starting Bank Balance ($B_{\text{pre}}$ or $B_0$):** Verify whether Opening Balance is unlocked ($B_{\text{pre}} = 0.00\text{ THB}$) or already established ($B_0$).
2. **Starting Credit Card Debt ($D_0$):** Verify exact debt amount on `Visa Credit Card`.
3. **Existing Transactions & Account Lock State:** Inspect `/transactions` and `/accounts` (`Set Opening Balance` button vs. `Opening balance locked` badge).
4. **User Role & Fixture Presence:** Confirm login succeeds for `user_demo`, `user_other` (for `UAT-S1-04`), and `admin` / `admin_demo`.
> **Stop Rule:** If the observed starting balances or account fixtures do not match the required preconditions of a test case (for example, if `user_other` is missing in `UAT-S1-04` or the `5,000 / 3,000` fixture is not prepared for `UAT-S1-02` Sub-check 2D), **stop immediately**, record `BLOCKED` (never `PASS`), and ask the Product Team to prepare/reset the fixture before continuing.

#### C. Unique Test Run Identification
To distinguish UAT transactions across repeated test runs without ambiguity:
* Assign each UAT execution session a unique Run ID in the format: **`LAB6-UAT-RUN-01`** (incrementing to `LAB6-UAT-RUN-02`, etc., for re-tests).
* Prefix every transaction description created during UAT with the Run ID and Case ID:
  - Example: `[LAB6-UAT-RUN-01] UAT-S1-01 Monthly Salary`
  - Example: `[LAB6-UAT-RUN-01] UAT-S1-01 Split Purchase`
  - Example: `[LAB6-UAT-RUN-01] UAT-S1-01 Full Card Settlement`

#### D. Reset and Cleanup Procedure
1. **Responsible Owner:** Product Team Lead (`@Apichaya251400`).
2. **Reset Procedure (For Disposable Local / Isolated Staging UAT Environment):**
   ```bash
   # Execute ONLY on disposable local/staging test database (NEVER on unbacked production)
   cd server
   npx prisma migrate reset --force
   npx prisma db seed
   ```
3. **Post-Reset Verification:**
   - Log in as `user_demo` and `user_other`; confirm `Checking Bank` and `Visa Credit Card` show `0.00 THB`, `Set Opening Balance` button is active (`is_opening_locked = false`), and `/transactions` shows `No transactions recorded yet`.
4. **Safe Alternative When Production Reset is Restricted (Preserving Lab 5 Evidence):**
   - **Never reset or delete existing production/demo data on the live Cloud SQL instance (`whatsss-sql`) without explicit authorization**, as Lab 5 grading requires C-04/C-05 records to remain inspectable.
   - Instead, either:
     - **(Option 1 — Delta Verification with Run Tags):** Execute `UAT-S1-01` on `user_demo` using unique `[LAB6-UAT-RUN-01]` descriptions and verify the exact mathematical deltas from the recorded starting state $B_0 = 32,000.00\text{ THB} \rightarrow 49,000.00\text{ THB}$; **OR**
     - **(Option 2 — Dedicated UAT User Fixture):** Provision a dedicated fresh `USER` account (e.g., `user_other` or `uat_tester_01` with its 5 standard accounts starting at `0.00 THB` via `provisionDemoAccounts`) so the UAT Team can test from a clean `0.00 THB` baseline without touching `user_demo`'s Lab 5 records.

---

### A2.5 Standardized Balance Definitions & Mathematical Formulas

To eliminate any ambiguity between pre-Opening-Balance and post-Opening-Balance figures across all test cases:

* **$B_{\text{pre}}$ (Pre-Opening-Balance Bank Balance):** The balance of `Checking Bank` **before** setting the Opening Balance (on a fresh database, $B_{\text{pre}} = 0.00\text{ THB}$).
* **$B_0$ (Post-Opening-Balance / Pre-Transaction Starting Bank Balance):** The balance of `Checking Bank` **after** the Opening Balance has been established, right before recording the first UAT transaction:
  $$B_0 = B_{\text{pre}} + \text{OpeningBalance}$$
* **$\text{FinalBalance}$ (Final Checking Bank Balance after `UAT-S1-01`):**
  $$\text{FinalBalance} = B_0 + \text{Income} - \text{Repayment}$$

#### Example 1: Fresh Database (Opening Balance Set During Test)
| Step / Component | Formula / Variable | Amount (THB) | Resulting Bank Balance |
|---|---|---:|---:|
| Balance before setting Opening Balance | $B_{\text{pre}}$ | `0.00` | `0.00 THB` |
| Set Opening Balance (`F-03`) | $+\text{OpeningBalance}$ | `+10,000.00` | **$B_0 = 10,000.00\text{ THB}$** |
| Record Salary Income (`F-04`) | $+\text{Income}$ | `+20,000.00` | $B_0 + 20,000.00 = 30,000.00\text{ THB}$ |
| Record Credit Card Split Purchase (`F-05`/`F-06`) | Charged to `Visa Credit Card` (`+3,000.00` Debt) | `0.00` (Cash impact) | `30,000.00 THB` (Debt = `3,000.00 THB`) |
| Record Credit Card Debt Repayment (`F-07`) | $-\text{Repayment}$ | `-3,000.00` | **$\text{FinalBalance} = 27,000.00\text{ THB}$** (Debt = `0.00 THB`) |

$$\text{Verification (Fresh DB): } B_0 = 0.00 + 10,000.00 = 10,000.00\text{ THB} \implies \text{FinalBalance} = 10,000.00 + 20,000.00 - 3,000.00 = \mathbf{27,000.00\text{ THB}}$$

#### Example 2: Existing Live Database (`user_demo` with Prior Lab 5 Transactions)
> *Note:* On the existing Live DB, `Checking Bank` Opening Balance was already set and locked during Lab 5. Therefore, no new Opening Balance is set in `UAT-S1-01`, and the pre-test starting balance is already **$B_0 = 32,000.00\text{ THB}$**.

| Step / Component | Formula / Variable | Amount (THB) | Resulting Bank Balance |
|---|---|---:|---:|
| Starting Balance before UAT test (Opening Balance already locked) | $B_0$ | `32,000.00` | **$B_0 = 32,000.00\text{ THB}$** |
| Record Salary Income (`F-04`) | $+\text{Income}$ | `+20,000.00` | $B_0 + 20,000.00 = 52,000.00\text{ THB}$ |
| Record Credit Card Split Purchase (`F-05`/`F-06`) | Charged to `Visa Credit Card` (`+3,000.00` Debt) | `0.00` (Cash impact) | `52,000.00 THB` (Debt = `3,000.00 THB`) |
| Record Credit Card Debt Repayment (`F-07`) | $-\text{Repayment}$ | `-3,000.00` | **$\text{FinalBalance} = 49,000.00\text{ THB}$** (Debt = `0.00 THB`) |

$$\text{Verification (Live DB): } B_0 = 32,000.00\text{ THB} \implies \text{FinalBalance} = 32,000.00 + 20,000.00 - 3,000.00 = \mathbf{49,000.00\text{ THB}}$$

---

### A3. Executable UAT Cases (Manual End-User Actions)

---

#### `UAT-S1-01` — Normal Domain Journey: Opening Balance, Income Inflow, Multi-Split Credit Card Purchase & Full Debt Repayment
* **Category:** Normal Domain Journey (Mandatory Category 1)
* **Linked Requirements & ACs:** `F-03`, `F-04`, `F-05`, `F-06`, `F-07`, `F-08`, `F-09`; `FR-05`–`FR-11`; `BR-02`–`BR-08`; `AC-03-1`, `AC-03-4`, `AC-04-1`, `AC-05-1`, `AC-06-1`, `AC-07-1`, `AC-07-2`, `AC-08-1`, `AC-09-1`.
* **Role / Account:** `USER-A` (`user_demo`, Role: `USER`)
* **Preconditions:**
  - Authenticated as `USER-A` (`user_demo`) at `/dashboard` and `/accounts`.
  - **If testing on Fresh DB:** `Checking Bank` is unlocked ($B_{\text{pre}} = 0.00\text{ THB}$). Setting Opening Balance to `10,000.00 THB` in Step 1 establishes $B_0 = B_{\text{pre}} + 10,000.00 = 10,000.00\text{ THB}$, with $D_0 = 0.00\text{ THB}$, $I_0 = 0.00\text{ THB}$, $E_0 = 0.00\text{ THB}$.
  - **If testing on Existing Live DB:** Opening Balance is already locked (`Opening balance locked`), and the pre-test starting figures on `/dashboard` are $B_0 = 32,000.00\text{ THB}$, $D_0 = 0.00\text{ THB}$, $I_0 = 25,000.00\text{ THB}$, $E_0 = 3,000.00\text{ THB}$.
* **Synthetic Inputs (Using Run Identifier `LAB6-UAT-RUN-01`):**
  - *Step 1 (Fresh DB only — Opening Balance):* Account = `Checking Bank`, Opening Balance = `10000.00` THB.
  - *Step 2 (Income Transaction):* Destination Cash Account = `Checking Bank`, Income Category = `Salary`, Amount (THB) = `20000.00`, Transaction Date = `2026-11-17`, Description = `[LAB6-UAT-RUN-01] UAT-S1-01 Monthly Salary`.
  - *Step 3 (Split Credit Card Purchase):* Credit Card = `Visa Credit Card`, Total Amount = `3000.00`, Transaction Date = `2026-11-17`, Description = `[LAB6-UAT-RUN-01] UAT-S1-01 Split Purchase`, Allocation 01: Expense Category = `Dining`, Amount (THB) = `1000.00`, Notes = `UAT Dinner`; Allocation 02: Expense Category = `Grocery`, Amount (THB) = `2000.00`, Notes = `UAT Supermarket`.
  - *Step 4 (Credit Card Repayment):* Pay From (Source Cash Account) = `Checking Bank`, Settle Debt For (Target Credit Card) = `Visa Credit Card`, Repayment Amount (THB) = `3000.00`, Transaction Date = `2026-11-17`, Description = `[LAB6-UAT-RUN-01] UAT-S1-01 Full Card Settlement`.
* **Numbered User Actions:**
  1. Log in as `user_demo`. Navigate to **Accounts** (`/accounts`).
     - **On Fresh DB ($B_{\text{pre}} = 0.00\text{ THB}$):** Click **Set Opening Balance** on `Checking Bank`, enter `10000.00`, and click **Save Opening Balance**. Verify `Checking Bank` Current Balance is now **$B_0 = 10,000.00\text{ THB}$**, while on `/dashboard`, `Total Income` (`0.00 THB`) and `Total Expenses` (`0.00 THB`) exclude the opening balance (`BR-02`, `AC-03-4`).
     - **On Live DB:** Observe that `Checking Bank` already displays `Opening balance locked` and record starting balance **$B_0 = 32,000.00\text{ THB}$** ($D_0 = 0.00$, $I_0 = 25,000.00$, $E_0 = 3,000.00$).
  2. On `/accounts`, click the green **Record Income** button. In the **Record Income Transaction** modal:
     - Select **Destination Cash Account** = `Checking Bank` and **Income Category** = `Salary`.
     - Enter **Amount (THB)** = `20000.00`, **Transaction Date** = `2026-11-17`, **Description** = `[LAB6-UAT-RUN-01] UAT-S1-01 Monthly Salary`, and submit.
     - Verify `Checking Bank` balance increases to $B_0 + 20,000.00$ (`30,000.00 THB` on Fresh DB; `52,000.00 THB` on Live DB) and `Checking Bank` status displays **`Opening balance locked`**.
  3. On `/accounts`, click the blue **Record Purchase** button. In the **Record Purchase** modal:
     - Select **Credit Card** = `Visa Credit Card`.
     - Enter **Total Amount** = `3000.00`, **Transaction Date** = `2026-11-17`, **Description** = `[LAB6-UAT-RUN-01] UAT-S1-01 Split Purchase`.
     - Under **02 — Expense Breakdown (Expense Allocations)**:
       - **Allocation 01:** Expense Category = `Dining`, Amount (THB) = `1000.00`, Notes = `UAT Dinner`.
       - **Allocation 02:** Expense Category = `Grocery`, Amount (THB) = `2000.00`, Notes = `UAT Supermarket`.
     - Confirm the **Allocation Summary** panel displays badge **`Balanced`**, `Total Purchase: ฿3000.00`, `Allocated: ฿3000.00`, `Remaining: ฿0.00`, and `✓ Fully allocated: ฿3000.00 of ฿3000.00. Ready to record.`
     - Click **Record Purchase**. Verify `Visa Credit Card` Current Debt becomes $D_0 + 3,000.00 = 3,000.00\text{ THB}$.
  4. On `/accounts`, click **Pay Credit Card** (or **Pay Debt** on the `Visa Credit Card` card). In the **Credit Card Repayment** modal:
     - Select **Pay From (Source Cash Account)** = `Checking Bank` and **Settle Debt For (Target Credit Card)** = `Visa Credit Card`.
     - Click **Pay Full Debt (฿3,000.00)** (or enter `3000.00`), set **Transaction Date** = `2026-11-17`, **Description** = `[LAB6-UAT-RUN-01] UAT-S1-01 Full Card Settlement`.
     - Confirm the live preview shows `New Bank Balance` = $B_0 + 17,000.00$ (`27,000.00 THB` on Fresh DB; `49,000.00 THB` on Live DB) and `New Credit Debt: 0.00 THB (Fully Settled)`.
     - Click **Confirm Repayment**.
  5. Navigate to **Dashboard** (`/dashboard`) and **History** (`/transactions`) to verify all 4 summary cards, the Expense Category Breakdown, and the Transaction History rows.
* **Specific Expected Results (Consistent $B_{\text{pre}}$ and $B_0$ Basis):**
  | Stage | Mathematical Formula | Fresh DB ($B_{\text{pre}} = 0.00$, Opening $= +10,000.00$) | Existing Live DB (Pre-test $B_0 = 32,000.00$, $I_0 = 25,000.00$, $E_0 = 3,000.00$) |
  |---|---|---|---|
  | **Pre-Opening Balance ($B_{\text{pre}}$)** | $B_{\text{pre}}$ | Bank = `0.00 THB` | *N/A (Opening balance locked in prior run)* |
  | **Post-Opening / Pre-Test Baseline ($B_0$)** | $B_0 = B_{\text{pre}} + \text{OpeningBalance}$ | **Bank ($B_0$) = `10,000.00`**, Debt ($D_0$) = `0.00`, Inc ($I_0$) = `0.00`, Exp ($E_0$) = `0.00` | **Bank ($B_0$) = `32,000.00`**, Debt ($D_0$) = `0.00`, Inc ($I_0$) = `25,000.00`, Exp ($E_0$) = `3,000.00` |
  | **After Step 2 (Salary `+20,000.00`)** | $B = B_0 + 20,000.00$<br>$I = I_0 + 20,000.00$ | Bank = `30,000.00`, Debt = `0.00`, Inc = `20,000.00`, Exp = `0.00` | Bank = `52,000.00`, Debt = `0.00`, Inc = `45,000.00`, Exp = `3,000.00` |
  | **After Step 3 (CC Purchase `+3,000.00`: `1,000` Dining + `2,000` Grocery)** | $D = D_0 + 3,000.00$<br>$E = E_0 + 3,000.00$ | Bank = `30,000.00`, Debt = `3,000.00`, Inc = `20,000.00`, Exp = `3,000.00` | Bank = `52,000.00`, Debt = `3,000.00`, Inc = `45,000.00`, Exp = `6,000.00` |
  | **After Step 4 (CC Repayment `-3,000.00`, Excluded from Expense per `BR-08`)** | $\text{FinalBalance} = B_0 + 20,000.00 - 3,000.00$<br>$D = D_0 + 3,000.00 - 3,000.00 = 0.00$ | **Bank = `27,000.00 THB`, Debt = `0.00 THB`, Inc = `20,000.00 THB`, Exp = `3,000.00 THB`** | **Bank = `49,000.00 THB`, Debt = `0.00 THB`, Inc = `45,000.00 THB`, Exp = `6,000.00 THB`** |
  - All 3 transactions (`[LAB6-UAT-RUN-01] UAT-S1-01 Monthly Salary`, `[LAB6-UAT-RUN-01] UAT-S1-01 Split Purchase` with `Dining: 1,000.00` & `Grocery: 2,000.00`, and `[LAB6-UAT-RUN-01] UAT-S1-01 Full Card Settlement`) are listed in `/transactions`.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-02` — Business-Rule & Boundary Case: Unbalanced Splits (`BR-06`), Duplicate Category (`AC-06-3`), Over-Repayment Fixture (`AC-07-4`), and Invalid Input Rejections (`AC-04-2`, `AC-05-2`, `AC-05-3`, `AC-07-6`)
* **Category:** Business-Rule or Boundary Case (Mandatory Category 2)
* **Linked Requirements & ACs:** `F-04`, `F-05`, `F-06`, `F-07`; `FR-06`–`FR-09`; `BR-03`–`BR-07`; `AC-04-2`, `AC-05-2`, `AC-05-3`, `AC-06-2`, `AC-06-3`, `AC-07-4`, `AC-07-6`.
* **Role / Account:**
  - Sub-checks 2A, 2B, 2C, 2E, 2F, 2G: Any authenticated `USER` (`user_demo` or `user_other`).
  - Sub-check 2D (Dedicated Over-Repayment Fixture per Sprint 1 Test Spec `AC-07-4` / `TEST-REPAY-03`): Dedicated `USER` fixture (e.g., `user_other` or freshly reset `user_demo`) prepared with **Bank Balance = `5,000.00 THB`** and **Credit Card Debt = `3,000.00 THB`**.
* **Preconditions:**
  - Record pre-test account balances before running negative checks.
  - For **Sub-check 2D (Over-Repayment `AC-07-4`)**, prepare the dedicated fixture first so it is 100% independent of `UAT-S1-01`:
    | Dedicated Fixture Parameter (`AC-07-4` / `TEST-REPAY-03`) | Required Value | How to Prepare on Isolated User (`user_other` or Fresh Reset) |
    |---|---:|---|
    | **Checking Bank Balance** | **`5,000.00 THB`** | Set Opening Balance = `5000.00` THB on `Checking Bank` (or deposit `5000.00` Income if `0.00`). |
    | **Visa Credit Card Debt** | **`3,000.00 THB`** | Record a Credit Card Purchase of `3000.00` THB (`Dining: 1000.00`, `Grocery: 2000.00`) on `Visa Credit Card`. |
    | **Attempted Repayment Amount** | **`3,500.00 THB`** | Strictly exceeds the `3,000.00 THB` Credit Card Debt while being less than the `5,000.00 THB` Bank Balance. |
* **Synthetic Inputs & Numbered User Actions:**
  1. **Sub-check 2A — Under-Allocated Split (`BR-06` / `AC-06-2`):**
     - On `/accounts`, click **Record Purchase**. Enter **Total Amount** = `1500.00`, **Allocation 01** (`Dining`) = `500.00`, **Allocation 02** (`Grocery`) = `500.00` (Sum = `1,000.00 != 1,500.00`).
     - *UI Check:* Verify badge shows **`Incomplete`**, status shows `⚠ Allocate the remaining ฿500.00 to continue.`, and the **Record Purchase** submit button is disabled.
  2. **Sub-check 2B — Over-Allocated Split (`BR-06` / `AC-06-2`):**
     - In the same modal, keep **Total Amount** = `1500.00`, set **Allocation 01** (`Dining`) = `1000.00` and **Allocation 02** (`Grocery`) = `800.00` (Sum = `1,800.00 > 1,500.00`).
     - *UI Check:* Verify badge shows **`Over-allocated`**, status shows `✕ Over-allocated by ฿300.00. Total allocations exceed purchase amount.`, and the **Record Purchase** button is disabled.
  3. **Sub-check 2C — Duplicate Expense Category (`AC-06-3`):**
     - Change **Total Amount** to `1000.00`. Set **Allocation 01** Category = `Dining` (`400.00`) and **Allocation 02** Category = `Dining` (`600.00`). Click **Record Purchase**.
     - *UI Check:* Verify error banner displays **`Each allocation line must use a distinct expense category.`** (If sent directly to `POST /api/transactions/expense`, server returns HTTP `400 Bad Request` with `DUPLICATE_ALLOCATION_ACCOUNT`).
  4. **Sub-check 2D — Dedicated Over-Repayment Test (`AC-07-4` / `TEST-REPAY-03`):**
     - Using the dedicated fixture where **Checking Bank Balance = `5,000.00 THB`** and **Visa Credit Card Debt = `3,000.00 THB`**:
     - *Manual UI Validation:* Open **Pay Credit Card** (`Credit Card Repayment` modal). Confirm `Available: ฿5,000.00` on `Checking Bank` and `Current Debt: ฿3,000.00` on `Visa Credit Card`. Enter **Repayment Amount (THB)** = `3500.00`. Observe the red inline warning **`Exceeds debt (฿3,000.00)`** and confirm the **Confirm Repayment** button is disabled.
     - *API Validation (Execute via DevTools Console `F12` to verify backend contract `422 REPAYMENT_EXCEEDS_DEBT`):*
       ```javascript
       fetch('/api/accounts', { credentials: 'include' })
         .then(r => r.json())
         .then(async d => {
           const bank = d.data.accounts.find(a => a.name === 'Checking Bank');
           const cc = d.data.accounts.find(a => a.name === 'Visa Credit Card');
           const res = await fetch('/api/transactions/repayment', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({
               from_account_id: bank.id,
               to_account_id: cc.id,
               amount: 3500.00,
               transaction_date: '2026-11-17',
               description: '[LAB6-UAT-RUN-01] UAT-S1-02 Over-Repayment 3500 vs 3000'
             })
           });
           console.log('Over-Repayment API Status:', res.status, await res.json());
         });
       ```
     - Refresh `/accounts` and `/transactions`. Verify **Bank Balance remains `5,000.00 THB`**, **Credit Card Debt remains `3,000.00 THB`**, and no `3,500.00 THB` repayment transaction was recorded.
  5. **Sub-check 2E — Invalid Income Input Rejection (`AC-04-2`):**
     - Open **Record Income**, enter **Amount (THB)** = `-500.00` (or `0`, or `100abc`) and attempt to submit.
     - *Expected:* UI rejects with validation error (`Transaction amount must be strictly greater than 0.00.` / `Transaction amount must be a valid positive number.`). If sent directly to `POST /api/transactions/income` with a non-positive amount or missing `transaction_date`, the API returns HTTP `400 Bad Request` (`INVALID_TRANSACTION_AMOUNT` / `INVALID_DATE`) without saving any record.
  6. **Sub-check 2F — Missing Primary Credit Card Account (`AC-05-2`) & Invalid Expense Amount (`AC-05-3`):**
     - Open **Record Purchase**, change the **Credit Card** dropdown to the blank placeholder `Select a credit card`, enter Total Amount `1000.00` (`Dining: 400.00`, `Grocery: 600.00`), and click **Record Purchase**.
     - *Expected:* UI displays error alert **`Please select a primary credit card account.`** Next, select `Visa Credit Card`, enter a malformed/exponent amount (`1e3` or `100.123`), and verify rejection (`AC-05-3`). If sent to `POST /api/transactions/expense` omitting `primary_account_id` or with invalid amounts, the API returns HTTP `400 Bad Request` (`INVALID_PRIMARY_ACCOUNT` / `INVALID_TRANSACTION_AMOUNT`).
  7. **Sub-check 2G — Invalid Repayment Amount Rejection (`AC-07-6`):**
     - Open **Pay Credit Card**, enter `0`, `-100.00`, or `abc` in **Repayment Amount (THB)**.
     - *Expected:* UI keeps **Confirm Repayment** disabled (or displays validation error). If sent directly to `POST /api/transactions/repayment`, the API returns HTTP `400 Bad Request` (`INVALID_AMOUNT`).
* **Specific Expected Results & Reporting Rule:**
  - Record **UI Validation** and **API Validation** results separately. **Never claim that the API returned HTTP `422` or `400` unless the corresponding API request was actually sent and its response captured.**
  - For Sub-check 2D (`AC-07-4`), after the rejected `3,500.00 THB` attempt:
    - UI blocks submission with `Exceeds debt (฿3,000.00)`.
    - Direct API `POST /api/transactions/repayment` returns HTTP **`422 Unprocessable Entity`** with error code **`REPAYMENT_EXCEEDS_DEBT`**.
    - **Checking Bank Balance** remains **`5,000.00 THB`**.
    - **Visa Credit Card Debt** remains **`3,000.00 THB`**.
    - Zero new transaction is created in `/transactions`.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-03` — Business-Rule & Immutability Case: Opening Balance Permanent Lock After First Transaction (`F-03`, `BR-02`, `AC-03-3`)
* **Category:** Business-Rule / State Immutability Case
* **Linked Requirements & ACs:** `F-03`; `FR-05`; `BR-02`; `AC-03-2`, `AC-03-3`, `AC-03-4`.
* **Role / Account:** `USER-A` (`user_demo`, Role: `USER`)
* **Preconditions:** `USER-A` (`user_demo`) has at least one committed transaction referencing `Checking Bank` (`is_opening_locked = true`), and an unlocked account (e.g., `Visa Credit Card` before any purchase, or on a fresh user) to test invalid negative opening balance input (`AC-03-2`).
* **Synthetic Inputs:**
  - *Part A (Manual UI UAT):* Inspect locked `Checking Bank` card on `/accounts`; test invalid opening balance `-500.00` or `100.123` on any unlocked account modal (`AC-03-2`).
  - *Part B (API Corroboration — only if executed):* `PATCH /api/accounts/<checking_bank_id>/opening-balance` with `{ "opening_balance": 99999.00 }`.
* **Numbered User Actions & Explicit Separation of UI vs. API Validation:**

  ##### Part A — Manual UI UAT (Required)
  1. Log in as `user_demo` and navigate to `/accounts` (`Financial Accounts`).
  2. Locate the **Checking Bank** card under `Cash & Liquid Accounts`.
  3. Verify that the **Set Opening Balance** button is **no longer present** on the `Checking Bank` card.
  4. Verify that the `Status:` field displays the locked badge **`Opening balance locked`** (with tooltip `"Opening balance is locked permanently following first transaction"`).
  5. Confirm that the user cannot open the Opening Balance modal or modify the Opening Balance of `Checking Bank` through the UI.
  6. *(For `AC-03-2` on any unlocked account card where `Set Opening Balance` is still visible):* Click **Set Opening Balance**, enter `-500` or `100.123`, and click **Save Opening Balance**. Verify the modal rejects the input with `Opening balance must be a non-negative number.` or `Opening balance allows at most 2 decimal places.`

  ##### Part B — API Corroboration (Record ONLY When Actually Executed)
  1. While logged in as `user_demo` on `/accounts`, open Browser DevTools (`F12` $\rightarrow$ Console) and send a direct `PATCH` request attempting to overwrite the locked `Checking Bank` opening balance:
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
         console.log('Locked Opening Balance PATCH Status:', res.status, await res.json());
       });
     ```
  2. Record the exact HTTP status code and JSON error response returned by the server.
  3. Refresh `/accounts` and `/dashboard` to confirm `Checking Bank` Opening Balance and Current Balance remain unchanged.

* **Specific Expected Results:**
  - **Part A (Manual UI Result):** `Checking Bank` displays `Status: Opening balance locked`, the **Set Opening Balance** button is absent, and UI modification is impossible.
  - **Part B (API Corroboration Result — only when `PATCH` is executed):** The server responds with HTTP **`422 Unprocessable Entity`** and error code **`OPENING_BALANCE_LOCKED`**, and `opening_balance` remains unchanged. *(If Part B is not executed, record only the Part A UI observation and do not claim that the API returned HTTP 422).*
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-04` — Forbidden Role, Cross-User Ownership Isolation & CSRF Protection (`F-02`, `BR-01`, `BR-10`, `AC-02-2`, `AC-02-3`, `AC-02-4`)
* **Category:** Forbidden Role / Ownership Case (Mandatory Category 3)
* **Linked Requirements & ACs:** `F-02`; `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`; `AC-02-1`, `AC-02-2`, `AC-02-3`, `AC-02-4`.
* **Role / Account:**
  - **Admin:** `ADMIN-DEMO` (Cloud Run username: `admin` / Local & Staging username: `admin_demo`, Role: `ADMIN`)
  - **User A:** `USER-A` (`user_demo`, Role: `USER`)
  - **User B:** `USER-B` (`user_other`, Role: `USER`)
* **Preconditions & Environment Verification Gate (Critical):**
  - Before executing Sub-check 4B (Cross-User Isolation), verify that **both User A (`user_demo`) and User B (`user_other`) and their financial accounts actually exist** in the target UAT environment.
  - *Environment Note:* `server/prisma/seed.ts` automatically provisions `user_demo`, `user_other`, and `admin_demo` in Local/Staging environments (`NODE_ENV !== 'production'`). On Cloud Run (`NODE_ENV === 'production'`), if `user_other` has not yet been provisioned in Cloud SQL, the Product Team must provision `user_other` (with its 5 standard accounts) prior to the UAT session, or execute Sub-check 4B against the Staging environment where both real users exist. **Never substitute a fake/nonexistent UUID for User B's real account.** If User B is unavailable in the tested environment, mark Sub-check 4B as **`BLOCKED`** (not `PASS`).
* **Synthetic Inputs:**
  - *Sub-check 4A (Admin Financial Denial — `BR-10` / `AC-02-2`):* Login as `admin` (Cloud Run) / `admin_demo` (Local/Staging); navigate to `/dashboard`, `/accounts`, `/transactions` and query `/api/accounts`, `/api/transactions`, `/api/reports/summary`.
  - *Sub-check 4B (Real Cross-User Isolation — `BR-01` / `AC-02-3`):* Real Account ID `<USER_B_ACCOUNT_ID>` belonging to **User B (`user_other`)**, accessed and targeted for modification while logged in as **User A (`user_demo`)**.
  - *Sub-check 4C (CSRF Untrusted Origin Rejection — `AC-02-4`):* State-changing `POST` / `PATCH` request sent with untrusted header `Origin: https://evil-attacker.example`.
* **Numbered User Actions:**

  ##### Sub-check 4A — Administrator Denial of Financial Data (`BR-10` / `AC-02-2`)
  1. Log out of any active session. Log in at `/login` using the Administrator account (`admin` on Cloud Run / `admin_demo` on Local/Staging).
  2. Observe that the application redirects to `/access-denied` (`Access Forbidden (403)` — `Security Policy (BR-10)`) and hides all navigation links to `Dashboard`, `Accounts`, and `History`.
  3. Manually navigate to `/dashboard`, `/accounts`, and `/transactions` in the browser address bar. Confirm all three routes remain blocked on `/access-denied` with zero financial figures rendered.
  4. In Browser DevTools Console (`F12`), query the financial API endpoints as Admin and record the actual HTTP status codes:
     ```javascript
     Promise.all([
       fetch('/api/accounts', { credentials: 'include' }).then(async r => ({ endpoint: '/api/accounts', status: r.status, body: await r.json() })),
       fetch('/api/transactions', { credentials: 'include' }).then(async r => ({ endpoint: '/api/transactions', status: r.status, body: await r.json() })),
       fetch('/api/reports/summary', { credentials: 'include' }).then(async r => ({ endpoint: '/api/reports/summary', status: r.status, body: await r.json() }))
     ]).then(console.table);
     ```
  5. Log out of the Administrator account.

  ##### Sub-check 4B — Cross-User Ownership / Authorization Isolation Using Real User B Account (`BR-01` / `AC-02-3`)
  1. **Verify User A (`user_demo`) and User B (`user_other`) exist** with their respective 5 standard accounts in the target UAT environment before proceeding.
  2. **Log in as User B (`user_other`)** at `/login` and navigate to `/accounts`.
  3. **Select a real financial account belonging to User B** (specifically User B's `Checking Bank` account) and record its current Opening Balance, Current Balance, transaction count, and confirm whether its Opening Balance is unlocked (`is_opening_locked = false`).
  4. **Record User B's real Account ID (`<USER_B_ACCOUNT_ID>`):** Open Browser DevTools Console (`F12`) while logged in as **User B (`user_other`)** and run:
     ```javascript
     fetch('/api/accounts', { credentials: 'include' })
       .then(r => r.json())
       .then(d => {
         const userBBank = d.data.accounts.find(a => a.name === 'Checking Bank');
         console.log(
           'USER B Real Checking Bank ID:', userBBank.id,
           'Balance:', userBBank.current_balance,
           'is_opening_locked:', userBBank.is_opening_locked
         );
       });
     ```
     Copy the printed UUID string as `<USER_B_ACCOUNT_ID>`.
  5. **Log out of User B (`user_other`)** by clicking **Logout**.
  6. **Log in as User A (`user_demo`)** at `/login`.
  7. **Attempt to view User B's account data while authenticated as User A:**
     - Inspect `/accounts` and `/api/accounts` as User A; verify that `<USER_B_ACCOUNT_ID>` is completely absent from User A's account list.
  8. **Execute Cross-User Ownership Authorization Tests while authenticated as User A (`user_demo`):**
     - **Important Ownership Proof Rule:** Never rely on a `PATCH` against a *locked* Opening Balance account (`is_opening_locked = true`), because a `422 OPENING_BALANCE_LOCKED` response reflects business-rule locking rather than cross-user ownership rejection. To prove ownership authorization unambiguously:
       - **Primary Test (Always Valid Regardless of Lock State):** Send a `POST /api/transactions/income` request as User A referencing User B's real `<USER_B_ACCOUNT_ID>` as `primary_account_id`.
       - **Secondary Test (Only When User B's Account Has `is_opening_locked = false`):** Send a `PATCH /api/accounts/<USER_B_ACCOUNT_ID>/opening-balance` request as User A on User B's unlocked account.
     - In Browser DevTools Console (`F12`) while authenticated as **User A (`user_demo`)**, replace `<USER_B_ACCOUNT_ID>` with User B's real UUID from Step 4 and execute:
       ```javascript
       const userBAccountId = '<USER_B_ACCOUNT_ID>'; // Real UUID of User B's Checking Bank

       // Primary Ownership Test: Attempt to create an Income Transaction on User B's account as User A
       fetch('/api/accounts', { credentials: 'include' })
         .then(r => r.json())
         .then(async d => {
           const userASalary = d.data.accounts.find(a => a.name === 'Salary');
           const res = await fetch('/api/transactions/income', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({
               primary_account_id: userBAccountId,
               income_account_id: userASalary.id,
               total_amount: 5000.00,
               transaction_date: '2026-11-17',
               description: '[LAB6-UAT-RUN-01] Unauthorized Cross-User Income Attempt'
             })
           });
           console.log('Cross-User POST Income (Expected 404 NOT_FOUND):', res.status, await res.json());
         });

       // Secondary Ownership Test (Use ONLY when User B's account has is_opening_locked === false):
       fetch(`/api/accounts/${userBAccountId}/opening-balance`, {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify({ opening_balance: 77777.00 })
       }).then(async r => console.log('Cross-User Unlocked PATCH (Expected 404 NOT_FOUND):', r.status, await r.json()));
       ```
  9. **Verify HTTP `404 NOT_FOUND` response:** Confirm that the server rejects the cross-user request(s) with HTTP **`404 Not Found`** and error code **`NOT_FOUND`** per `AC-02-3` (`BR-01`). *(Never count `422 OPENING_BALANCE_LOCKED` as proof of cross-user authorization).*
  10. **Log out of User A (`user_demo`), log back in as User B (`user_other`)**, and inspect `/accounts` and `/transactions` to verify that no new transaction was created and User B's balances and account data remain 100% unchanged.

  ##### Sub-check 4C — CSRF Untrusted Origin Rejection Using an Authenticated Session (`AC-02-4` / `TEST-SEC-04`)
  1. **Authenticate as a valid UAT user (`user_demo`) and store the session cookie securely in a local temporary cookie jar** (never echo, commit, or screenshot the raw cookie/token value):
     ```bash
     # Step 1: Log in with valid UAT credentials (replace <PRIVATE_UAT_PASSWORD> locally in terminal; never commit)
     curl -sS -c /tmp/whatsss_uat_cookie.txt \
       -X POST "https://whatsss-sipqw4logq-as.a.run.app/api/auth/login" \
       -H "Origin: https://whatsss-sipqw4logq-as.a.run.app" \
       -H "Content-Type: application/json" \
       -d '{"username":"user_demo","password":"<PRIVATE_UAT_PASSWORD>"}'
     ```
  2. **Verify that the authenticated session is active and valid** before testing CSRF:
     ```bash
     # Step 2: Confirm authenticated session returns HTTP 200 OK and user_demo profile
     curl -i -sS -b /tmp/whatsss_uat_cookie.txt \
       "https://whatsss-sipqw4logq-as.a.run.app/api/auth/me"
     ```
  3. **Send a state-changing request using the verified authenticated session (`-b /tmp/whatsss_uat_cookie.txt`) but with an untrusted `Origin` header (`https://untrusted-origin.example`):**
     ```bash
     # Step 3: Send authenticated state-changing request from untrusted Origin
     curl -i -sS -b /tmp/whatsss_uat_cookie.txt \
       -X POST "https://whatsss-sipqw4logq-as.a.run.app/api/transactions/income" \
       -H "Origin: https://untrusted-origin.example" \
       -H "Content-Type: application/json" \
       -d '{"primary_account_id":"00000000-0000-0000-0000-000000000000","income_account_id":"00000000-0000-0000-0000-000000000000","total_amount":1000.00,"transaction_date":"2026-11-17","description":"CSRF Test"}'

     # Clean up temporary cookie file immediately after test
     rm -f /tmp/whatsss_uat_cookie.txt
     ```
  4. **Verify rejection and zero state mutation:** Confirm the response is HTTP **`403 Forbidden`** with error code **`CSRF_ORIGIN_REJECTED`** (`AC-02-4`), and verify in the UI (`/dashboard` and `/transactions`) that no transaction or balance change occurred.
  5. **Security & Redaction Rules:**
     - **Never** include raw `Cookie` or `Set-Cookie` token values in GitHub, screenshots, or the PDF report (redact any token string as `<REDACTED_COOKIE>`).
     - If authenticated CSRF testing cannot be executed during the UAT session, record Sub-check 4C honestly as **`BLOCKED`** or a documented limitation—**never mark it `PASS`**.

* **Specific Expected Results:**
  - **Sub-check 4A (`BR-10` / `AC-02-2`):** Administrator is denied access to `/dashboard`, `/accounts`, and `/transactions` in the UI (`Access Forbidden (403)`), and all financial API endpoints return HTTP `403 Forbidden`.
  - **Sub-check 4B (`BR-01` / `AC-02-3`):**
    - User A cannot view User B's financial accounts or balances.
    - Authenticated as User A, attempting to create an Income transaction on User B's real `<USER_B_ACCOUNT_ID>` (or `PATCH` User B's unlocked opening balance) is rejected with HTTP **`404 Not Found`** (`NOT_FOUND`) per `AC-02-3`. (`422 OPENING_BALANCE_LOCKED` is never accepted as proof of cross-user ownership isolation).
    - Zero private data or balance of User B is disclosed, no new transaction is created, and User B's balances and transaction history remain completely unmodified.
  - **Sub-check 4C (`AC-02-4`):** State-changing request sent with a verified authenticated session and an untrusted `Origin` (`https://untrusted-origin.example`) is rejected by `csrfGuard` with HTTP **`403 Forbidden`** and error code **`CSRF_ORIGIN_REJECTED`**, with zero database writes or balance changes.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-05` — State, History & Persistence Case: Ledger Survival Across Logout, Browser Closure & Fresh Session
* **Category:** State / History / Persistence Case (Mandatory Category 4)
* **Linked Requirements & ACs:** `F-01`, `F-08`, `F-09`; `FR-01`, `FR-10`, `FR-11`, `NFR-DATA-01`; `AC-01-5`, `AC-08-1`, `AC-09-1`, `AC-09-2`.
* **Role / Account:** `USER-A` (`user_demo`, Role: `USER`)
* **Preconditions:** `UAT-S1-01` has been completed. Record the exact post-`UAT-S1-01` summary figures $(\text{FinalBalance}, D_{\text{final}}, I_{\text{final}}, E_{\text{final}})$ on `/dashboard` (`27,000.00 / 0.00 / 20,000.00 / 3,000.00 THB` on Fresh DB, or `49,000.00 / 0.00 / 45,000.00 / 6,000.00 THB` on Live DB) and the 3 `[LAB6-UAT-RUN-01]` transaction rows on `/transactions` (`History`).
* **Synthetic Inputs:** None (verifies durability of state committed in `UAT-S1-01`).
* **Numbered User Actions:**
  1. On `/dashboard` and `/transactions` (`History`) as `user_demo`, capture screenshots of the 4 Summary Metric Cards and the Transaction History table showing the 3 `[LAB6-UAT-RUN-01]` records created in `UAT-S1-01`.
  2. Click **Logout** in the top navigation bar. Confirm redirect to `/login`.
  3. Close the browser window completely. Open a brand-new browser window, navigate to `https://whatsss-sipqw4logq-as.a.run.app/dashboard` while logged out, and verify it redirects to `/login` without exposing cached financial data.
  4. Log in again as `user_demo`.
  5. Perform a hard page reload (`Ctrl+F5` / `Cmd+Shift+R`) on `/dashboard` and navigate to `/transactions` (`History`) to inspect all summary cards and transaction rows.
* **Specific Expected Results:**
  - All 4 summary figures after fresh login and hard reload match $(\text{FinalBalance}, D_{\text{final}}, I_{\text{final}}, E_{\text{final}})$ to the exact decimal (`27,000.00 THB` on Fresh DB or `49,000.00 THB` on Live DB).
  - All 3 transactions recorded in `UAT-S1-01` (`[LAB6-UAT-RUN-01] UAT-S1-01 Monthly Salary` `+20,000.00 THB`, `[LAB6-UAT-RUN-01] UAT-S1-01 Split Purchase` `3,000.00 THB` with `Dining: 1,000.00` and `Grocery: 2,000.00` splits, and `[LAB6-UAT-RUN-01] UAT-S1-01 Full Card Settlement` `3,000.00 THB`) persist intact in chronological order without duplication or data loss.
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

#### `UAT-S1-06` — Authentication & Session Security: Invalid Login Rejection & Unauthenticated Access Gate
* **Category:** Authentication & Security Boundary Case (`F-01`, `F-02`)
* **Linked Requirements & ACs:** `F-01`, `F-02`; `FR-01`, `FR-02`, `BR-09`, `NFR-SEC-01`; `AC-01-1`, `AC-01-2`, `AC-01-3`, `AC-01-5`, `AC-02-1`.
* **Role / Account:** Unauthenticated visitor $\rightarrow$ `USER-A` (`user_demo`).
* **Preconditions:** Clean logged-out browser session at `https://whatsss-sipqw4logq-as.a.run.app/login`.
* **Synthetic Inputs:**
  - Wrong password attempt: Username = `user_demo`, Password = `WrongPassword_UAT_999!`
  - Valid login attempt: Username = `user_demo`, Password = `<private_handoff_password>`
* **Numbered User Actions:**
  1. In a logged-out browser, navigate directly to `https://whatsss-sipqw4logq-as.a.run.app/dashboard` and `https://whatsss-sipqw4logq-as.a.run.app/accounts`. Observe automatic redirect to `/login` (and verify `GET /api/accounts` while logged out returns `401 Unauthorized`).
  2. On `/login`, enter Username `user_demo` and Password `WrongPassword_UAT_999!`, then click **Sign In**.
  3. Observe the error alert and verify the user remains on `/login`.
  4. Enter valid `user_demo` credentials and click **Sign In**. Observe navigation to `/dashboard` and the user identity in the top navbar (`Signed in as: user_demo` with blue `USER` badge).
* **Specific Expected Results:**
  - Unauthenticated navigation to `/dashboard` or `/accounts` redirects to `/login`, and unauthenticated API calls return HTTP `401 Unauthorized` (`AC-02-1`).
  - Invalid password returns HTTP `401 Unauthorized` (`INVALID_CREDENTIALS`) and displays a clear error alert without leaking sensitive details (`AC-01-2`).
  - Valid credentials return HTTP `200 OK`, set an `HttpOnly` cookie, and load `/dashboard` with verified identity (`AC-01-1`, `AC-01-3`).
* **Actual / Evidence / Status:** `NOT RUN` — *Independent UAT Team to complete.*

---

### A4. Requirement-to-Case Coverage Index

Every Acceptance Criterion listed below has an explicit, executable test step defined in Section `A3`. *(Criteria requiring backend database inspection such as `AC-01-4` password bcrypt hashing or optional partial repayment `AC-07-3` / insufficient funds `AC-07-5` are verified by the automated test suite and are not overclaimed as manual UAT steps unless explicitly executed).*

| Sprint 1 Feature | Functional Req & Business Rules | Claimed Acceptance Criteria (With Explicit Test Steps in `A3`) | Exact Mapped UAT Case & Sub-Check |
|---|---|---|---|
| **`F-01` Authentication & Session** | `FR-01`, `FR-02`, `BR-09`, `NFR-SEC-01` | `AC-01-1` (Valid login), `AC-01-2` (Invalid login `401`), `AC-01-3` (Session identity), `AC-01-5` (Logout clears session) | `UAT-S1-06` (Steps 1–4), `UAT-S1-05` (Steps 2–3) |
| **`F-02` Authorization & Privacy** | `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02` | `AC-02-1` (Unauth `401`), `AC-02-2` (Admin `403` `BR-10`), `AC-02-3` (Cross-user real account isolation `BR-01`), `AC-02-4` (CSRF `403 CSRF_ORIGIN_REJECTED`) | `UAT-S1-06` (Step 1), `UAT-S1-04` (Sub-checks `4A`, `4B`, `4C`) |
| **`F-03` Opening Balance & Lock** | `FR-05`, `BR-02`, `NFR-DATA-01` | `AC-03-1` (Set valid opening balance), `AC-03-2` (Invalid negative/decimal opening balance), `AC-03-3` (Locked after first tx: Part A UI & Part B API `422`), `AC-03-4` (Excluded from income/expense `BR-02`) | `UAT-S1-01` (Step 1), `UAT-S1-03` (Part A Steps 1–6 & Part B Steps 1–3) |
| **`F-04` Income Transaction** | `FR-06`, `BR-03`, `NFR-DATA-01` | `AC-04-1` (Valid salary inflow `+20,000.00`), `AC-04-2` (Invalid income amount / missing date rejection) | `UAT-S1-01` (Step 2), `UAT-S1-02` (Sub-check `2E`) |
| **`F-05` Credit Card Purchase** | `FR-07`, `BR-04`, `NFR-DATA-01` | `AC-05-1` (Valid CC purchase `+3,000.00`), `AC-05-2` (Missing primary CC account rejection), `AC-05-3` (Invalid/malformed amount rejection) | `UAT-S1-01` (Step 3), `UAT-S1-02` (Sub-check `2F`) |
| **`F-06` Multiple Allocations** | `FR-08`, `BR-05`, `BR-06` | `AC-06-1` (Balanced multi-line split `1,000 + 2,000 = 3,000`), `AC-06-2` (Unbalanced split rejection `BR-06`), `AC-06-3` (Duplicate category rejection) | `UAT-S1-01` (Step 3), `UAT-S1-02` (Sub-checks `2A`, `2B`, `2C`) |
| **`F-07` Credit Card Repayment** | `FR-09`, `BR-07`, `BR-08` | `AC-07-1` (Full debt settlement `-3,000.00`), `AC-07-2` (Repayment excluded from expenses `BR-08`), `AC-07-4` (Over-repayment `3,500` vs `3,000` debt on `5,000` bank fixture), `AC-07-6` (Invalid repayment amount `0`/negative/malformed) | `UAT-S1-01` (Step 4), `UAT-S1-02` (Sub-checks `2D`, `2G`) |
| **`F-08` Balance & Summary** | `FR-10`, `BR-02`, `BR-08` | `AC-08-1` (Exact deterministic summary calculation for Bank, Debt, Income, Expense) | `UAT-S1-01` (Step 5), `UAT-S1-05` (Step 5) |
| **`F-09` Transaction History** | `FR-11`, `NFR-DATA-01` | `AC-09-1` (Chronological transaction list & allocation tags), `AC-09-2` (Persistence across session/reload) | `UAT-S1-01` (Step 5), `UAT-S1-05` (Steps 1–5) |

---

## Part B — Independent UAT Execution (Other Team's Product)

> *Note: Section to be populated under Issue #38 (`@Pilaiwan3492` & `@Apichaya251400`) upon receiving the paired Product Team's UAT handoff packet. Keep as template until actual independent testing is executed.*

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

### B2. Partner App – Independent UAT Acceptance Decision (Our Team Acting as UAT Team)
*This section records **our team's independent acceptance decision for the Partner Team's Sprint 1 application** (distinct from Section D2, where the Partner Team records their decision for Whatsss). Do not fill in a final decision until initial execution and any required defect re-testing on the Partner App are completed.*

| Decision Field (For Partner Team's Application) | Recorded Value |
|---|---|
| **Partner Product Name & Team** | `NOT YET RECORDED` |
| **Tested Partner App Version / Commit SHA & Revision** | `NOT YET RECORDED` |
| **Partner Deployed URL Tested** | `NOT YET RECORDED` |
| **Total UAT Cases Executed** | `NOT YET RECORDED` |
| **Execution Outcome Counts** | `PASS: TBD` \| `FAIL: TBD` \| `BLOCKED: TBD` |
| **Outstanding Release-Blocking Defects (Critical / Major)** | `NOT YET RECORDED` |
| **Documented Known Minor Limitations (if any)** | `NOT YET RECORDED` |
| **Final Independent Acceptance Decision (by Our Team for Partner App)** | `[ ] Accepted` \| `[ ] Accepted with explicitly documented minor limitations` \| `[ ] Not Accepted` |
| **Independent UAT Testers (Both Students)** | Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`) |
| **Decision Date / Time (ICT) & Supporting Evidence IDs** | `NOT YET RECORDED` |

---

## Part C — Defect Reporting and Product-Team Triage

### C1. Outgoing Defect Reports (Filed by Our Team Against Partner Team's Application)
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
4. **Full Regression Suite Verification (Fail-Fast & Safe Working Directory Sequence from Repository Root):**
   - Execute the repository verification commands below (`set -euo pipefail` ensures immediate termination if any test or build step fails, and `cd ..` returns to the repository root before invoking `deploy/tests/*`):
     ```bash
     set -euo pipefail

     # Backend tests
     cd server
     npm test
     npm run build

     # Frontend tests
     cd ../client
     npm test
     npm run build

     # Return to repository root
     cd ..

     # Deployment and release tests
     bash deploy/tests/test-deploy.sh
     bash deploy/tests/test-release.sh
     ```
5. **Teammate PR Review, CI & Cloud Run Redeployment:**
   - Open a Pull Request into `staging-lab5`, obtain substantive review and approval from `@Pilaiwan3492` (enforcing Rule R-09 Zero Self-Merge), and pass the `test-and-docker` CI gate.
   - Promote `staging-lab5` $\rightarrow$ `main` via reviewed Release PR to trigger `.github/workflows/deploy.yml`, rolling out the new Cloud Run revision and passing post-deployment smoke tests (`deploy/smoke_test.py`).
6. **Independent Partner Retest:**
   - Provide the updated Cloud Run revision and commit SHA to the partner UAT Team to re-execute the failed test case(s) and confirm closure.

> **Important Safeguard (Lab 6 Section 3.5):** If the partner UAT Team finds no natural defect in our deployed Sprint 1 release, we will obtain their documented `Accepted` sign-off on the healthy release first, and request a controlled defect exercise on an **isolated branch** (never deliberately breaking the live assessed `main` deployment).

### D2. Whatsss-PMandELS – Independent Sprint 1 UAT Acceptance Decision (By Partner UAT Team)
*This section records **the Partner UAT Team's independent acceptance decision for our application (`Whatsss-PMandELS`)** (distinct from Section B2, where our team records our decision for the Partner App). To be completed and confirmed **only** by the independent Partner UAT Team after initial testing and any required re-testing:*

| Decision Field (For Whatsss-PMandELS) | Recorded Value |
|---|---|
| **Assessed Product & Team** | Whatsss — Personal Money and Expense Logging System (`@Apichaya251400` & `@Pilaiwan3492`) |
| **Tested Application URL** | `https://whatsss-sipqw4logq-as.a.run.app` |
| **Accepted Release Commit SHA & Cloud Run Revision** | `NOT YET RECORDED` |
| **Total UAT Cases Executed** | `NOT YET RECORDED` |
| **Execution Outcome Counts** | `PASS: TBD` \| `FAIL: TBD` \| `BLOCKED: TBD` |
| **Outstanding Release-Blocking Defects (Critical / Major)** | `NOT YET RECORDED` |
| **Documented Minor Limitations (if any)** | `NOT YET RECORDED` |
| **Final Independent UAT Decision (by Partner UAT Team for Whatsss)** | `[ ] Accepted` \| `[ ] Accepted with explicitly documented minor limitations` \| `[ ] Not Accepted` |
| **Partner UAT Team & Tester Names** | `NOT YET RECORDED` |
| **Date / Time of Sign-Off (ICT) & Supporting Evidence IDs** | `NOT YET RECORDED` |

> **Current State:** `NO INDEPENDENT ACCEPTANCE DECISION RECORDED YET` — Do not treat this prepared UAT plan as a signed acceptance until actual partner execution and re-testing are completed.

---

## 5. Version Index, Evidence Register, Contributions & AI-Use Declaration

### 5.1 Version Traceability Table

| Lifecycle Stage | Branch / Environment | Git Commit SHA / Revision | Status & Notes |
|---|---|---|---|
| **Sprint 1 Code Baseline** | `sprint-1` | `2002ad088e739b90072f129838e6a096f6f4bf87` | Frozen Sprint 1 implementation baseline (`F-01`–`F-09`) |
| **Lab 5 Production Release (`main`)** | `main` / `staging-lab5` | `ba2f9dd43d8ed620d4b27820d43bee243d2e3d4d` | Merged Lab 5 release & CI/CD pipeline baseline |
| **Initial Tested Cloud Run Deployment** | Cloud Run (`asia-southeast1`) | Revision `whatsss-00020-65k` (Image SHA `f160f256af24635cdc602b676a7cf8822fbbceb8`) | Last known handoff baseline; to be re-verified during preflight (`A-EV-01`) |
| **Defective Commit(s) (if any)** | `TBD` | `TBD` | To be recorded in Part C/D |
| **Regression Test (`RED`) & Fix (`GREEN`) Commit** | `TBD` | `TBD` | To be recorded in Part D |
| **Corrected `main` Release & Cloud Run Revision** | `TBD` | `TBD` | To be recorded in Part D after retest |

### 5.2 Evidence Register Index

> **Status Definitions:**
> - `Planned`: Evidence item defined in UAT plan; execution not yet started.
> - `Pending Evidence`: Action/fixture exists, awaiting live UAT session screenshot/log capture with timestamp and revision.
> - `Captured`: Genuine screenshot or command log has been captured, verified, and embedded with full metadata. *(No item may be marked `Captured` before the actual artifact exists).*

| Evidence ID | Related Case / Issue | Action Performed | Expected Result | Actual Result | Date / Time (ICT) | Tested Commit / Revision | Status |
|:---:|:---:|---|---|---|:---:|:---:|:---:|
| **`A-EV-01`** | Part A Preflight (`#37`) | Query `GET /api/health` and `GET /api/ready` on `https://whatsss-sipqw4logq-as.a.run.app` before UAT handoff | HTTP `200 OK`, `"status":"ready"`, `"database":"connected"`, `commitSha: f160f25...` | *To be captured at preflight session* | `TBD` | `whatsss-00020-65k` (`f160f25`) | `Pending Evidence` |
| **`A-EV-02`** | Part A Fixture Setup (`#37`) | Verify `user_demo`, `user_other`, and `admin`/`admin_demo` accounts and baseline balances in target UAT environment | Users and 5 standard accounts per `USER` exist and match Section `A2.4` baseline | *To be captured at preflight session* | `TBD` | `ba2f9dd` / `whatsss-00020-65k` | `Pending Evidence` |
| **`B-EV-01`..`XX`** | Part B Partner UAT (`#38`) | Execute partner team's Sprint 1 UAT cases on partner's deployed URL | Partner Sprint 1 expected behavior (normal, boundary, forbidden access, persistence) | *Awaiting partner UAT execution* | `TBD` | Partner Release `TBD` | `Planned` |
| **`C-EV-01`..`XX`** | Part C Defect Triage (`#38`) | File outgoing defect reports & triage incoming findings on Whatsss | All findings classified with severity, rationale, owner, and disposition | *Awaiting UAT execution findings* | `TBD` | `TBD` | `Planned` |
| **`D-EV-01`..`XX`** | Part D Resolution (`#37`) | Run reproduction test (`RED`), apply fix (`GREEN`), run regression suite, PR review, CI, and Cloud Run redeploy | Test fails on defective commit (`RED`), passes on fix (`GREEN`), CI & smoke checks pass | *Awaiting Part D defect / exercise* | `TBD` | `TBD` | `Planned` |
| **`D-EV-FINAL`** | Part B2 & D2 Sign-Off (`#38`) | Record independent UAT acceptance decisions (our decision for Partner App in B2; Partner's decision for Whatsss in D2) | Signed/documented acceptance decisions with tester names, version, date, and evidence | *Awaiting retest completion* | `TBD` | `TBD` | `Planned` |

### 5.3 Team Contribution Table

| Team Member | Student ID | GitHub Handle | Primary Lab 6 Responsibilities |
|---|:---:|:---:|---|
| **Aphichaya Klinhual** | `67070503447` | `@Apichaya251400` | **Issue #37 (Product Team Lead):** Authored Sprint 1 UAT Test Plan, Test Data Lifecycle, and Safe Handoff (`UAT-S1-01`–`06` in `docs/labs/lab-06/uat-plan.md`); prepared test account fixtures; co-executed partner UAT cases in Part B; responsible for Part D RED/GREEN regression tests, bugfix implementation, and Cloud Run redeployment; reviewed Issue #38 PR. |
| **Pilaiwan Churdchu** | `67070503492` | `@Pilaiwan3492` | **Issue #38 (Independent UAT Lead & Defect Manager):** Reviewed & approved Issue #37 UAT Plan PR; led Part B independent UAT execution on partner team's deployment and recorded Partner App acceptance decision (B2); authored Part C outgoing defect reports and incoming triage register; verified Whatsss independent retest sign-off (D2) and compiled final Lab 6 submission PDF. |

### 5.4 AI-Use Declaration
AI assistance (Antigravity AI coding assistant) was used to help structure the Sprint 1 UAT test plan template, cross-reference requirement/acceptance-criteria IDs from our repository's Sprint 1 specifications (`docs/sprints/sprint-1/`), and format markdown tables. Both students (`Aphichaya Klinhual` and `Pilaiwan Churdchu`) independently verified all test steps, balance formulas, deployed URLs, and revision states against the live Cloud Run service, and are solely responsible for executing live UAT sessions, recording genuine test outcomes, triaging defects, and obtaining independent acceptance sign-offs. No execution outcomes or partner sign-offs were fabricated or generated by AI.
