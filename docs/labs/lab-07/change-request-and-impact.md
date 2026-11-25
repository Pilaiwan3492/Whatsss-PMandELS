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

### 1.3 Account Identification, Critical Blocker & Design Evaluation (`F-07` vs. Generic `LOAN_TAKEN`)
* **Covered Scope:** `F-07` (`POST /api/transactions/repayment`) settling debt from a `CASH` account (`from_account_id`) to an eligible Credit Card `LOAN_TAKEN` account (`to_account_id`).
* **Excluded Scope:** `LOAN_GIVEN` (`FR-14`), `INCOME`, `EXPENSE`, internal `CASH` transfers (`FR-13`), and generic `LOAN_TAKEN` borrowing (`FR-15`, Sprint 2).
* **Critical Blocker — No Reliable Credit-Card Discriminator in Current System:**
  * Inspection of `server/prisma/schema.prisma`, `docs/system-sds.md`, `server/prisma/seed.ts`, and `server/src/services/repayment.service.ts` confirms that `AccountType` only has `CASH`, `LOAN_TAKEN`, `LOAN_GIVEN`, `INCOME`, and `EXPENSE` with **no** credit-card-specific type or discriminator field. `repayment.service.ts` currently checks only `toAccount.type !== 'LOAN_TAKEN'`.
  * **Design Change Evaluation (if a schema discriminator is adopted):**
    1. *Data Model (`schema.prisma` & `docs/system-sds.md`):* Would require adding a discriminator (e.g., an account subtype/instrument classification) and updating the `accounts` ER/table specification.
    2. *Migration & Existing Data Compatibility:* Would require a Prisma migration and backfill so existing seeded `Visa Credit Card` (`LOAN_TAKEN`) rows remain valid without breaking `v0.1.0-sprint1` data.
    3. *API, Account Management & Validation Impact:* Would require updating `account.controller.ts` (for future `FR-12` account creation) and `repayment.service.ts` (`toAccount` eligibility check).
    4. *Regression Testing Impact:* Would require migration/seed tests plus `TEST-REPAY-14` execution against both credit-card and generic `LOAN_TAKEN` fixtures.
  * **Scope Constraint:** Because this Change Request currently scopes schema changes as out-of-scope, no discriminator field is invented here. Until the team and Instructor/TA decide whether to (a) approve a scoped schema/migration addition or (b) formally restrict `F-07` to `toAccount.type === 'LOAN_TAKEN'` in Sprint 1, **`AC-07-10` (generic `LOAN_TAKEN` exclusion) and `TEST-REPAY-14` remain BLOCKED / CONDITIONAL**.

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
| `AC-07-1`..`AC-07-6` | Preserved Sprint 1 baseline (`BR-07`, `BR-08`) | Preserved | `srs.md`, `feature-contracts.md`, `repayment.service.ts` | Unchanged behavior; protected by regression suite | `TEST-REPAY-01`..`06`, `TEST-REPAY-CONCURRENT-*` |
| `AC-07-7` | Minimum Repayment Floor (`500 THB` / `10%` `ROUND_HALF_UP` / `<500` full) | Proposed | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `RepaymentForm.tsx` | Adds decimal-safe floor check inside locked DB transaction + UI hint | `TEST-REPAY-07`, `TEST-REPAY-08`, `TEST-REPAY-15` |
| `AC-07-8` | `100.00 THB` Cash Reserve & Full-Settlement Exemption | Proposed | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `RepaymentForm.tsx` | Adds partial-repayment reserve check inside locked DB transaction + UI hint | `TEST-REPAY-09`, `TEST-REPAY-10`, `TEST-REPAY-12` |
| `AC-07-9` | Zero-Debt Rejection (`422 ZERO_OUTSTANDING_DEBT`) | Proposed | `srs.md`, `feature-contracts.md`, `repayment.service.ts`, `RepaymentForm.tsx` | Rejects `latestOutstandingDebt == 0.00` before floor/reserve checks; zero writes | `TEST-REPAY-11` |
| `AC-07-10` | Generic `LOAN_TAKEN` Exclusion & Account Scope | **BLOCKED / Conditional** | `srs.md`, `feature-contracts.md`, `system-sds.md`, `schema.prisma`, `account.controller.ts`, `repayment.service.ts` | **Blocked on credit-card discriminator decision** (§1.3); may require schema, migration, and System SDS updates if discriminator is added | `TEST-REPAY-14` *(Conditional)* |

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
* **Relationship & Relevant `F-07` / Repayment History:** Between `v0.1.0-sprint1` (`f84e7b1`) and `098c28f`, the repository underwent Lab 5 Cloud/CI/GCP deployment hardening (`#24`–`#28`, `#30`–`#36`) and Lab 6 UAT & defect resolution (`#39`, `#41`–`#44`). `F-07` repayment behavior (`repayment.service.ts`) remained at its accepted Sprint 1 rule set through `098c28f` (hardened only with live-DB concurrency/rollback verification in Lab 6).
* **Latest Base Sync (`staging-lab5`):** Commits `0f5bfdec8c5bceebbce001d60caed63029b4aa76` and `62f36411dcb4d7a40f832e8e51d1512494550e9e` (PR #45, SingSlot retest sign-off docs/evidence only) were merged cleanly into this branch with zero conflicts.
* **Amended Requirements:** Strictly `BR-07` (`BR-07 v1.1`), `Feature F-07` (`AC-07-7`..`AC-07-10`), and STS (`TEST-REPAY-07`..`15`). Original Sprint 1 baseline (`v0.1.0-sprint1`) is preserved intact.

### 3.2 Approval Gate (Implementation Blocked Until Recorded)
* **Mandatory Gates per `Lab_7_Sprint_1_Maintenance.pdf`:** Both **Teammate Review** and **Instructor/TA Approval** are mandatory before implementation begins. Silence does not constitute approval.
* **Teammate Review (`@Apichaya251400` on PR #51):** **PENDING / BLOCKED** — Must review repayment business rules, credit-card identification blocker, impact analysis, and test coverage before merging PR #51.
* **Instructor / TA Approval:** **PENDING / BLOCKED** — Implementation must NOT start until explicit approval is recorded below with supporting evidence:
  * **Reviewer / Approver:** *(Pending — not yet obtained)*
  * **Role:** *(Instructor / TA)*
  * **Review / Approval Date:** *(Pending)*
  * **Decision:** *(Pending)*
  * **Approved Scope:** *(Pending — `F-07` / `BR-07 v1.1` and credit-card discriminator resolution)*
  * **Supporting Evidence / Comments:** *(Pending)*
