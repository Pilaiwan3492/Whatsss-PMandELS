# Sprint 1 Issue Backlog & Work Breakdown

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Project:** Whatsss — Personal Finance Management Web Application (Theme 7)  
> **Milestone:** Project Deliverable 1  
> **Status:** Authoritative Baseline  

---

## 1. Overview & Pair Work Protocol

Sprint 1 development is organized into 6 consolidated, vertical engineering issues. In accordance with course guidelines:
* Both students actively participate across design, implementation, automated testing, and peer review.
* Authors do not approve their own Pull Requests.
* Development follows a sequential batch model:
  * **Batch 1 (Issues #1 to #3):** Implemented consecutively by **Pilaiwan Churdchu**; reviewed and approved by **Aphichaya Klinhual**.
  * **Batch 2 (Issues #4 to #6):** Implemented consecutively by **Aphichaya Klinhual**; reviewed and approved by **Pilaiwan Churdchu**.
* All feature branches branch from and merge into `sprint-1` staging via reviewed pull requests.

---

## 2. Issue Specifications & Descriptions

### Issue #1: User Authentication, Authorization & Security Boundaries
* **Issue Title:** `feat(auth): User Authentication, Authorization & Security Boundaries`
* **Assignee:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Reviewer:** Aphichaya Klinhual (`@Aphichaya`)
* **Linked Features:** `F-01` (Authentication & Session), `F-02` (Authorization & Privacy)
* **Linked Requirements:** `FR-01`, `FR-02`, `FR-03`, `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-01`, `NFR-SEC-02`
* **Target Branch:** `feat/auth-session-security`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As a user or platform administrator, I want to authenticate securely and have the backend enforce strict data isolation and role boundaries, so that personal financial data remains private and unauthorized requests are rejected.

#### Implementation Tasks
- [ ] Initialize Express and TypeScript application structure with configuration loader.
- [ ] Implement `User` model in Prisma schema (`id`, `username`, `email`, `password_hash`, `role`, `is_active`).
- [ ] Implement `POST /api/auth/login` with bcrypt password verification and JWT token issuance.
- [ ] Implement `GET /api/auth/me` returning current user profile and role.
- [ ] Implement `POST /api/auth/logout` clearing session context.
- [ ] Implement `AuthGuard` middleware rejecting unauthenticated requests with HTTP 401 (`BR-09`).
- [ ] Implement `RoleGuard` middleware rejecting ADMIN access to financial routes with HTTP 403 (`BR-10`).
- [ ] Implement tenant scoping ensuring user requests access only own records (`BR-01`).
- [ ] Implement `GET /api/admin/users` providing user directory inspection for ADMIN (`FR-03`).
- [ ] Implement automated integration tests (`TEST-AUTH-01..04`, `TEST-SEC-01..03`, `TEST-ADMIN-01`).

#### Acceptance Criteria Checklist
- [ ] `AC-01-1`: Valid credentials return 200 OK with session token (`TEST-AUTH-01`).
- [ ] `AC-01-2`: Invalid credentials return 401 Unauthorized (`TEST-AUTH-02`).
- [ ] `AC-01-3`: `GET /api/auth/me` returns verified identity and role (`TEST-AUTH-03`).
- [ ] `AC-01-4`: Passwords stored as salted one-way hashes (`TEST-AUTH-04`, `NFR-SEC-01`).
- [ ] `AC-02-1`: Missing/invalid token returns 401 Unauthorized (`TEST-SEC-02`, `BR-09`).
- [ ] `AC-02-2`: ADMIN calling financial endpoints returns 403 Forbidden with zero data leak (`TEST-SEC-03`, `BR-10`).
- [ ] `AC-02-3`: ADMIN calling `/api/admin/users` receives user directory (`TEST-ADMIN-01`, `FR-03`).

---

### Issue #2: Financial Account Model, Seed Environment & Opening Balance
* **Issue Title:** `feat(account): Financial Account Model, Seed Environment & Opening Balance`
* **Assignee:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Reviewer:** Aphichaya Klinhual (`@Aphichaya`)
* **Linked Features:** `F-03` (Opening Balance)
* **Linked Requirements:** `FR-05`, `BR-02`, `NFR-DATA-01`
* **Target Branch:** `feat/account-opening-balance`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to access my pre-seeded financial accounts and set an initial opening balance on my bank account before recording transactions, so that my starting cash position is accurately established without being counted as income.

#### Implementation Tasks
- [ ] Implement `Account` model in Prisma schema (`id`, `user_id`, `name`, `type`, `opening_balance`, `is_opening_locked`).
- [ ] Implement seed script (`server/prisma/seed.ts`) populating `user_demo`, `user_other`, `admin_demo`, and the 5 accounts for each user (`Checking Bank`, `Visa Credit Card`, `Salary`, `Dining`, `Grocery`).
- [ ] Implement `GET /api/accounts` returning accounts belonging to the authenticated user.
- [ ] Implement `PATCH /api/accounts/:id/opening-balance` to set opening balance on eligible unlocked accounts.
- [ ] Enforce opening balance immutability locking once transactions reference the account.
- [ ] Implement automated integration tests (`TEST-OPEN-01..02`, `TEST-SEC-01`).

#### Acceptance Criteria Checklist
- [ ] `AC-03-1`: Setting opening balance of 10000.00 THB returns 200 OK and updates balance (`TEST-OPEN-01`).
- [ ] `AC-03-2`: Negative opening balance rejected with 400 Bad Request.
- [ ] `AC-03-1`: Opening balance verified excluded from income and expense summaries (`TEST-OPEN-02`, `BR-02`).
- [ ] `AC-02-4`: Accessing another user's account returns 404 Not Found (`TEST-SEC-01`, `BR-01`).

---

### Issue #3: Income Transaction Processing (Salary Inflow)
* **Issue Title:** `feat(transaction): Income Transaction Processing (Salary Inflow)`
* **Assignee:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Reviewer:** Aphichaya Klinhual (`@Aphichaya`)
* **Linked Features:** `F-04` (Income Transaction)
* **Linked Requirements:** `FR-06`, `BR-03`, `NFR-DATA-01`
* **Target Branch:** `feat/income-transaction`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to record my received salary into my bank account with a transaction date, so that my cash balance and income summary increase accordingly.

#### Implementation Tasks
- [ ] Implement `Transaction` and `AllocationLine` models in Prisma schema.
- [ ] Implement `POST /api/transactions/income` endpoint accepting destination cash account, amount, date, and income category account.
- [ ] Enforce database transaction wrapping transaction insertion, allocation line insertion, and opening balance lock.
- [ ] Verify cash account balance increases by the received amount (`BR-03`).
- [ ] Implement automated integration tests (`TEST-INC-01`).

#### Acceptance Criteria Checklist
- [ ] `AC-04-1`: Recording salary of 20000.00 THB on date 2026-11-06 returns 201 Created (`TEST-INC-01`).
- [ ] Bank balance increases from 10000.00 THB to 30000.00 THB.
- [ ] Income summary reflects 20000.00 THB.
- [ ] `AC-04-2`: Invalid dates or non-positive amounts rejected with 400 Bad Request.

---

### Issue #4: Credit Card Purchase & Split Allocation Engine
* **Issue Title:** `feat(transaction): Credit Card Purchase & Split Allocation Engine`
* **Assignee:** Aphichaya Klinhual (`@Aphichaya`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Linked Features:** `F-05` (Credit Card Purchase), `F-06` (Multiple Allocations)
* **Linked Requirements:** `FR-07`, `FR-08`, `BR-04`, `BR-05`, `BR-06`, `NFR-DATA-01`
* **Target Branch:** `feat/credit-purchase-split-allocation`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to record an expense charged to my credit card and split the amount into Dining and Grocery allocations, so that my debt increases and my expense breakdown is mathematically balanced.

#### Implementation Tasks
- [ ] Implement `POST /api/transactions/expense` endpoint accepting credit card primary account, total amount, date, and allocation lines.
- [ ] Implement split allocation validation engine: verify that sum of allocation lines strictly equals total amount (`BR-05`, `BR-06`).
- [ ] Reject unbalanced allocation submissions with HTTP 422 Unprocessable Entity (`ALLOCATION_SUM_MISMATCH`).
- [ ] Increase credit card debt balance upon successful transaction creation (`BR-04`).
- [ ] Implement unit and integration tests (`TEST-EXP-01`, `TEST-ALLOC-01..02`) including TDD evidence for allocation validation.

#### Acceptance Criteria Checklist
- [ ] `AC-05-1`: Recording credit purchase of 3000.00 THB returns 201 Created and increases debt (`TEST-EXP-01`).
- [ ] `AC-06-1`: Split allocation with Dining 1000.00 + Grocery 2000.00 = 3000.00 THB persists successfully (`TEST-ALLOC-01`).
- [ ] `AC-06-2`: Unbalanced allocation sum rejected with 422 Unprocessable Entity (`TEST-ALLOC-02`, `BR-06`).

---

### Issue #5: Credit Card Debt Settlement (Repayment)
* **Issue Title:** `feat(transaction): Credit Card Debt Settlement (Repayment)`
* **Assignee:** Aphichaya Klinhual (`@Aphichaya`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Linked Features:** `F-07` (Credit Card Repayment)
* **Linked Requirements:** `FR-09`, `BR-07`, `BR-08`, `NFR-DATA-01`
* **Target Branch:** `feat/credit-card-repayment`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to record repayment of my credit card debt from my bank account, so that both my bank balance and credit debt decrease equally without recording a duplicate expense.

#### Implementation Tasks
- [ ] Implement `POST /api/transactions/repayment` endpoint accepting funding cash account, destination loan taken account, amount, and date.
- [ ] Enforce atomic update decreasing cash balance and decreasing debt balance by identical amount (`BR-07`).
- [ ] Ensure repayment transactions are classified as debt settlement and excluded from expense summaries (`BR-08`).
- [ ] Implement automated integration tests (`TEST-REPAY-01..02`).

#### Acceptance Criteria Checklist
- [ ] `AC-07-1`: Repayment of 3000.00 THB returns 201 Created (`TEST-REPAY-01`).
- [ ] Bank balance decreases from 30000.00 THB to 27000.00 THB.
- [ ] Credit card debt decreases from 3000.00 THB to 0.00 THB.
- [ ] `AC-07-2`: Expense summary verified unchanged at 3000.00 THB (`TEST-REPAY-02`, `BR-08`).

---

### Issue #6: Financial Summaries, Transaction History & Golden Journey UI
* **Issue Title:** `feat(report): Financial Summaries, Transaction History & Golden Journey UI`
* **Assignee:** Aphichaya Klinhual (`@Aphichaya`)
* **Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)
* **Linked Features:** `F-08` (Balance & Summary), `F-09` (Transaction History)
* **Linked Requirements:** `FR-10`, `FR-11`, `NFR-DATA-01`, All Sprint 1 ACs
* **Target Branch:** `feat/summaries-history-e2e`
* **Target Merge Branch:** `sprint-1`

#### Description & User Story
As an authenticated user, I want to view my real-time balances, income/expense summaries, and complete transaction history through a clean web interface, so that I can verify my financial state across the complete Golden Domain Journey.

#### Implementation Tasks
- [ ] Implement `GET /api/reports/summary` returning computed cash balance, credit debt, total income, and total expense (`FR-10`).
- [ ] Implement `GET /api/transactions` returning chronological transaction history with nested allocation lines (`FR-11`).
- [ ] Implement frontend client slice in `client/` (React + Vite + Bootstrap):
  - Login view supporting session storage.
  - Dashboard displaying real-time balance cards (Bank: 27000, Debt: 0, Income: 20000, Expense: 3000).
  - Transaction submission forms for Opening Balance, Salary, Split Expense, and Repayment.
  - Transaction history table displaying recorded entries.
- [ ] Implement E2E / Golden Journey integration test verifying complete sequential workflow (`TEST-E2E-01`).
- [ ] Implement persistence test asserting exact data retrieval after database reconnect (`TEST-PERSIST-01`, `NFR-DATA-01`).

#### Acceptance Criteria Checklist
- [ ] `AC-08-1`: Summary endpoint returns Bank 27000.00, Debt 0.00, Income 20000.00, Expense 3000.00 (`TEST-BAL-01`).
- [ ] `AC-09-1`: Transaction history returns all 3 recorded transactions with allocation breakdown (`TEST-HIST-01`).
- [ ] `AC-09-2`: Records persist accurately across connection restarts (`TEST-PERSIST-01`, `NFR-DATA-01`).
- [ ] `TEST-E2E-01`: End-to-end Golden Domain Journey executes successfully.
