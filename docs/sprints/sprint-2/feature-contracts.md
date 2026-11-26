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
| `v2.0-contract` | **Sprint 2 Baseline Contracts (Pre-Implementation)** | 2026-11-26 | `WP-07` / [Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) / [PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61) | Complete engineering contracts for all 8 Sprint 2 features (`F-10`..`F-16`, `F-19`), including feature SDS, UI/API/data definitions, validation/error envelopes, permissions, concurrency/locking standards, system-level archived account guard, numbered ACs, STS mappings, and Definition of Done. |

---

## 1. Overview & Architectural Layer Impact Summary

This document defines the binding engineering contracts for all **eight Sprint 2 features (`F-10` through `F-16`, and `F-19`)** allocated in `docs/features.md` and `docs/sprints/plan.md`. No Sprint 2 feature has been deferred to Sprint 3.

### 1.1 Cross-Layer Change Matrix (Explicit Statement of Changed vs. Unchanged Layers)
| Feature ID | Feature Name | Linked FR / BR / NFR | Database / Prisma Schema Layer | Backend API / Service Layer | Frontend UI Layer | Auth / CSRF / RoleGuard Middleware Layer |
|:---:|---|---|---|---|---|---|
| **`F-10`** | **Account Creation & Management** | `FR-12`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-SEC-02`, `NFR-DATA-01` | Adds `subtype` (`AccountSubtype`: `DEFAULT`, `CREDIT_CARD`, `GENERAL_LOAN`), `normalized_name` (`String @db.VarChar(100)` with `@@unique([user_id, normalized_name])` and DB functional unique index), and `is_archived` (`Boolean @default(false)`) to `Account`. | Adds `POST /api/accounts` and `PATCH /api/accounts/:id` in `account.controller.ts` / `account.service.ts` with name normalization and `409 DUPLICATE_ACCOUNT_NAME` mapping. | Adds Create/Edit Account modal and subtype badges on `AccountListPage.tsx`. | **No change required:** Existing `authGuard` (`401`/`403`), `roleGuard` (`403` for `ADMIN`), and `csrfGuard` (`403`) already protect `/api/accounts/*`. |
| **`F-11`** | **Internal Cash Transfer** | `FR-13`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No additional table needed:** Uses existing `Transaction` (`form: PAYMENT_CHARGE`, `primary_account: CASH`) + 1 `AllocationLine` (`target_account: CASH`). | Adds `POST /api/transactions/transfer` (`transfer.service.ts`) and updates `balance.service.ts` to add incoming `CASH -> CASH` transfer allocations to destination `CASH` balance while excluding from income/expense (`BR-02`). | Adds Internal Cash Transfer modal on `AccountListPage.tsx` / `DashboardPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-12`** | **Loan Given & Recovery** | `FR-14`, `BR-01`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No additional table needed:** Uses `Transaction` + 1 `AllocationLine` between `CASH` and `LOAN_GIVEN`. | Adds `POST /api/transactions/loan-given` and `POST /api/transactions/loan-recovery` (`loan.service.ts`); updates `balance.service.ts` to compute `LOAN_GIVEN` receivable balance and exclude from income/expense (`BR-08`). | Adds Loan Given (Disburse & Recover) modal on `AccountListPage.tsx` / `DashboardPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-13`** | **General Loan Taken & Repayment** | `FR-15`, `BR-01`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | Uses `Account.subtype = 'GENERAL_LOAN'` (added in `WP-08`) to distinguish General Borrowing from Credit Cards (`subtype = 'CREDIT_CARD'`). | Adds `POST /api/transactions/loan-borrowing` and `POST /api/transactions/loan-repayment` (`loan.service.ts`); updates `repayment.service.ts` (`F-07`) to reject `GENERAL_LOAN` targets (`400 INVALID_ACCOUNT_TYPE`). | Adds General Borrowing & Repayment modal on `AccountListPage.tsx` / `DashboardPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-14`** | **Favorite & Duplicate Transactions** | `FR-16`, `FR-17`, `BR-01`, `BR-05`, `BR-06`, `BR-09`, `BR-10`, `NFR-DATA-01` | Adds `is_favorite` (`Boolean @default(false)`) to `Transaction`. | Adds `PATCH /api/transactions/:id/favorite` and `POST /api/transactions/:id/duplicate`. | Adds Favorite star toggle, Favorites filter tab, and Duplicate action button on `TransactionHistoryPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-15`** | **Transaction Search & Multi-Criteria Filtering** | `FR-18`, `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No schema change required:** Uses existing `transactions` and `allocation_lines` columns and indexes (`@@index([user_id, transaction_date])`). | Extends `GET /api/transactions` query parser and Prisma filter builder (`startDate`, `endDate`, `accountId`, `categoryId`, `form`, `type`, `favorite`, `q`). | Adds search bar, date-range inputs, account/category/type selectors, and clear-filter controls on `TransactionHistoryPage.tsx`. | **No change required:** Safe `GET` request protected by `authGuard` and `roleGuard`. |
| **`F-16`** | **Transaction Corrections** | `FR-19`, `BR-01`, `BR-06`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | Adds `updated_at` to `Transaction` and `TransactionAuditLog` table (`id`, `transaction_id` with `onDelete: Restrict`, `user_id`, `action`, `previous_snapshot`, `new_snapshot`, `created_at`). | Adds `PUT /api/transactions/:id` (and `PATCH /api/transactions/:id`) inside `prisma.$transaction` with row locking, balance/split re-validation, and atomic audit log insertion. | Adds Edit/Correct Transaction modal on `TransactionHistoryPage.tsx`. | **No change required:** Existing middleware pipeline protects `/api/transactions/*`. |
| **`F-19`** | **Platform User Directory & Governance** | `FR-03`, `FR-04`, `BR-09`, `BR-10`, `NFR-SEC-02`, `NFR-DATA-01` | **No schema change required:** `User.is_active` (`Boolean @default(true)`) and `User.role` (`USER` \| `ADMIN`) already exist in `schema.prisma`. | Adds `GET /api/admin/users` and `PATCH /api/admin/users/:id/status` (`admin.controller.ts`), and enforces fail-closed `user.is_active === true` verification in `auth.service.ts` / `authGuard.ts` (`403 ACCOUNT_DISABLED`). | Adds `/admin/users` (`AdminUserDirectoryPage.tsx`) accessible exclusively to `ADMIN`. | Updates `authGuard.ts` to verify `is_active === true` via fail-closed DB lookup and adds `requireAdmin` guard (`403` for `USER`) on `/api/admin/*` while `roleGuard.ts` continues blocking `ADMIN` on financial routes (`BR-10`). |

---

### 1.2 System-Level Concurrency, Row-Locking & Archived Account Guard Contract

All Sprint 1, Sprint 2, and Sprint 3 transactional workflows enforce a single unified concurrency and archival policy:

1. **Clear Separation Between `acquireAccountRowLocks` and `lockAccounts` (`accountLock.service.ts`):**
   * **`acquireAccountRowLocks(tx, accountIds, userId)` — Concurrency & Deadlock Prevention:**
     * Deduplicates `accountIds` and sorts them in **canonical ascending lexicographical order (`[...new Set(accountIds)].sort()`)**.
     * Executes `SELECT id FROM accounts WHERE id IN (...) AND user_id = $userId FOR UPDATE` inside `prismaClient.$transaction` **before** reading account balances, debts, receivables, or `is_archived` flags.
     * Guarantees deadlock-free pessimistic row-level write serialization across concurrent requests (`F-04`, `F-05`, `F-07`, `F-11`, `F-12`, `F-13`, `F-14`, `F-16`, `F-18`).
   * **`lockAccounts(tx, accountIds, userId)` — Opening Balance Lifecycle (`F-03` / `AC-03-3`):**
     * Executes `UPDATE accounts SET is_opening_locked = true WHERE id IN (...) AND user_id = $userId AND is_opening_locked = false` inside the same `prismaClient.$transaction` **after** all domain validations succeed.
     * Permanently locks initial opening balances upon the first referencing committed transaction. It is not a substitute for `acquireAccountRowLocks`.

2. **Centralized Archived Account Guard (`422 ACCOUNT_ARCHIVED`):**
   * Inside `prismaClient.$transaction`, immediately after `acquireAccountRowLocks` locks all referenced accounts and ownership (`user_id === req.user.id`, else `404 NOT_FOUND`) is verified:
   * Every transaction creation or duplication workflow (**`F-04` Income, `F-05` Credit Purchase, `F-07` Credit Card Repayment, `F-11` Internal Cash Transfer, `F-12` Loan Given & Loan Recovery, `F-13` General Loan Borrowing & Repayment, and `F-14` Transaction Duplication**) checks `account.is_archived` on both the `primary_account` and **every** `AllocationLine.target_account` (including multi-line split allocations).
   * For **`F-16` Transaction Corrections**: if the transaction correction references an archived `primary_account` or introduces/references any archived `target_account`, it is likewise rejected.
   * If any referenced account has `is_archived === true`, the transaction aborts and rolls back immediately with **`HTTP 422 Unprocessable Entity` (`ACCOUNT_ARCHIVED`)** and performs **zero database writes**.
   * Because `PATCH /api/accounts/:id/archive` (`F-18`) also acquires `SELECT ... FOR UPDATE` on the account row via `acquireAccountRowLocks`, a concurrent archive request and a concurrent transaction creation request on the same account are strictly serialized in PostgreSQL.

---

## 2. Detailed Feature Engineering Contracts

---

### Feature F-10: Account Creation & Management (`WP-08` / [Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56))
* **Feature ID:** `F-10`
* **Linked Requirements:** `FR-12`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-SEC-02`, `NFR-DATA-01`
* **Primary Actor:** `USER` (`ADMIN` strictly barred per `BR-10`)
* **Preconditions:** Authenticated `USER` session (`HttpOnly` cookie `token`).
* **Feature SDS, Normalization & Uniqueness Workflow:**
  1. **Canonical Name Normalization Across All Layers (`normalizeAccountName`):**
     * Display Name Normalization: `displayName = rawName.trim().replace(/\s+/g, ' ')` (trims leading/trailing whitespace and collapses consecutive internal whitespace to a single space).
     * Canonical Comparison Key: `normalizedName = displayName.toLowerCase()`.
     * Database Enforcement (`WP-08` migration):
       * `accounts.normalized_name` column (`VARCHAR(100) NOT NULL`) with Prisma constraint `@@unique([user_id, normalized_name])`.
       * PostgreSQL functional unique expression index in the SQL migration:
         `CREATE UNIQUE INDEX accounts_user_id_normalized_name_expr_idx ON accounts (user_id, LOWER(REGEXP_REPLACE(BTRIM(name), '\s+', ' ', 'g')));`
  2. Client submits `POST /api/accounts` with `{ name, type, subtype?, opening_balance? }`.
  3. Backend validates:
     * `name`: required string; after `displayName = rawName.trim().replace(/\s+/g, ' ')`, length must be 1–100 characters (`400 INVALID_ACCOUNT_NAME`).
     * `type`: must be one of `'CASH' | 'LOAN_TAKEN' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE'` (`400 INVALID_ACCOUNT_TYPE`).
     * `subtype`: optional; for `LOAN_TAKEN`, allowed values are `'CREDIT_CARD'` or `'GENERAL_LOAN'` (defaults to `'GENERAL_LOAN'` if omitted on `LOAN_TAKEN`). For `'CASH' | 'LOAN_GIVEN' | 'INCOME' | 'EXPENSE'`, `subtype` must be omitted or `'DEFAULT'`; specifying `'CREDIT_CARD'` or `'GENERAL_LOAN'` on a non-`LOAN_TAKEN` account (or any unknown subtype string) returns `400 INVALID_ACCOUNT_SUBTYPE`.
     * `opening_balance`: optional (defaults to `'0.00'`). Must be a non-negative decimal (`>= 0.00`, max 2 decimal places, no exponent notation, `<= 9999999999.99`). For `INCOME` and `EXPENSE` category accounts, `opening_balance` must be `0.00` (`400 INVALID_OPENING_BALANCE`).
     * Uniqueness & Concurrency Error Mapping:
       * Backend checks if an account with `user_id === req.user.id` and `normalized_name === normalizedName` already exists.
       * Furthermore, if two concurrent requests bypass the pre-check simultaneously, PostgreSQL's unique constraint (`@@unique([user_id, normalized_name])` / expression index) rejects the second insert with Prisma error code `P2002`, which the service catches and maps deterministically to **`HTTP 409 Conflict` (`DUPLICATE_ACCOUNT_NAME`)** so at most **1** account is ever created.
  4. Backend creates the `Account` record (`name: displayName`, `normalized_name: normalizedName`, `is_opening_locked: false`, `is_archived: false`), returning `201 Created`.
  5. To rename an existing account, client submits `PATCH /api/accounts/:id` with `{ name }`. Backend verifies ownership (`404 NOT_FOUND` if not owned by `req.user.id`), applies the same `displayName` / `normalizedName` normalization, checks duplicate name excluding `:id` (and maps `P2002` to `409 DUPLICATE_ACCOUNT_NAME`), updates `name` and `normalized_name`, and returns `200 OK`.
* **API Specification:**
  * `POST /api/accounts` $\rightarrow$ `201 Created` `{ "success": true, "data": { "account": { "id": "...", "name": "Savings Bank", "type": "CASH", "subtype": "DEFAULT", "opening_balance": "5000.00", "current_balance": 5000.00, "is_opening_locked": false, "is_archived": false } } }`
  * `PATCH /api/accounts/:id` $\rightarrow$ `200 OK` `{ "success": true, "data": { "account": { ... } } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_NAME`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_ACCOUNT_SUBTYPE`, `400 INVALID_OPENING_BALANCE`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `404 NOT_FOUND`, `409 DUPLICATE_ACCOUNT_NAME`.
* **Acceptance Criteria:**
  * `AC-10-1`: Authenticated `USER` can create custom accounts across all five account types (`CASH`, `LOAN_TAKEN` with `CREDIT_CARD` or `GENERAL_LOAN` subtype, `LOAN_GIVEN`, `INCOME`, `EXPENSE`) with trimmed/normalized names and retrieve them via `GET /api/accounts` (`TEST-ACC-01`, `TEST-ACC-02`).
  * `AC-10-2`: Creating or renaming an account to a name that collides under case-insensitive and whitespace-normalized comparison (e.g., `"Checking Bank"` vs. `"checking bank"` vs. `"  Checking   Bank  "`) within the same user's ledger — including under concurrent creation requests — returns `409 Conflict` (`DUPLICATE_ACCOUNT_NAME`) and persists only 1 account, while another user (`user_other`) can create an account with that same name independently (`TEST-ACC-03`, `TEST-ACC-05`, `BR-01`).
  * `AC-10-3`: Authenticated `USER` can rename their own account via `PATCH /api/accounts/:id`; attempting to update another user's account returns `404 Not Found` (`TEST-ACC-04`, `BR-01`); `ADMIN` requests return `403 Forbidden` (`BR-10`).

---

### Feature F-11: Internal Cash Transfer (`WP-08` / [Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56))
* **Feature ID:** `F-11`
* **Linked Requirements:** `FR-13`, `BR-01`, `BR-02`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns at least two active (`is_archived = false`) `CASH` accounts (e.g., `Checking Bank` and `Savings Bank`).
* **Feature SDS & Workflow:**
  1. Client submits `POST /api/transactions/transfer` with `{ from_account_id, to_account_id, amount, transaction_date, description? }`.
  2. Pre-transaction fast-fail checks (zero DB writes on failure):
     * Validate presence of `from_account_id` and `to_account_id` (`400 INVALID_ACCOUNT_ID`).
     * Reject identical source and destination (`from_account_id.trim() === to_account_id.trim()`) with `400 SAME_ACCOUNT_TRANSFER`.
     * Validate `amount` (`> 0.00`, max 2 decimals, `<= 9999999999.99`, no exponent notation $\rightarrow$ `400 INVALID_AMOUNT`), `transaction_date` (valid calendar date in `YYYY-MM-DD` $\rightarrow$ `400 INVALID_TRANSACTION_DATE`), and `description` (optional string $\le 255$ chars $\rightarrow$ `400 INVALID_DESCRIPTION`).
  3. Inside atomic `prisma.$transaction`:
     * Acquire sorted pessimistic row-level write locks (`acquireAccountRowLocks(tx, [fromAccountId, toAccountId], userId)` / `SELECT ... FOR UPDATE`).
     * Verify both accounts exist and belong to `req.user.id` (`404 NOT_FOUND` on missing or foreign account per `BR-01`).
     * Verify both accounts have `type === 'CASH'` (`400 INVALID_ACCOUNT_TYPE`).
     * **System Archived Account Guard:** Verify neither `fromAccount` nor `toAccount` has `is_archived === true` (if either is archived, abort with `422 ACCOUNT_ARCHIVED`).
     * Compute authoritative `currentCashBalance` of `from_account_id` under lock (opening balance + `RECEIVE_MONEY` inflows + incoming `CASH -> CASH` transfer allocations - `PAYMENT_CHARGE` outflows).
     * If `amount > currentCashBalance`, reject with `422 INSUFFICIENT_FUNDS`.
     * Atomically lock opening balances (`lockAccounts(tx, [fromAccountId, toAccountId], userId)`).
     * Create 1 `Transaction` (`primary_account_id = from_account_id`, `form = 'PAYMENT_CHARGE'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = to_account_id`, `amount = amount`).
  4. **Accounting & Summary Invariant (`BR-02`):**
     * Source `CASH` account balance decreases by `amount`; Destination `CASH` account balance increases by `amount`.
     * Net total cash across all user `CASH` accounts is conserved ($\Delta \text{Total Cash} = 0.00$), and **`total_income` and `total_expense` remain completely unchanged (`BR-02`)**.
* **API Specification:**
  * `POST /api/transactions/transfer` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_from_cash_balance": "...", "updated_to_cash_balance": "..." } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_ID`, `400 SAME_ACCOUNT_TRANSFER`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `400 INVALID_DESCRIPTION`, `404 NOT_FOUND`, `422 ACCOUNT_ARCHIVED`, `422 INSUFFICIENT_FUNDS`.
* **Acceptance Criteria:**
  * `AC-11-1`: Valid transfer between two `CASH` accounts returns `201 Created`, decreases source `CASH` balance by `amount`, increases destination `CASH` balance by `amount`, and locks opening balances on both accounts (`TEST-XFER-01`).
  * `AC-11-2`: Internal cash transfer adds `0.00` to `total_income` and `0.00` to `total_expense` in `GET /api/reports/summary` (`TEST-XFER-02`, `BR-02`).
  * `AC-11-3`: Transferring to the same account (`400 SAME_ACCOUNT_TRANSFER`), transferring between non-`CASH` accounts (`400 INVALID_ACCOUNT_TYPE`), referencing an archived account (`422 ACCOUNT_ARCHIVED`), or transferring more than the source `CASH` balance (`422 INSUFFICIENT_FUNDS` — including under concurrent transfer requests) is rejected with zero database writes (`TEST-XFER-03`, `TEST-XFER-04`, `TEST-XFER-06`).
  * `AC-11-4`: Referencing another user's `CASH` account as `from_account_id` or `to_account_id` returns `404 Not Found` (`TEST-XFER-05`, `BR-01`).

---

### Feature F-12: Peer Lending — Loan Given & Recovery (`WP-09` / [Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57))
* **Feature ID:** `F-12`
* **Linked Requirements:** `FR-14`, `BR-01`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns an active `CASH` account and an active `LOAN_GIVEN` account.
* **Complete Validation & ErrorPrecedence Rules (`F-12`):**
  1. **Pre-Transaction Request Format Validation (Zero DB Writes):**
     * `from_account_id`, `to_account_id`: required non-empty strings (`400 INVALID_ACCOUNT_ID`).
     * `amount`: required positive decimal (`> 0.00`, max 2 decimal places, `<= 9999999999.99`, exponent notation e.g. `"1e3"` rejected) $\rightarrow$ `400 INVALID_AMOUNT`.
     * `transaction_date`: required real calendar date in `YYYY-MM-DD` format (year `2000..2100`, rejecting impossible dates like `2026-02-30`) $\rightarrow$ `400 INVALID_TRANSACTION_DATE`.
     * `description`: optional string $\le 255$ characters $\rightarrow$ `400 INVALID_DESCRIPTION`.
  2. **In-Transaction Locked Domain Validation (`prisma.$transaction` + `acquireAccountRowLocks`):**
     * **Account Ownership (`BR-01`):** Both `from_account_id` and `to_account_id` must exist and belong to `req.user.id` $\rightarrow$ else `404 NOT_FOUND`.
     * **Account Type & Subtype:**
       * For `POST /api/transactions/loan-given`: `fromAccount.type === 'CASH'` and `toAccount.type === 'LOAN_GIVEN'` (`toAccount.subtype === 'DEFAULT'`) $\rightarrow$ else `400 INVALID_ACCOUNT_TYPE`.
       * For `POST /api/transactions/loan-recovery`: `fromAccount.type === 'LOAN_GIVEN'` (`fromAccount.subtype === 'DEFAULT'`) and `toAccount.type === 'CASH'` $\rightarrow$ else `400 INVALID_ACCOUNT_TYPE`.
     * **Archived Status Guard:** Neither `fromAccount` nor `toAccount` may have `is_archived === true` $\rightarrow$ else `422 ACCOUNT_ARCHIVED`.
     * **Balance / Receivable Bounds (Under Row Lock):**
       * For `loan-given`: compute authoritative `currentCashBalance` on `fromAccount`; if `amount > currentCashBalance` $\rightarrow$ `422 INSUFFICIENT_FUNDS`.
       * For `loan-recovery`: compute authoritative `currentReceivable` on `fromAccount`:
         $$\text{Current Receivable} = \text{opening\_balance} + \sum \text{Disbursements (PAYMENT\_CHARGE allocations to LOAN\_GIVEN)} - \sum \text{Recoveries (RECEIVE\_MONEY allocations to LOAN\_GIVEN)}$$
         If `currentReceivable <= 0.00` $\rightarrow$ `422 ZERO_OUTSTANDING_RECEIVABLE`; if `amount > currentReceivable` $\rightarrow$ `422 RECOVERY_EXCEEDS_RECEIVABLE`.
     * Any validation failure aborts the transaction with **zero database writes**.
  3. **Atomic Persistence & Ledger Effect (`BR-08`):**
     * Call `lockAccounts(tx, [fromAccountId, toAccountId], userId)`.
     * For `loan-given`: create 1 `Transaction` (`primary_account_id = from_account_id`, `form = 'PAYMENT_CHARGE'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = to_account_id`, `amount = amount`). Decreases `CASH`, increases `LOAN_GIVEN` receivable, **`total_expense` unchanged (`BR-08`)**.
     * For `loan-recovery`: create 1 `Transaction` (`primary_account_id = to_account_id`, `form = 'RECEIVE_MONEY'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = from_account_id`, `amount = amount`). Increases `CASH`, decreases `LOAN_GIVEN` receivable, **`total_income` unchanged (`BR-08`)**.
* **API Specification:**
  * `POST /api/transactions/loan-given` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_receivable": "..." } }`
  * `POST /api/transactions/loan-recovery` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_receivable": "..." } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_ID`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `400 INVALID_DESCRIPTION`, `404 NOT_FOUND`, `422 ACCOUNT_ARCHIVED`, `422 INSUFFICIENT_FUNDS`, `422 ZERO_OUTSTANDING_RECEIVABLE`, `422 RECOVERY_EXCEEDS_RECEIVABLE`.
* **Acceptance Criteria:**
  * `AC-12-1`: Disbursing a loan given (`POST /api/transactions/loan-given`) decreases source `CASH` balance and increases `LOAN_GIVEN` receivable balance by equal amounts without increasing `total_expense` (`TEST-LOAN-GIVEN-01`, `BR-08`).
  * `AC-12-2`: Recovering a loan given (`POST /api/transactions/loan-recovery`, partial or full) increases destination `CASH` balance and decreases `LOAN_GIVEN` receivable balance without increasing `total_income` (`TEST-LOAN-GIVEN-02`, `BR-08`).
  * `AC-12-3`: Invalid amounts/dates/descriptions (`400`), archived accounts (`422 ACCOUNT_ARCHIVED`), disbursing more than available cash (`422 INSUFFICIENT_FUNDS`), or recovering more than the outstanding receivable (`422 RECOVERY_EXCEEDS_RECEIVABLE` / `422 ZERO_OUTSTANDING_RECEIVABLE` — including under concurrent requests) are rejected with zero database writes (`TEST-LOAN-GIVEN-03`, `TEST-LOAN-GIVEN-05`).
  * `AC-12-4`: Cross-tenant account references return `404 Not Found` (`BR-01`) and `ADMIN` access returns `403 Forbidden` (`BR-10`) (`TEST-LOAN-GIVEN-04`).

---

### Feature F-13: General Borrowing — Loan Taken & Repayment (`WP-09` / [Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57))
* **Feature ID:** `F-13`
* **Linked Requirements:** `FR-15`, `BR-01`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns an active `CASH` account and an active general `LOAN_TAKEN` account (`subtype === 'GENERAL_LOAN'`).
* **Resolution of Lab 7 `BR-07 v1.1` Prerequisite (Credit Card vs. General Loan Taken):**
  * `Account` rows with `type === 'LOAN_TAKEN'` carry `subtype: 'CREDIT_CARD' | 'GENERAL_LOAN'`.
  * **Credit Card Debt Settlement (`F-07`, `POST /api/transactions/repayment`):** Enforces `toAccount.type === 'LOAN_TAKEN' && toAccount.subtype === 'CREDIT_CARD'`. Any attempt to submit a `GENERAL_LOAN` account to `/api/transactions/repayment` is rejected with `400 INVALID_ACCOUNT_TYPE`.
  * **General Borrowing & Principal Repayment (`F-13`, `POST /api/transactions/loan-borrowing` & `POST /api/transactions/loan-repayment`):** Enforces `type === 'LOAN_TAKEN' && subtype === 'GENERAL_LOAN'` (rejecting `CREDIT_CARD` accounts with `400 INVALID_ACCOUNT_TYPE`). General loan principal repayments accept any positive decimal amount `0.00 < amount <= currentDebt` and `amount <= currentCashBalance` without imposing the credit-card `500.00 THB` / `10%` minimum floor or `100.00 THB` cash reserve buffer.
* **Complete Validation & Error Precedence Rules (`F-13`):**
  1. **Pre-Transaction Request Format Validation (Zero DB Writes):**
     * `from_account_id`, `to_account_id`: required non-empty strings (`400 INVALID_ACCOUNT_ID`).
     * `amount`: required positive decimal (`> 0.00`, max 2 decimal places, `<= 9999999999.99`, exponent notation rejected) $\rightarrow$ `400 INVALID_AMOUNT`.
     * `transaction_date`: required real calendar date in `YYYY-MM-DD` format $\rightarrow$ `400 INVALID_TRANSACTION_DATE`.
     * `description`: optional string $\le 255$ characters $\rightarrow$ `400 INVALID_DESCRIPTION`.
  2. **In-Transaction Locked Domain Validation (`prisma.$transaction` + `acquireAccountRowLocks`):**
     * **Account Ownership (`BR-01`):** Both accounts must exist and belong to `req.user.id` $\rightarrow$ else `404 NOT_FOUND`.
     * **Account Type & Subtype:**
       * For `POST /api/transactions/loan-borrowing`: `fromAccount.type === 'LOAN_TAKEN' && fromAccount.subtype === 'GENERAL_LOAN'` and `toAccount.type === 'CASH'` $\rightarrow$ else `400 INVALID_ACCOUNT_TYPE`.
       * For `POST /api/transactions/loan-repayment`: `fromAccount.type === 'CASH'` and `toAccount.type === 'LOAN_TAKEN' && toAccount.subtype === 'GENERAL_LOAN'` $\rightarrow$ else `400 INVALID_ACCOUNT_TYPE`.
     * **Archived Status Guard:** Neither `fromAccount` nor `toAccount` may have `is_archived === true` $\rightarrow$ else `422 ACCOUNT_ARCHIVED`.
     * **Balance / Debt Bounds (Under Row Lock for `loan-repayment`):**
       * Compute authoritative `currentCashBalance` and `currentDebt`:
         $$\text{General Loan Debt} = \text{opening\_balance} + \sum \text{Borrowings (RECEIVE\_MONEY allocations to LOAN\_TAKEN)} + \sum \text{Direct Charges (PAYMENT\_CHARGE on LOAN\_TAKEN)} - \sum \text{Repayments (PAYMENT\_CHARGE allocations from CASH to LOAN\_TAKEN)}$$
       * Precedence: if `currentDebt <= 0.00` $\rightarrow$ `422 ZERO_OUTSTANDING_DEBT`; if `amount > currentDebt` $\rightarrow$ `422 REPAYMENT_EXCEEDS_DEBT`; if `amount > currentCashBalance` $\rightarrow$ `422 INSUFFICIENT_FUNDS`.
     * Any validation failure aborts the transaction with **zero database writes**.
  3. **Atomic Persistence & Ledger Effect (`BR-08`):**
     * Call `lockAccounts(tx, [fromAccountId, toAccountId], userId)`.
     * For `loan-borrowing`: create 1 `Transaction` (`primary_account_id = to_account_id`, `form = 'RECEIVE_MONEY'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = from_account_id`, `amount = amount`). Increases `CASH` and general `LOAN_TAKEN` debt; **`total_income` unchanged (`BR-08`)**.
     * For `loan-repayment`: create 1 `Transaction` (`primary_account_id = from_account_id`, `form = 'PAYMENT_CHARGE'`, `total_amount = amount`) and 1 `AllocationLine` (`target_account_id = to_account_id`, `amount = amount`). Decreases `CASH` and general `LOAN_TAKEN` debt; **`total_expense` unchanged (`BR-08`)**.
* **API Specification:**
  * `POST /api/transactions/loan-borrowing` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_debt": "..." } }`
  * `POST /api/transactions/loan-repayment` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { ... }, "updated_cash_balance": "...", "updated_debt": "..." } }`
  * **Error Codes:** `400 INVALID_ACCOUNT_ID`, `400 INVALID_ACCOUNT_TYPE`, `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `400 INVALID_DESCRIPTION`, `404 NOT_FOUND`, `422 ACCOUNT_ARCHIVED`, `422 ZERO_OUTSTANDING_DEBT`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 INSUFFICIENT_FUNDS`.
* **Acceptance Criteria:**
  * `AC-13-1`: Recording money borrowed (`POST /api/transactions/loan-borrowing`) increases destination `CASH` balance and increases general `LOAN_TAKEN` liability balance by equal amounts without increasing `total_income` (`TEST-LOAN-TAKEN-01`, `BR-08`).
  * `AC-13-2`: Repaying general loan principal (`POST /api/transactions/loan-repayment`, including amounts `< 500.00 THB` or leaving `< 100.00 THB` cash) decreases `CASH` and decreases general `LOAN_TAKEN` liability without increasing `total_expense` (`TEST-LOAN-TAKEN-02`, `BR-08`).
  * `AC-13-3`: Invalid amounts/dates/descriptions (`400`), archived accounts (`422 ACCOUNT_ARCHIVED`), repaying more than outstanding general loan debt (`422 REPAYMENT_EXCEEDS_DEBT`), repaying when debt is `0.00` (`422 ZERO_OUTSTANDING_DEBT`), or repaying more than available cash (`422 INSUFFICIENT_FUNDS` — including under concurrent requests) are rejected with zero database writes (`TEST-LOAN-TAKEN-03`, `TEST-LOAN-TAKEN-05`).
  * `AC-13-4`: Submitting a `GENERAL_LOAN` account to Credit Card Repayment `POST /api/transactions/repayment` (`F-07`), or submitting a `CREDIT_CARD` account to `POST /api/transactions/loan-repayment` (`F-13`), is rejected with `400 INVALID_ACCOUNT_TYPE` (`TEST-LOAN-TAKEN-04`, `BR-07 v1.1` scoping contract).

---

### Feature F-14: Favorite & Duplicate Transactions (`WP-10` / [Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58))
* **Feature ID:** `F-14`
* **Linked Requirements:** `FR-16`, `FR-17`, `BR-01`, `BR-05`, `BR-06`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` has at least one recorded transaction.
* **Feature SDS & Exact Duplication Semantics:**
  1. **Mark / Unmark Favorite (`PATCH /api/transactions/:id/favorite`):**
     * Request body: `{ "is_favorite": true | false }` (must be boolean, else `400 INVALID_FAVORITE_FLAG`).
     * Backend verifies transaction `:id` belongs to `req.user.id` (`404 NOT_FOUND` on nonexistent or foreign transaction per `BR-01`).
     * Updates `is_favorite` and returns `200 OK` with the updated transaction.
  2. **Duplicate Transaction (`POST /api/transactions/:id/duplicate` & UI Pre-Fill Flow):**
     * Request body: optional overrides `{ "transaction_date"?: "YYYY-MM-DD", "description"?: string }`. If `transaction_date` is provided, it is validated as a real `YYYY-MM-DD` date (`400 INVALID_TRANSACTION_DATE`); if omitted, it defaults to the source transaction's `transaction_date`.
     * **Exact Duplication Rules (What Is Cloned vs. What Is Freshly Generated):**
       * **Freshly Generated (Never Copied):**
         * Generates a **brand-new `Transaction.id` (UUID)** and brand-new `AllocationLine.id` (UUID) for each allocation line.
         * Sets fresh `created_at = NOW()` and `updated_at = NOW()` timestamps (never copies historical `created_at` or `updated_at`).
         * Initializes **`is_favorite = false`** on the new duplicated transaction by default.
         * **Does NOT copy `TransactionAuditLog` history** from the source transaction (the new transaction starts with `0` audit log entries).
       * **Cloned Domain Payload:** Copies `primary_account_id`, `form`, `total_amount`, `description` (unless overridden), and the list of `allocation_lines` (`target_account_id`, `amount`, `notes`).
     * **Full Live Domain Re-Validation Inside `prisma.$transaction`:**
       * Acquires sorted row locks (`acquireAccountRowLocks`) on `primary_account_id` and all `allocation_lines.target_account_id` accounts.
       * Re-verifies account ownership (`404 NOT_FOUND`), account types/subtypes (`400 INVALID_ACCOUNT_TYPE`), and **Archived Account Guard** (if `primary_account` or any `target_account` in the split allocation has since been archived, rejects with **`422 ACCOUNT_ARCHIVED`**).
       * Re-evaluates all balance, debt, receivable, and business rule constraints against the **current locked database state**:
         * Allocation sum integrity (`BR-06`, `422 ALLOCATION_SUM_MISMATCH`).
         * For cash outflows (transfer `F-11`, credit card repayment `F-07`, loan given `F-12`, general loan repayment `F-13`): checks `amount <= currentCashBalance` (`422 INSUFFICIENT_FUNDS`).
         * For Credit Card Repayments (`F-07`): enforces **all `BR-07 v1.1` rules** against current locked debt and cash (`422 ZERO_OUTSTANDING_DEBT`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 INSUFFICIENT_FUNDS`, `422 MIN_REPAYMENT_NOT_MET`, `422 MINIMUM_CASH_RESERVE_VIOLATION`).
         * For General Loan Repayments (`F-13`) and Loan Recoveries (`F-12`): enforces `422 ZERO_OUTSTANDING_DEBT` / `422 REPAYMENT_EXCEEDS_DEBT` / `422 ZERO_OUTSTANDING_RECEIVABLE` / `422 RECOVERY_EXCEEDS_RECEIVABLE`.
       * Any violation aborts the duplication with **zero database writes**.
* **API Specification:**
  * `PATCH /api/transactions/:id/favorite` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transaction": { "id": "...", "is_favorite": true, ... } } }`
  * `POST /api/transactions/:id/duplicate` $\rightarrow$ `201 Created` `{ "success": true, "data": { "transaction": { "id": "<new-uuid>", "is_favorite": false, ... } } }`
  * **Error Codes:** `400 INVALID_FAVORITE_FLAG`, `400 INVALID_TRANSACTION_DATE`, `400 INVALID_DESCRIPTION`, `404 NOT_FOUND`, `422 ACCOUNT_ARCHIVED`, `422 INSUFFICIENT_FUNDS`, `422 ZERO_OUTSTANDING_DEBT`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 MIN_REPAYMENT_NOT_MET`, `422 MINIMUM_CASH_RESERVE_VIOLATION`, `422 ZERO_OUTSTANDING_RECEIVABLE`, `422 RECOVERY_EXCEEDS_RECEIVABLE`.
* **Acceptance Criteria:**
  * `AC-14-1`: Authenticated `USER` can toggle `is_favorite` (`true`/`false`) on their own transaction via `PATCH /api/transactions/:id/favorite`, and the updated status persists in `GET /api/transactions` (`TEST-FAV-01`).
  * `AC-14-2`: Authenticated `USER` can duplicate an existing transaction (including multi-line split allocations) via `POST /api/transactions/:id/duplicate`, producing a new transaction with a distinct `id`, fresh `created_at`/`updated_at`, `is_favorite = false`, `0` copied audit logs, and accurately updated account balances/summaries (`TEST-FAV-02`).
  * `AC-14-3`: Duplicating a transaction when a referenced primary or target account is archived returns `422 ACCOUNT_ARCHIVED`; duplicating a transaction whose side effect violates current balance/debt boundaries or `BR-07 v1.1` (e.g., `ZERO_OUTSTANDING_DEBT`, `REPAYMENT_EXCEEDS_DEBT`, `MIN_REPAYMENT_NOT_MET`, `MINIMUM_CASH_RESERVE_VIOLATION`, `INSUFFICIENT_FUNDS`) returns `422` with zero database writes; cross-tenant favorite/duplicate attempts return `404 Not Found` (`TEST-FAV-03`, `TEST-FAV-04`, `TEST-AUDIT-03`, `BR-01`).

---

### Feature F-15: Transaction Search & Multi-Criteria Filtering (`WP-10` / [Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58))
* **Feature ID:** `F-15`
* **Linked Requirements:** `FR-18`, `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` queries `GET /api/transactions`.
* **Feature SDS & Query Parameter Contract:**
  1. Client sends `GET /api/transactions` with optional, combinable query parameters:
     * `startDate` (`YYYY-MM-DD`): inclusive lower bound (`transaction_date >= startDate`).
     * `endDate` (`YYYY-MM-DD`): inclusive upper bound (`transaction_date <= endDate`).
       * **Validation:** If `startDate` or `endDate` is not a valid calendar date in `YYYY-MM-DD` format, or if both are provided and `startDate > endDate`, reject with **`400 Bad Request` (`INVALID_DATE_RANGE`)**.
     * `accountId` (UUID string): matches transactions where `primary_account_id === accountId` OR `allocation_lines.some(a => a.target_account_id === accountId)` (scoped to `req.user.id`).
     * `categoryId` (UUID string): matches transactions where `allocation_lines.some(a => a.target_account_id === categoryId)` (scoped to `req.user.id`).
     * `form`: allowed values `'PAYMENT_CHARGE' | 'RECEIVE_MONEY'`. Any other value returns **`400 Bad Request` (`INVALID_FILTER_PARAM`)**.
     * `type` (derived semantic transaction type filter):
       * **Allowed Values:** `'INCOME' | 'EXPENSE' | 'REPAYMENT' | 'TRANSFER' | 'LOAN'`. Any other non-empty value returns **`400 Bad Request` (`INVALID_FILTER_PARAM`)**.
       * **Semantic Mapping Rules:**
         * `'INCOME'`: `form === 'RECEIVE_MONEY'` and `allocation_lines.some(a => a.target_account.type === 'INCOME')`.
         * `'EXPENSE'`: `form === 'PAYMENT_CHARGE'` and `allocation_lines.some(a => a.target_account.type === 'EXPENSE')`.
         * `'REPAYMENT'`: `form === 'PAYMENT_CHARGE'` and `primary_account.type === 'CASH'` and `allocation_lines.some(a => a.target_account.type === 'LOAN_TAKEN' && a.target_account.subtype === 'CREDIT_CARD')`.
         * `'TRANSFER'`: `form === 'PAYMENT_CHARGE'` and `primary_account.type === 'CASH'` and `allocation_lines.some(a => a.target_account.type === 'CASH')`.
         * `'LOAN'`: transactions where `allocation_lines.some(a => a.target_account.type === 'LOAN_GIVEN' || (a.target_account.type === 'LOAN_TAKEN' && a.target_account.subtype === 'GENERAL_LOAN'))`.
     * `favorite`: allowed values `'true' | 'false'` (filters `is_favorite === true` or `false`). Any other value returns **`400 Bad Request` (`INVALID_FILTER_PARAM`)**.
     * `q`: trimmed keyword string ($\le 100$ chars) matching case-insensitively (`ILIKE %q%`) against `Transaction.description`, any `AllocationLine.notes`, or any referenced `Account.name`.
  2. All queries are unconditionally scoped with `WHERE user_id = req.user.id` (`BR-01`) and ordered by `transaction_date DESC, created_at DESC`.
* **API Specification:**
  * `GET /api/transactions?startDate=2026-11-01&endDate=2026-11-30&accountId=...&categoryId=...&form=PAYMENT_CHARGE&type=EXPENSE&favorite=true&q=salary` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transactions": [ ... ] } }`
  * **Error Codes:** `400 INVALID_DATE_RANGE`, `400 INVALID_FILTER_PARAM`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`.
* **Acceptance Criteria:**
  * `AC-15-1`: Filtering `GET /api/transactions` by `startDate` and `endDate` returns only the authenticated user's transactions within the inclusive date range; `startDate > endDate` or malformed date strings return `400 INVALID_DATE_RANGE` (`TEST-SRCH-01`, `TEST-SRCH-02`).
  * `AC-15-2`: Filtering by `accountId`, `categoryId`, `form`, `type` (`INCOME`, `EXPENSE`, `REPAYMENT`, `TRANSFER`, `LOAN`), `favorite`, and keyword `q` (individually and combined) returns the exact matching subset of transactions; invalid `form`, `type`, or `favorite` values return `400 INVALID_FILTER_PARAM` (`TEST-SRCH-03`, `TEST-SRCH-04`, `TEST-SRCH-06`).
  * `AC-15-3`: Search and filter results never include transactions belonging to another user even when passing another user's `accountId` or matching keyword (`TEST-SRCH-05`, `BR-01`).

---

### Feature F-16: Transaction Corrections (`WP-11` / [Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59))
* **Feature ID:** `F-16`
* **Linked Requirements:** `FR-19`, `BR-01`, `BR-05`, `BR-06`, `BR-07 v1.1`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns an existing recorded transaction `:id`.
* **Feature SDS, Atomicity & Concurrency Contract:**
  1. Client submits `PUT /api/transactions/:id` (or `PATCH /api/transactions/:id`) with `{ total_amount, transaction_date, description?, allocations: [{ target_account_id, amount, notes? }] }`.
  2. Pre-transaction input validation (zero DB writes):
     * Validate `total_amount` (`> 0.00`, max 2 decimals, no exponent notation $\rightarrow$ `400 INVALID_AMOUNT`), `transaction_date` (real `YYYY-MM-DD` date $\rightarrow$ `400 INVALID_TRANSACTION_DATE`), `description` ($\le 255$ chars $\rightarrow$ `400 INVALID_DESCRIPTION`), and `allocations` (non-empty array, each line `amount > 0.00` with max 2 decimals, no duplicate `target_account_id` $\rightarrow$ `400 DUPLICATE_ALLOCATION_ACCOUNT`).
     * Enforce `BR-06`: $\sum \text{allocations.amount} == \text{total\_amount}$, else reject with `422 ALLOCATION_SUM_MISMATCH`.
  3. **Atomic Execution, Row Locking & Audit Snapshot Integrity Inside Single `prisma.$transaction`:**
     * **Transaction Row Lock (Preventing Concurrent Corrections on the Same Transaction):**
       * Execute `SELECT id FROM transactions WHERE id = $id AND user_id = $userId FOR UPDATE` inside `prisma.$transaction`. If 0 rows are returned, abort with `404 NOT_FOUND` (`BR-01`).
       * Concurrent correction requests on the same transaction `:id` are serialized by PostgreSQL's row lock on `transactions`, ensuring snapshots are recorded in strict sequential order with no lost updates.
     * **Capture `previous_snapshot` Before Mutation:**
       * Read the locked transaction and its current `allocation_lines` (ordered deterministically by `id ASC`) to construct `previous_snapshot = { total_amount, transaction_date, description, allocations: [...] }`.
     * **Account Row Locks & Archived Account Guard:**
       * Collect all affected account IDs (`primary_account_id`, all existing `allocation_lines.target_account_id`, and all new `allocations.target_account_id`) and lock them in canonical ascending UUID order via `acquireAccountRowLocks(tx, allAccountIds, userId)`.
       * Verify every new `target_account_id` belongs to `req.user.id` (`404 NOT_FOUND`) and matches the allowed target account types/subtypes of the transaction (`400 INVALID_ACCOUNT_TYPE`).
       * **Archived Account Policy on Correction:** If the transaction's `primary_account` or any referenced `target_account` has `is_archived === true`, abort and roll back with **`422 ACCOUNT_ARCHIVED`** (an archived account must be unarchived first before its historical transactions or allocations can be modified).
     * **Apply Update & Re-Validate Resulting Account Balances/Debts Under Lock:**
       * Update `Transaction` (`total_amount`, `transaction_date`, `description`, `updated_at = NOW()`), replace its `allocation_lines`, and construct `new_snapshot = { total_amount, transaction_date, description, allocations: [...] }`.
       * Recompute the authoritative resulting balances of all affected `CASH`, `LOAN_TAKEN`, and `LOAN_GIVEN` accounts inside the transaction:
         * If any affected `CASH` account's resulting balance is `< 0.00` $\rightarrow$ abort & roll back with `422 INSUFFICIENT_FUNDS`.
         * If any affected `LOAN_TAKEN` debt or `LOAN_GIVEN` receivable is `< 0.00` $\rightarrow$ abort & roll back with `422 REPAYMENT_EXCEEDS_DEBT` / `422 RECOVERY_EXCEEDS_RECEIVABLE`.
         * If the transaction is a Credit Card Repayment (`F-07`), re-verify `BR-07 v1.1` minimum repayment floor (`422 MIN_REPAYMENT_NOT_MET`) and `100.00 THB` partial cash reserve (`422 MINIMUM_CASH_RESERVE_VIOLATION`) against the pre-repayment debt and cash balance.
     * **Atomic `TransactionAuditLog` Insertion (Mutual All-or-Nothing Atomicity):**
       * Insert 1 `TransactionAuditLog` row (`transaction_id`, `user_id`, `action: 'CORRECTED'`, `previous_snapshot`, `new_snapshot`) inside the **exact same `prisma.$transaction`**.
       * **Atomicity Guarantee:**
         * If the transaction update or any domain balance validation fails $\rightarrow$ the entire transaction rolls back and **zero `TransactionAuditLog` rows are written**.
         * If the `TransactionAuditLog` insert fails $\rightarrow$ the entire `prisma.$transaction` rolls back and **the `Transaction` and `AllocationLine` rows remain completely unmodified**.
* **API Specification:**
  * `PUT /api/transactions/:id` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transaction": { ... } } }`
  * **Error Codes:** `400 INVALID_AMOUNT`, `400 INVALID_TRANSACTION_DATE`, `400 INVALID_DESCRIPTION`, `400 DUPLICATE_ALLOCATION_ACCOUNT`, `400 INVALID_ACCOUNT_TYPE`, `404 NOT_FOUND`, `422 ACCOUNT_ARCHIVED`, `422 ALLOCATION_SUM_MISMATCH`, `422 INSUFFICIENT_FUNDS`, `422 REPAYMENT_EXCEEDS_DEBT`, `422 RECOVERY_EXCEEDS_RECEIVABLE`, `422 MIN_REPAYMENT_NOT_MET`, `422 MINIMUM_CASH_RESERVE_VIOLATION`.
* **Acceptance Criteria:**
  * `AC-16-1`: Authenticated `USER` can update the amount, date, description, and split allocation breakdown of their own transaction, atomically recording a `TransactionAuditLog` snapshot (`previous_snapshot` and `new_snapshot`), and `GET /api/reports/summary` immediately reflects the recalculated balances and totals (`TEST-CORR-01`, `TEST-CORR-02`).
  * `AC-16-2`: Submitting a correction with unbalanced allocation lines ($\sum \text{allocations} \ne \text{total\_amount}$) returns `422 ALLOCATION_SUM_MISMATCH`, rolls back completely, and writes zero audit log entries (`TEST-CORR-03`, `BR-06`).
  * `AC-16-3`: Submitting a correction that drives a `CASH` balance negative (`422 INSUFFICIENT_FUNDS`), violates `BR-07 v1.1` / debt bounds, references an archived account (`422 ACCOUNT_ARCHIVED`), or encounters an audit-log persistence failure rolls back atomically with zero partial state; concurrent corrections on the same transaction are serialized cleanly (`TEST-CORR-04`, `TEST-CORR-06`, `TEST-CORR-07`).
  * `AC-16-4`: Attempting to correct another user's transaction returns `404 Not Found` (`BR-01`), and `ADMIN` requests return `403 Forbidden` (`BR-10`) (`TEST-CORR-05`).

---

### Feature F-19: Platform User Directory & Access Governance (`WP-11` / [Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59))
* **Feature ID:** `F-19`
* **Linked Requirements:** `FR-03`, `FR-04`, `BR-09`, `BR-10`, `NFR-SEC-01`, `NFR-SEC-02`, `NFR-DATA-01`
* **Primary Actor:** `ADMIN` (`USER` strictly barred from `/api/admin/*`)
* **Preconditions:** Authenticated `ADMIN` session (`req.user.role === 'ADMIN'` and `is_active === true`).
* **Feature SDS & Fail-Closed Active User Verification Contract:**
  1. **List Platform User Directory (`GET /api/admin/users` — `FR-03`):**
     * Requires authenticated `ADMIN` role (`401 UNAUTHORIZED` if unauthenticated; `403 FORBIDDEN` with code `ADMIN_ONLY_ENDPOINT` if `req.user.role !== 'ADMIN'`).
     * Queries `users` table ordered by `created_at ASC` returning **strictly non-financial account governance fields**: `id`, `username`, `email`, `role`, `is_active`, `created_at`, `updated_at`.
     * **Strict Privacy Invariant (`BR-10`):** Never joins or returns `password_hash` (`NFR-SEC-01`), `accounts`, `opening_balance`, `transactions`, `allocation_lines`, or financial summaries.
  2. **Toggle User Access Status (`PATCH /api/admin/users/:id/status` — `FR-04`):**
     * Requires authenticated `ADMIN` role (`403 ADMIN_ONLY_ENDPOINT` for `USER`).
     * Request body: `{ "is_active": true | false }` (`400 INVALID_STATUS_PAYLOAD` if not boolean).
     * If target user `:id` does not exist, return `404 NOT_FOUND`.
     * Self-lockout guard: if `req.user.id === id` and `is_active === false`, reject with `422 CANNOT_DEACTIVATE_SELF`.
     * Updates `users.is_active` and returns `200 OK` with `{ id, username, email, role, is_active, updated_at }`.
  3. **Authoritative Fail-Closed `is_active` Enforcement Across Authentication & Session Guards (`F-01` + `F-19`):**
     * **On Login (`POST /api/auth/login`):** If credentials match a user with `is_active === false`, reject login with **`403 Forbidden` (`ACCOUNT_DISABLED`)** and do not set a session cookie.
     * **On Protected Requests With an Existing JWT Cookie (`authGuard.ts` & `GET /api/auth/me`):**
       * After verifying the JWT signature, `authGuard.ts` performs an **authoritative database query** (`prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, username: true, role: true, is_active: true } })`) to verify live user status.
       * If the user record is not found $\rightarrow$ clear cookie and return **`401 Unauthorized` (`UNAUTHORIZED`)**.
       * If `user.is_active === false` (e.g., the user logged in earlier and still holds an unexpired JWT cookie, then an `ADMIN` disabled their account) $\rightarrow$ immediately deny access with **`403 Forbidden` (`ACCOUNT_DISABLED`)** on every protected endpoint (`/api/auth/me`, `/api/accounts/*`, `/api/transactions/*`, `/api/reports/*`, `/api/admin/*`).
       * **Fail-Closed Policy on Database Lookup Failure:** If the database query in `authGuard.ts` throws an error or is unreachable, `authGuard.ts` **must fail closed** — it must **never** fall back to trusting the stateless JWT claims or allowing access to any protected endpoint. Instead, it denies the request immediately with **`503 Service Unavailable` (`AUTH_STATE_UNVERIFIABLE`)** and executes zero business operations.
* **API Specification:**
  * `GET /api/admin/users` $\rightarrow$ `200 OK` `{ "success": true, "data": { "users": [ { "id": "...", "username": "user_demo", "email": "user@whatsss.local", "role": "USER", "is_active": true, "created_at": "..." } ] } }`
  * `PATCH /api/admin/users/:id/status` $\rightarrow$ `200 OK` `{ "success": true, "data": { "user": { "id": "...", "username": "user_demo", "is_active": false, ... } } }`
  * **Error Codes:** `400 INVALID_STATUS_PAYLOAD`, `401 UNAUTHORIZED`, `403 ADMIN_ONLY_ENDPOINT`, `403 ACCOUNT_DISABLED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `404 NOT_FOUND`, `422 CANNOT_DEACTIVATE_SELF`, `503 AUTH_STATE_UNVERIFIABLE`.
* **Acceptance Criteria:**
  * `AC-19-1`: Authenticated `ADMIN` calling `GET /api/admin/users` receives `200 OK` with the platform user directory containing `id`, `username`, `email`, `role`, `is_active`, and `created_at`, and containing **zero** `password_hash` or financial ledger fields (`TEST-ADMIN-01`, `FR-03`, `BR-10`, `NFR-SEC-01`).
  * `AC-19-2`: Authenticated `ADMIN` calling `PATCH /api/admin/users/:id/status` with `{ "is_active": false }` disables the target user, and calling with `{ "is_active": true }` re-enables them (`TEST-ADMIN-02`, `FR-04`).
  * `AC-19-3`: A disabled user (`is_active = false`) is rejected with `403 ACCOUNT_DISABLED` both when attempting `POST /api/auth/login` and when presenting a previously issued JWT cookie to any protected endpoint; furthermore, if the database lookup in `authGuard` fails, access fails closed with `503 AUTH_STATE_UNVERIFIABLE` (`TEST-ADMIN-03`, `TEST-ADMIN-06`, `FR-04`).
  * `AC-19-4`: `USER` role calling `GET /api/admin/users` or `PATCH /api/admin/users/:id/status` receives `403 Forbidden` (`ADMIN_ONLY_ENDPOINT`); `ADMIN` attempting to deactivate their own account receives `422 CANNOT_DEACTIVATE_SELF`; `ADMIN` remains blocked (`403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`) from all `/api/accounts`, `/api/transactions`, and `/api/reports` endpoints (`TEST-ADMIN-04`, `TEST-ADMIN-05`, `BR-10`).

---

## 3. Sprint 2 Definition of Done (DoD)

A Sprint 2 feature and the integrated Sprint 2 release increment are declared **DONE** only when all of the following criteria are satisfied with verifiable commit SHA and test execution evidence:

1. **Contract-First Compliance:** Feature engineering contract, data model updates, API error codes, numbered ACs, and STS test IDs were committed and substantively peer-reviewed prior to implementation (`WP-07` / Issue #55 / PR #61).
2. **Database & Transactional Integrity:**
   * All multi-account and state-mutating workflows (`F-11` transfer, `F-12` loan given/recovery, `F-13` general borrowing/repayment, `F-14` duplicate, `F-16` correction) execute inside `prisma.$transaction` with canonical ascending UUID row locks (`acquireAccountRowLocks` / `SELECT ... FOR UPDATE`) and decimal-safe arithmetic (`Prisma.Decimal`).
   * Account name uniqueness (`F-10`) is enforced via normalized case-insensitive comparison (`normalized_name`) at both the application layer and the PostgreSQL unique index layer (`409 DUPLICATE_ACCOUNT_NAME`).
   * `TransactionAuditLog` (`F-16`) is written atomically inside the same `prisma.$transaction` as the transaction update and is protected by `onDelete: Restrict`.
3. **Business Rule & Security Preservation:**
   * `BR-01`: Cross-tenant requests return `404 Not Found` with zero data leakage.
   * `BR-02`: Opening balances and internal cash transfers (`F-11`) are excluded from `total_income` and `total_expense`.
   * `BR-06`: Multi-line split allocations in new, duplicated (`F-14`), and corrected (`F-16`) transactions strictly equal `total_amount`.
   * `BR-07 v1.1`: Credit card minimum repayment floor and `100.00 THB` partial cash reserve remain enforced for `CREDIT_CARD` accounts (`F-07`) while general loans (`F-13`, `GENERAL_LOAN`) are cleanly separated.
   * `BR-08`: Credit card repayments (`F-07`), loan given disbursements/recoveries (`F-12`), and general loan borrowings/repayments (`F-13`) are excluded from `total_income` and `total_expense`.
   * `BR-09` & `BR-10`: Unauthenticated requests return `401`; `authGuard` enforces `is_active === true` on a fail-closed basis (`403 ACCOUNT_DISABLED` / `503 AUTH_STATE_UNVERIFIABLE`); `ADMIN` can manage `/api/admin/users` (`F-19`) but remains unconditionally barred (`403`) from all user financial endpoints.
   * **Archived Account Guard:** Every transaction creation, duplication, and correction endpoint rejects archived primary or target accounts with `422 ACCOUNT_ARCHIVED` inside the locked database transaction.
4. **Automated Verification & Regression Safety:** Unit, API/database integration (including concurrency tests), and frontend component tests for all Sprint 2 ACs (`AC-10-*`..`AC-16-*`, `AC-19-*`) and all existing Sprint 1 + Lab 7 regression tests pass in GitHub Actions CI (`0 failed`) and compile cleanly (`npm run build` in both `server/` and `client/`).
5. **Teammate Peer Review & Release Traceability:** Every feature PR is substantively reviewed and approved by the non-author teammate (`R-09`: zero self-approvals), with the tested commit SHA and CI run URL recorded in the completion table.
