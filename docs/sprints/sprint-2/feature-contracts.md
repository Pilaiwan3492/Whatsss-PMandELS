# Sprint 2 Feature Engineering Contracts (Deliverable 2 — Part B)
## Project: Whatsss — Personal Finance Management Web Application (Theme 7)

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Deliverable:** Project Deliverable 2 (Part B: Sprint 2 Contracts and Working Increment — 25 Points)  
> **Team:** Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)  
> **Work Package:** `WP-07` ([Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55))  
> **Status:** `v2.0-contract` — **Contracted Prior to Sprint 2 Code Implementation**

### Document Revision History
| Version | Status | Date | Scope / Reference | Summary |
|---|---|---|---|---|
| `v0.1.0-sprint1` | **Accepted & Frozen Baseline** | 2026-11-08 | PR #14 (`f84e7b16`) | Original Sprint 1 feature contracts (`F-01`..`F-09`). |
| `v1.1-contract` | **Approved & Merged (Lab 7 Amendment)** | 2026-11-25 | PR #51 (`c358630`) / PR #52 (`7700cba`) / PR #53 (`31597de`) / PR #54 (`9054b45`) | Added `BR-07 v1.1` repayment rules (`AC-07-7`..`AC-07-10`) and established the Sprint 2 `LOAN_TAKEN` subtype discriminator prerequisite. |
| `v2.0-contract` | **Sprint 2 Baseline Contracts (Pre-Implementation)** | 2026-11-26 | `WP-07` / [Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) | Complete engineering contracts for all 8 Sprint 2 features (`F-10`..`F-16`, `F-19`), including feature SDS, UI/API/data definitions, validation/error envelopes, permissions, numbered ACs, STS mappings, and Definition of Done. |

---

## 1. Overview & Architectural Layer Impact Summary

This document defines the binding engineering contracts for all **eight Sprint 2 features (`F-10` through `F-16`, and `F-19`)** allocated in `docs/features.md` and `docs/sprints/plan.md`. No Sprint 2 feature has been deferred to Sprint 3.

### 1.1 Cross-Layer Change Matrix (Explicit Statement of Changed vs. Unchanged Layers)
| Feature ID | Feature Name | Linked FR / BR / NFR | Database / Prisma Schema Layer | Backend API / Service Layer | Frontend UI Layer | Auth / CSRF / RoleGuard Middleware Layer |
|:---:|---|---|---|---|---|---|
| **`F-10`** | **Account Creation & Management** | `FR-12`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-SEC-02`, `NFR-DATA-01` | Adds `subtype` (`AccountSubtype`: `DEFAULT`, `CREDIT_CARD`, `GENERAL_LOAN`) and `is_archived` (`Boolean @default(false)`) to `Account`. | Adds `POST /api/accounts` and `PATCH /api/accounts/:id` in `account.controller.ts` / `account.service.ts`. | Adds Create/Edit Account modal and subtype badges on `AccountListPage.tsx`. | **No change required:** Existing `authGuard` (`401`), `roleGuard` (`403` for `ADMIN`), and `csrfGuard` (`403`) already protect `/api/accounts/*`. |
| **`F-11`** | **Internal Cash Transfer** | `FR-13`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No additional table needed:** Uses existing `Transaction` (`form: PAYMENT_CHARGE`, `primary_account: CASH`) + 1 `AllocationLine` (`target_account: CASH`). | Adds `POST /api/transactions/transfer` (`transfer.service.ts`) and updates `balance.service.ts` to add incoming `CASH -> CASH` transfer allocations to destination `CASH` balance while excluding from income/expense (`BR-02`). | Adds Internal Cash Transfer modal on `AccountListPage.tsx` / `DashboardPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-12`** | **Loan Given & Recovery** | `FR-14`, `BR-01`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No additional table needed:** Uses `Transaction` + 1 `AllocationLine` between `CASH` and `LOAN_GIVEN`. | Adds `POST /api/transactions/loan-given` and `POST /api/transactions/loan-recovery` (`loan.service.ts`); updates `balance.service.ts` to compute `LOAN_GIVEN` receivable balance and exclude from income/expense (`BR-08`). | Adds Loan Given (Disburse & Recover) modal on `AccountListPage.tsx` / `DashboardPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-13`** | **General Loan Taken & Repayment** | `FR-15`, `BR-01`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | Uses `Account.subtype = 'GENERAL_LOAN'` (added in `WP-08`) to distinguish General Borrowing from Credit Cards (`subtype = 'CREDIT_CARD'`). | Adds `POST /api/transactions/loan-borrowing` and `POST /api/transactions/loan-repayment` (`loan.service.ts`); updates `repayment.service.ts` (`F-07`) to reject `GENERAL_LOAN` targets (`400 INVALID_ACCOUNT_TYPE`). | Adds General Borrowing & Repayment modal on `AccountListPage.tsx` / `DashboardPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-14`** | **Favorite & Duplicate Transactions** | `FR-16`, `FR-17`, `BR-01`, `BR-05`, `BR-06`, `BR-09`, `BR-10`, `NFR-DATA-01` | Adds `is_favorite` (`Boolean @default(false)`) to `Transaction`. | Adds `PATCH /api/transactions/:id/favorite` and `POST /api/transactions/:id/duplicate`. | Adds Favorite star toggle, Favorites filter tab, and Duplicate action button on `TransactionHistoryPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-15`** | **Transaction Search & Multi-Criteria Filtering** | `FR-18`, `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No schema change required:** Uses existing `transactions` and `allocation_lines` columns and indexes (`@@index([user_id, transaction_date])`). | Extends `GET /api/transactions` query parser and Prisma filter builder (`startDate`, `endDate`, `accountId`, `categoryId`, `form`, `type`, `favorite`, `q`). | Adds search bar, date-range inputs, account/category selectors, and clear-filter controls on `TransactionHistoryPage.tsx`. | **No change required:** Safe `GET` request protected by `authGuard` and `roleGuard`. |
| **`F-16`** | **Transaction Corrections** | `FR-19`, `BR-01`, `BR-06`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | Adds `updated_at` to `Transaction` and `TransactionAuditLog` table (`id`, `transaction_id`, `user_id`, `action`, `previous_snapshot`, `new_snapshot`, `created_at`). | Adds `PUT /api/transactions/:id` (and `PATCH /api/transactions/:id`) inside `prisma.$transaction` with row locking, balance/split re-validation, and audit log insertion. | Adds Edit/Correct Transaction modal on `TransactionHistoryPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-19`** | **Platform User Directory & Governance** | `FR-03`, `FR-04`, `BR-09`, `BR-10`, `NFR-SEC-02`, `NFR-DATA-01` | **No schema change required:** `User.is_active` (`Boolean @default(true)`) and `User.role` (`USER` \| `ADMIN`) already exist in `schema.prisma`. | Adds `GET /api/admin/users` and `PATCH /api/admin/users/:id/status` (`admin.controller.ts`), and enforces `user.is_active === true` in `auth.service.ts` / `authGuard.ts` (`403 ACCOUNT_DISABLED`). | Adds `/admin/users` (`AdminUserDirectoryPage.tsx`) accessible exclusively to `ADMIN`. | Updates `authGuard.ts` to verify `is_active === true` and adds `requireAdmin` guard (`403` for `USER`) on `/api/admin/*` while `roleGuard.ts` continues blocking `ADMIN` on financial routes (`BR-10`). |

---

## 2. Detailed Feature Engineering Contracts

---

### Feature F-10: Account Creation & Management (`WP-08` / [Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56))
* **Feature ID:** `F-10`
* **Linked Requirements:** `FR-12`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-SEC-02`, `NFR-DATA-01`
* **Primary Actor:** `USER` (`ADMIN` strictly barred per `BR-10`)
* **Preconditions:** Authenticated `USER` session (`HttpOnly` cookie `token`).
* **Feature SDS & Workflow:**
  1. Client submits `POST /api/accounts` with `{ name, type, subtype?, opening_balance? }`.
  2. Backend validates:
     * `name`: required non-empty string after trimming, 1–100 characters (`400 INVALID_ACCOUNT_NAME`).
     * `type`: must be one of `'CASH' | 'LOAN_TAKEN' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE'` (`400 INVALID_ACCOUNT_TYPE`).
     * `subtype`: optional; for `LOAN_TAKEN`, defaults to `'GENERAL_LOAN'` when created as a general loan or `'CREDIT_CARD'` when created as a credit card (`'DEFAULT'` for all other account types). Any invalid subtype or non-`LOAN_TAKEN` account specifying `'CREDIT_CARD'` / `'GENERAL_LOAN'` returns `400 INVALID_ACCOUNT_SUBTYPE`.
     * `opening_balance`: optional (defaults to `'0.00'`). Must be a non-negative decimal (`>= 0.00`, max 2 decimal places, `<= 9999999999.99`). For `INCOME` and `EXPENSE` category accounts, `opening_balance` must be `0.00` (`400 INVALID_OPENING_BALANCE`).
     * Uniqueness: checks `@@unique([user_id, name])` (case-insensitive trimmed match for `req.user.id`). If an account with the same name already exists for this user, reject with `409 DUPLICATE_ACCOUNT_NAME`.
  3. Backend creates the `Account` record with `is_opening_locked = false` and `is_archived = false`, returning `201 Created`.
  4. To rename an existing account, client submits `PATCH /api/accounts/:id` with `{ name }`. Backend verifies ownership (`404 NOT_FOUND` if not owned by `req.user.id`), checks duplicate name (`409 DUPLICATE_ACCOUNT_NAME`), updates `name`, and returns `200 OK`.
* **API Specification:**
  * `POST /api/accounts` $\rightarrow$ `201 Created` `{ "success": true, "data": { "account": { "id": "...", "name": "Savings Bank", "type": "CASH", "subtype": "DEFAULT", "opening_balance": "5000.00", "current_balance": 5000.00, "is_opening_locked": false, "is_archived": false } } }`
  * `PATCH /api/accounts/:id` $\rightarrow$ `200 OK` `{ "success": true, "data": { "account": { ... } } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_NAME`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_ACCOUNT_SUBTYPE`, `400 INVALID_OPENING_BALANCE`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `404 NOT_FOUND`, `409 DUPLICATE_ACCOUNT_NAME`.
* **Acceptance Criteria:**
  * `AC-10-1`: Authenticated `USER` can create custom accounts across all five account types (`CASH`, `LOAN_TAKEN` with `CREDIT_CARD` or `GENERAL_LOAN` subtype, `LOAN_GIVEN`, `INCOME`, `EXPENSE`) and retrieve them via `GET /api/accounts` (`TEST-ACC-01`, `TEST-ACC-02`).
  * `AC-10-2`: Creating or renaming an account to a name that already exists within the same user's ledger returns `409 Conflict` (`DUPLICATE_ACCOUNT_NAME`), while another user (`user_other`) can create an account with that same name independently (`TEST-ACC-03`, `BR-01`).
  * `AC-10-3`: Authenticated `USER` can rename their own account via `PATCH /api/accounts/:id`; attempting to update another user's account returns `404 Not Found` (`TEST-ACC-04`, `BR-01`); `ADMIN` requests return `403 Forbidden` (`BR-10`).

---

### Feature F-11: Internal Cash Transfer (`WP-08` / [Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56))
* **Feature ID:** `F-11`
* **Linked Requirements:** `FR-13`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns at least two active (`is_archived = false`) `CASH` accounts (e.g., `Checking Bank` and `Savings Bank`).
* **Feature SDS & Workflow:**
  1. Client submits `POST /api/transactions/transfer` with `{ from_account_id, to_account_id, amount, transaction_date, description? }`.
  2. Pre-transaction fast-fail checks:
     * Validate presence of `from_account_id` and `to_account_id` (`400 INVALID_ACCOUNT_ID`).
     * Reject identical source and destination (`from_account_id === to_account_id`) with `400 SAME_ACCOUNT_TRANSFER`.
     * Validate `amount` (`> 0.00`, max 2 decimals, no exponent notation $\rightarrow$ `400 INVALID_AMOUNT`), `transaction_date` (`YYYY-MM-DD` $\rightarrow$ `400 INVALID_TRANSACTION_DATE`), and `description` ($\le 255$ chars $\rightarrow$ `400 INVALID_DESCRIPTION`).
  3. Inside atomic `prisma.$transaction`:
     * Acquire sorted pessimistic row-level write locks (`acquireAccountRowLocks` / `SELECT ... FOR UPDATE`) on `[from_account_id, to_account_id]`.
     * Verify both accounts exist and belong to `req.user.id` (`404 NOT_FOUND` on missing or foreign account per `BR-01`), are not archived (`422 ACCOUNT_ARCHIVED`), and both have `type === 'CASH'` (`400 INVALID_ACCOUNT_TYPE`).
     * Compute authoritative `currentCashBalance` of `from_account_id` under lock (including opening balance, `RECEIVE_MONEY` inflows, incoming `CASH -> CASH` transfer allocations, minus `PAYMENT_CHARGE` outflows).
     * If `amount > currentCashBalance`, reject with `422 INSUFFICIENT_FUNDS`.
     * Atomically lock opening balances (`lockAccounts`) on both `from_account_id` and `to_account_id`.
     * Create 1 `Transaction` (`primary_account_id = from_account_id`, `form = 'PAYMENT_CHARGE'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = to_account_id`, `amount = amount`).
  4. **Accounting & Summary Invariant (`BR-02`):**
     * Source `CASH` account balance decreases by `amount`.
     * Destination `CASH` account balance increases by `amount` (computed via `AllocationLine` targeting `CASH` from a `PAYMENT_CHARGE` transaction).
     * Net total cash across all user `CASH` accounts is conserved ($\Delta \text{Total Cash} = 0.00$), and **`total_income` and `total_expense` remain completely unchanged (`BR-02`)**.
* **API Specification:**
  * `POST /api/transactions/transfer` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_from_cash_balance": "...", "updated_to_cash_balance": "..." } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_ID`, `400 SAME_ACCOUNT_TRANSFER`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `404 NOT_FOUND`, `422 INSUFFICIENT_FUNDS`, `422 ACCOUNT_ARCHIVED`.
* **Acceptance Criteria:**
  * `AC-11-1`: Valid transfer between two `CASH` accounts returns `201 Created`, decreases source `CASH` balance by `amount`, increases destination `CASH` balance by `amount`, and locks opening balances on both accounts (`TEST-XFER-01`).
  * `AC-11-2`: Internal cash transfer adds `0.00` to `total_income` and `0.00` to `total_expense` in `GET /api/reports/summary` (`TEST-XFER-02`, `BR-02`).
  * `AC-11-3`: Transferring to the same account (`400 SAME_ACCOUNT_TRANSFER`), transferring between non-`CASH` accounts (`400 INVALID_ACCOUNT_TYPE`), or transferring more than the source `CASH` balance (`422 INSUFFICIENT_FUNDS`) is rejected with zero database writes (`TEST-XFER-03`, `TEST-XFER-04`).
  * `AC-11-4`: Referencing another user's `CASH` account as `from_account_id` or `to_account_id` returns `404 Not Found` (`TEST-XFER-05`, `BR-01`).

---

### Feature F-12: Peer Lending — Loan Given & Recovery (`WP-09` / [Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57))
* **Feature ID:** `F-12`
* **Linked Requirements:** `FR-14`, `BR-01`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns a `CASH` account and a `LOAN_GIVEN` account.
* **Feature SDS & Workflow:**
  1. **Loan Given Disbursement (`POST /api/transactions/loan-given`):**
     * Input: `{ from_account_id, to_account_id, amount, transaction_date, description? }` where `from_account_id` is `CASH` and `to_account_id` is `LOAN_GIVEN`.
     * Inside atomic `prisma.$transaction` under sorted `SELECT ... FOR UPDATE` row locks:
       * Verify ownership (`404 NOT_FOUND`) and types (`fromAccount.type === 'CASH'` and `toAccount.type === 'LOAN_GIVEN'`, else `400 INVALID_ACCOUNT_TYPE`).
       * Compute authoritative `currentCashBalance` of `from_account_id`. If `amount > currentCashBalance`, reject with `422 INSUFFICIENT_FUNDS`.
       * Lock opening balances on both accounts, create 1 `Transaction` (`primary_account_id = from_account_id`, `form = 'PAYMENT_CHARGE'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = to_account_id`, `amount = amount`).
     * **Ledger Effect (`BR-08`):** `CASH` balance decreases by `amount`; `LOAN_GIVEN` receivable balance increases by `amount`; **`total_expense` is unchanged (`BR-08`)**.
  2. **Loan Given Recovery (`POST /api/transactions/loan-recovery`):**
     * Input: `{ from_account_id, to_account_id, amount, transaction_date, description? }` where `from_account_id` is the `LOAN_GIVEN` account being recovered and `to_account_id` is the receiving `CASH` account.
     * Inside atomic `prisma.$transaction` under sorted `SELECT ... FOR UPDATE` row locks:
       * Verify ownership (`404 NOT_FOUND`) and types (`fromAccount.type === 'LOAN_GIVEN'` and `toAccount.type === 'CASH'`, else `400 INVALID_ACCOUNT_TYPE`).
       * Compute authoritative outstanding receivable balance on `from_account_id`:
         $$\text{Current Receivable} = \text{opening\_balance} + \sum \text{Disbursements (PAYMENT\_CHARGE allocations to LOAN\_GIVEN)} - \sum \text{Recoveries (RECEIVE\_MONEY allocations to LOAN\_GIVEN)}$$
       * If `currentReceivable <= 0.00`, reject with `422 ZERO_OUTSTANDING_RECEIVABLE`.
       * If `amount > currentReceivable`, reject with `422 RECOVERY_EXCEEDS_RECEIVABLE`.
       * Lock opening balances on both accounts, create 1 `Transaction` (`primary_account_id = to_account_id`, `form = 'RECEIVE_MONEY'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = from_account_id`, `amount = amount`).
     * **Ledger Effect (`BR-08`):** `CASH` balance increases by `amount`; `LOAN_GIVEN` receivable balance decreases by `amount`; **`total_income` is unchanged (`BR-08`)**.
* **API Specification:**
  * `POST /api/transactions/loan-given` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_receivable": "..." } }`
  * `POST /api/transactions/loan-recovery` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_receivable": "..." } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_ID`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `404 NOT_FOUND`, `422 INSUFFICIENT_FUNDS`, `422 ZERO_OUTSTANDING_RECEIVABLE`, `422 RECOVERY_EXCEEDS_RECEIVABLE`.
* **Acceptance Criteria:**
  * `AC-12-1`: Disbursing a loan given (`POST /api/transactions/loan-given`) decreases source `CASH` balance and increases `LOAN_GIVEN` receivable balance by equal amounts without increasing `total_expense` (`TEST-LOAN-GIVEN-01`, `BR-08`).
  * `AC-12-2`: Recovering a loan given (`POST /api/transactions/loan-recovery`, partial or full) increases destination `CASH` balance and decreases `LOAN_GIVEN` receivable balance without increasing `total_income` (`TEST-LOAN-GIVEN-02`, `BR-08`).
  * `AC-12-3`: Disbursing more than available cash returns `422 INSUFFICIENT_FUNDS`; recovering more than the outstanding receivable returns `422 RECOVERY_EXCEEDS_RECEIVABLE` (or `422 ZERO_OUTSTANDING_RECEIVABLE` when receivable is `0.00`), leaving balances unchanged (`TEST-LOAN-GIVEN-03`).
  * `AC-12-4`: Cross-tenant account references return `404 Not Found` (`BR-01`) and `ADMIN` access returns `403 Forbidden` (`BR-10`) (`TEST-LOAN-GIVEN-04`).

---

### Feature F-13: General Borrowing — Loan Taken & Repayment (`WP-09` / [Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57))
* **Feature ID:** `F-13`
* **Linked Requirements:** `FR-15`, `BR-01`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns a `CASH` account and a general `LOAN_TAKEN` account with `subtype === 'GENERAL_LOAN'`.
* **Resolution of Lab 7 `BR-07 v1.1` Prerequisite (Credit Card vs. General Loan Taken):**
  * `Account` rows with `type === 'LOAN_TAKEN'` carry `subtype: 'CREDIT_CARD' | 'GENERAL_LOAN'`.
  * **Credit Card Debt Settlement (`F-07`, `POST /api/transactions/repayment`):** Enforces `toAccount.type === 'LOAN_TAKEN' && toAccount.subtype === 'CREDIT_CARD'`. Any attempt to submit a `GENERAL_LOAN` account to `/api/transactions/repayment` is rejected with `400 INVALID_ACCOUNT_TYPE`. Thus, the Lab 7 `500.00 THB` / `10%` minimum repayment floor and `100.00 THB` partial cash reserve apply **exclusively** to Credit Card repayments (`F-07`).
  * **General Borrowing & Principal Repayment (`F-13`, `POST /api/transactions/loan-borrowing` & `POST /api/transactions/loan-repayment`):** Requires `type === 'LOAN_TAKEN' && subtype === 'GENERAL_LOAN'` (rejecting `CREDIT_CARD` accounts with `400 INVALID_ACCOUNT_TYPE`). General loan principal repayments accept any positive decimal amount `0.00 < amount <= currentDebt` and `amount <= currentCashBalance` without imposing the credit-card minimum floor or `100.00 THB` reserve buffer.
* **Feature SDS & Workflow:**
  1. **Record Money Borrowed (`POST /api/transactions/loan-borrowing`):**
     * Input: `{ from_account_id, to_account_id, amount, transaction_date, description? }` where `from_account_id` is the `LOAN_TAKEN` (`subtype: 'GENERAL_LOAN'`) liability account and `to_account_id` is the destination `CASH` account receiving the borrowed proceeds.
     * Inside atomic `prisma.$transaction` under sorted `SELECT ... FOR UPDATE` row locks:
       * Verify ownership (`404 NOT_FOUND`) and types (`fromAccount.type === 'LOAN_TAKEN' && fromAccount.subtype === 'GENERAL_LOAN'` and `toAccount.type === 'CASH'`, else `400 INVALID_ACCOUNT_TYPE`).
       * Lock opening balances, create 1 `Transaction` (`primary_account_id = to_account_id`, `form = 'RECEIVE_MONEY'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = from_account_id`, `amount = amount`).
     * **Ledger Effect (`BR-08`):** `CASH` balance increases by `amount`; general `LOAN_TAKEN` debt increases by `amount`; **`total_income` is unchanged (`BR-08`)**.
  2. **Repay General Loan Principal (`POST /api/transactions/loan-repayment`):**
     * Input: `{ from_account_id, to_account_id, amount, transaction_date, description? }` where `from_account_id` is `CASH` and `to_account_id` is `LOAN_TAKEN` (`subtype: 'GENERAL_LOAN'`).
     * Inside atomic `prisma.$transaction` under sorted `SELECT ... FOR UPDATE` row locks:
       * Verify ownership (`404 NOT_FOUND`) and types (`fromAccount.type === 'CASH'` and `toAccount.type === 'LOAN_TAKEN' && toAccount.subtype === 'GENERAL_LOAN'`, else `400 INVALID_ACCOUNT_TYPE`).
       * Compute authoritative `currentCashBalance` and `currentDebt` under lock:
         $$\text{General Loan Debt} = \text{opening\_balance} + \sum \text{Borrowings (RECEIVE\_MONEY allocations to LOAN\_TAKEN)} + \sum \text{Direct Charges (PAYMENT\_CHARGE on LOAN\_TAKEN)} - \sum \text{Repayments (PAYMENT\_CHARGE allocations from CASH to LOAN\_TAKEN)}$$
       * Validate: if `currentDebt <= 0.00` $\rightarrow$ `422 ZERO_OUTSTANDING_DEBT`; if `amount > currentDebt` $\rightarrow$ `422 REPAYMENT_EXCEEDS_DEBT`; if `amount > currentCashBalance` $\rightarrow$ `422 INSUFFICIENT_FUNDS`.
       * Lock opening balances, create 1 `Transaction` (`primary_account_id = from_account_id`, `form = 'PAYMENT_CHARGE'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = to_account_id`, `amount = amount`).
     * **Ledger Effect (`BR-08`):** `CASH` balance decreases by `amount`; general `LOAN_TAKEN` debt decreases by `amount`; **`total_expense` is unchanged (`BR-08`)**.
* **API Specification:**
  * `POST /api/transactions/loan-borrowing` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_debt": "..." } }`
  * `POST /api/transactions/loan-repayment` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_debt": "..." } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_ID`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `404 NOT_FOUND`, `422 ZERO_OUTSTANDING_DEBT`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 INSUFFICIENT_FUNDS`.
* **Acceptance Criteria:**
  * `AC-13-1`: Recording money borrowed (`POST /api/transactions/loan-borrowing`) increases destination `CASH` balance and increases general `LOAN_TAKEN` liability balance by equal amounts without increasing `total_income` (`TEST-LOAN-TAKEN-01`, `BR-08`).
  * `AC-13-2`: Repaying general loan principal (`POST /api/transactions/loan-repayment`, including amounts `< 500.00 THB` or leaving `< 100.00 THB` cash) decreases `CASH` and decreases general `LOAN_TAKEN` liability without increasing `total_expense` (`TEST-LOAN-TAKEN-02`, `BR-08`).
  * `AC-13-3`: Repaying more than outstanding general loan debt (`422 REPAYMENT_EXCEEDS_DEBT`), repaying when debt is `0.00` (`422 ZERO_OUTSTANDING_DEBT`), or repaying more than available cash (`422 INSUFFICIENT_FUNDS`) is rejected with zero database writes (`TEST-LOAN-TAKEN-03`).
  * `AC-13-4`: Submitting a `GENERAL_LOAN` account to Credit Card Repayment `POST /api/transactions/repayment` (`F-07`), or submitting a `CREDIT_CARD` account to `POST /api/transactions/loan-repayment` (`F-13`), is rejected with `400 INVALID_ACCOUNT_TYPE` (`TEST-LOAN-TAKEN-04`, `BR-07 v1.1` scoping contract).

---

### Feature F-14: Favorite & Duplicate Transactions (`WP-10` / [Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58))
* **Feature ID:** `F-14`
* **Linked Requirements:** `FR-16`, `FR-17`, `BR-01`, `BR-05`, `BR-06`, `BR-07 v1.1`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` has at least one recorded transaction.
* **Feature SDS & Workflow:**
  1. **Mark / Unmark Favorite (`PATCH /api/transactions/:id/favorite`):**
     * Request body: `{ "is_favorite": true | false }` (must be boolean, else `400 INVALID_FAVORITE_FLAG`).
     * Backend verifies transaction `:id` belongs to `req.user.id` (`404 NOT_FOUND` on nonexistent or foreign transaction per `BR-01`).
     * Updates `is_favorite` and returns `200 OK` with the updated transaction including `is_favorite`.
  2. **Duplicate Transaction (`POST /api/transactions/:id/duplicate` & UI Pre-Fill):**
     * Request body: optional overrides `{ "transaction_date"?: "YYYY-MM-DD", "description"?: string }`. If `transaction_date` is omitted, defaults to the original transaction's `transaction_date` (or user-provided date in the UI modal).
     * Backend fetches source transaction `:id` scoped to `req.user.id` (`404 NOT_FOUND` if not owned by user).
     * Re-executes the authoritative domain creation rules inside an atomic `prisma.$transaction` under `SELECT ... FOR UPDATE` row locks on all referenced accounts (checking sufficient cash balance, credit card `BR-07 v1.1` rules if duplicating a credit card repayment, or receivable/debt bounds if duplicating a loan repayment/recovery), and creates a new `Transaction` and cloned `AllocationLine` rows.
* **API Specification:**
  * `PATCH /api/transactions/:id/favorite` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transaction": { "id": "...", "is_favorite": true, ... } } }`
  * `POST /api/transactions/:id/duplicate` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... } } }`
  * **Error Codes:** `400 INVALID_FAVORITE_FLAG`, `400 INVALID_TRANSACTION_DATE`, `404 NOT_FOUND`, `422 INSUFFICIENT_FUNDS`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 MIN_REPAYMENT_NOT_MET`, `422 MINIMUM_CASH_RESERVE_VIOLATION`.
* **Acceptance Criteria:**
  * `AC-14-1`: Authenticated `USER` can toggle `is_favorite` (`true`/`false`) on their own transaction via `PATCH /api/transactions/:id/favorite`, and the updated status persists in `GET /api/transactions` (`TEST-FAV-01`).
  * `AC-14-2`: Authenticated `USER` can duplicate an existing transaction (including multi-line split allocations) via `POST /api/transactions/:id/duplicate`, creating a distinct persisted transaction and updating account balances/summaries accordingly (`TEST-FAV-02`).
  * `AC-14-3`: Duplicating a transaction whose side effect would violate current balance boundaries (e.g., duplicating a repayment when remaining debt is now `0.00`) is rejected with `422`; toggling favorite or duplicating another user's transaction returns `404 Not Found` (`TEST-FAV-03`, `TEST-FAV-04`, `BR-01`).

---

### Feature F-15: Transaction Search & Multi-Criteria Filtering (`WP-10` / [Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58))
* **Feature ID:** `F-15`
* **Linked Requirements:** `FR-18`, `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` queries `GET /api/transactions`.
* **Feature SDS & Workflow:**
  1. Client sends `GET /api/transactions` with optional query parameters:
     * `startDate` (`YYYY-MM-DD`): filter `transaction_date >= startDate`.
     * `endDate` (`YYYY-MM-DD`): filter `transaction_date <= endDate`.
     * Validation: if `startDate` or `endDate` is not a valid calendar date, or if `startDate > endDate`, return `400 INVALID_DATE_RANGE`.
     * `accountId`: filter transactions where `primary_account_id === accountId` OR `allocation_lines.some(a => a.target_account_id === accountId)`.
     * `categoryId`: filter transactions where `allocation_lines.some(a => a.target_account_id === categoryId)`.
     * `form`: `'PAYMENT_CHARGE' | 'RECEIVE_MONEY'` (`400 INVALID_FILTER_PARAM` if invalid value).
     * `favorite`: `'true' | 'false'` (filters `is_favorite`).
     * `q`: trimmed search keyword matching `description` (`ILIKE %q%`) or any allocation line `notes` / target account `name` (`ILIKE %q%`).
  2. All queries are unconditionally scoped with `WHERE user_id = req.user.id` (`BR-01`) and ordered by `transaction_date DESC, created_at DESC`.
* **API Specification:**
  * `GET /api/transactions?startDate=2026-11-01&endDate=2026-11-30&accountId=...&categoryId=...&favorite=true&q=salary` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transactions": [ ... ] } }`
  * **Error Codes:** `400 INVALID_DATE_RANGE`, `400 INVALID_FILTER_PARAM`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`.
* **Acceptance Criteria:**
  * `AC-15-1`: Filtering `GET /api/transactions` by `startDate` and `endDate` returns only the authenticated user's transactions within the inclusive date range; `startDate > endDate` or malformed date strings return `400 INVALID_DATE_RANGE` (`TEST-SRCH-01`, `TEST-SRCH-02`).
  * `AC-15-2`: Filtering by `accountId`, `categoryId`, `form`, `favorite=true`, and keyword `q` (individually and combined) returns the exact matching subset of transactions (`TEST-SRCH-03`, `TEST-SRCH-04`).
  * `AC-15-3`: Search and filter results never include transactions belonging to another user even when passing another user's `accountId` or matching keyword (`TEST-SRCH-05`, `BR-01`).

---

### Feature F-16: Transaction Corrections (`WP-11` / [Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59))
* **Feature ID:** `F-16`
* **Linked Requirements:** `FR-19`, `BR-01`, `BR-05`, `BR-06`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns an existing recorded transaction `:id`.
* **Feature SDS & Workflow:**
  1. Client submits `PUT /api/transactions/:id` (or `PATCH /api/transactions/:id`) with `{ total_amount, transaction_date, description?, allocations: [{ target_account_id, amount, notes? }] }`.
  2. Pre-transaction input validation:
     * Validate `total_amount` (`> 0.00`, max 2 decimals $\rightarrow$ `400 INVALID_AMOUNT`), `transaction_date` (`YYYY-MM-DD` $\rightarrow$ `400 INVALID_TRANSACTION_DATE`), `description` ($\le 255$ chars), and `allocations` (non-empty array, each line `amount > 0.00` with max 2 decimals, no duplicate `target_account_id` $\rightarrow$ `400 DUPLICATE_ALLOCATION_ACCOUNT`).
     * Enforce `BR-06`: $\sum \text{allocations.amount} == \text{total\_amount}$, else reject with `422 ALLOCATION_SUM_MISMATCH`.
  3. Inside atomic `prisma.$transaction`:
     * Fetch existing transaction `:id` with its `allocation_lines` and `primary_account`. If not found or `user_id !== req.user.id`, reject with `404 NOT_FOUND` (`BR-01`).
     * Acquire sorted pessimistic row locks (`SELECT ... FOR UPDATE`) on the primary account and all old and new target accounts.
     * Verify all target accounts belong to `req.user.id` (`404 NOT_FOUND`) and match the allowed target account types of the transaction's domain workflow (`400 INVALID_ACCOUNT_TYPE`).
     * Apply the update (`UPDATE transactions`, replace `allocation_lines`), and recompute the resulting balances of affected `CASH`, `LOAN_TAKEN`, and `LOAN_GIVEN` accounts inside the transaction:
       * If any affected `CASH` account's resulting balance becomes `< 0.00`, abort and roll back with `422 INSUFFICIENT_FUNDS`.
       * If any affected `LOAN_TAKEN` debt or `LOAN_GIVEN` receivable becomes `< 0.00`, abort and roll back with `422 REPAYMENT_EXCEEDS_DEBT` / `422 RECOVERY_EXCEEDS_RECEIVABLE`.
       * If the transaction is a Credit Card Repayment (`F-07`), re-verify `BR-07 v1.1` minimum repayment floor (`422 MIN_REPAYMENT_NOT_MET`) and `100.00 THB` partial cash reserve (`422 MINIMUM_CASH_RESERVE_VIOLATION`) against the pre-repayment debt/cash state.
     * Insert an immutable `TransactionAuditLog` record capturing `previous_snapshot` and `new_snapshot` JSON payloads.
* **API Specification:**
  * `PUT /api/transactions/:id` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transaction": { ... } } }`
  * **Error Codes:** `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `400 DUPLICATE_ALLOCATION_ACCOUNT`, `400 INVALID_ACCOUNT_TYPE`, `404 NOT_FOUND`, `422 ALLOCATION_SUM_MISMATCH`, `422 INSUFFICIENT_FUNDS`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 MIN_REPAYMENT_NOT_MET`, `422 MINIMUM_CASH_RESERVE_VIOLATION`.
* **Acceptance Criteria:**
  * `AC-16-1`: Authenticated `USER` can update the amount, date, description, and split allocation breakdown of their own transaction, and `GET /api/reports/summary` immediately reflects the recalculated balances and income/expense totals (`TEST-CORR-01`, `TEST-CORR-02`).
  * `AC-16-2`: Submitting a correction with unbalanced allocation lines ($\sum \text{allocations} \ne \text{total\_amount}$) returns `422 ALLOCATION_SUM_MISMATCH` and rolls back completely (`TEST-CORR-03`, `BR-06`).
  * `AC-16-3`: Submitting a correction that would drive a `CASH` balance negative (`422 INSUFFICIENT_FUNDS`) or violate `BR-07 v1.1` / debt bounds rolls back with zero changes (`TEST-CORR-04`).
  * `AC-16-4`: Attempting to correct another user's transaction returns `404 Not Found` (`BR-01`), and `ADMIN` requests return `403 Forbidden` (`BR-10`) (`TEST-CORR-05`).

---

### Feature F-19: Platform User Directory & Access Governance (`WP-11` / [Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59))
* **Feature ID:** `F-19`
* **Linked Requirements:** `FR-03`, `FR-04`, `BR-09`, `BR-10`, `NFR-SEC-01`, `NFR-SEC-02`, `NFR-DATA-01`
* **Primary Actor:** `ADMIN` (`USER` strictly barred from `/api/admin/*`)
* **Preconditions:** Authenticated `ADMIN` session (`req.user.role === 'ADMIN'`).
* **Feature SDS & Workflow:**
  1. **List Platform User Directory (`GET /api/admin/users` — `FR-03`):**
     * Requires authenticated `ADMIN` role (`401 UNAUTHORIZED` if unauthenticated; `403 FORBIDDEN` with code `ADMIN_ONLY_ENDPOINT` if `req.user.role !== 'ADMIN'`).
     * Queries `users` table returning **strictly non-financial account governance fields**: `id`, `username`, `email`, `role`, `is_active`, `created_at`, `updated_at`.
     * **Strict Privacy Invariant (`BR-10`):** Never joins or returns `password_hash` (`NFR-SEC-01`), `accounts`, `opening_balance`, `transactions`, `allocation_lines`, or financial summaries.
  2. **Toggle User Access Status (`PATCH /api/admin/users/:id/status` — `FR-04`):**
     * Requires authenticated `ADMIN` role (`403` for `USER`).
     * Request body: `{ "is_active": true | false }` (`400 INVALID_STATUS_PAYLOAD` if not boolean).
     * If target user `:id` does not exist, return `404 NOT_FOUND`.
     * Self-lockout guard: if `req.user.id === id` and `is_active === false`, reject with `422 CANNOT_DEACTIVATE_SELF`.
     * Updates `users.is_active` and returns `200 OK` with `{ id, username, email, role, is_active, updated_at }`.
  3. **Active Status Enforcement Across Authentication & Session Guards (`F-01` + `F-19`):**
     * In `POST /api/auth/login`: if credentials match a user with `is_active === false`, reject login with `403 Forbidden` (`ACCOUNT_DISABLED`) and do not issue a session cookie.
     * In `authGuard.ts` (and `GET /api/auth/me`): verify that the authenticated user exists and has `is_active === true` (when database lookup is available or via active status check); if `is_active === false`, reject with `403 ACCOUNT_DISABLED`.
* **API Specification:**
  * `GET /api/admin/users` $\rightarrow$ `200 OK` `{ "success": true, "data": { "users": [ { "id": "...", "username": "user_demo", "email": "user@whatsss.local", "role": "USER", "is_active": true, "created_at": "..." } ] } }`
  * `PATCH /api/admin/users/:id/status` $\rightarrow$ `200 OK` `{ "success": true, "data": { "user": { "id": "...", "username": "user_demo", "is_active": false, ... } } }`
  * **Error Codes:** `400 INVALID_STATUS_PAYLOAD`, `401 UNAUTHORIZED`, `403 ADMIN_ONLY_ENDPOINT`, `403 ACCOUNT_DISABLED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `404 NOT_FOUND`, `422 CANNOT_DEACTIVATE_SELF`.
* **Acceptance Criteria:**
  * `AC-19-1`: Authenticated `ADMIN` calling `GET /api/admin/users` receives `200 OK` with the platform user directory containing `id`, `username`, `email`, `role`, `is_active`, and `created_at`, and containing **zero** `password_hash` or financial ledger fields (`TEST-ADMIN-01`, `FR-03`, `BR-10`, `NFR-SEC-01`).
  * `AC-19-2`: Authenticated `ADMIN` calling `PATCH /api/admin/users/:id/status` with `{ "is_active": false }` disables the target user, and calling with `{ "is_active": true }` re-enables them (`TEST-ADMIN-02`, `FR-04`).
  * `AC-19-3`: A disabled user (`is_active = false`) is rejected with `403 ACCOUNT_DISABLED` when attempting `POST /api/auth/login` or accessing protected endpoints (`TEST-ADMIN-03`, `FR-04`).
  * `AC-19-4`: `USER` role calling `GET /api/admin/users` or `PATCH /api/admin/users/:id/status` receives `403 Forbidden`; `ADMIN` attempting to deactivate their own account receives `422 CANNOT_DEACTIVATE_SELF`; `ADMIN` remains blocked (`403`) from all `/api/accounts`, `/api/transactions`, and `/api/reports` endpoints (`TEST-ADMIN-04`, `TEST-ADMIN-05`, `BR-10`).

---

## 3. Sprint 2 Definition of Done (DoD)

A Sprint 2 feature and the integrated Sprint 2 release increment are declared **DONE** only when all of the following criteria are satisfied:

1. **Contract-First Compliance:** Feature engineering contract, data model updates, API error codes, numbered ACs, and STS test IDs were committed and peer-reviewed prior to implementation (`WP-07` / Issue #55).
2. **Database & Transactional Integrity:** All multi-account mutations (`F-11` transfer, `F-12` loan given/recovery, `F-13` general borrowing/repayment, `F-14` duplicate, `F-16` correction) execute inside `prisma.$transaction` with sorted pessimistic row-level write locks (`SELECT ... FOR UPDATE`) and decimal-safe arithmetic (`Prisma.Decimal`).
3. **Business Rule Preservation:**
   * `BR-01`: Cross-tenant requests return `404 Not Found` with zero data leakage.
   * `BR-02`: Opening balances and internal cash transfers (`F-11`) are excluded from `total_income` and `total_expense`.
   * `BR-06`: Multi-line split allocations in new, duplicated (`F-14`), and corrected (`F-16`) transactions strictly equal `total_amount`.
   * `BR-07 v1.1`: Credit card minimum repayment floor and `100.00 THB` partial cash reserve remain enforced for `CREDIT_CARD` accounts (`F-07`) while general loans (`F-13`, `GENERAL_LOAN`) are cleanly separated.
   * `BR-08`: Credit card repayments (`F-07`), loan given disbursements/recoveries (`F-12`), and general loan borrowings/repayments (`F-13`) are excluded from `total_income` and `total_expense`.
   * `BR-09` & `BR-10`: Unauthenticated requests return `401`; `ADMIN` can manage `/api/admin/users` (`F-19`) but remains unconditionally barred (`403`) from all user financial endpoints.
4. **Automated Verification & Regression Safety:** Unit, API/database integration, and frontend component tests for all Sprint 2 ACs (`AC-10-*`..`AC-16-*`, `AC-19-*`) and all existing Sprint 1 + Lab 7 regression tests pass in GitHub Actions CI (`0 failed`) and compile cleanly (`npm run build` in both `server/` and `client/`).
5. **Teammate Peer Review:** Every feature PR is substantively reviewed and approved by the non-author teammate (`R-09`: zero self-approvals).
