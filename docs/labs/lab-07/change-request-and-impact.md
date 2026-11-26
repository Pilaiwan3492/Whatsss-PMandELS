# Lab 7 Change Request & Impact Analysis — Sprint 1 Credit Card Repayment Rules (`F-07` / `BR-07`)

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Project:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Team:** Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)  
> **Accepted Sprint 1 Baseline:** `v0.1.0-sprint1` (`f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d`, Merge PR #14 from `sprint-1`)  
> **Pre-Change Implementation Commit (`origin/main`):** `098c28f7beefd34c5c0cf70a0f04630f865b282c` (`098c28f`, Merge PR #44 from `staging-lab5`, Lab 6 Release)  
> **Base Branch Sync (`staging-lab5`):** Synchronized with `62f36411dcb4d7a40f832e8e51d1512494550e9e` / `0f5bfdec8c5bceebbce001d60caed63029b4aa76` (PR #45, Lab 6 SingSlot retest sign-off, docs/evidence only)  
> **Contract Revision Status:** **APPROVED & MERGED (PR #51 / Issue #47)** — Substantive teammate review and approval completed by `@Apichaya251400` on `2026-11-25T16:09:45Z` (Review ID `PRR_kwDOVlVi_s8AAAABaULYGA` on commit `7f068f453990b25a73dbbc8bded32dcfd5964cd9`), merged into `staging-lab5` at `2026-11-25T16:23:57Z` (`c35863052765bb1c09982f4884dcfe22bb117e43`) prior to backend (`PR #52`, `2026-11-25T16:29:33Z`, Approved & Merged `7700cba`) and frontend (`PR #53`, Implemented & CI-Verified on PR Branch — Pending Peer Review & Merge) implementation commits. Sprint 1 CR Instructor/TA pre-approval is waived per official Lab 7 Spec Sheet Change announcement.

---

## 1. Change Request Specification

### 1.1 Original Sprint 1 Requirement & Implemented Rule
* **Requirement / Feature:** `FR-09` (Credit Card Debt Settlement), `BR-07` (Debt Settlement Invariant), `F-07` (Credit Card Repayment Engine).
* **Old Rule:** Any strictly positive repayment amount (`0.00 < amount <= currentDebt` and `amount <= currentCashBalance`, max 2 decimal places) is accepted. There is no minimum partial repayment floor, no small-debt full-settlement rule, and a repayment may drain the source `CASH` account down to `0.00 THB`.

### 1.2 Approved New Rule (Bounded Complex Change)
Update `F-07` / `BR-07` to enforce **Minimum Repayment Floor + Small-Debt Full Settlement + Minimum Cash Reserve Protection**:

1. **Minimum Repayment Floor (`MIN_REPAYMENT_NOT_MET`, HTTP `422`):**
   * When `currentDebt >= 500.00 THB`, the minimum allowed repayment is:
     $$\text{minRepayment} = \max\bigl(500.00,\; \text{roundHalfUp}_2(\text{currentDebt} \times 0.10)\bigr)$$
     *(10% of outstanding debt rounded half-up to 2 decimal places, or `500.00 THB`, whichever is greater; capped at `currentDebt` if `currentDebt == 500.00`).*
   * When `0.00 < currentDebt < 500.00 THB`, partial repayment is disallowed: the repayment amount **must equal** `currentDebt` (`amount == currentDebt`).
   * Full settlement (`amount == currentDebt`) always satisfies the minimum repayment floor.
   * If the latest outstanding debt is `0.00 THB`, reject the repayment with `422 ZERO_OUTSTANDING_DEBT`; do not create a transaction or allocation line.

2. **Minimum Cash Reserve Protection (`MINIMUM_CASH_RESERVE_VIOLATION`, HTTP `422`):**
   * For partial repayments (`amount < currentDebt`), the source `CASH` account must retain at least **`100.00 THB`** after the transaction:
     $$\text{currentCashBalance} - \text{amount} \ge 100.00$$
   * **Boundary Exception (Full Settlement):** If the user is paying off the **entire remaining debt** (`amount == currentDebt`) and has sufficient funds (`currentCashBalance >= amount`), the `100.00 THB` reserve requirement is waived so a user can clear 100% of their credit card debt without being blocked by the reserve buffer.

3. **Reason for Change (Whatsss Product Rationale):**
   * The `500.00 THB` minimum floor, `10%` minimum calculation, `< 500.00 THB` full-settlement requirement, and `100.00 THB` partial-repayment cash reserve are **Whatsss-specific product/business rules chosen by the project team** — they are **not** universal credit-card rules, banking regulations, legal requirements, or financial advice.
   * **Product Rationale:** (a) prevent micro-repayments that are too small to meaningfully reduce debt; (b) encourage meaningful debt reduction via `MAX(500.00, 10%)`; (c) maintain a `100.00 THB` cash buffer for partial repayments; and (d) allow users to fully settle small balances (`< 500.00 THB`) without being blocked by the reserve buffer.

### 1.3 Account Identification & Adopted Sprint 1 Design Decision (`F-07` vs. Generic `LOAN_TAKEN`)
* **Covered Scope:** `F-07` (`POST /api/transactions/repayment`) settling debt from a `CASH` account (`from_account_id`) to an eligible Credit Card `LOAN_TAKEN` account (`to_account_id`).
* **Excluded Scope:** `LOAN_GIVEN` (`FR-14`), `INCOME`, `EXPENSE`, internal `CASH` transfers (`FR-13`), and generic `LOAN_TAKEN` borrowing (`FR-15`, Sprint 2).
* **Schema Reality & Adopted Design Decision:**
  * Inspection of `server/prisma/schema.prisma`, `docs/system-sds.md`, `server/prisma/seed.ts`, and `server/src/services/repayment.service.ts` confirms that `AccountType` only has `CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`, `INCOME`, and `EXPENSE` with no subtype/discriminator column.
  * Because `FR-15` (Generic Borrowing) is deferred to Sprint 2 (`docs/srs.md` §4.2, `docs/sprints/sprint-1/scope.md` §3), **no generic `LOAN_TAKEN` borrowing accounts exist in the Sprint 1 data model** (`Visa Credit Card` is the sole `LOAN_TAKEN` account in `seed.ts`).
  * **Adopted Design Decision (No Schema Migration in Lab 7):** For Lab 7 Sprint 1 maintenance, `F-07` enforces `fromAccount.type === 'CASH'` and `toAccount.type === 'LOAN_TAKEN'`, rejecting any non-`LOAN_TAKEN` target (`LOAN_GIVEN`, `CASH`, `INCOME`, `EXPENSE`) with `400 INVALID_ACCOUNT_TYPE` (`TEST-REPAY-14`). **Sprint 2 Prerequisite:** Before `FR-15` creates generic `LOAN_TAKEN` borrowing accounts, Sprint 2 must introduce an explicit `Account` subtype/discriminator (requiring a Prisma migration and `docs/system-sds.md` update) or a separate borrowing endpoint so generic borrowing never enters `F-07`.

### 1.4 Scope, Boundaries, Invalid Cases & Access Expectations
* **In-Scope:**
  * `server/src/services/repayment.service.ts` (atomic validation inside `prismaClient.$transaction` under `SELECT ... FOR UPDATE` row locks).
  * `client/src/components/RepaymentForm.tsx` (display computed Minimum Repayment & Available Cash after Reserve, client-side validation, and `422` error handling).
  * Engineering contracts (`docs/srs.md`, `docs/sprints/sprint-1/feature-contracts.md`, `docs/sprints/sprint-1/test-specification.md`).
  * Automated unit, integration, and frontend component tests.
* **Out-of-Scope:**
  * Sprint 2/3 features (`F-10`..`F-21`), database schema changes, or changes to `income.service.ts` / `expense.service.ts`.
* **Exact Boundaries:**
  * `currentDebt = 500.00`: `minRepayment = 500.00` (partial `< 500.00` rejected with `422 MIN_REPAYMENT_NOT_MET`).
  * `currentDebt = 499.99`: `minRepayment = 499.99` (must pay full `499.99`; `499.98` rejected with `422 MIN_REPAYMENT_NOT_MET`).
  * `currentDebt = 6000.00`: `10% = 600.00 > 500.00` $\rightarrow$ `minRepayment = 600.00` (`599.99` rejected, `600.00` accepted).
  * `currentDebt = 5555.55`: `10% = 555.555` $\rightarrow$ `roundHalfUp2 = 555.56` (`555.55` rejected, `555.56` accepted).
  * `currentCashBalance = 1600.00`, `currentDebt = 3000.00`, `amount = 1500.00`: remaining cash = `100.00` $\rightarrow$ **Accepted (`201`)**.
  * `currentCashBalance = 1599.99`, `currentDebt = 3000.00`, `amount = 1500.00`: remaining cash = `99.99 < 100.00` (partial) $\rightarrow$ **Rejected (`422 MINIMUM_CASH_RESERVE_VIOLATION`)**.
  * `currentCashBalance = 3000.00`, `currentDebt = 3000.00`, `amount = 3000.00` (full settlement): remaining cash = `0.00`, full settlement exception applies $\rightarrow$ **Accepted (`201`)**.
* **Validation Precedence (Server; evaluated against locked, latest database values):**
  1. `INVALID_AMOUNT` (`400`) — missing, non-numeric, non-positive, or more than 2 decimal places.
  2. `ZERO_OUTSTANDING_DEBT` (`422`) — latest outstanding credit-card debt is `0.00`.
  3. `REPAYMENT_EXCEEDS_DEBT` (`422`) — `amount > currentDebt`.
  4. `INSUFFICIENT_FUNDS` (`422`) — `amount > currentCashBalance`.
  5. `MIN_REPAYMENT_NOT_MET` (`422`) — `amount < minRepayment`.
  6. `MINIMUM_CASH_RESERVE_VIOLATION` (`422`) — `amount < currentDebt` and `currentCashBalance - amount < 100.00`.
* **Access Expectations:**
  * Authenticated `USER` only, strictly scoped to `user_id` (`BR-01`, `404 NOT_FOUND` on cross-tenant accounts).
  * `ADMIN` strictly barred (`BR-10`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`).
  * Unauthenticated requests rejected (`BR-09`, `401 UNAUTHORIZED`).

---

## 2. Change Impact Analysis

### 2.1 Acceptance Criteria Traceability & Impact Matrix
| AC ID | Requirement / Rule | Status | Impacted Docs & Modules | Impact Assessment | Linked STS Test IDs |
|---|---|---|---|---|---|
| `AC-07-1`..`AC-07-6` | Preserved Sprint 1 baseline (`FR-09`, `BR-07`, `BR-08`) | Preserved | `srs.md`, `feature-contracts.md`, `repayment.service.ts` | Unchanged behavior; protected by regression suite | `TEST-REPAY-01`..`06`, `TEST-REPAY-CONCURRENT-*`, `TEST-UI-REPAY-01`..`11` |
| `AC-07-7` | Minimum Repayment Floor (`500 THB` / `10%` `ROUND_HALF_UP` / `<500` full) | Approved & Implemented (`v1.1`) | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `RepaymentForm.tsx`, `repayment.test.ts`, `db-repayment.test.ts`, `RepaymentForm.test.tsx` | Adds decimal-safe floor check inside locked DB transaction + UI hint | `TEST-REPAY-07`, `TEST-REPAY-08`, `TEST-REPAY-15`, `TEST-REPAY-16`, `LIVE-01`, `LIVE-02`, `LIVE-08`, `LIVE-09`, `TEST-UI-REPAY-12`..`14`, `17`, `20`, `26` |
| `AC-07-8` | `100.00 THB` Cash Reserve & Full-Settlement Exemption | Approved & Implemented (`v1.1`) | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `RepaymentForm.tsx`, `repayment.test.ts`, `db-repayment.test.ts`, `RepaymentForm.test.tsx` | Adds partial-repayment reserve check inside locked DB transaction + UI hint | `TEST-REPAY-09`, `TEST-REPAY-09-CONCURRENT`, `TEST-REPAY-10`, `TEST-REPAY-12`, `TEST-REPAY-16`, `LIVE-03`, `LIVE-04`, `LIVE-06`, `LIVE-07`, `LIVE-10`, `TEST-UI-REPAY-15`, `16`, `18`..`20`, `25` |
| `AC-07-9` | Zero-Debt Rejection (`422 ZERO_OUTSTANDING_DEBT`) | Approved & Implemented (`v1.1`) | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `RepaymentForm.tsx`, `repayment.test.ts`, `db-repayment.test.ts`, `RepaymentForm.test.tsx` | Rejects `latestOutstandingDebt == 0.00` before floor/reserve checks; zero writes | `TEST-REPAY-11`, `TEST-REPAY-16`, `LIVE-05`, `TEST-UI-REPAY-21`, `TEST-UI-REPAY-22` |
| `AC-07-10` | Target Account Scope & Non-`LOAN_TAKEN` Rejection (`400 INVALID_ACCOUNT_TYPE`) | Approved & Implemented (`v1.1`) | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `repayment.test.ts`, `RepaymentForm.test.tsx` | Enforces `CASH` $\rightarrow$ `LOAN_TAKEN` in Sprint 1; documents Sprint 2 `FR-15` subtype/discriminator prerequisite | `TEST-REPAY-14`, `TEST-UI-REPAY-23`, `TEST-UI-REPAY-24` |

### 2.2 Applicability Assessment for System Layers
* **System-Level SDS (`docs/system-sds.md`) & Prisma Schema (`server/prisma/schema.prisma`):** Under the current no-schema-change scope, `docs/system-sds.md` architecture, middleware sequence, and transaction boundaries remain valid; **however**, because `docs/system-sds.md` and `schema.prisma` lack a credit-card discriminator (§1.3), resolving `AC-07-10` with a schema-level discriminator would directly impact `schema.prisma`, Prisma migrations, existing seed/account data compatibility, and `docs/system-sds.md`.
* **Callers / Dependencies (`transaction.controller.ts`, `account.controller.ts`):** `transaction.controller.ts` delegates to `recordRepayment()` and forwards `RepaymentError.statusCode`/`code`. `account.controller.ts` is unaffected unless a credit-card discriminator is added. `RepaymentForm.tsx` calls `recordRepayment()` in `transactionApi.ts`.
* **UI / API Validation:** Backend (`repayment.service.ts`) is authoritative and must validate inside `prismaClient.$transaction` after acquiring row locks (`acquireAccountRowLocks`). Client validation (`RepaymentForm.tsx`) is UX only.
* **Roles / Ownership:** Preserve `USER`-only access, authentication, `ADMIN` denial (`BR-10`), and per-user ownership checks (`BR-01`, `BR-09`).
* **Persistence, Historical Data & Migrations:** No schema migration is included in this documentation PR. If a discriminator is approved to resolve §1.3, a migration and data-compatibility plan must be approved before implementation. Historical transactions and allocation lines remain unchanged.

### Preserved Sprint 1 Behavior & Regression Protection
* **Preserved Behavior:**
  * Golden Journey (`TEST-REPAY-01`: `3000.00` full repayment from `30000.00` cash; `TEST-REPAY-05`: `1500.00` partial repayment from `27000.00` cash against `3000.00` debt) remains valid.
  * Expense exclusion (`BR-08`, `TEST-REPAY-02`), user isolation (`BR-01`, `access.test.ts`), Admin 403 denial (`BR-10`, `roleGuard.test.ts`), and concurrent row-locking (`TEST-REPAY-CONCURRENT-DEBT`, `TEST-REPAY-CONCURRENT-FUNDS`) remain unchanged.
* **Regression Protection:** Run `repayment.test.ts`, `access.test.ts`, `db-repayment.test.ts`, `golden-journey.test.ts`, `balance.test.ts`, and `RepaymentForm.test.tsx`; record actual outcomes and CI evidence in Part B. The current contract PR does not claim these tests have already passed.

---

## 3. Baseline Traceability & Required Approval Gates

### 3.1 Verified Baseline & Pre-Change History
* **Accepted Sprint 1 Baseline:** Tag `v0.1.0-sprint1` $\rightarrow$ commit `f84e7b1680b5c5096ec045b8f9e8d47f5c5a9d1d` (`f84e7b1`, Merge PR #14 from `sprint-1`).
* **Pre-Change Implementation Commit:** `098c28f7beefd34c5c0cf70a0f04630f865b282c` (`098c28f`, Merge PR #44 from `staging-lab5`).
* **Verifiable Diff Evidence (`v0.1.0-sprint1..098c28f`):** Running `git diff --stat v0.1.0-sprint1..098c28f -- server/src/services/repayment.service.ts server/src/controllers/transaction.controller.ts client/src/components/RepaymentForm.tsx` and `git log --oneline v0.1.0-sprint1..098c28f -- server/src/services/repayment.service.ts` confirms **0 commits / 0 lines changed** in `repayment.service.ts` and `transaction.controller.ts`, and only a 1-line UI diff (`2 +-`) in `RepaymentForm.tsx`. Thus, backend `F-07` repayment rules remained identical to `v0.1.0-sprint1` through `098c28f`.
* **Latest Base Sync (`staging-lab5`):** Commits `0f5bfdec8c5bceebbce001d60caed63029b4aa76` and `62f36411dcb4d7a40f832e8e51d1512494550e9e` (PR #45, SingSlot retest sign-off docs/evidence only) were merged cleanly into this branch with zero conflicts.
* **Amended Requirements:** Strictly `BR-07` (`BR-07 v1.1`), `Feature F-07` (`AC-07-7`..`AC-07-10`), and STS (`TEST-REPAY-07`..`16`). Original Sprint 1 baseline (`v0.1.0-sprint1`) is preserved intact.

### 3.2 Approval Gate (Verified & Recorded Prior to Implementation)
* **Substantive Teammate Review (`@Apichaya251400` on [PR #51](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/51)):** **APPROVED & MERGED** — Reviewed repayment business rules, Sprint 1 `LOAN_TAKEN` scoping decision (§1.3), impact analysis, and test coverage before merging PR #51 and before any implementation commits in PR #52 / PR #53.
  * **Reviewer:** Aphichaya Klinhual (`@Apichaya251400`)
  * **Review Date / Decision:** `2026-11-25T16:09:45Z` — **`APPROVED`** (Review ID `PRR_kwDOVlVi_s8AAAABaULYGA` on commit `7f068f453990b25a73dbbc8bded32dcfd5964cd9`; merged into `staging-lab5` at `2026-11-25T16:23:57Z`, commit `c35863052765bb1c09982f4884dcfe22bb117e43`)
* **Backend Implementation Peer Review (`@Apichaya251400` on [PR #52](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/52)):** **APPROVED & MERGED** — `2026-11-25T19:51:58Z` (Review ID `PRR_kwDOVlVi_s8AAAABaXGj8g` on commit `5bc3183166f8ff17ca1574c98d44265b1082e9b8`; merged into `staging-lab5` at `2026-11-25T19:52:42Z`, commit `7700cba5d2ba75b6a99ba0edb279ce22a969d38d`).
* **Instructor / TA Change Request Approval:** **WAIVED (Verified Official Course Announcement)** — Per the official Lab 7 Spec Sheet Change announcement (*"Announcement. Lab 7 Spec Sheet Change. You need not get Instructor or TA Approval for your change request to Sprint 1. Think of a good change to Sprint 1 among yourselves, but do try to make it a complex enough added feature and not just a trivial change."*), Instructor/TA pre-approval of the Sprint 1 Change Request is not required. Note: substantive teammate review, RED/GREEN test-first evidence, and regression safety remain mandatory.

---

## 4. API Error Specification (`POST /api/transactions/repayment`)

All error responses use the standard repository envelope (`{ "success": false, "error": { "code": "...", "message": "...", "details": [] } }`).

| HTTP Status | Error Code | Producing Layer | Trigger Condition |
|---:|---|---|---|
| `401` | `UNAUTHORIZED` | `authGuard` | Unauthenticated request (`BR-09`). |
| `403` | `ADMIN_FINANCIAL_ACCESS_FORBIDDEN` | `roleGuard` | `ADMIN` role attempting financial access (`BR-10`). |
| `404` | `NOT_FOUND` | `repayment.service.ts` | `from_account_id` or `to_account_id` not found or owned by another user (`BR-01`). |
| `400` | `INVALID_AMOUNT` / `INVALID_ACCOUNT_TYPE` / `INVALID_TRANSACTION_DATE` / `INVALID_DESCRIPTION` | `repayment.service.ts` | Malformed/non-positive/>2-decimal amount, non-`CASH` source or non-`LOAN_TAKEN` target, invalid date, or invalid description. |
| `422` | `ZERO_OUTSTANDING_DEBT` | `repayment.service.ts` | Authoritative `currentDebt <= 0.00` under DB lock. |
| `422` | `REPAYMENT_EXCEEDS_DEBT` | `repayment.service.ts` | `amount > currentDebt`. |
| `422` | `INSUFFICIENT_FUNDS` | `repayment.service.ts` | `amount > currentCashBalance`. |
| `422` | `MIN_REPAYMENT_NOT_MET` | `repayment.service.ts` | `amount < max(500.00, roundHalfUp2(currentDebt * 0.10))` (for `>= 500.00`) or `amount < currentDebt` (for `< 500.00`). |
| `422` | `MINIMUM_CASH_RESERVE_VIOLATION` | `repayment.service.ts` | Partial repayment (`amount < currentDebt`) leaves `currentCashBalance - amount < 100.00`. |
