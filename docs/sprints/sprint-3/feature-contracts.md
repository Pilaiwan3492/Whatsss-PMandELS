# Sprint 3 Feature Engineering Contracts (Deliverable 2 — Part C)
## Project: Whatsss — Personal Finance Management Web Application (Theme 7)

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Deliverable:** Project Deliverable 2 (Part C: Sprint 3 Contracts and Working Progress — 15 Points)  
> **Team:** Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)  
> **Work Package:** `WP-07` ([Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) — Contracts) $\rightarrow$ `WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60) — Implementation & Release)  
> **Status:** `v3.0-contract` — **Contracted Prior to Sprint 3 Code Implementation**

### Document Revision History
| Version | Status | Date | Scope / Reference | Summary |
|---|---|---|---|---|
| `v0.1.0-sprint1` | **Accepted & Frozen Baseline** | 2026-11-08 | PR #14 (`f84e7b16`) | Original 3-sprint plan allocating `F-17` (`FR-20`) and `F-18` (`FR-21`) to Sprint 3 (`docs/sprints/plan.md`). |
| `v3.0-contract` | **Sprint 3 Baseline Contracts (Pre-Implementation)** | 2026-11-26 | `WP-07` / [Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) | Complete engineering contracts for all remaining Sprint 3 features (`F-17: Category Spending Summaries & Reports`, `F-18: Audited Correction History & Archival`), including UI/API/data specifications, numbered ACs, STS mappings, and Sprint 3 implementation/completion schedule by 13 December 2026. |

---

## 1. Overview & Sprint 3 Feature Scope

In accordance with `docs/features.md`, `docs/srs.md`, and `docs/sprints/plan.md`, Sprint 3 covers the two remaining product features required to complete the full Whatsss product vision (`FR-01` through `FR-21`):

1. **`F-17`: Category Spending Summaries & Period Reports (`FR-20`, `BR-01`, `BR-02`, `BR-08`, `BR-10`)** — Required Theme 7 analytics capability computing category-wise spending distributions, transaction counts, and percentage shares over user-selectable date ranges.
2. **`F-18`: Audited Correction History & Account Archival (`FR-21`, `BR-01`, `BR-10`, `NFR-DATA-01`)** — Approved Team Scope Addition providing an immutable audit trail of transaction corrections (`F-16`) and a safe soft-archive lifecycle (`is_archived`) for zero-balance accounts.

### 1.1 Cross-Layer Change Matrix
| Feature ID | Feature Name | Linked FR / BR / NFR | Database / Prisma Schema Layer | Backend API / Service Layer | Frontend UI Layer | Auth / CSRF / RoleGuard Middleware Layer |
|:---:|---|---|---|---|---|---|
| **`F-17`** | **Category Spending Summaries & Reports** | `FR-20`, `BR-01`, `BR-02`, `BR-08`, `BR-09`, `BR-10`, `NFR-DATA-01` | **No additional table needed:** Queries `allocation_lines` joined with `transactions` and `accounts` (`type === 'EXPENSE'`). | Adds `GET /api/reports/categories` (`report.controller.ts` / `balance.service.ts`) supporting optional `startDate` & `endDate` filtering and decimal-safe percentage distribution (`roundHalfUp2`). | Enhances `DashboardPage.tsx` (and/or `CategoryReportPanel`) with date-range period filter, category progress bars, transaction counts, and percentage breakdown. | **No change required:** Protected by existing `authGuard` (`401`) and `roleGuard` (`403` for `ADMIN` on `/api/reports/*`). |
| **`F-18`** | **Audited Correction History & Account Archival** | `FR-21`, `BR-01`, `BR-09`, `BR-10`, `NFR-DATA-01` | Uses `TransactionAuditLog` table and `Account.is_archived` (`Boolean @default(false)`) introduced in the consolidated `WP-08` migration. | Adds `GET /api/transactions/:id/audit-history` and `PATCH /api/accounts/:id/archive` (enforcing zero-balance archival precondition `422 ACCOUNT_BALANCE_NON_ZERO` and blocking transactions on archived accounts `422 ACCOUNT_ARCHIVED`). | Adds Audit History modal/drawer on `TransactionHistoryPage.tsx` and Archive/Unarchive action on `AccountListPage.tsx`. | **No change required:** Protected by existing `authGuard`, `roleGuard`, and `csrfGuard`. |

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
  4. **Strict Exclusion Invariant (`BR-02`, `BR-08`):**
     * Opening balances (`F-03`), internal cash transfers (`F-11`, `target_account.type === 'CASH'`), credit card debt repayments (`F-07`, `target_account.type === 'LOAN_TAKEN'`), loan given disbursements/recoveries (`F-12`, `target_account.type === 'LOAN_GIVEN'`), general loan borrowings/repayments (`F-13`), and income allocations (`F-04`, `target_account.type === 'INCOME'`) are **strictly excluded** from category spending calculations.
  5. For each `EXPENSE` category account (or each category with spending $> 0.00$), backend computes using `Prisma.Decimal`:
     * `category_id`, `category_name`
     * `total_amount`: sum of matching allocation amounts formatted to 2 decimal places
     * `transaction_count`: number of distinct transactions allocating to this category in the period
     * `percentage`:
       $$\text{percentage} = \begin{cases} \text{roundHalfUp}_2\!\left(\frac{\text{category.total\_amount}}{\text{period\_total\_expense}} \times 100\right) & \text{if } \text{period\_total\_expense} > 0.00 \\ 0.00 & \text{if } \text{period\_total\_expense} = 0.00 \end{cases}$$
     * Categories are ordered by `total_amount DESC, category_name ASC`.
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
  * `AC-17-1`: Calling `GET /api/reports/categories` returns accurate per-category spending totals, transaction counts, and `ROUND_HALF_UP` percentage shares (e.g., Golden Journey: `Grocery = 2000.00 (66.67%)`, `Dining = 1000.00 (33.33%)`, `total_expense = 3000.00`) (`TEST-REP-CAT-01`, `FR-20`).
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
     * Queries `transaction_audit_logs` where `transaction_id = :id` and `user_id = req.user.id`, ordered by `created_at DESC`.
     * Returns immutable audit entries showing `id`, `transaction_id`, `action` (`'CORRECTED'`), `previous_snapshot` (`total_amount`, `transaction_date`, `description`, `allocations`), `new_snapshot`, and `created_at`.
  2. **Account Soft-Delete Archival Lifecycle (`PATCH /api/accounts/:id/archive`):**
     * Request body: `{ "is_archived": true | false }` (`400 INVALID_ARCHIVE_PAYLOAD` if not boolean).
     * Inside atomic `prisma.$transaction` under row lock (`SELECT ... FOR UPDATE` on account `:id`):
       * Verify account belongs to `req.user.id` (`404 NOT_FOUND`).
       * When archiving (`is_archived === true`) an asset/liability account (`CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`): compute its current balance / debt / receivable under lock. If the current balance/debt/receivable is not `0.00` (`!currentBalance.isZero()`), reject with `422 ACCOUNT_BALANCE_NON_ZERO` (*"Cannot archive an account with a non-zero balance or outstanding debt."*).
       * Update `is_archived` and return `200 OK`.
     * **Archived Account Guard on New Transactions:** Any attempt to record a new transaction (income, expense, repayment, transfer, loan) referencing an account with `is_archived === true` is rejected with `422 ACCOUNT_ARCHIVED`, while historical transactions referencing that account remain intact in transaction history and reports (`NFR-DATA-01`).
* **API Specification:**
  * `GET /api/transactions/:id/audit-history` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transaction_id": "...", "audit_logs": [ { "id": "...", "action": "CORRECTED", "previous_snapshot": { ... }, "new_snapshot": { ... }, "created_at": "..." } ] } }`
  * `PATCH /api/accounts/:id/archive` $\rightarrow$ `200 OK` `{ "success": true, "data": { "account": { "id": "...", "is_archived": true, ... } } }`
  * **Error Codes:** `400 INVALID_ARCHIVE_PAYLOAD`, `401 UNAUTHORIZED`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`, `404 NOT_FOUND`, `422 ACCOUNT_BALANCE_NON_ZERO`, `422 ACCOUNT_ARCHIVED`.
* **Acceptance Criteria:**
  * `AC-18-1`: When a transaction is corrected via `F-16`, calling `GET /api/transactions/:id/audit-history` returns the chronological audit trail with exact `previous_snapshot` and `new_snapshot` values (`TEST-AUDIT-01`, `FR-21`).
  * `AC-18-2`: Archiving an account with `0.00 THB` balance/debt succeeds (`200 OK`, `is_archived = true`), whereas attempting to archive a `CASH`, `LOAN_TAKEN`, or `LOAN_GIVEN` account with a non-zero balance/debt returns `422 ACCOUNT_BALANCE_NON_ZERO` (`TEST-AUDIT-02`, `FR-21`).
  * `AC-18-3`: Attempting to post a new transaction against an archived account returns `422 ACCOUNT_ARCHIVED` while historical records remain intact; cross-user audit/archive requests return `404 Not Found` (`TEST-AUDIT-03`, `TEST-AUDIT-04`, `BR-01`, `NFR-DATA-01`).

---

## 3. Sprint 3 Implementation Plan & Schedule to Final Submission (13 December 2026)

Per Deliverable 2 Section 3.3, the team plans around the final examination period (`1–11 December 2026`) by completing all Sprint 2 workflows (`F-10`..`F-16`, `F-19`) and implementing Sprint 3 workflows (`F-17`, `F-18`) for the **29 November 2026 Deliverable 2 Release Candidate**, leaving only bounded final UAT re-verification, presentation video recording, and final PDF packaging for `11–13 December 2026`:

| Feature / Work Item | Target ACs & Tests | Owner | Target Completion Date | Status at `WP-07` Contract Stage |
|---|---|---|---|---|
| **`WP-07` ([Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55)):** Sprint 2 & 3 Contracts, Schema SDS & STS | `AC-10-*`..`AC-19-*`, `TEST-ACC-*`..`TEST-AUDIT-*` | `@Apichaya251400` (Rev: `@Pilaiwan3492`) | **26 Nov 2026** | **Implemented in PR (Ready for Peer Review)** |
| **`WP-08` ([Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56)):** `F-10` Custom Accounts, `F-11` Cash Transfer & Prisma Schema | `AC-10-1`..`3`, `AC-11-1`..`4` (`TEST-ACC-01`..`04`, `TEST-XFER-01`..`05`) | `@Apichaya251400` (Rev: `@Pilaiwan3492`) | **27 Nov 2026** | **Contracted (Next in Queue)** |
| **`WP-09` ([Issue #57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57)):** `F-12` Loan Given & `F-13` General Loan Taken | `AC-12-1`..`4`, `AC-13-1`..`4` (`TEST-LOAN-GIVEN-01`..`04`, `TEST-LOAN-TAKEN-01`..`04`) | `@Apichaya251400` (Rev: `@Pilaiwan3492`) | **27 Nov 2026** | **Contracted** |
| **`WP-10` ([Issue #58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58)):** `F-14` Favorite/Duplicate & `F-15` Search/Filter | `AC-14-1`..`3`, `AC-15-1`..`3` (`TEST-FAV-01`..`04`, `TEST-SRCH-01`..`05`) | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **28 Nov 2026** | **Contracted** |
| **`WP-11` ([Issue #59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59)):** `F-16` Transaction Corrections & `F-19` Admin Governance | `AC-16-1`..`4`, `AC-19-1`..`4` (`TEST-CORR-01`..`05`, `TEST-ADMIN-01`..`05`) | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **28 Nov 2026** | **Contracted** |
| **`WP-12` ([Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60)):** Sprint 3 `F-17` Category Reports & `F-18` Audit/Archival + D2 Release Candidate on GCP | `AC-17-1`..`3`, `AC-18-1`..`3` (`TEST-REP-CAT-01`..`04`, `TEST-AUDIT-01`..`04`) + GCP Deploy | `@Pilaiwan3492` (Rev: `@Apichaya251400`) | **29 Nov 2026** | **Contracted** |
| **Final Exam Period Buffer (`1–11 Dec 2026`)** | Final examination window (no heavy coding scheduled) | Both Students | **1–11 Dec 2026** | **Reserved Buffer** |
| **Final Deliverable 3 Polish, Video & Release (`11–13 Dec 2026`)** | Cross-feature E2E regression polish, <10-min presentation video, Final Release tag `v1.0.0` | Both Students | **12–13 Dec 2026** | **Planned** |
