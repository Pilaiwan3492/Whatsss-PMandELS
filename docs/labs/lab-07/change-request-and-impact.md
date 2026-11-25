# Lab 7 Change Request & Impact Analysis — Sprint 1 Credit Card Repayment Rules (`F-07` / `BR-07`)

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Project:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Team:** Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)  
> **Accepted Sprint 1 Baseline:** `v0.1.0-sprint1` (`f84e7b1`, Merge PR #14 from `sprint-1`)  
> **Pre-Change Implementation Commit (`origin/main`):** `098c28f7beefd34c5c0cf70a0f04630f865b282c` (`098c28f`, Merge PR #44 from `staging-lab5`, Lab 6 Release)  
> **Base Branch Sync (`staging-lab5`):** Includes `62f3641` / `0f5bfde` (PR #45, Lab 6 SingSlot retest sign-off, docs/evidence only)  
> **Contract Revision Status:** **PENDING TEAMMATE REVIEW & INSTRUCTOR/TA APPROVAL** — `@Apichaya251400` review and Instructor/TA approval are **required before implementation**. Do not start implementation until recorded approval evidence exists.

---

## 1. Change Request Specification

### 1.1 Original Sprint 1 Requirement & Implemented Rule
* **Requirement / Feature:** `FR-09` (Credit Card Debt Settlement), `BR-07` (Debt Settlement Invariant), `F-07` (Credit Card Repayment Engine).
* **Old Rule:** Any strictly positive repayment amount (`0.00 < amount <= currentDebt` and `amount <= currentCashBalance`, max 2 decimal places) is accepted. There is no minimum partial repayment floor, no small-debt full-settlement rule, and a repayment may drain the source `CASH` account down to `0.00 THB`.

### 1.2 Proposed New Rule (Bounded Complex Change)
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
   * The `500.00 THB` minimum floor, `10%` minimum calculation, `< 500.00 THB` full-settlement requirement, and `100.00 THB` partial-repayment cash reserve are **Whatsss product/business rules chosen by the project team** — they are **not** universal credit-card rules, banking regulations, legal requirements, or financial advice.
   * **Product Rationale:** (a) prevent repayments that are too small to meaningfully reduce debt; (b) encourage meaningful debt reduction via a `MAX(500.00, 10%)` floor; (c) maintain a `100.00 THB` cash buffer for partial repayments; and (d) allow users to fully settle small balances (`< 500.00 THB`) without being blocked by the reserve buffer.

### 1.3 Account Identification & Scope (`F-07` vs. Generic `Loan Taken`)
* **Covered:** `F-07` (`POST /api/transactions/repayment`) settling debt from a `CASH` account (`from_account_id`) to an eligible Credit Card `LOAN_TAKEN` account (`to_account_id`).
* **Excluded:** `LOAN_GIVEN` (`FR-14`), `INCOME`, `EXPENSE`, internal `CASH` transfers (`FR-13`), and generic `LOAN_TAKEN` borrowing (`FR-15`, Sprint 2).
* **Current Schema & Unresolved Design Issue:** In `server/prisma/schema.prisma`, `AccountType` contains `CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`, `INCOME`, and `EXPENSE` with **no** subtype/discriminator column. In Sprint 1, `Visa Credit Card` (`seed.ts`) is the only `LOAN_TAKEN` account, so `repayment.service.ts` checks `toAccount.type !== 'LOAN_TAKEN'`. **Unresolved Design Issue:** Before Sprint 2 introduces generic `LOAN_TAKEN` borrowing (`FR-15`), a schema discriminator or separate borrowing-repayment service boundary must be decided by the team/instructor so generic borrowing records never accidentally receive `F-07` credit-card rules.

### 1.3 Scope, Boundaries, Invalid Cases & Access Expectations
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

| Req ID | Feature | SRS Section | Feature SDS (`feature-contracts.md`) | System SDS (`system-sds.md`) | Acceptance Criteria | STS Test IDs | Code Modules |
|---|---|---|---|---|---|---|---|
| `FR-09`, `BR-07` | `F-07` Credit Card Repayment Engine | §4.1 (`FR-09`), §5 (`BR-07` v1.1) | `Feature F-07` (`AC-07-3`, `AC-07-7`..`AC-07-10`, API error codes) | **Unchanged (`docs/system-sds.md` remains valid)** — domain-level validation added inside existing atomic service transaction | `AC-07-1`..`AC-07-6` (preserved), `AC-07-7`..`AC-07-10` (proposed) | `TEST-REPAY-01`..`06`, `TEST-REPAY-CONCURRENT-*`, **`TEST-REPAY-07`..`15`** (proposed) | `server/src/services/repayment.service.ts`, `client/src/components/RepaymentForm.tsx`, `server/tests/integration/repayment.test.ts`, `client/src/components/RepaymentForm.test.tsx` |

### Applicability Assessment for System Layers
* **System-Level SDS (`docs/system-sds.md`):** No system-level architecture or schema change is proposed. The impact assessment assumes the existing authentication/authorization and transaction boundaries remain in place; confirm the actual locking and service flow against the implementation during Part B before treating this layer as unaffected.
* **Callers / Dependencies:** `transaction.controller.ts` delegates directly to `recordRepayment()` and forwards `RepaymentError.statusCode` and `code`, so no controller signature change is needed. `RepaymentForm.tsx` calls `recordRepayment()` in `transactionApi.ts`.
* **UI / API Validation:** The backend is authoritative and must validate the request using decimal-safe arithmetic (`Prisma.Decimal` or integer satang/cents) after locking and re-reading the latest balances. The client may display the computed minimum and estimated post-payment cash, but client validation is UX only and must never be trusted as a security or correctness boundary.
* **Roles / Ownership:** Preserve `USER`-only access, authentication, administrator denial, and per-user ownership checks (`BR-01`, `BR-09`, `BR-10`). Verify the concrete middleware, ownership predicates, and lock helper in the implementation before sign-off; this document does not replace those tests.
* **Persistence, Historical Data & Migrations:** No schema migration is proposed. The new rules govern new repayment submissions only; historical transactions and allocation lines must remain unchanged. Confirm this with schema and balance-regression tests during implementation.

### Preserved Sprint 1 Behavior & Regression Protection
* **Preserved Behavior:**
  * Golden Journey (`TEST-REPAY-01`: `3000.00` full repayment from `30000.00` cash; `TEST-REPAY-05`: `1500.00` partial repayment from `27000.00` cash against `3000.00` debt) remains valid.
  * Expense exclusion (`BR-08`, `TEST-REPAY-02`), user isolation (`BR-01`, `access.test.ts`), Admin 403 denial (`BR-10`, `roleGuard.test.ts`), and concurrent row-locking (`TEST-REPAY-CONCURRENT-DEBT`, `TEST-REPAY-CONCURRENT-FUNDS`) remain unchanged.
* **Regression Protection:** Run `repayment.test.ts`, `access.test.ts`, `db-repayment.test.ts`, `golden-journey.test.ts`, `balance.test.ts`, and `RepaymentForm.test.tsx`; record actual outcomes and CI evidence in Part B. The current contract PR does not claim these tests have already passed.

---

## 3. Baseline Traceability & Required Approval Gates

### 3.1 Verified Baseline & Pre-Change History
* **Accepted Sprint 1 Baseline:** Tag `v0.1.0-sprint1` $\rightarrow$ commit `f84e7b1` (Merge PR #14 from `sprint-1`).
* **Intervening Lab 5 & Lab 6 History (`v0.1.0-sprint1` $\rightarrow$ `098c28f`):** Cloud/CI/GCP deployment PRs (`#24`–`#28`, `#30`–`#36`) and Lab 6 UAT & defect-resolution PRs (`#39`, `#41`, `#42`, `#43`, `#44`), culminating in `098c28f7beefd34c5c0cf70a0f04630f865b282c` (Merge PR #44 from `staging-lab5`).
* **Latest Base Sync (`staging-lab5`):** Commit `62f3641` / `0f5bfde` (Merge PR #45, SingSlot retest sign-off docs) merged into this PR branch with zero conflicts.
* **Amended Requirements:** Strictly `BR-07` (`BR-07 v1.1`), `Feature F-07` (`AC-07-7`..`AC-07-10`), and STS (`TEST-REPAY-07`..`15`). Original Sprint 1 baseline (`v0.1.0-sprint1`) is preserved intact.

### 3.2 Approval Gate (Implementation Blocked Until Recorded)
* **Teammate Review (`@Apichaya251400` on PR #51):** **PENDING / BLOCKED** — Must review repayment business rules, account distinction, impact analysis, and test coverage before merging PR #51.
* **Instructor / TA Approval (Required per Lab 7 Spec):** **PENDING / BLOCKED** — Implementation must NOT start until explicit approval is recorded with:
  1. **Approver Identity / Role:** *(Pending)*
  2. **Approval Date:** *(Pending)*
  3. **Approval Decision:** *(Pending)*
  4. **Approved Change Scope / Reference:** *(Pending — `F-07` / `BR-07 v1.1` per PR #51)*
