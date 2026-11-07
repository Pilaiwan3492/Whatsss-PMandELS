# Sprint 1 Work Packages & Implementation Backlog

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Project:** Whatsss — Personal Finance Management Web Application (Theme 7)  
> **Milestone:** Project Deliverable 1  
> **Status:** Authoritative Baseline  

---

## 1. Overview & Pair Work Protocol

Sprint 1 development is organized into 6 consolidated, vertical engineering work packages. In accordance with course guidelines:
* Both students actively participate across design, implementation, automated testing, and peer review.
* Authors do not approve their own Pull Requests.
* Development follows a sequential batch model:
  * **Batch 1 (Work Packages 1 to 3):** Implemented consecutively by **Pilaiwan Churdchu**; reviewed and approved by **Aphichaya Klinhual**.
  * **Batch 2 (Work Packages 4 to 6):** Implemented consecutively by **Aphichaya Klinhual**; reviewed and approved by **Pilaiwan Churdchu**.
* All feature branches branch from and merge into `sprint-1` staging via reviewed pull requests. Implementation tasks are tracked under sequential GitHub Issues [#2](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/2) through [#7](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/7).

---

## 2. Work Package Specifications

### Work Package 1: User Authentication, Authorization & Security Boundaries
* **Work Package ID:** `WP-01`
* **Target Issue:** [GitHub Issue #2](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/2)
* **Target Issue Title:** `feat(auth): User Authentication, Authorization & Security Boundaries`
* **Assignee:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Reviewer:** Aphichaya Klinhual (`@Apichaya251400`)
* **Linked Features:** `F-01` (Authentication & Session), `F-02` (Authorization & Privacy)
* **Linked Requirements:** `FR-01`, `FR-02`, `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-01`, `NFR-SEC-02`
* **Target Branch:** `feat/auth-session-security`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As a user or platform administrator, I want to authenticate securely and have the backend enforce strict data isolation and role boundaries, so that personal financial data remains private and unauthorized requests are rejected.

#### Implementation Tasks
- [x] Initialize Express and TypeScript application structure with configuration loader.
- [x] Implement `User` model in Prisma schema (`id`, `username`, `email`, `password_hash`, `role`, `is_active`).
- [x] Implement `POST /api/auth/login` with bcrypt password verification and signed JWT set in an HttpOnly, SameSite=Lax cookie with conditional Secure flag in production (no token in body).
- [x] Implement `GET /api/auth/me` returning current user profile and role from cookie credentials.
- [x] Implement `POST /api/auth/logout` clearing session cookie with matching attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, and conditional `Secure` in production) and `Max-Age=0`.
- [x] Implement `AuthGuard` middleware rejecting unauthenticated requests with HTTP 401 (`BR-09`).
- [x] Implement `RoleGuard` middleware rejecting ADMIN access to financial routes with HTTP 403 (`BR-10`).
- [x] Implement tenant scoping ensuring user requests access only own records (`BR-01`).
- [x] Implement CSRF Origin/Referer validation middleware rejecting untrusted origins with HTTP 403 (`CSRF_ORIGIN_REJECTED`) on state-changing requests (`TEST-SEC-04`).
- [x] Configure and verify CORS preflight (`OPTIONS`) handling ensuring preflights terminate before CSRF and auth without executing business operations (`TEST-SEC-05`).
- [x] Implement conditional `RequireJsonContentType` middleware and malformed JSON error handling returning HTTP 400 (`INVALID_CONTENT_TYPE`, `INVALID_JSON_BODY`) while preserving bodyless logout compatibility (`TEST-SEC-06`).
- [x] Implement automated integration tests (`TEST-AUTH-01..05`, `TEST-SEC-01..06`).

#### Acceptance Criteria Checklist
- [x] `AC-01-1`: Valid credentials return 200 OK with user profile and set HttpOnly session cookie (`TEST-AUTH-01`).
- [x] `AC-01-2`: Invalid credentials return 401 Unauthorized (`TEST-AUTH-02`).
- [x] `AC-01-3`: `GET /api/auth/me` returns verified identity and role (`TEST-AUTH-03`).
- [x] `AC-01-4`: Passwords stored as salted one-way hashes (`TEST-AUTH-04`, `NFR-SEC-01`).
- [x] `AC-01-5`: Calling logout clears cookie and subsequent protected call returns 401 (`TEST-AUTH-05`, `FR-01`).
- [x] `AC-02-1`: Missing/invalid cookie returns 401 Unauthorized (`TEST-SEC-02`, `BR-09`).
- [x] `AC-02-2`: ADMIN calling financial endpoints returns 403 Forbidden with zero data leak (`TEST-SEC-03`, `BR-10`).
- [x] `AC-02-3`: Accessing another user's financial record returns 404 Not Found (`TEST-SEC-01`, `BR-01`).
- [x] `AC-02-4`: Origin/Referer validation rejects untrusted origins with HTTP 403 (`CSRF_ORIGIN_REJECTED`) on state-changing requests (`TEST-SEC-04`).

---

### Work Package 2: Financial Account Model, Seed Environment & Opening Balance
* **Work Package ID:** `WP-02`
* **Target Issue:** [GitHub Issue #3](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/3)
* **Target Issue Title:** `feat(account): Financial Account Model, Seed Environment & Opening Balance`
* **Assignee:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Reviewer:** Aphichaya Klinhual (`@Apichaya251400`)
* **Linked Features:** `F-03` (Opening Balance)
* **Linked Requirements:** `FR-05`, `BR-02`, `NFR-DATA-01`
* **Target Branch:** `feat/account-opening-balance`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to access my pre-seeded financial accounts and set an initial opening balance on my bank account before recording transactions, so that my starting cash position is accurately established without being counted as income.

#### Implementation Tasks
- [x] Implement `Account` model in Prisma schema (`id`, `user_id`, `name`, `type`, `opening_balance`, `is_opening_locked` default `false`).
- [x] Implement seed script (`server/prisma/seed.ts`) populating `user_demo`, `user_other`, `admin_demo`, and the 5 accounts for each user (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`).
- [x] Implement `GET /api/accounts` returning accounts belonging to the authenticated user.
- [x] Implement `PATCH /api/accounts/:id/opening-balance` to set opening balance on eligible unlocked accounts (`opening_balance >= 0.00`, max 2 decimals).
- [x] Enforce opening balance locking rules:
  1. Account initializes with `is_opening_locked = false`.
  2. User can update opening balance only before the first referencing transaction commits.
  3. Locking executes atomically within the same database transaction (`prisma.$transaction`).
  4. If transaction fails or rolls back, account is not locked.
  5. Once locked, any subsequent opening balance update returns HTTP 422 (`OPENING_BALANCE_LOCKED`).
- [x] Implement atomic account lock service (`accountLock.service.ts` with batch validation, ID deduplication, and atomic abort).
- [x] Verify lock service commit/rollback at service-level against live PostgreSQL (`TEST-OPEN-04`).
- [x] Integrate lock service into actual transaction creation workflow in WP-03.
- [x] Verify transaction-triggered locking end-to-end in WP-03 (`TEST-OPEN-04`).
- [x] Implement automated integration tests (`TEST-OPEN-01..04`, `TEST-SEC-01`).

#### Acceptance Criteria Checklist
- [x] `AC-03-1`: Setting opening balance of 10000.00 THB returns 200 OK and updates balance (`TEST-OPEN-01`).
- [x] `AC-03-2`: Negative, non-numeric, or invalid decimal balance (e.g., `100.123`) rejected with 400 Bad Request (`INVALID_OPENING_BALANCE`) (`TEST-OPEN-03`).
- [x] `AC-03-3`: Opening balance locked once first referencing transaction is committed; subsequent update returns 422 Unprocessable Entity (`OPENING_BALANCE_LOCKED`) (`TEST-OPEN-04`).  
  *(Boundary Note: In WP-02, the atomic lock service `accountLock.service.ts` was implemented and service-verified. In WP-03, it is integrated into `POST /api/transactions/income` inside the atomic `prisma.$transaction`, locking the destination Cash account permanently upon commit).*
- [x] `AC-03-4`: Opening balance verified excluded from income and expense summaries (`TEST-OPEN-02`, `BR-02`).

---

### Work Package 3: Income Transaction Processing (Salary Inflow)
* **Work Package ID:** `WP-03`
* **Target Issue:** [GitHub Issue #4](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/4)
* **Target Issue Title:** `feat(transaction): Income Transaction Processing (Salary Inflow)`
* **Assignee:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Reviewer:** Aphichaya Klinhual (`@Apichaya251400`)
* **Linked Features:** `F-04` (Income Transaction)
* **Linked Requirements:** `FR-06`, `BR-03`, `NFR-DATA-01`
* **Target Branch:** `feat/income-transaction`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to record my received salary into my bank account with a transaction date, so that my cash balance and income summary increase accordingly.

#### Implementation Tasks
- [x] Implement `Transaction` and `AllocationLine` models in Prisma schema (`TransactionForm` enum, foreign keys, indexes).
- [x] Implement `POST /api/transactions/income` endpoint accepting destination cash account, amount, date, and income category account.
- [x] Enforce database transaction wrapping transaction insertion (Transaction 1 of Golden Journey), 1 allocation line targeting `Salary`, and atomic opening balance lock.
- [x] Verify cash account balance increases by the received amount (`BR-03`).
- [x] Implement frontend `IncomeForm` component and API client integration (`client/src/components/IncomeForm.tsx`).
- [x] Implement automated integration and unit tests (`TEST-INC-01..02`, `TEST-OPEN-04`, `TEST-SEC-01`, `TEST-SEC-03`, `TEST-INC-DECIMAL`, `TEST-INC-ATOM`, `TEST-INC-CONCURRENT`, `TEST-UI-INC`).

#### Acceptance Criteria Checklist
- [x] `AC-04-1`: Recording salary of 20000.00 THB on date 2026-11-06 returns 201 Created (`TEST-INC-01`).
- [x] Bank balance increases from 10000.00 THB to 30000.00 THB.
- [x] Income summary reflects 20000.00 THB.
- [x] `AC-04-2`: Invalid dates or non-positive amounts rejected with 400 Bad Request (`TEST-INC-02`).

---

### Work Package 4: Credit Card Purchase & Split Allocation Engine
* **Work Package ID:** `WP-04`
* **Target Issue:** [GitHub Issue #5](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/5)
* **Target Issue Title:** `feat(transaction): Credit Card Purchase & Split Allocation Engine`
* **Assignee:** Aphichaya Klinhual (`@Apichaya251400`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Linked Features:** `F-05` (Credit Card Purchase), `F-06` (Multiple Allocations)
* **Linked Requirements:** `FR-07`, `FR-08`, `BR-04`, `BR-05`, `BR-06`, `NFR-DATA-01`
* **Target Branch:** `feat/credit-purchase-split-allocation`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to record an expense charged to my credit card and split the amount into Dining and Grocery allocations, so that my debt increases and my expense breakdown is mathematically balanced.

#### Implementation Tasks
- [x] Implement `POST /api/transactions/expense` endpoint accepting credit card primary account, total amount, date, and allocation lines.
- [x] Implement split allocation validation engine: verify that sum of allocation lines strictly equals total amount (`BR-05`, `BR-06`).
- [x] Reject unbalanced allocation submissions with HTTP 422 Unprocessable Entity (`ALLOCATION_SUM_MISMATCH`).
- [x] Record purchase transaction (Transaction 2 of Golden Journey) with 2 allocation lines (Dining 1000.00, Grocery 2000.00) and increase credit card debt balance (`BR-04`).
- [x] Implement unit and integration tests (`TEST-EXP-01..02`, `TEST-ALLOC-01..02`) including TDD evidence for allocation validation.

#### Acceptance Criteria Checklist
- [x] `AC-05-1`: Recording credit purchase of 3000.00 THB returns 201 Created and increases debt (`TEST-EXP-01`).
- [x] `AC-05-2`: Omitting credit card primary account ID returns 400 Bad Request (`TEST-EXP-02`).
- [x] `AC-05-3`: Submitting invalid, negative, non-numeric (1000abc), exponent (1e3), or excessive precision (>2 decimals) rejected with 400 Bad Request (`TEST-VAL-01`).
- [x] `AC-06-1`: Split allocation with Dining 1000.00 + Grocery 2000.00 = 3000.00 THB persists successfully with 2 allocation lines (`TEST-ALLOC-01`).
- [x] `AC-06-2`: Unbalanced allocation sum rejected with 422 Unprocessable Entity (`TEST-ALLOC-02`, `BR-06`).
- [x] `AC-06-3`: Submitting duplicate allocation categories rejected with 400 Bad Request (`TEST-ALLOC-03`).

---

### Work Package 5: Credit Card Debt Settlement (Repayment)
* **Work Package ID:** `WP-05`
* **Target Issue:** [GitHub Issue #6](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/6)
* **Target Issue Title:** `feat(transaction): Credit Card Debt Settlement (Repayment)`
* **Assignee:** Aphichaya Klinhual (`@Apichaya251400`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Linked Features:** `F-07` (Credit Card Repayment)
* **Linked Requirements:** `FR-09`, `BR-07`, `BR-08`, `NFR-DATA-01`
* **Target Branch:** `feat/credit-card-repayment`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to record repayment of my credit card debt from my bank account, so that both my bank balance and credit debt decrease equally without recording a duplicate expense.

#### Implementation Tasks
- [x] Implement `POST /api/transactions/repayment` endpoint accepting funding cash account, destination loan taken account, amount, and date.
- [x] Record transaction (Transaction 3 of Golden Journey) with 1 allocation line targeting the credit card account (`Loan Taken`).
- [x] Atomically decrease cash balance by 3000.00 and decrease debt balance by 3000.00 (`BR-07`).
- [x] Enforce repayment boundary validations: reject repayment amount exceeding outstanding debt with HTTP 422 (`REPAYMENT_EXCEEDS_DEBT`), reject insufficient funds with HTTP 422 (`INSUFFICIENT_FUNDS`), and reject non-positive amounts with HTTP 400 (`INVALID_AMOUNT`).
- [x] Ensure repayment allocation is classified under Loan Taken and excluded from expense summaries (`BR-08`).
- [x] Implement automated integration and boundary tests (`TEST-REPAY-01..06`).

#### Acceptance Criteria Checklist
- [x] `AC-07-1`: Repayment of 3000.00 THB returns 201 Created, creates 1 allocation line targeting Loan Taken, decreases bank balance to 27000.00, and decreases debt to 0.00 (`TEST-REPAY-01`).
- [x] `AC-07-2`: Expense summary verified unchanged at 3000.00 THB (`TEST-REPAY-02`, `BR-08`).
- [x] `AC-07-3`: Partial repayment strictly less than debt reduces debt proportionally (`TEST-REPAY-05`).
- [x] `AC-07-4`: Repayment amount strictly exceeding outstanding debt returns 422 Unprocessable Entity (`TEST-REPAY-03`).
- [x] `AC-07-5`: Repayment amount exceeding available bank funds returns 422 Unprocessable Entity (`TEST-REPAY-04`).
- [x] `AC-07-6`: Non-positive repayment amount returns 400 Bad Request (`TEST-REPAY-06`).

---

### Work Package 6: Financial Summaries, Transaction History & Golden Journey UI
* **Work Package ID:** `WP-06`
* **Target Issue:** [GitHub Issue #7](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/7)
* **Target Issue Title:** `feat(report): Financial Summaries, Transaction History & Golden Journey UI`
* **Assignee:** Aphichaya Klinhual (`@Apichaya251400`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Linked Features:** `F-08` (Balance & Summary), `F-09` (Transaction History)
* **Linked Requirements:** `FR-10`, `FR-11`, `NFR-DATA-01`, All Sprint 1 ACs
* **Dependencies:** WP-01, WP-02, WP-03, WP-04, WP-05
* **Target Branch:** `feat/summaries-history-e2e`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to view my real-time balances, income/expense summaries, and complete transaction history through a clean web interface, so that I can verify my financial state across the complete Golden Domain Journey.

#### Implementation Tasks
- [ ] Implement `GET /api/reports/summary` returning computed cash balance, credit debt, total income, and total expense (`FR-10`).
- [ ] Implement `GET /api/transactions` returning chronological transaction history (verifying exactly 3 transactions and 4 allocation lines total) (`FR-11`).
- [ ] Implement frontend client slice in `client/` (React + Vite + Bootstrap):
  - Login view supporting authenticated HttpOnly cookie session (no localStorage token storage).
  - Dashboard displaying real-time balance cards (Bank: 27000, Debt: 0, Income: 20000, Expense: 3000).
  - Transaction submission forms for Opening Balance, Salary, Split Expense, and Repayment.
  - Transaction history table displaying recorded entries.
- [ ] Implement E2E / Golden Journey integration test verifying complete sequential workflow (`TEST-E2E-01`).
- [ ] Implement persistence test asserting exact data retrieval after stopping/restarting backend server process against persistent database (`TEST-PERSIST-01`, `NFR-DATA-01`).

#### Acceptance Criteria Checklist
- [ ] `AC-08-1`: Summary endpoint returns Bank 27000.00, Debt 0.00, Income 20000.00, Expense 3000.00 (`TEST-BAL-01`).
- [ ] `AC-09-1`: Transaction history returns exactly 3 recorded transactions with 4 allocation lines total (`TEST-HIST-01`).
- [ ] `AC-09-2`: Records persist accurately across backend server process restarts (`TEST-PERSIST-01`, `NFR-DATA-01`).
- [ ] `TEST-E2E-01`: End-to-end Golden Domain Journey executes successfully.
