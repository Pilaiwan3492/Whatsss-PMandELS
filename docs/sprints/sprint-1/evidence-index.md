# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** IN PROGRESS — Work Package 1 (WP-01) and Work Package 2 (WP-02) Completed (WP-03 through WP-06 Pending Implementation)  

---

## 1. Release Identification

* **Assessed Implementation Baseline Commit:** Working on `feat/account-opening-balance` (PR targeting `sprint-1`)
* **Base Branch Commit:** `b29ba59` (PR #8 merged into `sprint-1`)
* **Release Tag:** `v0.1.0-sprint1` (pending final merge into main)
* **Test Environment:** Node.js v20+, PostgreSQL 16 (GitHub Actions Service Container / Docker Compose)

> **Sprint 1 Scope Note:** This record reflects the implementation verification for WP-01 (Authentication, Session Security & Access Control) and WP-02 (Financial Account Model, Reproducible Seed & Opening Balance Lifecycle). Final Deliverable 1 submission package evidence will be compiled upon completion of WP-03 through WP-06 (Transactions, Allocations, Repayments, Summary, and Golden Domain Journey).

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/`)
  * Frontend: `npm test` (within `client/`)
* **Automated Test Execution Summary (113 Tests across 13 Suites):**
  * Backend Unit Tests: 17 passed (`config.test.ts`: 5, `seed.test.ts`: 8, `password.test.ts`: 4)
  * Backend Integration Tests: 88 passed / 2 skipped locally (90 passed in CI: `auth.test.ts`: 11, `access.test.ts`: 17, `account.test.ts`: 15, `db-account.test.ts`: 4, `csrf.test.ts`: 12, `content-type.test.ts`: 26, `cors.test.ts`: 3, `db-password.test.ts`: 2)
  * Frontend Component Tests: 8 passed (`ProtectedRoute.test.tsx`: 4, `AccountListPage.test.tsx`: 4)
  * CI Status: 115 tests expected in CI (107 backend + 8 frontend, 0 skipped when PostgreSQL 16 service is active).

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

### 2.2 Completed Work Package Evidence (WP-02: Financial Account Model & Opening Balance)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-OPEN-01` | `AC-03-1` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma / Live PostgreSQL | WP-02 Branch |
| `TEST-OPEN-02` | `AC-03-4`, `BR-02` | `server/tests/integration/account.test.ts` | Passed — Mocked Prisma (`GET /api/reports/summary`) | WP-02 Branch |
| `TEST-OPEN-03` | `AC-03-2` | `server/tests/integration/account.test.ts` | Passed — Mocked Prisma / Content-Type Guard | WP-02 Branch |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/integration/account.test.ts` | Passed — Mocked Prisma / Atomic Conditional Update | WP-02 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Live PostgreSQL / Mocked Prisma (Database-backed tenant isolation verified for accounts) | WP-02 Branch |

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
