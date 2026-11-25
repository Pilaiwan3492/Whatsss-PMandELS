# Lab 7 Change Request & Impact Analysis — Sprint 1 Credit Card Repayment Rules (`F-07` / `BR-07`)

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Project:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Team:** Pilaiwan Churdchu (`67070503492`, `@Pilaiwan3492`) & Aphichaya Klinhual (`67070503447`, `@Apichaya251400`)  
> **Accepted Sprint 1 Baseline:** `v0.1.0-sprint1`  
> **Pre-Change Implementation Commit (`origin/main`):** `098c28f` (PR #44, Lab 6 Release)  
> **Contract Revision Status:** Proposed for Teammate Review (per Lab 7 Spec & Announcement: Team-selected bounded complex Sprint 1 rule change; Instructor/TA pre-approval waived)

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

2. **Minimum Cash Reserve Protection (`MINIMUM_CASH_RESERVE_VIOLATION`, HTTP `422`):**
   * For partial repayments (`amount < currentDebt`), the source `CASH` account must retain at least **`100.00 THB`** after the transaction:
     $$\text{currentCashBalance} - \text{amount} \ge 100.00$$
   * **Boundary Exception (Full Settlement):** If the user is paying off the **entire remaining debt** (`amount == currentDebt`) and has sufficient funds (`currentCashBalance >= amount`), the `100.00 THB` reserve requirement is waived so a user can clear 100% of their credit card debt without being blocked by the reserve buffer.

3. **Reason for Change:**
   * Real-world personal finance and credit card billing policies enforce minimum monthly payments (preventing micro-payments on large balances and requiring full payoff of trivial balances `< 500.00 THB`) and protect users from accidentally draining their primary checking account to `0.00 THB` on partial repayments.

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
* **Validation Precedence (Server):**
  1. `INVALID_AMOUNT` (`400`) — non-positive, >2 decimals, non-numeric.
  2. `REPAYMENT_EXCEEDS_DEBT` (`422`) — `amount > currentDebt`.
  3. `INSUFFICIENT_FUNDS` (`422`) — `amount > currentCashBalance`.
  4. `MIN_REPAYMENT_NOT_MET` (`422`) — `amount < minRepayment`.
  5. `MINIMUM_CASH_RESERVE_VIOLATION` (`422`) — `amount < currentDebt` and `currentCashBalance - amount < 100.00`.
* **Access Expectations:**
  * Authenticated `USER` only, strictly scoped to `user_id` (`BR-01`, `404 NOT_FOUND` on cross-tenant accounts).
  * `ADMIN` strictly barred (`BR-10`, `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN`).
  * Unauthenticated requests rejected (`BR-09`, `401 UNAUTHORIZED`).

---

## 2. Change Impact Analysis

| Req ID | Feature | SRS Section | Feature SDS (`feature-contracts.md`) | System SDS (`system-sds.md`) | Acceptance Criteria | STS Test IDs | Code Modules |
|---|---|---|---|---|---|---|---|
| `FR-09`, `BR-07` | `F-07` Credit Card Repayment Engine | §4.1 (`FR-09`), §5 (`BR-07`) | `Feature F-07` (`AC-07-3`, `AC-07-7`, `AC-07-8`, API error codes) | **Unchanged (`docs/system-sds.md` remains valid)** — domain-level validation added inside existing atomic service transaction | `AC-07-1`..`AC-07-6` (preserved), `AC-07-7`, `AC-07-8` (new) | `TEST-REPAY-01`..`06`, `TEST-REPAY-CONCURRENT-*`, **`TEST-REPAY-07`..`10`** (new) | `server/src/services/repayment.service.ts`, `client/src/components/RepaymentForm.tsx`, `server/tests/integration/repayment.test.ts`, `client/src/components/RepaymentForm.test.tsx` |

### Applicability Assessment for System Layers
* **System-Level SDS (`docs/system-sds.md` — Unchanged):** `docs/system-sds.md` is intentionally not modified because it remains 100% valid as-is. This change adds domain-level validation strictly within the existing repayment service (`repayment.service.ts`) and its existing atomic database transaction, without changing the system architecture, middleware sequence (`authGuard` $\rightarrow$ `roleGuard` $\rightarrow$ controller $\rightarrow$ service), transaction boundaries, database schema, or persistence model.
* **Callers / Dependencies:** `transaction.controller.ts` delegates directly to `recordRepayment()` and forwards `RepaymentError.statusCode` and `code`, so no controller signature change is needed. `RepaymentForm.tsx` calls `recordRepayment()` in `transactionApi.ts`.
* **UI / API Validation:** Both server (`repayment.service.ts`) and client (`RepaymentForm.tsx`) must enforce and display the new minimum repayment and cash reserve rules using integer-cent / `Prisma.Decimal` arithmetic.
* **Roles / Ownership:** Unchanged; `authGuard`, `roleGuard(['USER'])`, `acquireAccountRowLocks()`, and `user_id` ownership filters remain strictly enforced (`BR-01`, `BR-09`, `BR-10`).
* **Persistence, Historical Data & Migrations:** **Not Applicable (N/A)** — No new tables or columns are required; existing `transactions` and `allocation_lines` records remain valid, and no Prisma migration is needed because the new rules govern validation of *new* repayment submissions only.

### Preserved Sprint 1 Behavior & Regression Protection
* **Preserved Behavior:**
  * Golden Journey (`TEST-REPAY-01`: `3000.00` full repayment from `30000.00` cash; `TEST-REPAY-05`: `1500.00` partial repayment from `27000.00` cash against `3000.00` debt) remains valid.
  * Expense exclusion (`BR-08`, `TEST-REPAY-02`), user isolation (`BR-01`, `access.test.ts`), Admin 403 denial (`BR-10`, `roleGuard.test.ts`), and concurrent row-locking (`TEST-REPAY-CONCURRENT-DEBT`, `TEST-REPAY-CONCURRENT-FUNDS`) remain unchanged.
* **Regression Protection:** Protected by running `repayment.test.ts`, `access.test.ts`, `db-repayment.test.ts`, `golden-journey.test.ts`, `balance.test.ts`, and `RepaymentForm.test.tsx`.
