# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** IN PROGRESS — Work Package 1 (WP-01) Verification Completed (WP-02 through WP-06 Pending Implementation)  

---

## 1. Release Identification

* **Assessed Release Commit:** `fdbc65cd31f1031b14934cf924080c86dde505e3` (`feat/auth-session-security` / PR #8)
* **Release Tag:** `v0.1.0-sprint1` (pending final merge into main)
* **Test Environment:** Node.js v20+, PostgreSQL 16 (Docker Compose / GitHub Actions Service Container), local development environment
* **CI Verification Run:** GitHub Actions Run [#42334882814](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/42334882814) (PR #8)

> **Important Scope Note:** Deliverable 1 / Sprint 1 is IN PROGRESS. Only WP-01 (Authentication & Session Security) is assessed in this PR. Financial domain work packages WP-02 through WP-06 (Opening Balance, Income, Expense, Allocations, Repayments, Summary) are pending implementation in subsequent work packages.

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/` directory)
  * Frontend: `npm test` (within `client/` directory)
* **WP-01 Automated Test Execution Summary (92 Tests across 10 Suites):**
  * **Backend Unit Tests (17 tests across 3 suites):**
    * `server/tests/unit/config.test.ts` (5 passed)
    * `server/tests/unit/seed.test.ts` (8 passed)
    * `server/tests/unit/password.test.ts` (4 passed)
  * **Backend Integration Tests (71 tests across 6 suites):**
    * `server/tests/integration/auth.test.ts` (11 passed — Mocked Prisma)
    * `server/tests/integration/access.test.ts` (17 passed — Application-tier Stub)
    * `server/tests/integration/csrf.test.ts` (12 passed — Mocked Prisma)
    * `server/tests/integration/content-type.test.ts` (26 passed — Mocked Prisma)
    * `server/tests/integration/cors.test.ts` (3 passed — Mocked Prisma)
    * `server/tests/integration/db-password.test.ts` (2 passed in CI against live PostgreSQL 16; skipped locally when DB daemon is absent)
  * **Frontend Component Tests (4 tests across 1 suite):**
    * `client/src/components/ProtectedRoute.test.tsx` (4 passed)
  * **CI Status:** 92 passing (88 backend + 4 frontend), 0 failing, 0 skipped in CI.

### Test-to-Requirement Results Mapping
| Test ID | Linked AC / System Contract | Test Name / Location | Execution Result | Tested Commit |
|---|---|---|:---:|:---:|
| `TEST-AUTH-01` | `AC-01-1` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-AUTH-02` | `AC-01-2` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-AUTH-03` | `AC-01-3` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-AUTH-04` | `AC-01-4` | `server/tests/integration/db-password.test.ts`, `server/tests/unit/password.test.ts` | Passed — Live PostgreSQL (db-password) / Mocked Bcrypt (unit) | `fdbc65c` |
| `TEST-AUTH-05` | `AC-01-5` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-SEC-01` | `AC-02-3` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | `fdbc65c` |
| `TEST-SEC-02` | `AC-02-1` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | `fdbc65c` |
| `TEST-SEC-03` | `AC-02-2` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | `fdbc65c` |
| `TEST-SEC-04` | `AC-02-4` | `server/tests/integration/csrf.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-SEC-05` | `System Security Contract (CORS Preflight)` | `server/tests/integration/cors.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-SEC-06` | `System API Contract (Content-Type Validation and JSON Body Parsing)` | `server/tests/integration/content-type.test.ts` | Passed — Mocked Prisma | `fdbc65c` |
| `TEST-OPEN-01` | `AC-03-1` | `server/tests/integration/account.test.ts` | Pending Execution | Pending Execution |
| `TEST-OPEN-02` | `AC-03-4` | `server/tests/integration/summary.test.ts` | Pending Execution | Pending Execution |
| `TEST-OPEN-03` | `AC-03-2` | `server/tests/integration/account.test.ts` | Pending Execution | Pending Execution |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/integration/account.test.ts` | Pending Execution | Pending Execution |
| `TEST-INC-01` | `AC-04-1` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-INC-02` | `AC-04-2` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-EXP-01` | `AC-05-1` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-EXP-02` | `AC-05-2` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-ALLOC-01`| `AC-06-1` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-ALLOC-02`| `AC-06-2` | `server/tests/integration/allocation.test.ts` | Pending Execution | Pending Execution |
| `TEST-REPAY-01`| `AC-07-1` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-REPAY-02`| `AC-07-2` | `server/tests/integration/summary.test.ts` | Pending Execution | Pending Execution |
| `TEST-REPAY-03`| `AC-07-4` | `server/tests/integration/repayment.test.ts` | Pending Execution | Pending Execution |
| `TEST-REPAY-04`| `AC-07-5` | `server/tests/integration/repayment.test.ts` | Pending Execution | Pending Execution |
| `TEST-REPAY-05`| `AC-07-3` | `server/tests/integration/repayment.test.ts` | Pending Execution | Pending Execution |
| `TEST-REPAY-06`| `AC-07-6` | `server/tests/integration/repayment.test.ts` | Pending Execution | Pending Execution |
| `TEST-BAL-01` | `AC-08-1` | `server/tests/unit/balance.test.ts` | Pending Execution | Pending Execution |
| `TEST-HIST-01` | `AC-09-1` | `server/tests/integration/transaction.test.ts` | Pending Execution | Pending Execution |
| `TEST-PERSIST-01`| `AC-09-2`| `server/tests/integration/persistence.test.ts` | Pending Execution | Pending Execution |
| `TEST-E2E-01` | All Golden ACs | `server/tests/e2e/golden-journey.test.ts` | Pending Execution | Pending Execution |

> **Note on Pending Tests (`TEST-OPEN-01` through `TEST-E2E-01`):**  
> Tests listed as `Pending Execution` belong to work packages WP-02 through WP-06 (financial account creation, transactions, allocations, repayments, and end-to-end golden domain journey). These tests are not part of WP-01 scope and will be implemented, executed, and recorded in their corresponding work packages once financial database models and endpoints are developed.

---

## 3. Golden Domain Journey Execution Log & Captures

*(Captures, terminal logs, and step-by-step API responses will be recorded upon executing the golden journey against the implemented backend during Sprint 1 execution).*
