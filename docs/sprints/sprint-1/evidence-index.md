# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** IN PROGRESS — Work Package 1 (WP-01), Work Package 2 (WP-02), and Work Package 3 (WP-03) Merged into sprint-1; Work Package 4 (WP-04) Implemented & Verified on branch feat/credit-purchase-split-allocation (Awaiting Peer Review and Approval; WP-05 and WP-06 Pending Implementation)  

---

## 1. Release Identification

* **Assessed Implementation Baseline Commit:** Branch `feat/credit-purchase-split-allocation` (WP-04 Credit Card Purchase & Split Allocation Engine)
* **Base Branch Commit:** `119fed2` (`sprint-1` merge of PR #10)
* **Release Tag:** `v0.1.0-sprint1` (pending final merge into main)
* **Target Issue:** [GitHub Issue #5](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/5)
* **Assignee:** Aphichaya Klinhual (`@Apichaya251400`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Test Environment:** Node.js v20+, PostgreSQL 16 (GitHub Actions Service Container / Docker Compose)

> **Sprint 1 Scope Note:** This record reflects the implementation verification for WP-01 (Authentication & Session Security), WP-02 (Account Model & Opening Balance), WP-03 (Income Processing & Ledger Integration), and WP-04 (Credit Card Purchase & Split Allocation Engine). WP-05 (Debt Repayment) and WP-06 (Summary, History & Golden Domain Journey) will follow in sequence.

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/`)
  * Frontend: `npm test` (within `client/`)
* **Automated Test Execution Summary (WP-04 Complete Suite):**
  * Backend Unit Tests: 83 passed across 7 suites (+14 new tests in `splitAllocation.test.ts`)
    * `splitAllocation.test.ts`: 14 passed (BR-05/BR-06 split balance integrity, 422 ALLOCATION_SUM_MISMATCH on unbalanced sums, arbitrary-precision Decimal arithmetic, IEEE-754 floating point hazard prevention [0.10 + 0.20 === 0.30], single and multi-line validations, syntactic boundary checks, and over-precision rejection)
    * `accountLock.test.ts`: 9 passed
    * `testSafety.test.ts`: 27 passed
    * `decimal.test.ts`: 16 passed
    * `config.test.ts`: 5 passed
    * `seed.test.ts`: 8 passed
    * `password.test.ts`: 4 passed
  * Backend Integration Tests: 147 passed / 23 skipped locally across 12 suites (+17 new tests in `expense.test.ts`, +2 new tests in `db-expense.test.ts`)
    * `expense.test.ts`: 18 passed (Mocked Prisma & HTTP API; records purchase of 3,000.00 THB split into Dining 1,000.00 and Grocery 2,000.00, increases credit debt by 3,000.00 and expense summary by 3,000.00 per BR-04, distinguishes credit charges from cash repayments, locks account opening balances per AC-03-3, rejects missing primary account ID with 400, rejects unbalanced allocation sums with 422 ALLOCATION_SUM_MISMATCH, rejects non-LOAN_TAKEN primary account with 400 INVALID_PRIMARY_ACCOUNT, rejects non-EXPENSE target category with 400 INVALID_EXPENSE_ACCOUNT, rejects negative/zero/over-precision amounts, rejects cross-tenant accounts with 404 NOT_FOUND per BR-01, rejects unauthenticated requests with 401 per BR-09, and rejects ADMIN with 403 per BR-10)
    * `db-expense.test.ts`: 9 passed in CI (skipped locally without live PostgreSQL; verifies live PostgreSQL persistence of Transaction form PAYMENT_CHARGE and child AllocationLines, debt increase, split allocations, rollback, cross-tenant isolation, atomic lock rollback, boundary decimal precision, and transaction rollback upon unbalanced allocations)
    * `income.test.ts`: 35 passed
    * `account.test.ts`: 26 passed
    * `access.test.ts`: 17 passed
    * `content-type.test.ts`: 26 passed
    * `csrf.test.ts`: 12 passed
    * `auth.test.ts`: 11 passed
    * `cors.test.ts`: 3 passed
    * `db-income.test.ts`: 9 passed in CI
    * `db-password.test.ts`: 2 passed in CI
    * `db-account.test.ts`: 10 passed in CI
  * Frontend Component Tests: 29 passed across 4 suites (+10 tests in `ExpenseForm.test.tsx`)
    * `ExpenseForm.test.tsx`: 10 passed (3-section layout rendering, LOAN_TAKEN credit card selection, EXPENSE categories dropdown, split allocation cards layout, explicit htmlFor/id accessibility linkage, visible keyboard focus state, live client-side balance validation, disabled submit button when unbalanced per BR-06, enabled submit button when balanced per AC-06-1, Over-allocated warning badge, dynamic addition and removal of split cards, disabled remove button when only 1 card remains, accessible progress bar with dynamic aria-valuetext, successful submission, and backend error alert display)
    * `IncomeForm.test.tsx`: 8 passed
    * `ProtectedRoute.test.tsx`: 4 passed
    * `AccountListPage.test.tsx`: 7 passed

---

### 2.1 Completed Work Package Evidence (WP-01: Authentication & Access Control)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-AUTH-01` | `AC-01-1` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-AUTH-02` | `AC-01-2` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-AUTH-03` | `AC-01-3` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-AUTH-04` | `AC-01-4`, `NFR-SEC-01` | `server/tests/integration/db-password.test.ts`, `server/tests/unit/password.test.ts` | Passed — Live PostgreSQL / In-memory Fixture | PR #8 (`b29ba59`) |
| `TEST-AUTH-05` | `AC-01-5`, `FR-01` | `server/tests/integration/auth.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | PR #8 (`b29ba59`) |
| `TEST-SEC-02` | `AC-02-1`, `BR-09` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | PR #8 (`b29ba59`) |
| `TEST-SEC-03` | `AC-02-2`, `BR-10` | `server/tests/integration/access.test.ts` | Passed — Application-tier Stub | PR #8 (`b29ba59`) |
| `TEST-SEC-04` | `AC-02-4` | `server/tests/integration/csrf.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-SEC-05` | System Contract (CORS) | `server/tests/integration/cors.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |
| `TEST-SEC-06` | System Contract (Content-Type) | `server/tests/integration/content-type.test.ts` | Passed — Mocked Prisma | PR #8 (`b29ba59`) |

---

### 2.2 Work Package 2 Evidence (WP-02: Financial Account Model & Opening Balance)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-OPEN-01` | `AC-03-1`, `NFR-DATA-01` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API | WP-02 Branch |
| `TEST-OPEN-02` | `AC-03-4`, `BR-02` | `server/tests/integration/account.test.ts` | Passed — Mocked Prisma | WP-02 Branch |
| `TEST-OPEN-03` | `AC-03-2` | `server/tests/unit/decimal.test.ts`, `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Unit, Mocked Prisma & Live PostgreSQL HTTP API | WP-02 Branch |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/unit/accountLock.test.ts`, `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL Transaction | WP-02 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API | WP-02 Branch |
| `TEST-SEC-03` | `BR-10` | `server/tests/integration/account.test.ts`, `server/tests/integration/db-account.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API | WP-02 Branch |

---

### 2.3 Work Package 3 Evidence (WP-03: Income Transaction Processing & Ledger Integration)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-INC-01` | `AC-04-1`, `BR-03`, `FR-06` | `server/tests/integration/income.test.ts`, `server/tests/integration/db-income.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API | PR #10 (`119fed2`) |
| `TEST-INC-02` | `AC-04-2` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma | PR #10 (`119fed2`) |
| `TEST-OPEN-04` (E2E) | `AC-03-3` | `server/tests/integration/income.test.ts`, `server/tests/integration/db-income.test.ts` | Passed — Mocked Prisma & Live PostgreSQL Transaction | PR #10 (`119fed2`) |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma | PR #10 (`119fed2`) |
| `TEST-SEC-03` | `BR-10` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma | PR #10 (`119fed2`) |
| `TEST-INC-DECIMAL` | `NFR-DATA-01` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma | PR #10 (`119fed2`) |
| `TEST-INC-ATOM` | `AC-03-3`, `F-04` | `server/tests/integration/income.test.ts`, `server/tests/integration/db-income.test.ts` | Passed — Mocked Prisma & Live PostgreSQL | PR #10 (`119fed2`) |
| `TEST-INC-CONCURRENT` | `AC-03-3`, `F-04` | `server/tests/integration/income.test.ts` | Passed — Mocked Prisma | PR #10 (`119fed2`) |
| `TEST-UI-INC` | `AC-04-1`, `AC-04-2` | `client/src/components/IncomeForm.test.tsx` | Passed — Vitest / Testing Library | PR #10 (`119fed2`) |

---

### 2.4 Work Package 4 Evidence (WP-04: Credit Card Purchase & Split Allocation Engine)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-EXP-01` | `AC-05-1`, `BR-04`, `FR-07` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Recording credit purchase of 3,000.00 THB increases credit debt by 3,000.00 THB and expense summary by 3,000.00 THB; distinguishes purchases from cash-funded repayments) | WP-04 Branch |
| `TEST-EXP-02` | `AC-05-2` | `server/tests/integration/expense.test.ts` | Passed — Mocked Prisma (Omitting primary_account_id rejected with 400 INVALID_ACCOUNT_ID) | WP-04 Branch |
| `TEST-ALLOC-01` | `AC-06-1`, `BR-05`, `FR-08` | `server/tests/unit/splitAllocation.test.ts`, `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Unit, Mocked Prisma & Live PostgreSQL HTTP API (Split allocation with Dining 1,000.00 + Grocery 2,000.00 = 3,000.00 THB persists successfully with 2 allocation lines and relational integrity) | WP-04 Branch |
| `TEST-ALLOC-02` | `AC-06-2`, `BR-06` | `server/tests/unit/splitAllocation.test.ts`, `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Unit, Mocked Prisma & Live PostgreSQL HTTP API (Unbalanced allocation sum [1000 + 1500 != 3000] rejected with 422 ALLOCATION_SUM_MISMATCH without partial writes or orphaned records) | WP-04 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Cross-tenant primary_account_id or target_account_id returns 404 NOT_FOUND, writes 0 rows to PostgreSQL) | WP-04 Branch |
| `TEST-SEC-02` | `AC-02-1`, `BR-09` | `server/tests/integration/expense.test.ts` | Passed — Mocked Prisma (Unauthenticated POST /api/transactions/expense returns 401 UNAUTHORIZED) | WP-04 Branch |
| `TEST-SEC-03` | `AC-02-2`, `BR-10` | `server/tests/integration/expense.test.ts` | Passed — Mocked Prisma (ADMIN caller returns 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN with zero data leak) | WP-04 Branch |
| `TEST-VAL-01` | `AC-05-3`, `BR-04` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Non-LOAN_TAKEN primary account rejected with 400 INVALID_PRIMARY_ACCOUNT with 0 rows written) | WP-04 Branch |
| `TEST-EXP-ATOM` | `AC-03-3`, `BR-04` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Mid-flight failure inside $transaction rolls back Transaction and restores opening balance lock to unlocked state) | WP-04 Branch |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Validation failure preserves unlocked opening balance) | WP-04 Branch |
| `TEST-EXP-DECIMAL` | `NFR-DATA-01` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Preserves exact boundary Decimal values 0.01, 0.29, 100.10, 9999999999.99 without floating-point distortion) | WP-04 Branch |
| `TEST-UI-EXP` | `AC-05-1`, `AC-06-1`, `AC-06-2` | `client/src/components/ExpenseForm.test.tsx` | Passed — Vitest / Testing Library (Expense form rendering, 3-section layout, split allocation cards with accessible htmlFor/id linkage, live balance validation, disable submit when unbalanced, dynamic add/remove cards, progress bar with aria metadata) | WP-04 Branch |

---

### 2.5 Pending Work Packages (WP-05 through WP-06: Repayment, Summary & E2E)
> **Note:** Repayments, final balances, and historical ledger are scheduled for subsequent work packages. The following tests remain pending implementation and execution.

| Test ID | Linked AC / Feature | Test Location | Status |
|---|---|---|:---:|
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
