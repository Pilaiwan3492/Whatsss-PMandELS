# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** IN PROGRESS — Work Package 1 (WP-01) Merged; Work Package 2 (WP-02) Implemented & Verified on PR #9 (Awaiting Peer Review and Approval; WP-03 through WP-06 Pending Implementation)  

---

## 1. Release Identification

* **Assessed Implementation Baseline:** Branch `feat/account-opening-balance` (PR #9 targeting `sprint-1`)
* **Base Branch Commit:** `b29ba59` (PR #8 merged into `sprint-1`)
* **Release Tag:** `v0.1.0-sprint1` (pending final merge into main)
* **Test Environment:** Node.js v20+, PostgreSQL 16 (GitHub Actions Service Container / Docker Compose)

> **Sprint 1 Scope Note:** This record reflects the implementation verification for WP-01 (Authentication, Session Security & Access Control) and WP-02 (Financial Account Model, Reproducible Seed & Opening Balance Lifecycle). Final Deliverable 1 submission package evidence will be compiled upon completion of WP-02 through WP-06 (Transactions, Allocations, Repayments, Summary, and Golden Domain Journey).

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/`)
  * Frontend: `npm test` (within `client/`)
* **Automated Test Execution Summary (167 Tests across 16 Suites):**
  * Backend Unit Tests: 54 passed across 6 suites
    * `accountLock.test.ts`: 8 passed (hardened ID validation, deduplication, atomic abort without partial lock)
    * `testSafety.test.ts`: 13 passed (test database isolation verification, account/user snapshot restoration including updated_at, local environment guard)
    * `decimal.test.ts`: 16 passed (Prisma.Decimal validation, boundary checks, micro-precision rejection)
    * `config.test.ts`: 5 passed
    * `seed.test.ts`: 8 passed
    * `password.test.ts`: 4 passed
  * Backend Integration Tests: 93 passed / 10 skipped locally (103 passed in CI when PostgreSQL 16 service is active) across 8 suites
    * `account.test.ts`: 24 passed (Mocked Prisma & HTTP API; captures and asserts HTTP 200 and persisted values across all 5 account PATCH requests, decimal validation, concurrency race handling distinguishing 404, 422, and 409 `CONCURRENT_UPDATE_CONFLICT`, database error propagation without fake zero summary, and BR-02 category account balance exclusion)
    * `access.test.ts`: 17 passed (App-tier Stub & Mocked Prisma)
    * `content-type.test.ts`: 26 passed (Express Middleware)
    * `csrf.test.ts`: 12 passed (Origin/Referer Guard)
    * `auth.test.ts`: 11 passed (AuthGuard & Session)
    * `cors.test.ts`: 3 passed (CORS Preflight)
    * `db-password.test.ts`: 2 passed in CI (skipped locally without live PostgreSQL)
    * `db-account.test.ts`: 8 passed in CI (skipped locally without live PostgreSQL; test database isolation verification, user updated_at restoration across seed, pre-test baseline snapshot comparison, seed idempotency, live HTTP API isolation, admin exclusion, and transaction commit/rollback locking)
  * Frontend Component Tests: 10 passed across 2 suites
    * `ProtectedRoute.test.tsx`: 4 passed
    * `AccountListPage.test.tsx`: 6 passed (5 grouped account sections & decimal validation)
  * Execution Environment Totals:
    * Local Environment (without live PostgreSQL): 157 passed | 10 skipped (167 total)
    * CI Environment (with live PostgreSQL 16 container): 167 passed | 0 skipped (167 total)

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
| `TEST-OPEN-03` | `AC-03-2` | `server/tests/unit/decimal.test.ts`, `server/tests/integration/account.test.ts` | Passed — Unit & Mocked Prisma (Rejects negative, non-numeric, >2 decimals like `100.123` and `1e-7`, >9,999,999,999.99 with 400 `INVALID_OPENING_BALANCE`) | WP-02 Branch |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/unit/accountLock.test.ts`, `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Service-Level Verified — End-to-end transaction-triggered locking pending WP-03 (Unit, Mocked Prisma & Live PostgreSQL Transaction. Proves HTTP 422 on locked account, 409 on concurrent conflict; `lockAccounts` batch validation aborts on foreign/missing IDs without partial locks; proves lock persists on transaction commit and rolls back on failure in PostgreSQL. End-to-end invocation from `POST /api/transactions` is scheduled for WP-03) | WP-02 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Cross-tenant account reads and opening balance updates return 404 NOT_FOUND through real auth middleware; foreign database rows untouched) | WP-02 Branch |
| `TEST-SEC-03` | `BR-10` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Admin calling account endpoints returns 403 `ADMIN_FINANCIAL_ACCESS_FORBIDDEN` through real auth middleware) | WP-02 Branch |

### 2.3 Pending Work Packages (WP-03 through WP-06: Financial Transactions & Ledger)
> **Note:** Financial transaction models, allocation lines, repayments, and historical ledger are scheduled for subsequent work packages. The following tests remain pending implementation and execution.

| Test ID | Linked AC / Feature | Test Location | Status |
|---|---|---|:---:|
| `TEST-INC-01` | `AC-04-1` (Income Transaction) | `server/tests/integration/transaction.test.ts` | Pending Execution |
| `TEST-INC-02` | `AC-04-2` (Income Balance Update) | `server/tests/integration/transaction.test.ts` | Pending Execution |
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
