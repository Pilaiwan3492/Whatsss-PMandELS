# Feature Inventory & Product Baseline Catalog (Part B & Deliverable 2 Part D)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part B) & Deliverable 2 (Part D: Updated Feature Inventory & Status)  
> **Accepted Sprint 1 Baseline:** `v0.1.0-sprint1` (`f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d`, `2026-11-08`)  
> **Post-Lab 7 Baseline on `main`:** `9054b45880dc4e4a38f86560f0d6fb16fa6a8895` (`2026-11-26`)  
> **Status:** `v2.0-contract` — Sprint 1 + Lab 6/7 (`F-01`..`F-09`) Implemented & CI-Verified; Sprint 2 (`F-10`..`F-16`, `F-19`) & Sprint 3 (`F-17`..`F-18`) Contracted in `WP-07` ([Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) / [PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61))

### Document Revision History
| Version | Status | Date | Scope / Reference | Summary |
|---|---|---|---|---|
| `v0.1.0-sprint1` | **Accepted & Frozen Baseline** | 2026-11-08 | PR #14 (`f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d`) | Original Deliverable 1 feature inventory (`F-01`..`F-19`). |
| `v1.1-full` | **Lab 6 & Lab 7 Amendments Integrated** | 2026-11-26 | PR #43..#44 (`098c28f`), PR #51..#54 (`9054b45`) | Updated `F-02` (`DEF-OUT-01` case-insensitive `roleGuard`) and `F-07` (`BR-07 v1.1` minimum repayment floor, `<500` full settlement, `100.00 THB` partial cash reserve, `ZERO_OUTSTANDING_DEBT`). |
| `v2.0-contract` | **Sprint 2 & Sprint 3 Contracted Catalog** | 2026-11-26 | Deliverable 2 `WP-07` / [Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) / [PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61) | Adds Section 4 & Section 5 high-level specifications and AC/Work-Package mappings for all Sprint 2 (`F-10`..`F-16`, `F-19`) and Sprint 3 (`F-17`, `F-18`) features. |

---

## 1. Purpose and Identification Scheme

This document establishes the authoritative Feature Inventory for Whatsss. Each feature is assigned an immutable identifier `F-XX` (where `XX` is a two-digit integer).

Features are partitioned into:
1. **Sprint 1 Core Features (`F-01` to `F-09`):** The foundational Golden Domain Journey slice implemented and verified in Deliverable 1 (`v0.1.0-sprint1`) and enhanced in Labs 5–7 (`9054b45880dc4e4a38f86560f0d6fb16fa6a8895`).
2. **Sprint 2 Core Expansion Features (`F-10` to `F-16`, `F-19`):** Full account self-management, internal cash transfers, peer lending (`Loan Given`), general borrowing (`Loan Taken`), favorite/duplicate transactions, multi-criteria search/filtering, transaction corrections, and platform user directory governance.
3. **Sprint 3 Analytics & Governance Features (`F-17`, `F-18`):** Category spending distribution reports (`FR-20`) and audited correction history with soft-delete account archival lifecycle (`FR-21`).

---

## 2. Feature Inventory Matrix (`F-01` to `F-19`)

| Feature ID | Feature Name | Primary Actor | Target Sprint | Work Package & Issue | Current Status | Summary Description |
|:---:|---|:---:|:---:|---|---|---|
| **`F-01`** | **Authentication & Session** | `USER`, `ADMIN` | **Sprint 1** | `WP-01` (#2) | **Implemented & Verified** (`9054b45`) | User login, logout, and current user identity/role verification via `HttpOnly` cookies (`AC-01-1`..`5`). |
| **`F-02`** | **Authorization & Privacy** | `USER`, `ADMIN` | **Sprint 1 + Lab 6** | `WP-01` (#2), Lab 6 (#37) | **Implemented & Verified** (`9054b45`) | Backend tenancy isolation (`BR-01`), CSRF/CORS/Content-Type guards, and case-insensitive `ADMIN` financial privacy enforcement (`BR-10`, `DEF-OUT-01`, `AC-02-1`..`4`). |
| **`F-03`** | **Opening Balance** | `USER` | **Sprint 1** | `WP-02` (#3) | **Implemented & Verified** (`9054b45`) | Record starting balance on eligible accounts prior to first transaction; atomic lock on first transaction (`BR-02`, `AC-03-1`..`4`). |
| **`F-04`** | **Income Transaction** | `USER` | **Sprint 1** | `WP-03` (#4) | **Implemented & Verified** (`9054b45`) | Record salary received into bank account with date; updates cash balance and income summary (`BR-03`, `AC-04-1`..`2`). |
| **`F-05`** | **Credit Card Purchase** | `USER` | **Sprint 1** | `WP-04` (#5) | **Implemented & Verified** (`9054b45`) | Record purchase charged to credit card with date; increases debt and expense summary (`BR-04`, `AC-05-1`..`3`). |
| **`F-06`** | **Multiple Allocations** | `USER` | **Sprint 1** | `WP-04` (#5) | **Implemented & Verified** (`9054b45`) | Split credit purchase into Dining & Grocery lines; validates allocation sum equals total (`BR-05`, `BR-06`, `AC-06-1`..`3`). |
| **`F-07`** | **Credit Card Repayment** | `USER` | **Sprint 1 + Lab 7** | `WP-05` (#6), Lab 7 (#47..#50) | **Implemented & Verified** (`9054b45`) | Repay credit card (`subtype: CREDIT_CARD`) from bank account; enforces `BR-07 v1.1` minimum repayment floor (`max(500.00, 10%)`), `<500` full settlement, `100.00 THB` partial cash reserve, `ZERO_OUTSTANDING_DEBT`, and expense exclusion (`BR-08`, `AC-07-1`..`10`). |
| **`F-08`** | **Balance & Summary** | `USER` | **Sprint 1** | `WP-06` (#7) | **Implemented & Verified** (`9054b45`) | Real-time deterministic computation of bank balance, credit debt, total income, and total expenses (`AC-08-1`). |
| **`F-09`** | **Transaction History** | `USER` | **Sprint 1** | `WP-06` (#7) | **Implemented & Verified** (`9054b45`) | Display chronological list of persisted user transactions and allocation splits across restarts (`AC-09-1`..`2`). |
| **`F-10`** | **Account Creation & Management** | `USER` | **Sprint 2** | `WP-08` ([Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56) / [PR #62](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/62)) | **Implemented & Verified in `WP-08`** ([PR #62](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/62)) | User custom creation and renaming of accounts across all 5 types (`CASH`, `LOAN_TAKEN` with `CREDIT_CARD`/`GENERAL_LOAN` subtype, `LOAN_GIVEN`, `INCOME`, `EXPENSE`) with normalized case-insensitive uniqueness (`409 DUPLICATE_ACCOUNT_NAME`, `AC-10-1`..`3`). |
| **`F-11`** | **Internal Cash Transfer** | `USER` | **Sprint 2** | `WP-08` ([Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56) / [PR #62](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/62)) | **Implemented & Verified in `WP-08`** ([PR #62](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/62)) | Atomic transfer between user's own `CASH` accounts under row locks without affecting income/expense summaries (`BR-02`, `AC-11-1`..`4`). |
| **`F-12`** | **Loan Given & Recovery** | `USER` | **Sprint 2** | `WP-09` ([Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Track money lent to third parties (`LOAN_GIVEN` disbursement) and subsequent repayment recoveries without affecting income/expense summaries (`BR-08`, `AC-12-1`..`4`). |
| **`F-13`** | **General Loan Taken & Repayment** | `USER` | **Sprint 2** | `WP-09` ([Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Track money borrowed (`LOAN_TAKEN`, `subtype: GENERAL_LOAN`) and principal repayments cleanly separated from Credit Card `F-07` (`BR-07 v1.1`, `BR-08`, `AC-13-1`..`4`). |
| **`F-14`** | **Favorite & Duplicate Transactions** | `USER` | **Sprint 2** | `WP-10` ([Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Toggle `is_favorite` on transactions and duplicate existing transactions (with new UUID, fresh timestamps, `is_favorite = false`, `0` copied audit logs, and live rule re-validation, `AC-14-1`..`3`). |
| **`F-15`** | **Transaction Search & Filtering** | `USER` | **Sprint 2** | `WP-10` ([Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Query transactions by `startDate`, `endDate`, `accountId`, `categoryId`, `form`, semantic `type`, `favorite`, and keyword `q` (`AC-15-1`..`3`). |
| **`F-16`** | **Transaction Corrections** | `USER` | **Sprint 2** | `WP-11` ([Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Atomically update transaction amount, date, description, and split allocations under row locks with balance re-validation and immutable `TransactionAuditLog` snapshot creation (`AC-16-1`..`4`). |
| **`F-17`** | **Category Spending Summaries & Reports** | `USER` | **Sprint 3** | `WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Period-filtered category spending totals, transaction counts, and `ROUND_HALF_UP` percentage shares excluding transfers, repayments, and loans (`FR-20`, `BR-02`, `BR-08`, `AC-17-1`..`3`). |
| **`F-18`** | **Audited Correction History & Archival** | `USER` | **Sprint 3** | `WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Reverse-chronological (`created_at DESC, id DESC`), append-only (`onDelete: Restrict`) correction audit trail and zero-balance account archival lifecycle (`422 ACCOUNT_ARCHIVED`, `FR-21`, `AC-18-1`..`3`). |
| **`F-19`** | **Platform User Directory & Governance** | `ADMIN` | **Sprint 2** | `WP-11` ([Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59)) | **Contracted in `WP-07`** ([PR #61](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/61)) | Administrator inspection of non-financial user directory (`FR-03`) and fail-closed `is_active` access governance (`FR-04`, `403 ACCOUNT_DISABLED`, `503 AUTH_STATE_UNVERIFIABLE`, `BR-10`, `AC-19-1`..`4`). |

---

## 3. Sprint 1 Feature Specifications (`F-01` to `F-09`)

### Feature F-01: Authentication & Session
* **User Goal:** As a user or admin, I want to authenticate securely and terminate my session so my identity is verified.
* **Scope (Sprint 1):** Login with credentials, secure `HttpOnly` cookie session management, idempotent logout, and identity resolution endpoint (`/api/auth/me`).
* **Linked Requirements & ACs:** `FR-01`, `FR-02`, `NFR-SEC-01`, `BR-09`, `AC-01-1`..`AC-01-5`.

### Feature F-02: Authorization & Privacy
* **User Goal:** As a user, I want my financial records completely isolated from other users and platform administrators.
* **Scope (Sprint 1 + Lab 6):** Backend tenancy check (`404 NOT_FOUND`), case-insensitive `roleGuard.ts` rejecting `ADMIN` access to financial routes (`403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `DEF-OUT-01`), CSRF Origin/Referer validation, CORS preflight, and JSON Content-Type guard.
* **Linked Requirements & ACs:** `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`, `AC-02-1`..`AC-02-4`.

### Feature F-03: Opening Balance
* **User Goal:** As a user, I want to set an initial starting balance on my bank account before recording transactions.
* **Scope (Sprint 1):** Record opening balance on unlocked accounts; lock balance atomically upon first committed transaction; exclude opening balance from income/expense calculations.
* **Linked Requirements & ACs:** `FR-05`, `BR-02`, `NFR-DATA-01`, `AC-03-1`..`AC-03-4`.

### Feature F-04: Income Transaction
* **User Goal:** As a user, I want to record my received salary into my bank account.
* **Scope (Sprint 1):** Record salary inflow with date; update receiving bank balance and income summary.
* **Linked Requirements & ACs:** `FR-06`, `BR-03`, `NFR-DATA-01`, `AC-04-1`..`AC-04-2`.

### Feature F-05: Credit Card Purchase
* **User Goal:** As a user, I want to record an expense transaction charged to my credit card.
* **Scope (Sprint 1):** Record credit charge with date; increase credit card liability balance and expense summary.
* **Linked Requirements & ACs:** `FR-07`, `BR-04`, `NFR-DATA-01`, `AC-05-1`..`AC-05-3`.

### Feature F-06: Multiple Allocations
* **User Goal:** As a user, I want to split a single credit card purchase into Dining and Grocery allocations.
* **Scope (Sprint 1):** Multi-line split allocation engine; strictly enforce that $\sum \text{allocation} = \text{total}$ and reject duplicate categories.
* **Linked Requirements & ACs:** `FR-08`, `BR-05`, `BR-06`, `AC-06-1`..`AC-06-3`.

### Feature F-07: Credit Card Repayment
* **User Goal:** As a user, I want to pay off my credit card balance from my bank account.
* **Scope (Sprint 1 + Lab 7 `BR-07 v1.1`):** Transfer funds from `CASH` to Credit Card (`LOAN_TAKEN`, `subtype: CREDIT_CARD`); enforce minimum repayment floor (`max(500.00, 10%)` or full settlement for `< 500.00`), `100.00 THB` partial cash reserve (with full-settlement exemption), and zero-debt rejection (`422 ZERO_OUTSTANDING_DEBT`); exclude from expenses (`BR-08`).
* **Linked Requirements & ACs:** `FR-09`, `BR-07` (`BR-07 v1.1`), `BR-08`, `AC-07-1`..`AC-07-10`.

### Feature F-08: Balance & Summary
* **User Goal:** As a user, I want to view my current bank balance, outstanding debt, and total income and expenses.
* **Scope (Sprint 1):** Computed summaries derived deterministically from persisted transactions.
* **Linked Requirements & ACs:** `FR-10`, `BR-02`, `BR-08`, `AC-08-1`.

### Feature F-09: Transaction History
* **User Goal:** As a user, I want to inspect all my recorded transactions and their allocation breakdowns.
* **Scope (Sprint 1):** Query and display historical transactions and allocations belonging to the authenticated user with durability across restarts.
* **Linked Requirements & ACs:** `FR-11`, `NFR-DATA-01`, `AC-09-1`..`AC-09-2`.

---

## 4. Sprint 2 Feature Specifications (`F-10` to `F-16`, `F-19` — Detailed Contracts in `docs/sprints/sprint-2/feature-contracts.md`)

### Feature F-10: Account Creation & Management (`WP-08` / Issue #56)
* **User Goal:** As a user, I want to create and rename custom accounts across all five account types (`CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`, `INCOME`, `EXPENSE`).
* **Scope (Sprint 2):** `POST /api/accounts` and `PATCH /api/accounts/:id` with trimmed/collapsed whitespace normalization, case-insensitive uniqueness per user (`409 DUPLICATE_ACCOUNT_NAME`), and `AccountSubtype` (`CREDIT_CARD` vs. `GENERAL_LOAN`) support.
* **Linked Requirements & ACs:** `FR-12`, `BR-01`, `BR-02`, `BR-10`, `AC-10-1`..`AC-10-3`.

### Feature F-11: Internal Cash Transfer (`WP-08` / Issue #56)
* **User Goal:** As a user, I want to transfer funds between my own cash/bank accounts without inflating my income or expense summaries.
* **Scope (Sprint 2):** `POST /api/transactions/transfer` executing atomically under sorted `SELECT ... FOR UPDATE` row locks, conserving net cash and excluding transfers from income/expense (`BR-02`).
* **Linked Requirements & ACs:** `FR-13`, `BR-01`, `BR-02`, `BR-10`, `AC-11-1`..`AC-11-4`.

### Feature F-12: Loan Given & Recovery (`WP-09` / Issue #57)
* **User Goal:** As a user, I want to record money lent to others and track principal recoveries back into my cash account.
* **Scope (Sprint 2):** `POST /api/transactions/loan-given` and `POST /api/transactions/loan-recovery` updating `CASH` and `LOAN_GIVEN` receivable balances atomically while excluding loan principal flows from income/expense (`BR-08`).
* **Linked Requirements & ACs:** `FR-14`, `BR-01`, `BR-08`, `BR-10`, `AC-12-1`..`AC-12-4`.

### Feature F-13: General Loan Taken & Repayment (`WP-09` / Issue #57)
* **User Goal:** As a user, I want to record general borrowed money and principal repayments separately from credit card bills.
* **Scope (Sprint 2):** `POST /api/transactions/loan-borrowing` and `POST /api/transactions/loan-repayment` on `LOAN_TAKEN` accounts with `subtype: GENERAL_LOAN`, excluded from income/expense (`BR-08`) and separated from Credit Card `F-07` (`BR-07 v1.1`).
* **Linked Requirements & ACs:** `FR-15`, `BR-01`, `BR-07 v1.1`, `BR-08`, `BR-10`, `AC-13-1`..`AC-13-4`.

### Feature F-14: Favorite & Duplicate Transactions (`WP-10` / Issue #58)
* **User Goal:** As a user, I want to bookmark frequent transactions as favorites and duplicate an existing transaction for rapid entry.
* **Scope (Sprint 2):** `PATCH /api/transactions/:id/favorite` and `POST /api/transactions/:id/duplicate` (generating a new UUID and fresh timestamps, `is_favorite = false`, `0` copied audit logs, and full live domain re-validation).
* **Linked Requirements & ACs:** `FR-16`, `FR-17`, `BR-01`, `BR-05`, `BR-06`, `BR-07 v1.1`, `AC-14-1`..`AC-14-3`.

### Feature F-15: Transaction Search & Filtering (`WP-10` / Issue #58)
* **User Goal:** As a user, I want to search and filter my transaction history by date range, account, category, type, favorite status, and keyword.
* **Scope (Sprint 2):** Enhanced `GET /api/transactions` supporting `startDate`, `endDate`, `accountId`, `categoryId`, `form`, semantic `type` (`INCOME | EXPENSE | REPAYMENT | TRANSFER | LOAN`), `favorite`, and keyword `q`.
* **Linked Requirements & ACs:** `FR-18`, `BR-01`, `BR-10`, `AC-15-1`..`AC-15-3`.

### Feature F-16: Transaction Corrections (`WP-11` / Issue #59)
* **User Goal:** As a user, I want to adjust a previously recorded transaction while preserving ledger balance integrity and an audit trail.
* **Scope (Sprint 2):** `PUT /api/transactions/:id` under row locks with split sum validation (`BR-06`), resulting balance/debt validation, and mutual all-or-nothing atomic insertion of a `TransactionAuditLog` snapshot.
* **Linked Requirements & ACs:** `FR-19`, `BR-01`, `BR-06`, `BR-07 v1.1`, `BR-10`, `AC-16-1`..`AC-16-4`.

### Feature F-19: Platform User Directory & Governance (`WP-11` / Issue #59)
* **User Goal:** As a platform administrator, I want to view the registered user directory and enable/disable user access without accessing private user financial records.
* **Scope (Sprint 2):** `GET /api/admin/users` (zero financial data per `BR-10`), `PATCH /api/admin/users/:id/status`, and fail-closed `is_active` verification in `authGuard.ts` (`403 ACCOUNT_DISABLED` / `503 AUTH_STATE_UNVERIFIABLE`).
* **Linked Requirements & ACs:** `FR-03`, `FR-04`, `BR-09`, `BR-10`, `NFR-SEC-01`, `NFR-SEC-02`, `AC-19-1`..`AC-19-4`.

---

## 5. Sprint 3 Feature Specifications (`F-17` to `F-18` — Detailed Contracts in `docs/sprints/sprint-3/feature-contracts.md`)

### Feature F-17: Category Spending Summaries & Reports (`WP-12` / Issue #60)
* **User Goal:** As a user, I want to inspect category-wise expense totals, transaction counts, and percentage distributions over a chosen date period.
* **Scope (Sprint 3):** `GET /api/reports/categories?startDate=...&endDate=...` with `ROUND_HALF_UP` percentage shares and strict exclusion of opening balances, transfers, repayments, and loans (`BR-02`, `BR-08`).
* **Linked Requirements & ACs:** `FR-20`, `BR-01`, `BR-02`, `BR-08`, `BR-10`, `AC-17-1`..`AC-17-3`.

### Feature F-18: Audited Correction History & Archival (`WP-12` / Issue #60)
* **User Goal:** As a user, I want to inspect the immutable revision history of corrected transactions and archive unused zero-balance accounts.
* **Scope (Sprint 3):** `GET /api/transactions/:id/audit-history` (reverse-chronological `created_at DESC, id DESC`, append-only with `onDelete: Restrict`) and `PATCH /api/accounts/:id/archive` (enforcing `422 ACCOUNT_BALANCE_NON_ZERO` on non-zero `CASH`/`LOAN_TAKEN`/`LOAN_GIVEN` accounts and `422 ACCOUNT_ARCHIVED` across all transaction creation/duplication/correction workflows).
* **Linked Requirements & ACs:** `FR-21`, `BR-01`, `BR-10`, `NFR-DATA-01`, `AC-18-1`..`AC-18-3`.
