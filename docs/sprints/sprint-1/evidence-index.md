# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** IN PROGRESS — Work Package 1 (WP-01) and Work Package 2 (WP-02) Merged into sprint-1; Work Package 3 (WP-03) Implemented & Verified on PR targeting sprint-1 (Awaiting Peer Review and Approval; WP-04 through WP-06 Pending Implementation)  

---

## 1. Release Identification

* **Assessed Implementation Baseline Commit:** Commit `1f31dd1d20739c786f51d4a3739d028aa880ffbe` (WP-03 Income Transaction Processing & Ledger Integration)
* **Current Documentation HEAD Commit:** Commit `5e695a5f3dc872ee9c285ca71f7ff42d3a3ac843` on branch `feat/income-transaction` (PR targeting `sprint-1`)
* **Base Branch Commit:** `a53f10d4272dc638de518bce3e0e7bd80fa2500a` (`sprint-1`)
* **Release Tag:** `v0.1.0-sprint1` (pending final merge into main)
* **CI Verification Run:** Pending initial CI run for PR on branch `feat/income-transaction`
* **Test Environment:** Node.js v20+, PostgreSQL 16 (GitHub Actions Service Container / Docker Compose)

> **Sprint 1 Scope Note:** This record reflects the implementation verification for WP-01 (Authentication, Session Security & Access Control), WP-02 (Financial Account Model, Reproducible Seed & Opening Balance Lifecycle), and WP-03 (Income Transaction Processing & Ledger Integration). Final Deliverable 1 submission package evidence will be compiled upon completion of WP-04 through WP-06 (Expense Transactions, Allocations, Repayments, Summary, and Golden Domain Journey).

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/`)
  * Frontend: `npm test` (within `client/`)
* **Automated Test Execution Summary (224 Tests across 19 Suites):**
  * Backend Unit Tests: 69 passed across 6 suites
    * `accountLock.test.ts`: 9 passed (hardened ID validation, deduplication, atomic abort without partial lock, and count mismatch concurrency conflict detection)
    * `testSafety.test.ts`: 27 passed (immutable test database exact match verification [whatsss_test], rejection of whatsss_db, rejection of custom TEST_DATABASE_NAME and expectedDbName overrides, rejection of production_test regardless of GITHUB_ACTIONS/CI flags, bounded-retry snapshot restoration with failure reporting, user/account snapshot restoration, and local environment guard)
    * `decimal.test.ts`: 16 passed (Prisma.Decimal validation, boundary checks, micro-precision rejection)
    * `config.test.ts`: 5 passed
    * `seed.test.ts`: 8 passed
    * `password.test.ts`: 4 passed
  * Backend Integration Tests: 122 passed / 12 skipped locally (136 passed in CI when PostgreSQL 16 service is active) across 10 suites
    * `income.test.ts`: 27 passed (Mocked Prisma & HTTP API; records salary inflow, updates destination bank balance from 10,000.00 to 30,000.00 THB, increases income summary to 20,000.00 THB, locks destination account opening balance per AC-03-3, validates negative/zero/invalid decimal amounts, validates calendar dates, rejects cross-tenant accounts with 404 and admin access with 403)
    * `account.test.ts`: 26 passed (Mocked Prisma & HTTP API; captures and asserts HTTP 200 and persisted values across all 5 account PATCH requests, decimal validation, real concurrent requests serialized under PostgreSQL row locking, arbitrary precision summation in summary, database error propagation without fake zero summary, and BR-02 category account balance exclusion)
    * `access.test.ts`: 17 passed (App-tier Stub & Mocked Prisma)
    * `content-type.test.ts`: 26 passed (Express Middleware)
    * `csrf.test.ts`: 12 passed (Origin/Referer Guard)
    * `auth.test.ts`: 11 passed (AuthGuard & Session)
    * `cors.test.ts`: 3 passed (CORS Preflight)
    * `db-income.test.ts`: 2 passed in CI (skipped locally without live PostgreSQL; dedicated test database verification [whatsss_test], live transaction commit and rollback atomicity)
    * `db-password.test.ts`: 2 passed in CI (skipped locally without live PostgreSQL)
    * `db-account.test.ts`: 10 passed in CI (skipped locally without live PostgreSQL; dedicated test database verification [whatsss_test], bounded-retry cleanup failure isolation, real seed failure injection with proxy client and full snapshot restoration, live HTTP API isolation, admin exclusion, transaction commit/rollback locking, and live PostgreSQL boundary Decimal precision verification across accepted [0.01, 0.29, 100.10, 9999999999.99] and rejected [100.123, 10000000000.00, -0.01] inputs)
  * Frontend Component Tests: 19 passed across 3 suites
    * `IncomeForm.test.tsx`: 8 passed (modal rendering, destination CASH selection, INCOME category selection, valid amount/date submission, field validations, loading state, and error handling)
    * `ProtectedRoute.test.tsx`: 4 passed
    * `AccountListPage.test.tsx`: 7 passed (5 grouped account sections, decimal validation, and maximum allowed limit enforcement)
  * Execution Environment Totals:
    * Local Environment (without live PostgreSQL): 212 passed | 12 skipped (224 total)
    * CI Environment (with live PostgreSQL 16 container): 224 passed | 0 skipped (224 total)

### 2.1 Completed Work Package Evidence (WP-01: Authentication & Access Control)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-AUTH-01` | `AC-01-1` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-AUTH-02` | `AC-01-2` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-AUTH-03` | `AC-01-3` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-AUTH-04` | `AC-01-4` | `server/tests/integration/db-password.test.ts`, `server/tests/unit/password.test.ts` | Passed — Live PostgreSQL / In-memory Fixture | PR #8 (`b29ba59`) |
| `TEST-AUTH-05` | `AC-01-5` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-SEC-01` | `AC-02-3` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | PR #8 (`b29ba59`) |
| `TEST-SEC-02` | `AC-02-1` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | PR #8 (`b29ba59`) |
| `TEST-SEC-03` | `AC-02-2` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | PR #8 (`b29ba59`) |
| `TEST-SEC-04` | `AC-02-4` | `server/tests/integration/csrf.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-SEC-05` | System Contract (CORS) | `server/tests/integration/cors.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-SEC-06` | System Contract (Content-Type) | `server/tests/integration/content-type.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |

### 2.2 Work Package 2 Evidence (WP-02: Financial Account Model & Opening Balance)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-OPEN-01` | `AC-03-1`, `NFR-DATA-01` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Sets 10,000.00 THB on unlocked account, updates row, returns 200 OK) | WP-02 Branch |
| `TEST-OPEN-02` | `AC-03-4`, `BR-02` | `server/tests/integration/account.test.ts` | Passed — Mocked Prisma (`GET /api/reports/summary` asserts HTTP 200 and saved balances across all 5 account PATCH requests [Checking: 10,000.00, Credit Card: 1,500.00, Salary: 5,000.00, Dining: 300.00, Grocery: 200.00], proving opening balance is strictly excluded from income/expense summaries; `total_income = 0.00`, `total_expense = 0.00`. Genuine DB errors propagate to 500 without fake zero summary. Transaction processing is scheduled for WP-03 and WP-04) | WP-02 Branch |
| `TEST-OPEN-03` | `AC-03-2` | `server/tests/unit/decimal.test.ts`, `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Unit, Mocked Prisma & Live PostgreSQL HTTP API (Rejects negative [-0.01], non-numeric, >2 decimals like `100.123` and `1e-7`, >9,999,999,999.99 [`10000000000.00`] with 400 `INVALID_OPENING_BALANCE` leaving database untouched; accepts boundary values [`0.01`, `0.29`, `100.10`, `9999999999.99`] and confirms exact `Prisma.Decimal` persistence in PostgreSQL) | WP-02 Branch |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/unit/accountLock.test.ts`, `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed (End-to-End Verified in WP-03) — Mocked Prisma & Live PostgreSQL Transaction (Proves HTTP 422 on locked account, `ACCOUNT_LOCK_CONCURRENCY_CONFLICT` on count mismatch; `lockAccounts` batch validation aborts on foreign/missing IDs without partial locks; proves lock persists on transaction commit and rolls back on failure in PostgreSQL. End-to-end invocation verified via `POST /api/transactions/income` in WP-03) | WP-02 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Cross-tenant account reads and opening balance updates return 404 NOT_FOUND through real auth middleware; foreign database rows untouched) | WP-02 Branch |
| `TEST-SEC-03` | `BR-10` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Admin calling account endpoints returns 403 `ADMIN_FINANCIAL_ACCESS_FORBIDDEN` through real auth middleware) | WP-02 Branch |

### 2.3 Work Package 3 Evidence (WP-03: Income Transaction Processing & Ledger Integration)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-INC-01` | `AC-04-1`, `BR-03`, `FR-06` | `server/tests/integration/income.test.ts`, `server/tests/integration/db-income.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Recording salary of 20,000.00 THB on date 2026-11-06 returns 201 Created, destination cash balance increases from 10,000.00 THB to 30,000.00 THB, income summary increases to 20,000.00 THB) | WP-03 Branch |
| `TEST-INC-02` | `AC-04-2` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma (Invalid dates [e.g. 2026-02-30, non-date string], negative amounts [-100.00], zero [0.00], >2 decimals [100.123], exponential notation [1e5], and >9,999,999,999.99 rejected with 400 INVALID_TRANSACTION_PAYLOAD) | WP-03 Branch |
| `TEST-OPEN-04` (E2E) | `AC-03-3` | `server/tests/integration/income.test.ts`, `server/tests/integration/db-income.test.ts` | Passed — Mocked Prisma & Live PostgreSQL Transaction (Opening balance locked once first income transaction is committed; subsequent PATCH /api/accounts/:id/opening-balance returns 422 OPENING_BALANCE_LOCKED) | WP-03 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma (Cross-tenant account IDs for primary cash account or target category account return 404 NOT_FOUND, concealing existence) | WP-03 Branch |
| `TEST-SEC-03` | `BR-10` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma (Admin role caller rejected with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN) | WP-03 Branch |
| `TEST-INC-DECIMAL` | `NFR-DATA-01` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma (Exact 2-decimal precision arithmetic in balance and income summary calculations without floating-point drift) | WP-03 Branch |
| `TEST-INC-ATOM` | `AC-03-3`, `F-04` | `server/tests/integration/income.test.ts`, `server/tests/integration/db-income.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (All-or-nothing database transaction rollback when transaction, allocation, or account lock fails) | WP-03 Branch |
| `TEST-INC-CONCURRENT` | `AC-03-3`, `F-04` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma (Concurrent income transactions handled without race conditions or corrupted balances) | WP-03 Branch |
| `TEST-UI-INC` | `AC-04-1`, `AC-04-2` | `client/src/components/IncomeForm.test.tsx` | Passed — Vitest / Testing Library (Income form rendering, input validation, submission, and state management) | WP-03 Branch |

### 2.4 Pending Work Packages (WP-04 through WP-06: Financial Transactions & Ledger)
> **Note:** Expense transactions, split allocations, repayments, and historical ledger are scheduled for subsequent work packages. The following tests remain pending implementation and execution.

| Test ID | Linked AC / Feature | Test Location | Status |
|---|---|---|:---:|
| `TEST-EXP-01` | `AC-05-1` (Expense Transaction) | `server/tests/integration/transaction.test.ts` | Pending Execution |
| `TEST-EXP-02` | `AC-05-2` (Expense Balance Deduction) | `server/tests/integration/transaction.test.ts` | Pending Execution |
| `TEST-ALLOC-01`| `AC-06-1` (Equal Split Allocation) | `server/tests/integration/transaction.test.ts` | Pending Execution |
| `TEST-ALLOC-02`| `AC-06-2` (Exact Split Allocation) | `server/tests/integration/allocation.test.ts` | Pending Execution |
| `TEST-REPAY-01`| `AC-07-1` (Credit Repayment) | `server/tests/integration/transaction.test.ts` | Pending Execution |
| `TEST-REPAY-02`| `AC-07-2` (Repayment Balance Update) | `server/tests/integration/summary.test.ts` | Pending Execution |
| `TEST-REPAY-03`| `AC-07-4` (Target Account Validation) | `server/tests/integration/repayment.test.ts` | Pending Execution |
| `TEST-REPAY-04`| `AC-07-5` (Negative Amount Validation) | `server/tests/integration/repayment.test.ts` | Pending Execution |
| `TEST-REPAY-05`| `AC-07-3` (Zero Repayment Amount) | `server/tests/integration/repayment.test.ts` | Pending Execution |
| `TEST-REPAY-06`| `AC-07-6` (Overpayment Handling) | `server/tests/integration/repayment.test.ts` | Pending Execution |
| `TEST-BAL-01` | `AC-08-1` (Balance Invariant Formula) | `server/tests/unit/balance.test.ts` | Pending Execution |
| `TEST-HIST-01` | `AC-09-1` (Transaction History Order) | `server/tests/integration/transaction.test.ts` | Pending Execution |
| `TEST-PERSIST-01`| `AC-09-2` (Relational DB Persistence) | `server/tests/integration/persistence.test.ts` | Pending Execution |
| `TEST-E2E-01` | All Golden ACs (E2E Domain Flow) | `server/tests/e2e/golden-journey.test.ts` | Pending Execution |

---

## 3. Golden Domain Journey Execution Log & Captures

*(Captures, terminal logs, and step-by-step API responses will be recorded upon executing the golden journey against the implemented backend during Sprint 1 execution).*
