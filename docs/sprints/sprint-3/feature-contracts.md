# Sprint 3 Feature Engineering Contracts (Deliverable 2 — Part C)
## Project: Whatsss — Personal Finance Management Web Application (Theme 7)

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Deliverable:** Project Deliverable 2 (Part C: Sprint 3 Contracts and Working Progress — 15 Points)  
> **Team:** Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)  
> **Work Package:** `WP-07` ([Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) — Contracts) $\rightarrow$ `WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60) — Implementation & Release)  
> **Status:** `v3.2-part-e` — **Implemented, Released (`v0.2.0-sprint2-rc`), and Reconciled (`WP-12` / PR #66, PR #67, PR #68)**

### Document Revision History
| Version | Status | Date | Scope / Reference | Summary |
|---|---|---|---|---|
| `v0.1.0-sprint1` | **Accepted & Frozen Baseline** | 2026-11-08 | PR #14 (`f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d`) | Original 3-sprint plan allocating `F-17` (`FR-20`) and `F-18` (`FR-21`) to Sprint 3 (`docs/sprints/plan.md`). |
| `v3.0-contract` | **Sprint 3 Baseline Contracts (Pre-Implementation)** | 2026-11-26 | `WP-07` / [Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) / [PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61) (`d42b72000f5713479a93c2686041c598f1a37a29`) | Complete engineering contracts for all remaining Sprint 3 features (`F-17: Category Spending Summaries & Reports`, `F-18: Audited Correction History & Archival`), including UI/API/data specifications, reverse-chronological (`created_at DESC, id DESC`) audit ordering, append-only audit retention (`onDelete: Restrict`), per-AccountType archival rules, numbered ACs, STS mappings, Sprint 3 Definition of Done (DoD), and completion schedule by 13 December 2026. |
| `v3.1-amended` | **Contract Amendment (Teammate Review — `WP-12`)** | 2026-11-28 | `WP-12` / [Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60) / [PR #66](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/66) (`5c687a6262d8b781ef6309a25c7092fa8c6c80ed`) | **Audit Ordering Amendment:** Updates `F-18` audit-history ordering from `created_at DESC, id DESC` to **`sequence_number DESC`** (with `created_at DESC, id DESC` fallback), matching `schema.prisma` (`20261128000000_audit_log_sequence_number`). Timestamp/UUID ordering alone is insufficient because rapid or concurrent corrections under `FOR UPDATE` row locks can share an identical millisecond `created_at` and random UUID `id`s do not reflect commit/lock order. Also updates `TEST-AUDIT-05` file reference to `audit-history.test.ts` & `db-reports-audit-archive.test.ts`. |
| `v3.2-part-e` | **Part E Release Reconciliation (`v0.2.0-sprint2-rc`)** | 2026-11-28 | [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67) (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`), [PR #68](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/68) | Preserves original §4.1 historical schedule and adds §4.2 Sprint 2 Feature Completion Table (`WP-08`..`WP-11`) and §4.3 Sprint 3 Actual Progress & Remaining-Work Plan (`13 Dec 2026`). |

---

## 1. Overview & Sprint 3 Feature Scope

In accordance with `docs/features.md`, `docs/srs.md`, and `docs/sprints/plan.md`, Sprint 3 covers the two remaining product features required to complete the full Whatsss product vision (`FR-01` through `FR-21`):

1. **`F-17`: Category Spending Summaries & Period Reports (`FR-20`, `BR-01`, `BR-02`, `BR-08`, `BR-10`)** — Required Theme 7 analytics capability computing category-wise spending distributions, transaction counts, and percentage shares over user-selectable date ranges.
2. **`F-18`: Audited Correction History & Account Archival (`FR-21`, `BR-01`, `BR-10`, `NFR-DATA-01`)** — Approved Team Scope Addition providing an immutable, reverse-chronological (`sequence_number DESC`, with `created_at DESC, id DESC` fallback) audit trail of transaction corrections (`F-16`) and a safe soft-archive lifecycle (`is_archived`) across all five account types.

### 1.1 Cross-Layer Change Matrix
| Feature ID | Feature Name | Linked FR / BR / NFR | Database / Prisma Schema Layer | Backend API / Service Layer | Frontend UI Layer | Auth / CSRF / RoleGuard Middleware Layer |
|:---:|---|---|---|---|---|---|
| **`F-17`** | **Category Spending Summaries & Reports** | `FR-20`, `BR-01`, `BR-02`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No additional table needed:** Queries `allocation_lines` joined with `transactions` and `accounts` (`type === 'EXPENSE'`). | Adds `GET /api/reports/categories` (`report.controller.ts` / `report.service.ts`) supporting optional `startDate` & `endDate` filtering and decimal-safe percentage distribution (`roundHalfUp2`). | Enhances `DashboardPage.tsx` with date-range period filter, category progress bars, transaction counts, and percentage breakdown. | **No change required:** Protected by existing `authGuard` (`401`/`403`) and `roleGuard` (`403` for `ADMIN` on `/api/reports/*`). |
| **`F-18`** | **Audited Correction History & Account Archival** | `FR-21`, `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01` | Uses `TransactionAuditLog` (`onDelete: Restrict`, `sequence_number BigInt @unique @default(autoincrement())`, `@@index([transaction_id, sequence_number(sort: Desc)])`) and `Account.is_archived` (`Boolean @default(false)`). | Adds `GET /api/transactions/:id/audit-history` (ordered by `sequence_number DESC, created_at DESC, id DESC`) and `PATCH /api/accounts/:id/archive` (enforcing zero-balance archival precondition `422 ACCOUNT_BALANCE_NON_ZERO` and blocking transactions on archived accounts `422 ACCOUNT_ARCHIVED` across all transaction creation/duplication/correction endpoints). | Adds Audit History modal on `TransactionHistoryPage.tsx` and Archive/Unarchive action on `AccountListPage.tsx`. | **No change required:** Protected by existing `authGuard`, `roleGuard`, and `csrfGuard`. |

---

## 2. Detailed Sprint 3 Feature Engineering Contracts

---

### Feature F-17: Category Spending Summaries & Period Reports (`WP-12` / [Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60))
* **Feature ID:** `F-17`
* **Linked Requirements:** `FR-20`, `BR-01`, `BR-02`, `BR-04`, `BR-05`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER` (`ADMIN` strictly barred per `BR-10`)
* **Preconditions:** Authenticated `USER` session.
* **Feature SDS & Workflow:**
  1. Client sends `GET /api/reports/categories` with optional query parameters `startDate` (`YYYY-MM-DD`) and `endDate` (`YYYY-MM-DD`).
  2. Backend validates date parameters:
     * If `startDate` or `endDate` is provided, it must be a valid calendar date in `YYYY-MM-DD` format, and if both are provided, `startDate <= endDate` (otherwise return `400 INVALID_DATE_RANGE`).
  3. Backend queries all `AllocationLine` records belonging to `req.user.id` (`transaction.user_id === req.user.id` and `target_account.user_id === req.user.id`, `BR-01`) where:
     * `target_account.type === 'EXPENSE'`
     * `transaction.transaction_date` falls within `[startDate, endDate]` (if specified).
     * *(Note: Historical expense allocations targeting an `EXPENSE` category account that was later archived remain included in historical period reports per `NFR-DATA-01`.)*
  4. **Strict Exclusion Invariant (`BR-02`, `BR-08`):**
     * Opening balances (`F-03`), internal cash transfers (`F-11`, `target_account.type === 'CASH'`), credit card debt repayments (`F-07`, `target_account.type === 'LOAN_TAKEN'`), loan given disbursements/recoveries (`F-12`, `target_account.type === 'LOAN_GIVEN'`), general loan borrowings/repayments (`F-13`), and income allocations (`F-04`, `target_account.type === 'INCOME'`) are **strictly excluded** from category spending calculations.
  5. For each `EXPENSE` category account with spending $> 0.00$, backend computes using `Prisma.Decimal`:
     * `category_id`, `category_name`
     * `total_amount`: sum of matching allocation amounts formatted to 2 decimal places
     * `transaction_count`: number of distinct transactions allocating to this category in the period
     * `percentage`:
       $$\text{percentage} = \begin{cases} \text{roundHalfUp}_2\!\left(\frac{\text{category.total\_amount}}{\text{period\_total\_expense}} \times 100\right) & \text{if } \text{period\_total\_expense} > 0.00 \\ 0.00 & \text{if } \text{period\_total\_expense} = 0.00 \end{cases}$$
     * Categories are ordered deterministically by `total_amount DESC, category_name ASC`.
* **API Specification (`GET /api/reports/categories`):**
  * **Success (`200 OK`):**
    ```json
    {
      "success": true,
      "data": {
        "period": {
          "start_date": "2026-11-01",
          "end_date": "2026-11-30"
        },
        "total_expense": "3000.00",
        "categories": [
          {
            "category_id": "acc-grocery",
            "category_name": "Grocery",
            "total_amount": "2000.00",
            "transaction_count": 1,
            "percentage": "66.67"
          },
          {
            "category_id": "acc-dining",
            "category_name": "Dining",
            "total_amount": "1000.00",
            "transaction_count": 1,
            "percentage": "33.33"
          }
        ]
      }
    }
    ```
  * **Error Codes:** `400 INVALID_DATE_RANGE`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`.
* **Acceptance Criteria:**
  * `AC-17-1`: Calling `GET /api/reports/categories` returns accurate per-category spending totals, transaction counts, and `ROUND_HALF_UP` percentage shares ordered by `total_amount DESC, category_name ASC` (e.g., Golden Journey: `Grocery = 2000.00 (66.67%)`, `Dining = 1000.00 (33.33%)`, `total_expense = 3000.00`) (`TEST-REP-CAT-01`, `FR-20`).
  * `AC-17-2`: Filtering by `startDate` and `endDate` includes only `EXPENSE` allocations within the date window and strictly excludes transfers (`F-11`), credit card repayments (`F-07`), and loan transactions (`F-12`, `F-13`); invalid date ranges (`startDate > endDate`) return `400 INVALID_DATE_RANGE` (`TEST-REP-CAT-02`, `TEST-REP-CAT-03`, `BR-02`, `BR-08`).
  * `AC-17-3`: Cross-user expense records are excluded (`BR-01`), and `ADMIN` requests to `GET /api/reports/categories` return `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN` (`TEST-REP-CAT-04`, `BR-10`).

---

### Feature F-18: Audited Correction History & Account Archival (`WP-12` / [Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60))
* **Feature ID:** `F-18`
* **Linked Requirements:** `FR-21` (Approved Team Scope Addition), `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01`
* **Primary Actor:** `USER`
* **Preconditions:** Authenticated `USER` owns a transaction `:id` (for audit history) or an account `:id` (for archival lifecycle).
* **Feature SDS & Workflow:**
  1. **Inspect Transaction Audit History (`GET /api/transactions/:id/audit-history`):**
     * Backend verifies transaction `:id` belongs to `req.user.id` (`404 NOT_FOUND` if missing or owned by another user per `BR-01`).
     * Queries `transaction_audit_logs` where `transaction_id = :id` and `user_id = req.user.id`, ordered in **reverse chronological order (newest correction first): `ORDER BY sequence_number DESC, created_at DESC, id DESC`** (using database-allocated monotonic `BIGSERIAL` `sequence_number` because timestamp/UUID ordering alone is insufficient when rapid or concurrent corrections share identical timestamps).
     * Returns immutable audit entries showing `id`, `sequence_number` (decimal string preserving `BIGINT` precision beyond `Number.MAX_SAFE_INTEGER`), `transaction_id`, `action` (`'CORRECTED'`), `previous_snapshot` (`total_amount`, `transaction_date`, `description`, `allocations`), `new_snapshot`, and `created_at`. Snapshot allocation account/category names are resolved in the UI from the tenant's account list with safe `target_account_id` fallback; persisting denormalized historical category names at write time is a separate future enhancement.
  2. **Audit Log Retention, Immutability & Multi-Layer Deletion Protection (`onDelete: Restrict` + PostgreSQL Trigger):**
     * `TransactionAuditLog` is strictly **append-only** and retained permanently.
     * **Layer 1 — Application API Boundary:** The application API exposes **no** update (`PUT`/`PATCH`) or delete (`DELETE`) endpoints on `/api/transactions/:id/audit-history` or `/api/transactions/:id/audit-history/:logId` (any `PUT`, `PATCH`, or `DELETE` request to audit-history routes is rejected with `405 Method Not Allowed` / `404`).
     * **Layer 2 — Relational Foreign Key Protection (`onDelete: Restrict`):** The foreign key `transaction_audit_logs.transaction_id -> transactions.id` enforces **`onDelete: Restrict`** (never `Cascade`), rejecting any attempt to delete a parent `Transaction` that has audit history (`P2003` / `409 AUDIT_HISTORY_PROTECTED`) while leaving all existing audit log rows intact.
     * **Layer 3 — PostgreSQL Database Trigger Against Direct Mutation/Deletion:** The `WP-08` migration installs a `BEFORE UPDATE OR DELETE ON transaction_audit_logs` PostgreSQL trigger (`prevent_audit_log_mutation()`) that raises an exception (`'TransactionAuditLog records are immutable and cannot be updated or deleted'`), preventing direct ORM/SQL modification or deletion of audit log rows.
     * **Mandatory Verification in `WP-12` (`TEST-AUDIT-05`):** All three layers (API `PUT`/`PATCH`/`DELETE` rejection, direct DB/Prisma update/delete rejection, and parent `Transaction` deletion rejection with full preservation of existing audit history) must be executed and verified in `server/tests/integration/audit-history.test.ts` and `server/tests/integration/db-reports-audit-archive.test.ts` during `WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60)).
  3. **Account Soft-Delete Archival Lifecycle Across All 5 Account Types (`PATCH /api/accounts/:id/archive`):**
     * Request body: `{ "is_archived": true | false }` (`400 INVALID_ARCHIVE_PAYLOAD` if `is_archived` is missing or not a boolean).
     * Inside atomic `prisma.$transaction`:
       * Acquire pessimistic row lock on account `:id` via `acquireAccountRowLocks(tx, [accountId], userId)` (`SELECT ... FOR UPDATE`).
       * Verify account exists and belongs to `req.user.id` (`404 NOT_FOUND` on nonexistent or foreign account per `BR-01`).
       * **Per-Account-Type Archival Rules (All 5 Account Types Can Be Archived & Unarchived):**
         * **`CASH` Accounts:** May be archived (`is_archived = true`) **only** when current computed cash balance is exactly `0.00 THB`. If `currentCashBalance !== 0.00`, reject with **`422 Unprocessable Entity` (`ACCOUNT_BALANCE_NON_ZERO`)**.
         * **`LOAN_TAKEN` Accounts (both `CREDIT_CARD` and `GENERAL_LOAN`):** May be archived (`is_archived = true`) **only** when current computed outstanding debt is exactly `0.00 THB`. If `currentDebt !== 0.00`, reject with **`422 Unprocessable Entity` (`ACCOUNT_BALANCE_NON_ZERO`)**.
         * **`LOAN_GIVEN` Accounts:** May be archived (`is_archived = true`) **only** when current computed outstanding receivable balance is exactly `0.00 THB`. If `currentReceivable !== 0.00`, reject with **`422 Unprocessable Entity` (`ACCOUNT_BALANCE_NON_ZERO`)**.
         * **`INCOME` and `EXPENSE` Category Accounts:** Category accounts do not hold an asset/liability balance (`opening_balance = 0.00`); they can be archived (`is_archived = true`) at any time to retire a category from future transaction selection while preserving all historical transactions and category spending reports (`NFR-DATA-01`).
         * **Unarchiving (`is_archived = false`):** Any archived account across all 5 types (`CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`, `INCOME`, `EXPENSE`) owned by `req.user.id` can be unarchived (`{ "is_archived": false }`) at any time (`200 OK`), restoring its availability for new transactions.
       * Update `is_archived` and return `200 OK`.
  4. **System-Level Archived Account Guard on All Transaction Workflows:**
     * As defined in `docs/system-sds.md` §11.2 and `docs/sprints/sprint-2/feature-contracts.md` §1.2, every transaction creation, duplication, or correction endpoint (`F-04` Income, `F-05` Expense, `F-07` Credit Card Repayment, `F-11` Internal Cash Transfer, `F-12` Loan Given & Loan Recovery, `F-13` General Loan Borrowing & Repayment, `F-14` Duplicate Transaction, and `F-16` Transaction Correction) checks `account.is_archived` inside `prisma.$transaction` under `acquireAccountRowLocks`.
     * If the `primary_account` or **any** `AllocationLine.target_account` (including multi-line split allocations) has `is_archived === true`, the operation is rejected with **`HTTP 422 Unprocessable Entity` (`ACCOUNT_ARCHIVED`)** with zero database writes, while historical transactions and reports remain readable.
* **API Specification:**
  * `GET /api/transactions/:id/audit-history` $\rightarrow$ `200 OK` (ordered newest first: `sequence_number DESC, created_at DESC, id DESC`):
    ```json
    {
      "success": true,
      "data": {
        "transaction_id": "txn-1",
        "audit_logs": [
          {
            "id": "log-02",
            "sequence_number": "2",
            "transaction_id": "txn-1",
            "action": "CORRECTED",
            "previous_snapshot": {
              "total_amount": "22000.00",
              "transaction_date": "2026-11-06",
              "description": "First Salary Adjustment",
              "allocations": [{ "target_account_id": "acc-salary", "amount": "22000.00", "notes": null }]
            },
            "new_snapshot": {
              "total_amount": "25000.00",
              "transaction_date": "2026-11-06",
              "description": "Second Salary Adjustment",
              "allocations": [{ "target_account_id": "acc-salary", "amount": "25000.00", "notes": null }]
            },
            "created_at": "2026-11-26T10:15:00.000Z"
          },
          {
            "id": "log-01",
            "transaction_id": "txn-1",
            "action": "CORRECTED",
            "previous_snapshot": {
              "total_amount": "20000.00",
              "transaction_date": "2026-11-06",
              "description": "November Salary",
              "allocations": [{ "target_account_id": "acc-salary", "amount": "20000.00", "notes": null }]
            },
            "new_snapshot": {
              "total_amount": "22000.00",
              "transaction_date": "2026-11-06",
              "description": "First Salary Adjustment",
              "allocations": [{ "target_account_id": "acc-salary", "amount": "22000.00", "notes": null }]
            },
            "created_at": "2026-11-26T10:05:00.000Z"
          }
        ]
      }
    }
    ```
  * `PATCH /api/accounts/:id/archive` $\rightarrow$ `200 OK` `{ "success": true, "data": { "account": { "id": "...", "is_archived": true, ... } } }`
  * **Error Codes:** `400 INVALID_ARCHIVE_PAYLOAD`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `404 NOT_FOUND`, `405 METHOD_NOT_ALLOWED`, `409 AUDIT_HISTORY_PROTECTED`, `422 ACCOUNT_BALANCE_NON_ZERO`, `422 ACCOUNT_ARCHIVED`.
* **Acceptance Criteria:**
  * `AC-18-1`: When a transaction is corrected via `F-16`, calling `GET /api/transactions/:id/audit-history` returns the immutable audit trail ordered in **reverse chronological order (`sequence_number DESC`, newest entry first)** with exact `previous_snapshot` and `new_snapshot` values; audit logs cannot be modified, deleted, or lost via cascade deletion (`onDelete: Restrict`) (`TEST-AUDIT-01`, `TEST-AUDIT-05`, `FR-21`).
  * `AC-18-2`: Archiving (`is_archived = true`) a `CASH` account with `0.00` balance, a `LOAN_TAKEN` account with `0.00` debt, a `LOAN_GIVEN` account with `0.00` receivable, or an `INCOME`/`EXPENSE` category account succeeds (`200 OK`), and unarchiving (`is_archived = false`) restores active status (`200 OK`); attempting to archive a `CASH`, `LOAN_TAKEN`, or `LOAN_GIVEN` account with a non-zero balance, debt, or receivable returns `422 ACCOUNT_BALANCE_NON_ZERO` (`TEST-AUDIT-02`, `FR-21`).
  * `AC-18-3`: Attempting to create, duplicate, or correct a transaction across any workflow (`F-04` Income, `F-05` Expense, `F-07` Credit Card Repayment, `F-11` Transfer, `F-12` Loan Given/Recovery, `F-13` General Loan Borrowing/Repayment, `F-14` Duplicate, `F-16` Correction) when the `primary_account` or any `AllocationLine.target_account` (including split allocations) has `is_archived = true` — including under concurrent archive and transaction creation requests — returns `422 ACCOUNT_ARCHIVED` with zero database writes, while historical records remain readable; cross-user audit/archive requests return `404 Not Found` (`TEST-AUDIT-03`, `TEST-AUDIT-04`, `TEST-AUDIT-06`, `BR-01`, `NFR-DATA-01`).

---

## 3. Sprint 3 Definition of Done (DoD)

A Sprint 3 feature (`F-17`, `F-18`) and the integrated Sprint 3 / Deliverable 2 release candidate are declared **DONE** only when all of the following criteria are satisfied with concrete execution evidence:

1. **Contract & AC Peer Review (`WP-07` / Issue #55 / PR #61):**
   * Complete feature contracts, data schemas, API specifications, error envelopes, numbered Acceptance Criteria (`AC-17-1`..`3`, `AC-18-1`..`3`), and STS test cases (`TEST-REP-CAT-01`..`04`, `TEST-AUDIT-01`..`06`) are reviewed and approved by the teammate prior to merging implementation PRs.
2. **Feature `F-17` Implementation & Verification Completeness (`FR-20`):**
   * **Backend / API:** `GET /api/reports/categories` implemented with `startDate`/`endDate` validation (`400 INVALID_DATE_RANGE`), `Prisma.Decimal` aggregation, `ROUND_HALF_UP` percentage calculation, deterministic `total_amount DESC, category_name ASC` ordering, and strict exclusion of opening balances (`BR-02`), internal transfers (`F-11`, `BR-02`), credit card repayments (`F-07`, `BR-08`), and loan principal flows (`F-12`, `F-13`, `BR-08`).
   * **Frontend UI:** Category Spending breakdown and period filter rendered on `DashboardPage.tsx` / `ReportsPage`.
   * **Automated Tests:** Unit, API/database integration, and UI component tests (`TEST-REP-CAT-01`..`04`) executed and passing (`0 failed`).
3. **Feature `F-18` Implementation & Verification Completeness (`FR-21`):**
   * **Database:** `TransactionAuditLog` table created with `onDelete: Restrict`, monotonic `sequence_number` (`BIGSERIAL`), and index `(transaction_id, sequence_number DESC)`; `Account.is_archived` persisted in PostgreSQL.
   * **Backend / API:** `GET /api/transactions/:id/audit-history` (returning newest-first `sequence_number DESC` snapshots with zero update/delete mutation endpoints) and `PATCH /api/accounts/:id/archive` (enforcing zero-balance/debt/receivable precondition `422 ACCOUNT_BALANCE_NON_ZERO` on `CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`, allowing `INCOME`/`EXPENSE` category archival and unarchival, and enforcing `422 ACCOUNT_ARCHIVED` across all transaction creation/duplication/correction workflows under `acquireAccountRowLocks`).
   * **Frontend UI:** Audit History viewer modal/drawer on `TransactionHistoryPage.tsx` and Archive/Unarchive controls on `AccountListPage.tsx`.
   * **Automated Tests:** Integration, concurrency, and UI tests (`TEST-AUDIT-01`..`06`) executed and passing (`0 failed`).
4. **Business Rules, Permissions, Persistence & Negative Cases:**
   * `BR-01` (tenancy isolation returning `404 NOT_FOUND`), `BR-02` & `BR-08` (report exclusions), `BR-09` (`401` unauthenticated), `BR-10` (`403` for `ADMIN` on `/api/reports/categories`, `/api/transactions/:id/audit-history`, and `/api/accounts/:id/archive`), and `NFR-DATA-01` (PostgreSQL persistence) are verified by automated positive, negative, and boundary test cases.
5. **Full Regression Suite, Teammate Peer Review & Evidence Traceability:**
   * All Sprint 1, Lab 7, Sprint 2, and Sprint 3 backend and frontend test suites pass in GitHub Actions CI (`0 failed`), and both `server/` and `client/` build cleanly (`npm run build`).
   * Implementation PR (`WP-12` / Issue #60) is substantively reviewed and approved by the non-author teammate (`R-09`), and the exact **40-character tested Commit SHA**, **GitHub Actions CI Run URL**, and **pass/fail/skip counts** are recorded in the Sprint 3 progress table and `docs/traceability.md`.

---

## 4. Sprint 2 & Sprint 3 Plan, Actual Progress & Remaining-Work Schedule (to 13 December 2026)

### 4.1 Original Planned Schedule (Historical — `WP-07` Contract Stage)

> *Note: Preserved verbatim from `WP-07` ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) for historical traceability. See §4.2 and §4.3 for actual completion and remaining work.*

Per Deliverable 2 Section 3.3, the team plans around the final examination period (`1–11 December 2026`) by completing all Sprint 2 workflows (`F-10`..`F-16`, `F-19`) and implementing Sprint 3 workflows (`F-17`, `F-18`) for the **29 November 2026 Deliverable 2 Release Candidate**, leaving only bounded final UAT re-verification, presentation video recording, and final PDF packaging for `11–13 December 2026`:

| Feature / Work Item | Target ACs & Tests | Owner | Target Completion Date | Status at `WP-07` Contract Stage |
|---|---|---|---|---|
| **`WP-07` ([Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55)):** Sprint 2 & 3 Contracts, Schema SDS & STS | `AC-10-*`..`AC-19-*`, `TEST-ACC-*`..`TEST-AUDIT-*` | `@Apichaya251400` (Rev: `@Pilaiwan3492`) | **26 Nov 2026** | **Implemented in PR #61 (Ready for Peer Review)** |
| **`WP-08` ([Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56)):** `F-10` Custom Accounts, `F-11` Cash Transfer & Prisma Schema | `AC-10-1`..`3`, `AC-11-1`..`4` (`TEST-ACC-01`..`05`, `TEST-XFER-01`..`06`) | `@Apichaya251400` (Rev: `@Pilaiwan3492`) | **27 Nov 2026** | **Contracted (Next in Queue)** |
| **`WP-09` ([Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57)):** `F-12` Loan Given & `F-13` General Loan Taken | `AC-12-1`..`4`, `AC-13-1`..`4` (`TEST-LOAN-GIVEN-01`..`05`, `TEST-LOAN-TAKEN-01`..`05`) | `@Apichaya251400` (Rev: `@Pilaiwan3492`) | **27 Nov 2026** | **Contracted** |
| **`WP-10` ([Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58)):** `F-14` Favorite/Duplicate & `F-15` Search/Filter | `AC-14-1`..`3`, `AC-15-1`..`3` (`TEST-FAV-01`..`04`, `TEST-SRCH-01`..`06`) | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **28 Nov 2026** | **Contracted** |
| **`WP-11` ([Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59)):** `F-16` Transaction Corrections & `F-19` Admin Governance | `AC-16-1`..`4`, `AC-19-1`..`4` (`TEST-CORR-01`..`07`, `TEST-ADMIN-01`..`06`) | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **28 Nov 2026** | **Contracted** |
| **`WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60)):** Sprint 3 `F-17` Category Reports & `F-18` Audit/Archival + D2 Release Candidate on GCP | `AC-17-1`..`3`, `AC-18-1`..`3` (`TEST-REP-CAT-01`..`04`, `TEST-AUDIT-01`..`06`) + Complete RTM (`docs/traceability.md`) + GCP Deploy | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **29 Nov 2026** | **Contracted** |
| **Final Exam Period Buffer (`1–11 Dec 2026`)** | Final examination window (no heavy coding scheduled) | Both Students | **1–11 Dec 2026** | **Reserved Buffer** |
| **Final Deliverable 3 Polish, Video & Release (`11–13 Dec 2026`)** | Cross-feature E2E regression polish, <10-min presentation video, Final Release tag `v1.0.0` | Both Students | **12–13 Dec 2026** | **Planned** |

---

### 4.2 Sprint 2 Feature Completion Table (`WP-08`..`WP-11`)

| Work Package | Features | Impl Status | Test Status | Merge Status | PR | Merge SHA (`staging-lab5`) | Tested SHA | CI Run URL |
|---|---|---|---|---|---|---|---|---|
| **`WP-08`** (#56) | `F-10` Custom Accounts, `F-11` Cash Transfer | **Completed** | **Passed** (`TEST-ACC-01`..`05`, `TEST-XFER-01`..`06`) | **Merged (`staging-lab5` & `main` `467eb4c`)** | [PR #62](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/62) | `10f33c0641d96d16cf0addcc07b4fb13e3111142` | `5e31264c7a08a21b7379e0eda7d20583f2cd395a` | [CI #279 (`45961894238`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/45961894238) |
| **`WP-09`** (#57) | `F-12` Loan Given, `F-13` General Loan Taken | **Completed** | **Passed** (`TEST-LOAN-GIVEN-01`..`05`, `TEST-LOAN-TAKEN-01`..`05`) | **Merged (`staging-lab5` & `main` `467eb4c`)** | [PR #65](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/65) | `8b015478d530c930a02fc8f006599fc985578b90` | `795ef8884665d65b08c31a4280471120b89ccccf` | [CI #281 (`45990625475`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/45990625475) |
| **`WP-10`** (#58) | `F-14` Favorite/Duplicate, `F-15` Search/Filter | **Completed** | **Passed** (`TEST-FAV-01`..`05`, `TEST-SRCH-01`..`06`) | **Merged (`staging-lab5` & `main` `467eb4c`)** | [PR #63](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/63) | `b7b9f16bc0d92b4e0528b419dbd72a9d3bbca0a7` | `805524297891c2632436088f1c66e8c41bd04476` | [CI #282 (`45998344358`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/45998344358) |
| **`WP-11`** (#59) | `F-16` Corrections, `F-19` Admin Governance | **Completed** | **Passed** (`TEST-CORR-01`..`07`, `TEST-ADMIN-01`..`06`) | **Merged (`staging-lab5` & `main` `467eb4c`)** | [PR #64](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/64) | `f3cd70bfeb34dca10057d7dedd9859d6262fcaf8` | `d34e46f02d4dd9310844a9e85da7e6618bdde53a` | [CI #299 (`46040062231`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46040062231) |

---

### 4.3 Sprint 3 Actual Progress, Evidence & Remaining-Work Plan (`F-17`, `F-18`, Part D, Part E)

| Work Item / Scope | Current Status | Owner | Target / Completion Date | Dependencies | Required / Verified Evidence |
|---|---|---|---|---|---|
| **`F-17` Category Spending Reports** (`FR-20`, `WP-12`) | **Completed** (`Released & Deployed` `v0.2.0-sprint2-rc`) | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **Completed 2026-11-28** | `WP-07`, `WP-11` | [PR #66](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/66) (`5c687a6262d8b781ef6309a25c7092fa8c6c80ed`), [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67) (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`), [Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583) |
| **`F-18` Audit History & Account Archival** (`FR-21`, `WP-12`) | **Completed** (`Released & Deployed` `v0.2.0-sprint2-rc`) | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **Completed 2026-11-28** | `WP-08`..`WP-11` | [PR #66](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/66) (`5c687a6262d8b781ef6309a25c7092fa8c6c80ed`), [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67) (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`), [Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583) |
| **Part D: Requirements & Test Traceability Sync** | **Implemented (Pending Merge to `main`)** | `@Pilaiwan3492` | **2026-11-28** | `PR #67` (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`) | [PR #68](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/68), [`docs/traceability.md`](../../traceability.md) (Pending merge) |
| **Part E: Cloud Run Release, Smoke Checks & Live Demo** | **Release & Demo Completed; Doc PR #68 Pending Merge** | `@Pilaiwan3492` | **2026-11-28** | `PR #67`, `PR #68` | [Deploy #13](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654) (`whatsss-00030-k42`), [`deliverable-2-report.pdf`](../sprint-2/deliverable-2-report.pdf); [PR #68](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/68) merge pending |
| **Final Exam Period Buffer** | **Pending** (Scheduled Buffer) | Both Students | **1–11 Dec 2026** | Deliverable 2 submitted | — |
| **Final Deliverable 3 Polish, Presentation Video & `v1.0.0`** | **Pending** | Both Students | **13 Dec 2026** | Final exams complete | Final E2E regression, `<10`-min video, `v1.0.0` release tag |
