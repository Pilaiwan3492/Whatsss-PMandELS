# Sprint 1 Verification Evidence Index (Part F)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part F: Working Sprint 1 and Verification)  
> **Status:** COMPLETED — All Work Packages (WP-01 through WP-06) Fully Implemented, Verified, and Integrated into Sprint 1 Golden Domain Release Candidate (Branch `feat/summaries-history-e2e` ready for Peer Review)  

---

## 1. Release Identification

* **Assessed Implementation Baseline Commit:** Branch `feat/summaries-history-e2e` (`0b4342712e41c9ab246f207f13f5ab1644c6e167` / verified on CI Run #129: WP-06 Financial Summaries, Transaction History, Real Process Restart, Isolated Test Fixtures & Database Safety Guard)
* **Base Branch Commit:** `f9d4ad8` (`sprint-1` merge of PR #12)
* **Release Tag:** `v0.1.0-sprint1 (Release Candidate — Pending Tag Creation upon Sprint 1 Review & Merge)`
* **Target Issue:** [GitHub Issue #7](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/7)
* **Assignee:** Aphichaya Klinhual (`@Apichaya251400`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Test Environment:** Node.js v20+, PostgreSQL 16 (GitHub Actions Service Container / Docker Compose)

> **Sprint 1 Scope Note:** This record reflects the final verification across all 6 Sprint 1 Work Packages: WP-01 (Authentication & Session Security), WP-02 (Account Model & Opening Balance), WP-03 (Income Processing & Ledger Integration), WP-04 (Credit Card Purchase & Split Allocation Engine), WP-05 (Credit Card Debt Settlement / Repayment), and WP-06 (Financial Summary, Transaction History & Golden Domain Journey E2E Integration).

---

## 2. Automated Test Execution Results

* **Execution Commands:**
  * Backend: `npm test` (within `server/`)
  * Frontend: `npm test` (within `client/`)
* **TDD Red/Green Implementation Evidence:**
  * **Red Commit (`f0f7878`):** Test specifications and failing test suites added for F-07 credit card repayment engine and boundary validations.
  * **Green Commit (`558b307`):** Implementation of `repayment.service.ts`, `transaction.controller.ts`, atomic balance locking, and Decimal calculation satisfying all test assertions.
  * **Concurrency & Row Lock Hardening Commit:** Unified pessimistic row-level locking (`acquireAccountRowLocks`) before account reads inside `$transaction` across all financial transaction services (Income, Expense, Repayment) and live concurrent tests (`TEST-REPAY-CONCURRENT-DEBT`, `TEST-REPAY-CONCURRENT-FUNDS`).
* **Automated Test Execution Summary:**
  * **Local Suite Execution (without live DB):**
    * Backend: 277 passed, 37 skipped across 25 test files (89 Unit tests passed across 8 suites; 188 Integration tests passed across 15 suites; 37 live DB tests skipped locally).
    * Frontend: 55 passed across 7 component test files (7 in `DashboardPage.test.tsx`, 5 in `TransactionHistoryPage.test.tsx`, 10 in `RepaymentForm.test.tsx`, 13 in `ExpenseForm.test.tsx`, 8 in `AccountListPage.test.tsx`, 8 in `IncomeForm.test.tsx`, 4 in `ProtectedRoute.test.tsx`).
  * **GitHub Actions CI Environment (Live PostgreSQL Service Container, ALLOW_LIVE_DB_TESTS=true):**
    * Backend: 314 passed, 0 failed, 0 skipped across 25 test files.
    * Frontend: 55 passed, 0 failed across 7 test files.
    * Production Builds:
      * Backend TypeScript compilation: Passed.
      * Frontend TypeScript compilation and Vite production build: Passed.
    * CI Run: [#129](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/42502900160) (and Push [#128](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/42502895139))
    * Verified Commit: `0b4342712e41c9ab246f207f13f5ab1644c6e167`
    * หมายเหตุ: ตัวเลขนี้ตรวจจาก Job Logs ของ Run #129 (Backend 314 passed across 25 files, Frontend 55 passed across 7 files, TypeScript compilation & Vite build passed)
  * **Detailed Suite Breakdown:**
    * `balance.test.ts`: 5 passed (TEST-BAL-01: arbitrary-precision Decimal balance calculations, opening balance exclusion BR-02, salary inflow balance impact, split purchase debt impact, Golden Journey final balances Bank 27,000 THB, Debt 0 THB, Income 20,000 THB, Expense 3,000 THB, Dining 1,000 THB, Grocery 2,000 THB)
    * `transaction.test.ts`: 7 passed (TEST-HIST-01: Mocked Prisma & HTTP API; 401 unauthenticated per BR-09, 403 admin financial barrier per BR-10, cross-tenant isolation per BR-01, empty state, exactly 3 transactions and 4 allocation lines total per AC-09-1, deterministic chronological sorting transaction_date DESC, created_at DESC, eagerly loaded primary account and target category metadata)
    * persistence.test.ts: 2 passed in CI (TEST-PERSIST-01: Live PostgreSQL HTTP API & Real OS Process Restart; verifies relational database persistence against whatsss_test without re-seeding across real OS server process restart: spawns Process 1 with isolated test tenant fixtures, queries initial state, terminates Process 1 [port closed verified], spawns Process 2 with brand new PID, queries post-restart state, confirms 100% identical metrics Bank 27k, Debt 0, Income 20k, Expense 3k, Dining 1k, Grocery 2k, 3 transactions, 4 allocation lines; TEST-PERSIST-02: verifies test data isolation asserting user_demo is 100% untouched and unmutated before and after process restart)
    * golden-journey.test.ts: 2 passed in CI (TEST-E2E-01: Live PostgreSQL HTTP API; executes complete 4-step sequential Golden Domain Journey via HTTP session cookies against whatsss_test using isolated test fixture: Step 1 Opening Balance 10k -> Step 2 Salary 20k -> Step 3 Split Purchase 3k -> Step 4 Repayment 3k -> Step 5 Final Summary Verification Bank 27k, Debt 0, Income 20k, Expense 3k, Dining 1k, Grocery 2k -> Step 6 History Verification 3 transactions, 4 allocations; TEST-E2E-02: verifies test data isolation asserting user_demo was 100% untouched throughout end-to-end journey execution)
    * `DashboardPage.test.tsx`: 7 passed (TEST-UI-DASH-01..07: renders 4 summary metric cards with formatted THB currency, renders expense category breakdown progress bars with 33% Dining and 67% Grocery, renders recent transactions snippet table, quick action navigation links, handles loading spinner, TEST-UI-DASH-06 history error handling with Retry while summary renders normally, TEST-UI-DASH-07 empty state placeholder when zero transactions recorded)
    * `TransactionHistoryPage.test.tsx`: 5 passed (TEST-UI-HIST-01..05: renders chronological transactions table with type badges, filter tabs All/Income/Expense/Repayment with counts, expandable nested accordion rows showing split allocations, empty state placeholder, handles loading spinner and error banner with retry)
    * `repayment.test.ts`: 24 passed (Mocked Prisma & HTTP API; records full CC repayment of 3,000.00 THB reducing Bank and Debt atomically with 1 allocation line targeting LOAN_TAKEN, verifies expense exclusion invariant per BR-08, supports partial repayment, rejects repayment exceeding debt with 422 REPAYMENT_EXCEEDS_DEBT, rejects insufficient funds with 422 INSUFFICIENT_FUNDS, rejects non-positive/over-precision/non-numeric amount with 400 INVALID_AMOUNT, rejects cross-tenant accounts with 404 NOT_FOUND per BR-01, rejects unauthenticated requests with 401 per BR-09, rejects ADMIN with 403 per BR-10, locks opening balance atomically)
    * `db-repayment.test.ts`: 9 passed in CI (skipped locally without live PostgreSQL; verifies live PostgreSQL persistence of Transaction form PAYMENT_CHARGE and child AllocationLine targeting LOAN_TAKEN, atomic reduction of Bank and Debt balances, expense exclusion invariant BR-08, boundary 422 rejection on exceeding debt or insufficient funds, concurrent race condition serialization via pessimistic row locks [TEST-REPAY-CONCURRENT-DEBT, TEST-REPAY-CONCURRENT-FUNDS], mid-flight rollback atomicity [TEST-REPAY-ATOM], and exact decimal arithmetic [TEST-REPAY-DECIMAL])
    * `RepaymentForm.test.tsx`: 10 passed (TEST-UI-REPAY-01..10: rendering repayment modal with source CASH and target LOAN_TAKEN accounts, full repayment submission, partial repayment submission, quick-fill "Pay Full Debt" button, live warning badge when repayment exceeds debt, live warning badge when insufficient bank funds, disabled submit button on invalid/over-debt/insufficient-funds, formatted currency preview, error banner display on 422/400 API response, and modal dismissal/reset)
    * `splitAllocation.test.ts`: 15 passed (BR-05/BR-06 split balance integrity, AC-06-3 duplicate category rejection, 422 ALLOCATION_SUM_MISMATCH on unbalanced sums, arbitrary-precision Decimal arithmetic, IEEE-754 floating point hazard prevention [0.10 + 0.20 === 0.30], single and multi-line validations, syntactic boundary checks, and over-precision rejection)
    * `accountLock.test.ts`: 9 passed
    * `testSafety.test.ts`: 27 passed
    * `decimal.test.ts`: 16 passed
    * `config.test.ts`: 5 passed
    * `seed.test.ts`: 8 passed
    * `password.test.ts`: 4 passed
    * `expense.test.ts`: 19 passed (Mocked Prisma & HTTP API; records purchase of 3,000.00 THB split into Dining 1,000.00 and Grocery 2,000.00, increases credit debt by 3,000.00 and expense summary by 3,000.00 per BR-04, distinguishes credit charges from cash repayments, locks account opening balances per AC-03-3, rejects duplicate category allocations with 400 DUPLICATE_ALLOCATION_ACCOUNT per AC-06-3, rejects missing primary account ID with 400, rejects unbalanced allocation sums with 422 ALLOCATION_SUM_MISMATCH, rejects non-LOAN_TAKEN primary account with 400 INVALID_PRIMARY_ACCOUNT, rejects non-EXPENSE target category with 400 INVALID_EXPENSE_ACCOUNT, rejects negative/zero/over-precision amounts, rejects cross-tenant accounts with 404 NOT_FOUND per BR-01, rejects unauthenticated requests with 401 per BR-09, and rejects ADMIN with 403 per BR-10)
    * `db-expense.test.ts`: 9 passed in CI (skipped locally without live PostgreSQL; verifies live PostgreSQL persistence of Transaction form PAYMENT_CHARGE and child AllocationLines, debt increase, split allocations, rollback, cross-tenant isolation, atomic lock rollback, boundary decimal precision, and transaction rollback upon unbalanced allocations)
    * `income.test.ts`: 35 passed
    * `account.test.ts`: 28 passed (+2 tests for LOAN_TAKEN dynamic debt calculation via Opening Balance + Charges - Repayments in GET /api/accounts and GET /api/accounts/:id)
    * `access.test.ts`: 17 passed
    * `content-type.test.ts`: 26 passed
    * `csrf.test.ts`: 12 passed
    * `auth.test.ts`: 11 passed
    * `cors.test.ts`: 3 passed
    * `db-income.test.ts`: 9 passed in CI
    * `db-password.test.ts`: 2 passed in CI
    * `db-account.test.ts`: 10 passed in CI
    * `ExpenseForm.test.tsx`: 13 passed (TEST-UI-EXP-01..13: 3-section layout rendering, LOAN_TAKEN credit card selection, EXPENSE categories dropdown, split allocation cards layout, explicit htmlFor/id accessibility linkage, visible keyboard focus state, live integer cents balance validation without float conversion, disabled submit button when unbalanced per BR-06, enabled submit button when balanced per AC-06-1, Over-allocated warning badge, dynamic addition and removal of split cards, disabled remove button when only 1 card remains, accessible progress bar with dynamic aria-valuetext, successful submission with string decimal payload, AC-06-3 duplicate category selection rejection, AC-05-3 exponent/precision rejection, and direct rejection of non-numeric amounts like 1000abc)
    * `AccountListPage.test.tsx`: 8 passed (renders accounts list, opens modal, updates opening balance, validates negative/over-precision, enforces max limit, redirects ADMIN to /access-denied, and renders Current Debt with formatted currency for LOAN_TAKEN accounts)
    * `IncomeForm.test.tsx`: 8 passed
    * `ProtectedRoute.test.tsx`: 4 passed

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
| `TEST-ALLOC-03` | `AC-06-3`, `BR-05` | `server/tests/unit/splitAllocation.test.ts`, `server/tests/integration/expense.test.ts` | Passed — Unit & Mocked Prisma HTTP API (Duplicate category selection in allocation lines rejected with 400 DUPLICATE_ALLOCATION_ACCOUNT; verified via unit and mocked integration suites; live PostgreSQL test pending) | WP-04 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Cross-tenant primary_account_id or target_account_id returns 404 NOT_FOUND, writes 0 rows to PostgreSQL) | WP-04 Branch |
| `TEST-SEC-02` | `AC-02-1`, `BR-09` | `server/tests/integration/expense.test.ts` | Passed — Mocked Prisma (Unauthenticated POST /api/transactions/expense returns 401 UNAUTHORIZED) | WP-04 Branch |
| `TEST-SEC-03` | `AC-02-2`, `BR-10` | `server/tests/integration/expense.test.ts` | Passed — Mocked Prisma (ADMIN caller returns 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN with zero data leak) | WP-04 Branch |
| `TEST-VAL-01` | `AC-05-3`, `BR-04` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Non-numeric amount, exponent notation 1e3, negative/zero, excessive decimal precision >2 places, or non-LOAN_TAKEN primary account rejected with 400 INVALID_TRANSACTION_AMOUNT / INVALID_ALLOCATION_AMOUNT / INVALID_PRIMARY_ACCOUNT with 0 rows written) | WP-04 Branch |
| `TEST-EXP-ATOM` | `AC-03-3`, `BR-04` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Mid-flight failure inside $transaction rolls back Transaction and restores opening balance lock to unlocked state) | WP-04 Branch |
| `TEST-OPEN-04` | `AC-03-3` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Validation failure preserves unlocked opening balance) | WP-04 Branch |
| `TEST-EXP-DECIMAL` | `NFR-DATA-01` | `server/tests/integration/expense.test.ts`, `server/tests/integration/db-expense.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Preserves exact boundary Decimal values 0.01, 0.29, 100.10, 9999999999.99 without floating-point distortion) | WP-04 Branch |
| `TEST-UI-EXP` | `AC-05-1`, `AC-05-3`, `AC-06-1`, `AC-06-2`, `AC-06-3` | `client/src/components/ExpenseForm.test.tsx` | Passed — Vitest / Testing Library (13 test cases in ExpenseForm.test.tsx verified by Vitest: TEST-UI-EXP-01..13 covering layout, a11y, integer cents live balance, submit state, over-allocation, dynamic cards, aria progress, string decimal API payload, duplicate category rejection, exponent rejection, and non-numeric 1000abc rejection) | WP-04 Branch |

---

### 2.5 Work Package 5 Evidence (WP-05: Credit Card Debt Settlement / Repayment)
| Test ID | Linked AC / Contract | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-REPAY-01` | `AC-07-1`, `BR-07`, `FR-09` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Recording CC repayment of 3,000.00 THB from Bank to Credit Card reduces Bank balance to 27,000.00 THB and debt to 0.00 THB with 1 allocation line targeting LOAN_TAKEN; locks opening balances atomically) | WP-05 Branch |
| `TEST-REPAY-02` | `AC-07-2`, `BR-08` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Expense summary verified unchanged at 3,000.00 THB after debt repayment; repayments targeting LOAN_TAKEN are strictly excluded from total expenses per BR-08) | WP-05 Branch |
| `TEST-REPAY-03` | `AC-07-4` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Repayment request of 3,500.00 THB against 3,000.00 THB debt rejected with 422 REPAYMENT_EXCEEDS_DEBT, zero records written to database) | WP-05 Branch |
| `TEST-REPAY-04` | `AC-07-5` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Repayment request of 30,000.00 THB when bank balance is 27,000.00 THB rejected with 422 INSUFFICIENT_FUNDS, zero records written) | WP-05 Branch |
| `TEST-REPAY-05` | `AC-07-3` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Partial repayment of 1,500.00 THB against 3,000.00 THB debt reduces debt to 1,500.00 THB and bank balance to 25,500.00 THB with zero expense impact) | WP-05 Branch |
| `TEST-REPAY-06` | `AC-07-6` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Non-positive amount <= 0, alphanumeric "1000abc", exponent notation "1e3", or decimal precision >2 places rejected with 400 INVALID_AMOUNT) | WP-05 Branch |
| `TEST-REPAY-CONCURRENT-DEBT` | `AC-07-4`, `BR-07`, `NFR-DATA-01` | `server/tests/integration/db-repayment.test.ts` | Passed — Live PostgreSQL HTTP API (Two concurrent repayment requests of 2,000.00 THB against 3,000.00 THB debt serialized via row-level locks; exactly 1 succeeds [201], 1 rejected with 422 REPAYMENT_EXCEEDS_DEBT; remaining debt is 1,000.00 THB and never negative; writes exactly 1 Transaction and 1 AllocationLine) | WP-05 Branch |
| `TEST-REPAY-CONCURRENT-FUNDS` | `AC-07-5`, `BR-07`, `NFR-DATA-01` | `server/tests/integration/db-repayment.test.ts` | Passed — Live PostgreSQL HTTP API (Two concurrent repayment requests of 2,000.00 THB with only 3,000.00 THB bank balance serialized via row-level locks; exactly 1 succeeds [201], 1 rejected with 422 INSUFFICIENT_FUNDS; remaining bank balance is 1,000.00 THB and never negative; writes exactly 1 Transaction and 1 AllocationLine) | WP-05 Branch |
| `TEST-SEC-01` | `AC-02-3`, `BR-01` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL HTTP API (Cross-tenant source or target accounts return 404 NOT_FOUND, 0 rows written) | WP-05 Branch |
| `TEST-SEC-02` | `AC-02-1`, `BR-09` | `server/tests/integration/repayment.test.ts` | Passed — Mocked Prisma (Unauthenticated POST /api/transactions/repayment returns 401 UNAUTHORIZED) | WP-05 Branch |
| `TEST-SEC-03` | `AC-02-2`, `BR-10` | `server/tests/integration/repayment.test.ts` | Passed — Mocked Prisma (ADMIN caller returns 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN with zero data leak) | WP-05 Branch |
| `TEST-REPAY-ATOM` | `AC-03-3`, `BR-07` | `server/tests/integration/db-repayment.test.ts` | Passed — Live PostgreSQL (Mid-flight failure inside $transaction rolls back transaction and preserves opening balance lock state) | WP-05 Branch |
| `TEST-REPAY-DECIMAL`| `NFR-DATA-01` | `server/tests/integration/repayment.test.ts`, `server/tests/integration/db-repayment.test.ts` | Passed — Mocked Prisma & Live PostgreSQL (Preserves exact boundary Decimal values without floating-point distortion) | WP-05 Branch |
| `TEST-UI-REPAY` | `AC-07-1`..`06` | `client/src/components/RepaymentForm.test.tsx` | Passed — Vitest / Testing Library (10 test cases in RepaymentForm.test.tsx: TEST-UI-REPAY-01..10 covering layout, full repayment submission, partial repayment, pay full debt quick action, debt exceed warning, insufficient funds warning, invalid amount blocking, error banner, and cancel modal) | WP-05 Branch |

---

### 2.6 Work Package 6 Evidence (WP-06: Financial Summaries, Transaction History & E2E)
| Test ID | Linked AC / Feature | Test Location | Classification & Result | Tested Baseline |
|---|---|---|---|:---:|
| `TEST-BAL-01` | `AC-08-1`, `FR-10`, `BR-02`..`08` | `server/tests/unit/balance.test.ts` | Passed — Vitest Unit Test (5 test cases: verifies opening balance exclusion BR-02, salary inflow balance impact, split expense debt impact, category breakdown Dining 1000/Grocery 2000, final balances Bank 27000, Debt 0, Income 20000, Expense 3000, and NFR-DATA-01 decimal precision preservation) | WP-06 Branch |
| `TEST-HIST-01` | `AC-09-1`, `FR-11`, `BR-01`, `BR-09`, `BR-10` | `server/tests/integration/transaction.test.ts` | Passed — Mocked Prisma HTTP API (7 test cases: verifies 401 unauthenticated, 403 admin financial barrier, tenancy isolation, empty state, exactly 3 recorded transactions and 4 allocation lines total, chronological date descending order, primary and target category metadata) | WP-06 Branch |
| `TEST-PERSIST-01..02` | `AC-09-2`, `NFR-DATA-01` | `server/tests/integration/persistence.test.ts`, `server/scripts/verify_server_restart.mjs` | Passed — Live PostgreSQL Integration & Real OS Process Restart (2 test cases: TEST-PERSIST-01 directly spawns Process 1 with isolated test tenant fixtures, executes HTTP queries, kills Process 1, verifies port release, spawns Process 2 with new PID without DB re-seeding, and asserts 100% identical data retrieval: Bank 27k, Debt 0, Income 20k, Expense 3k, Dining 1k, Grocery 2k, 3 transactions, 4 allocation lines; TEST-PERSIST-02 confirms test data isolation asserting user_demo is 100% untouched) | WP-06 Branch |
| `TEST-E2E-01..02` | All Golden ACs (`AC-03-1`..`AC-09-1`) | `server/tests/e2e/golden-journey.test.ts` | Passed — Live PostgreSQL HTTP API (2 test cases: TEST-E2E-01 executes full sequential 4-step Golden Journey through HTTP API with live session cookies against whatsss_test using isolated test fixture: Step 1 Opening Balance 10,000 THB -> Step 2 Salary 20,000 THB -> Step 3 Split CC Purchase 3,000 THB -> Step 4 Repayment 3,000 THB -> Step 5 Final Summary Verification Bank 27k, Debt 0, Income 20k, Expense 3k, Dining 1k, Grocery 2k -> Step 6 History Verification 3 transactions, 4 allocations; TEST-E2E-02 asserts test data isolation with user_demo 100% untouched) | WP-06 Branch |
| `TEST-UI-DASH` | `AC-08-1`, `F-08` | `client/src/pages/DashboardPage.test.tsx` | Passed — Vitest / Testing Library (7 test cases: TEST-UI-DASH-01..07 covering 4 summary metric cards, category breakdown progress bars, recent transactions table, quick action navigation links, TEST-UI-DASH-06 history error handling with Retry while summary renders normally, TEST-UI-DASH-07 empty state placeholder) | WP-06 Branch |
| `TEST-UI-HIST` | `AC-09-1`, `F-09` | `client/src/pages/TransactionHistoryPage.test.tsx` | Passed — Vitest / Testing Library (5 test cases: TEST-UI-HIST-01..05 covering 3 transactions and 4 allocation lines rendering, filter tabs by type, expandable split allocation rows, empty state placeholder, and error banner with retry) | WP-06 Branch |

---

## 3. Golden Domain Journey Execution Log & Captures

The complete 5-step Golden Domain Journey was executed sequentially against the PostgreSQL database (`whatsss_test`) via the automated integration test suite `server/tests/e2e/golden-journey.test.ts` (`TEST-E2E-01`). Below is the verified step-by-step transaction execution record:

### Step 1: Account Opening Balance (WP-02 / AC-03-1)
* **Action:** Authenticated user `user_demo` sets opening balance on `Checking Bank` account.
* **HTTP Request:**
  ```http
  PATCH /api/accounts/11111111-1111-4111-8111-111111111101/opening-balance
  Cookie: token=...
  Content-Type: application/json

  {
    "opening_balance": 10000.00
  }
  ```
* **HTTP Response:** `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "account": {
        "id": "11111111-1111-4111-8111-111111111101",
        "name": "Checking Bank",
        "type": "CASH",
        "opening_balance": "10000.00",
        "is_opening_locked": false
      }
    }
  }
  ```
* **Verified Ledger State:** Bank Balance = **10,000.00 THB**, Debt = **0.00 THB**, Income = **0.00 THB**, Expense = **0.00 THB**.

### Step 2: Salary Inflow (WP-03 / AC-04-1, BR-03)
* **Action:** Record regular monthly salary inflow into `Checking Bank` from `Salary` income category.
* **HTTP Request:**
  ```http
  POST /api/transactions/income
  Cookie: token=...
  Content-Type: application/json

  {
    "primary_account_id": "11111111-1111-4111-8111-111111111101",
    "income_account_id": "11111111-1111-4111-8111-111111111103",
    "total_amount": "20000.00",
    "transaction_date": "2026-11-02",
    "description": "November Salary Inflow"
  }
  ```
* **HTTP Response:** `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "txn-01",
        "primary_account_id": "11111111-1111-4111-8111-111111111101",
        "form": "RECEIVE_MONEY",
        "total_amount": "20000.00",
        "transaction_date": "2026-11-02",
        "allocations": [
          { "target_account_id": "11111111-1111-4111-8111-111111111103", "amount": "20000.00" }
        ]
      },
      "updated_balance": {
        "current_balance": "30000.00"
      }
    }
  }
  ```
* **Verified Ledger State:** Bank Balance = **30,000.00 THB**, Debt = **0.00 THB**, Income = **20,000.00 THB**, Expense = **0.00 THB**. Primary account `Checking Bank` opening balance locked atomically (`is_opening_locked: true`).

### Step 3: Credit Card Purchase with Split Allocation (WP-04 / AC-05-1, AC-06-1, BR-04, BR-05)
* **Action:** Record credit card purchase charged to `Visa Credit Card` split into Dining (1,000.00 THB) and Grocery (2,000.00 THB).
* **HTTP Request:**
  ```http
  POST /api/transactions/expense
  Cookie: token=...
  Content-Type: application/json

  {
    "primary_account_id": "11111111-1111-4111-8111-111111111102",
    "total_amount": "3000.00",
    "transaction_date": "2026-11-03",
    "description": "Weekend Dining & Grocery",
    "allocations": [
      { "target_account_id": "11111111-1111-4111-8111-111111111104", "amount": "1000.00", "notes": "Dinner" },
      { "target_account_id": "11111111-1111-4111-8111-111111111105", "amount": "2000.00", "notes": "Weekly grocery" }
    ]
  }
  ```
* **HTTP Response:** `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "txn-02",
        "primary_account_id": "11111111-1111-4111-8111-111111111102",
        "form": "PAYMENT_CHARGE",
        "total_amount": "3000.00",
        "transaction_date": "2026-11-03",
        "allocations": [
          { "target_account_id": "11111111-1111-4111-8111-111111111104", "amount": "1000.00", "notes": "Dinner" },
          { "target_account_id": "11111111-1111-4111-8111-111111111105", "amount": "2000.00", "notes": "Weekly grocery" }
        ]
      },
      "updated_debt": {
        "current_debt": "3000.00"
      }
    }
  }
  ```
* **Verified Ledger State:** Bank Balance = **30,000.00 THB**, Debt = **3,000.00 THB**, Income = **20,000.00 THB**, Expense = **3,000.00 THB** (Dining: 1,000.00, Grocery: 2,000.00).

### Step 4: Credit Card Debt Settlement Repayment (WP-05 / AC-07-1, BR-07, BR-08)
* **Action:** Record credit card debt repayment from `Checking Bank` to `Visa Credit Card`.
* **HTTP Request:**
  ```http
  POST /api/transactions/repayment
  Cookie: token=...
  Content-Type: application/json

  {
    "from_account_id": "11111111-1111-4111-8111-111111111101",
    "to_account_id": "11111111-1111-4111-8111-111111111102",
    "amount": "3000.00",
    "transaction_date": "2026-11-04",
    "description": "Full Credit Card Debt Repayment"
  }
  ```
* **HTTP Response:** `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "id": "txn-03",
        "primary_account_id": "11111111-1111-4111-8111-111111111101",
        "form": "PAYMENT_CHARGE",
        "total_amount": "3000.00",
        "transaction_date": "2026-11-04",
        "allocations": [
          { "target_account_id": "11111111-1111-4111-8111-111111111102", "amount": "3000.00" }
        ]
      },
      "updated_cash_balance": "27000.00",
      "updated_debt": "0.00"
    }
  }
  ```
* **Verified Ledger State:** Bank Balance = **27,000.00 THB**, Debt = **0.00 THB**, Income = **20,000.00 THB**, Expense = **3,000.00 THB** (Repayment strictly excluded from expense summary per BR-08).

### Step 5: Final Real-Time Financial Summary & Audit History (WP-06 / AC-08-1, AC-09-1)
* **Summary Query:** `GET /api/reports/summary` $ightarrow$ `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "bank_balance": 27000.00,
      "credit_debt": 0.00,
      "total_income": 20000.00,
      "total_expense": 3000.00,
      "category_breakdown": {
        "Dining": 1000.00,
        "Grocery": 2000.00
      },
      "categories": [
        { "name": "Dining", "amount": 1000.00 },
        { "name": "Grocery", "amount": 2000.00 }
      ]
    }
  }
  ```
* **Transaction History Query:** `GET /api/transactions` $ightarrow$ `200 OK`
  * Returns **exactly 3 transactions** in chronological descending order:
    1. `2026-11-04`: Repayment (3,000.00 THB, 1 allocation line to Visa Credit Card)
    2. `2026-11-03`: Purchase (3,000.00 THB, 2 allocation lines: Dining 1k + Grocery 2k)
    3. `2026-11-02`: Salary Inflow (20,000.00 THB, 1 allocation line to Salary)
  * Returns **exactly 4 allocation lines total** across all recorded transactions.

### 3.1 Real Server Process Restart Verification & Execution Evidence (AC-09-2, NFR-DATA-01)

Per Issue #7 requirements, data persistence across process boundaries was verified through an **actual Operating System backend server process restart**:

1. **Initial Process Lifecycle (Process 1):**
   - Backend Express server spawned as OS Process 1 with **PID: 3276** listening on `http://localhost:5000`.
   - Executed the complete 4-step Golden Domain Journey via HTTP API:
     - Opening Balance: 10,000.00 THB on Checking Bank (`AC-03-1`)
     - Salary Inflow: 20,000.00 THB (`AC-04-1`)
     - CC Split Purchase: 3,000.00 THB (Dining 1,000.00 THB + Grocery 2,000.00 THB) (`AC-05-1`, `AC-06-1`)
     - CC Debt Repayment: 3,000.00 THB (`AC-07-1`)
   - Queried Pre-Restart Summary & History endpoints from Process 1.
   - Captured Pre-Restart UI Screenshots for Dashboard and Transaction History.

2. **Process Termination:**
   - Terminated Process 1 (**PID: 3276**) via OS process termination signal (`taskkill /PID 3276 /T /F`).
   - Verified port `5000` released and server actively unreachable (`ECONNREFUSED` / Port down confirmed).

3. **Subsequent Process Lifecycle (Process 2):**
   - Spawned completely new backend process as OS Process 2 with **PID: 14784** (**PID 14784 $\neq$ 3276**).
   - **Crucial Invariant:** The PostgreSQL database was **NOT reset**, **NOT re-seeded**, and schema was untouched.
   - Queried Post-Restart Summary & History endpoints from Process 2.
   - Captured Post-Restart UI Screenshots for Dashboard and Transaction History.

#### Terminal Execution Log
```text
======================================================================
   STARTING REAL BACKEND SERVER PROCESS RESTART VERIFICATION
======================================================================

[STEP 0] Seeding whatsss_db database to pristine baseline...
Development seeding completed successfully.
[STEP 0] Database seeded.

[STEP 1] Spawning Backend Server Process 1...
[STEP 1] Server Process 1 spawned with PID: 3276
[STEP 1] Server Process 1 is listening and responsive on http://localhost:5000

[STEP 2] Authenticating as user_demo on Process 1...
[STEP 2] Authenticated successfully. Auth Cookie: token=eyJhbGciOiJIUzI1NiI...

[STEP 3] Fetching accounts for user_demo...
Checking Bank ID: 58a82b98-c99a-4531-b495-ff8b51528158
Visa Credit Card ID: 9877f2fc-714e-4149-903e-1ac01249146e
Salary ID: 9fe7f8fc-381f-4f53-9a48-07cecc28ab7b
Dining ID: 1d711df0-a3ee-4c36-880c-bab07909372b
Grocery ID: 9ef72109-f65d-4f3c-bd0a-516a677fe011

[STEP 4] Executing Golden Domain Journey on Server Process 1:
  4.1 PATCH /api/accounts/:id/opening-balance (10,000.00 THB)...
      -> Success. Checking Bank opening balance set to 10,000.00 THB
  4.2 POST /api/transactions/income (20,000.00 THB Salary)...
      -> Success. Recorded 20,000.00 THB Salary Income
  4.3 POST /api/transactions/expense (3,000.00 THB Split Dining/Grocery)...
      -> Success. Recorded 3,000.00 THB CC Split Purchase
  4.4 POST /api/transactions/repayment (3,000.00 THB Full Repayment)...
      -> Success. Recorded 3,000.00 THB CC Repayment

[STEP 5] Querying Pre-Restart State from Server Process 1 (PID: 3276)...
--- PRE-RESTART METRICS (Process 1, PID: 3276) ---
Bank Balance:     27000 THB (Expected: 27000.00)
Credit Card Debt: 0 THB (Expected: 0.00)
Total Income:     20000 THB (Expected: 20000.00)
Total Expense:    3000 THB (Expected: 3000.00)
Dining:           1000 THB (Expected: 1000.00)
Grocery:          2000 THB (Expected: 2000.00)
Transactions:     3 (Expected: 3)
Allocation Lines: 4 (Expected: 4)

[STEP 6] Capturing Pre-Restart Screenshots via Puppeteer...
Captured: screenshots/restart_01_dashboard_pre.png
Captured: screenshots/restart_02_history_pre.png

[STEP 7] Stopping Backend Server Process 1 (PID: 3276)...
[STEP 7] Verified Server Process 1 is terminated. Port 5000 down: true

[STEP 8] Spawning Backend Server Process 2 (WITHOUT touching or re-seeding database)...
[STEP 8] Server Process 2 spawned with NEW PID: 14784 (Different PID verified: true)
[STEP 8] Server Process 2 is up and listening on http://localhost:5000

[STEP 9] Querying Post-Restart State from Server Process 2 (PID: 14784)...
--- POST-RESTART METRICS (Process 2, PID: 14784) ---
Bank Balance:     27000 THB (Expected: 27000.00)
Credit Card Debt: 0 THB (Expected: 0.00)
Total Income:     20000 THB (Expected: 20000.00)
Total Expense:    3000 THB (Expected: 3000.00)
Dining:           1000 THB (Expected: 1000.00)
Grocery:          2000 THB (Expected: 2000.00)
Transactions:     3 (Expected: 3)
Allocation Lines: 4 (Expected: 4)

[STEP 10] Capturing Post-Restart Screenshots via Puppeteer...
Captured: screenshots/restart_03_dashboard_post.png
Captured: screenshots/restart_04_history_post.png

[CLEANUP] Process 2 (PID: 14784) closed cleanly.

======================================================================
                  VERIFICATION COMPARISON MATRIX                      
======================================================================
Metric                     | Pre-Restart (P1:3276) | Post-Restart (P2:14784) | Match?
---------------------------|-----------------------|------------------------|-------
Bank Balance (THB)         | 27000                 | 27000                  | PASS
Credit Debt (THB)          | 0                     | 0                      | PASS
Total Income (THB)         | 20000                 | 20000                  | PASS
Total Expense (THB)        | 3000                  | 3000                   | PASS
Dining Breakdown (THB)     | 1000                  | 1000                   | PASS
Grocery Breakdown (THB)    | 2000                  | 2000                   | PASS
Transactions Count         | 3                     | 3                      | PASS
Allocation Lines Count     | 4                     | 4                      | PASS
---------------------------|-----------------------|------------------------|-------

>>> RESULT: SUCCESS! REAL SERVER PROCESS RESTART PERSISTENCE CONFIRMED! <<<
```

#### Pre- vs Post-Restart Visual Evidence

| Metric / Screen | Pre-Restart State (Process 1, PID: 3276) | Post-Restart State (Process 2, PID: 14784) | Result |
|---|---|---|:---:|
| **Financial Dashboard** | ![Pre-Restart Dashboard](screenshots/restart_01_dashboard_pre.png) | ![Post-Restart Dashboard](screenshots/restart_03_dashboard_post.png) | **IDENTICAL (Bank 27k, Debt 0, Income 20k, Expense 3k, Dining 1k, Grocery 2k)** |
| **Transaction History** | ![Pre-Restart History](screenshots/restart_02_history_pre.png) | ![Post-Restart History](screenshots/restart_04_history_post.png) | **IDENTICAL (3 Transactions, 4 Allocation Lines)** |

