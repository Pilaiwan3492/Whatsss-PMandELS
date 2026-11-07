# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** IN PROGRESS — Work Package 1 (WP-01) Verification Completed (WP-02 through WP-06 Pending Implementation)  

---

## 1. Release Identification

* **Assessed Implementation Baseline Commit:** `887ebab6f478e4c979ac1e1e3055cf00cc856686` (`feat/auth-session-security` / PR #8)
* **Release Tag:** `v0.1.0-sprint1` (pending final merge into main)
* **Test Environment:** Node.js v20+, PostgreSQL 16 (GitHub Actions Service Container / Docker Compose)
* **CI Verification Run:** GitHub Actions Run [#42336172166](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/42336172166) (PR #8)

> **Sprint 1 Scope Notice:** Work Package 1 (WP-01: Authentication & Session Security) is verified. Financial domain work packages WP-02 through WP-06 (Opening Balance, Income, Expense, Allocations, Repayments, Summary) are pending implementation in subsequent work packages.

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/`)
  * Frontend: `npm test` (within `client/`)
* **WP-01 Automated Test Execution Summary (92 Tests across 10 Suites):**
  * Backend Unit Tests: 17 passed (`config.test.ts`: 5, `seed.test.ts`: 8, `password.test.ts`: 4)
  * Backend Integration Tests: 71 passed (`auth.test.ts`: 11, `access.test.ts`: 17, `csrf.test.ts`: 12, `content-type.test.ts`: 26, `cors.test.ts`: 3, `db-password.test.ts`: 2)
  * Frontend Component Tests: 4 passed (`ProtectedRoute.test.tsx`: 4)
  * CI Status: 92 passed, 0 failed, 0 skipped in CI (88 backend + 4 frontend).

### 2.1 Completed Work Package Evidence (WP-01: Authentication & Security)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Commit |
|---|---|---|---|:---:|
| `TEST-AUTH-01` | `AC-01-1` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `887ebab` |
| `TEST-AUTH-02` | `AC-01-2` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `887ebab` |
| `TEST-AUTH-03` | `AC-01-3` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `887ebab` |
| `TEST-AUTH-04` | `AC-01-4` | `server/tests/integration/db-password.test.ts`, `server/tests/unit/password.test.ts` | Passed — Live PostgreSQL / In-memory Fixture | `887ebab` |
| `TEST-AUTH-05` | `AC-01-5` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `887ebab` |
| `TEST-SEC-01` | `AC-02-3` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | `887ebab` |
| `TEST-SEC-02` | `AC-02-1` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | `887ebab` |
| `TEST-SEC-03` | `AC-02-2` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | `887ebab` |
| `TEST-SEC-04` | `AC-02-4` | `server/tests/integration/csrf.test.ts` | Passed — Mocked Prisma | `887ebab` |
| `TEST-SEC-05` | System Contract (CORS) | `server/tests/integration/cors.test.ts` | Passed — Mocked Prisma | `887ebab` |
| `TEST-SEC-06` | System Contract (Content-Type) | `server/tests/integration/content-type.test.ts` | Passed — Mocked Prisma | `887ebab` |

### 2.2 Pending Work Packages (WP-02 through WP-06: Financial Domain)
> **Note:** Financial models and domain endpoints are scheduled for subsequent work packages. The following tests remain pending implementation and execution.

| Test ID | Linked AC / Feature | Test Location | Status |
|---|---|---|:---:|
| `TEST-OPEN-01` | `AC-03-1` (Account Opening) | `server/tests/integration/account.test.ts` | Pending Execution |
| `TEST-OPEN-02` | `AC-03-4` (Opening Balance in Summary) | `server/tests/integration/summary.test.ts` | Pending Execution |
| `TEST-OPEN-03` | `AC-03-2` (Invalid Opening Balance) | `server/tests/integration/account.test.ts` | Pending Execution |
| `TEST-OPEN-04` | `AC-03-3` (Account Type Validation) | `server/tests/integration/account.test.ts` | Pending Execution |
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
