# Lab 6 — Part C: Defect Reporting & Triage Register

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Lab:** Lab 6 — Independent User Acceptance Testing & Defect Management  
> **Product Team:** Whatsss — Theme 7 (Personal Money and Expense Logging System)  
> **Partner Testing Team:** SingSlot — Karaoke Room Reservation & Management System  
> **Authors:** Pilaiwan Churdchu (`@Pilaiwan3492`), Aphichaya Klinhual (`@Apichaya251400`)  
> **Linked Tracking Issue:** [Issue #38](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38)

---

## 1. Defect Triage & Governance Framework

To establish a traceable, reasoned disposition for all findings, findings are classified under the following strict taxonomy.

### 1.1 Classification Taxonomies

- **Accepted Defect:** A confirmed contradiction between observed behavior and the agreed Sprint 1 specification or approved engineering contracts (`docs/srs.md`, `docs/sprints/sprint-1/feature-contracts.md`). Release-blocking defects (Critical/Major) require an automated reproducing test (**RED**), code correction (**GREEN**), PR review, CI verification, and redeployment for retest.
- **Duplicate:** A finding that describes an identical anomaly already tracked under an earlier Issue ID.
- **Not-a-Defect:** Observed behavior that conforms to the agreed Sprint 1 specification, expected error handling, or security access restrictions (e.g., HTTP 403 Forbidden for Admin ledger access).
- **Enhancement:** A suggested feature or scope addition beyond the agreed Sprint 1 boundary (deferred to Sprint 2/3).
- **Unverified Observation / Potential Enhancement Candidate:** A recorded finding or potential edge-case behavior that is not defined or required by the agreed specification/contracts and has not been proven through a controlled reproducing test.

### 1.2 Severity Levels

- **Critical:** Application crash, unhandled 500 error, data corruption, or total blockage of the core domain journey with zero workaround (blocks Sprint 1 release).
- **Major:** Severe business rule violation or security vulnerability (e.g., double booking permitted, unauthorized financial ledger exposure, or decimal allocation mismatch) (blocks Sprint 1 release).
- **Minor:** Non-blocking discrepancy, cosmetic or styling issue, or edge-case input handling that does not break ledger invariants.

---

## 2. Outgoing Findings Register (Partner Application: SingSlot)

During the independent evaluation of **SingSlot Sprint 1** (`singslot-00004-6mv`, commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`), the Whatsss team executed all 5 agreed UAT test cases (`UAT-01` to `UAT-05` — all `PASS` within live UI/API scope) and performed an independent concurrency, schema, and security code inspection.

Four code-verified findings (`DEF-SS-01` through `DEF-SS-04`) were formally reported to the SingSlot tracking issue at [`Phenwatsa/singslot-karaoke#35` (comment `7060029335`)](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335).

| Finding ID | Source / Scope | Subsystem / Code Reference | Observed Behavior | Specification Invariant | Severity | Status & Tracking Link |
|:---:|---|---|---|---|:---:|---|
| **DEF-SS-01** | Code & Concurrency Audit | `POST /api/bookings/online` (`booking.controller.ts#L156-L230`, `schema.prisma#L84-L114`) | `roomBlock` check runs outside `prisma.$transaction` with no cross-table lock between `booking_slots` and `room_blocks`, allowing a concurrent staff maintenance block and customer booking on the same `(roomId, date, slotIndex)`. | `BR-01`, `BR-02`, `BR-06`, `NFR-03` | **Critical** | **Reported (Open)** — [`#35#issuecomment-7060029335`](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335) |
| **DEF-SS-02** | Schema & Logic Audit (Latent) | `GET /api/availability` & `POST /api/bookings/online` (`schema.prisma#L26-L29,#L95`, `availability.controller.ts#L86-L97`, `booking.controller.ts#L157-L164`) | Queries filter `booking_slots` by `booking: { status: 'CONFIRMED' }`, but `@@unique([roomId, bookingDate, slotIndex])` applies to all rows regardless of status. Marking a booking `CANCELLED` without deleting `booking_slots` would leave a "Zombie Slot" shown as available yet permanently rejecting bookings with `409 SLOT_CONFLICT`. *(Latent: no cancel endpoint exposed in Sprint 1.)* | `FR-03`, `FR-04`, `BR-02` | **Major (High)** | **Reported (Open — Latent)** — [`#35#issuecomment-7060029335`](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335) |
| **DEF-SS-03** | Code & Error-Handling Audit | `generateBookingCode` & `createOnlineBooking` (`booking.controller.ts#L10-L14,#L186,#L250-L275`, `app.ts#L129-L141`) | `generateBookingCode` uses a 4-char `Math.random()` suffix with no retry loop, and the `P2002` catch block only handles `[roomId, bookingDate, slotIndex]` collisions—re-throwing `bookingCode` collisions as unhandled `HTTP 500`. | `FR-04`, `NFR-03` | **Major (High)** | **Reported (Open)** — [`#35#issuecomment-7060029335`](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335) |
| **DEF-SS-04** | Security & Session Audit | Express CORS & Client Storage (`server/src/app.ts#L17`, `client/src/utils/session.ts#L3-L24`) | `app.use(cors())` uses permissive wildcard origin (`*`), and JWT tokens (`singslot_token`) are stored in `localStorage` rather than `HttpOnly` cookies. | Security Hardening / Origin & Session Hygiene | **Minor (Medium)** | **Reported (Open)** — [`#35#issuecomment-7060029335`](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335) |

**Audit Summary:**

1. All 5 agreed live UAT scenarios (`UAT-01` to `UAT-05`) passed on the deployed Sprint 1 baseline (`singslot-00004-6mv`): single-user booking, sequential slot conflict (`409 SLOT_CONFLICT`), boundary validation (`400`), ownership/role isolation (`403 FORBIDDEN`), and persistence/Master Schedule sync.
2. Independent code-level inspection of commit `aa5f109b97c157a143a7a9a94cd58dc02998467e` identified 4 additional concurrency, latent schema, error-handling, and security hardening defects (`DEF-SS-01`–`DEF-SS-04`), which have been formally submitted to SingSlot for triage and resolution under `Phenwatsa/singslot-karaoke#35`.

> **Scope Statement:**  
> Live UAT execution (`UAT-01` to `UAT-05`) verified expected behavior under sequential single-user/two-user test flows, whereas `DEF-SS-01` through `DEF-SS-04` were identified via source-level concurrency, schema, and security inspection of the deployed release (`aa5f109b97c157a143a7a9a94cd58dc02998467e`). Partner triage and retest verification remain pending.

---

## 3. Incoming Findings Register (Whatsss Application)

This register separates findings identified through internal audit and handoff verification from findings formally reported by the partner testing team. Each finding retains its actual source to ensure accurate traceability and avoid misrepresenting internal observations as partner-reported defects.

### 3.1 Internal Audit and Handoff Verification Findings

The following findings were identified through our team's internal audit and handoff verification of Whatsss. They were not submitted as formal defect reports by the SingSlot UAT Team.

| Finding ID | Reporter / Source | Related Test Case | Tested Endpoint / Operation | Expected Behavior | Observed API Response | Observed UI Observation | Evidence Reference | Classification Rationale | Disposition |
|:---:|:---:|:---:|---|---|:---:|---|---|---|:---:|
| **DEF-01** | Internal Audit / Handoff Verification | `UAT-S1-01` (Step 3: Multi-Split Expense Allocation) | `POST /api/transactions/expense` | Balanced multi-line expense allocation ($\sum \text{allocations.amount} = \text{total\_amount}$) accepted atomically per `BR-05` and `BR-06`. | `HTTP 201 Created` | Transaction receipt displayed successfully | Lab 5 baseline evidence `docs/labs/lab-05/evidence/c04-03-transaction-creation-recorded.png`; Unit test `server/tests/unit/transaction.test.ts` (`TEST-ALLOC-01`). *(Formal Lab 6 Cloud Run UAT evidence `A-EV-03` is pending partner execution by SingSlot).* | Conforms strictly to `BR-05` and `BR-06`. The observation verified mathematical balance and line creation, not a failure of decimal precision. | **Not-a-Defect** |
| **DEF-02** | Internal Audit / Handoff Verification | `UAT-S1-04` (Sub-check 4A: Administrator Denial of Financial Data) | `GET /api/accounts`, `GET /api/transactions`, UI `/dashboard` as `ADMIN` | Platform administrator possessing zero financial accounts is denied access to personal ledgers (`BR-10`, `NFR-SEC-02`, `AC-02-2`). | `HTTP 403 Forbidden` | Access denied / redirect to `/access-denied` (`Access Forbidden (403)` — `Security Policy (BR-10)`) | Lab 5 baseline evidence `docs/labs/lab-05/evidence/c04-05-br10-admin-access-denied-403.png`; Integration test `server/tests/integration/auth.test.ts` (`TEST-AUTH-ADMIN-DENIED`). *(Formal Lab 6 Cloud Run UAT evidence `A-EV-05` is pending partner execution by SingSlot).* | Expected security behavior. The HTTP 403 Forbidden response enforces the mandatory administrative isolation boundary required by `BR-10` and `NFR-SEC-02`. | **Not-a-Defect** |

**Internal Audit Summary & Evidence Traceability:**

- **DEF-01 (Balanced Multi-Split Allocation):**
  - *Tested Endpoint:* `POST /api/transactions/expense`
  - *Requirement Reference:* `BR-05` (atomic multi-line allocation creation) and `BR-06` (allocation balance validation).
  - *API Response:* `HTTP 201 Created`
  - *UI Observation:* Transaction receipt displayed successfully.
  - *Classification:* **Not-a-Defect**. The system successfully accepted a valid, balanced expense allocation where the split lines equaled the total amount (฿1,000 Dining + ฿2,000 Grocery = ฿3,000 Total). The observed behavior satisfies the contract. Direct Lab 6 partner UAT execution evidence for Whatsss (`A-EV-03`) remains pending partner execution by SingSlot; historical baseline evidence is referenced above.
  - *Final Disposition:* Not-a-Defect.
- **DEF-02 (Administrator Denial of Financial Ledgers):**
  - *Tested Endpoint:* `GET /api/accounts`, `GET /api/transactions`, `GET /api/reports/summary`, UI `/dashboard` as `ADMIN`.
  - *Requirement Reference:* `BR-10` (administrator financial ledger denial) and `NFR-SEC-02` (backend authorization guard).
  - *API Response:* `HTTP 403 Forbidden`
  - *UI Observation:* Access denied / application redirects to `/access-denied` displaying `Access Forbidden (403) — Security Policy (BR-10)` and hides financial navigation links.
  - *Classification:* **Not-a-Defect**. When an authenticated Administrator attempts to query personal financial endpoints or open the user dashboard, the system rejects the request with HTTP `403 Forbidden`. This response enforces the agreed security boundary. Direct Lab 6 partner UAT execution evidence for Whatsss (`A-EV-05`) remains pending partner execution by SingSlot; historical baseline evidence is referenced above.
  - *Final Disposition:* Not-a-Defect.

### 3.2 Formal Partner-Reported Findings (SingSlot UAT Team → Whatsss)

The Whatsss team triaged all formal findings submitted by the SingSlot UAT Team (`@lephirada` & `@Phenwatsa`) in [Issue #38 Comment `#7063056757`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38#issuecomment-7063056757) against the deployed Whatsss Cloud Run release `whatsss-00020-65k` ([https://whatsss-sipqw4logq-as.a.run.app](https://whatsss-sipqw4logq-as.a.run.app), commit `ba2f9dd`).

| Finding ID | Reporter / Source | Linked Requirement & UAT Case | Description & Observed Behavior | Classification | Severity | Assigned Owner | Fix Status & Disposition |
|:---:|:---:|:---:|---|:---:|:---:|:---:|---|
| **`DEF-OUT-01`** | SingSlot UAT Team (`@lephirada`, `@Phenwatsa`) | `UAT-S1-04` (Sub-check 4A)<br>`BR-10`, `AC-02-2`, `NFR-SEC-02` | **Case-Sensitivity Authorization Bypass in `roleGuard.ts`:** `server/src/middlewares/roleGuard.ts` compared `path.replace(/\/+$/, '')` against lowercase prefixes (`/api/accounts`, `/api/reports`, `/api/transactions`) without `.toLowerCase()`, whereas Express routing is case-insensitive by default. Navigating to `/api/Accounts` or `/api/Reports/summary` as `admin` bypassed `roleGuard` and returned `HTTP 200 OK`. | **Accepted Defect** | **Critical** *(Release-Blocking)* | `@Apichaya251400` ([Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) | **Code Fix & RED → GREEN Regression Completed ([PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43)); Peer Review, Redeployment & Partner Retest Pending.** Fixed in `server/src/middlewares/roleGuard.ts` (`path.toLowerCase().replace(/\/+$/, '')`) and verified in `server/tests/unit/roleGuard.test.ts` (4 dedicated `roleGuard` unit tests) and `server/tests/integration/access.test.ts` (HTTP-level Supertest verification against the production Express app for `ADMIN` `403` and an isolated `stubApp` mounting the production `roleGuard` middleware for `USER` `200`). Documented in [`docs/labs/lab-06/defect-resolution.md`](./defect-resolution.md). |
| **`DEF-OUT-02`** | SingSlot UAT Team (`@lephirada`, `@Phenwatsa`) | `AC-01-5`, `FR-01`, SDS Section 7.6 & Section 8 | **Unauthenticated Caller Receives HTTP 200 on `POST /api/auth/logout`:** Sending `POST /api/auth/logout` without an active session cookie returns `HTTP 200 OK` with `Set-Cookie: token=; Max-Age=0`. | **Not-a-Defect** | **None** *(Advisory)* | `@Pilaiwan3492` / `@Apichaya251400` | **By Design (Verified Against Updated `AC-01-5` Contract & SDS Section 8):** `AC-01-5` in [`docs/sprints/sprint-1/feature-contracts.md`](../../sprints/sprint-1/feature-contracts.md) and [`docs/system-sds.md`](../../system-sds.md) (Section 7.6 & Section 8 Role and Privacy Matrix) have been updated to explicitly specify that `POST /api/auth/logout` is an idempotent operation that returns `200 OK` and clears the cookie even when no active session exists, without creating a new session or exposing private user information, and that subsequent protected calls return `401 Unauthorized`. Directly verified without a session cookie in `server/tests/integration/auth.test.ts` and `server/tests/unit/partDHardening.test.ts` (`TEST-AUTH-LOGOUT-UNAUTHENTICATED`). |
| **`AUDIT-01`** | SingSlot Code Inspection (`@lephirada`, `@Phenwatsa`) | `UAT-S1-03`<br>`AC-03-3`, `BR-02` | **Income Target Category Lock Parity (`income.service.ts`):** `server/src/services/income.service.ts` locked `primaryAccount.id` (`Checking Bank`) upon income creation without including `incomeAccount.id` (`Salary`) in `lockAccounts()`. | **Accepted Defect** *(Code Audit Hardening)* | **Minor** | `@Apichaya251400` ([Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) | **Code Fix & Dual-Layer Regression Completed ([PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43)):** Updated `server/src/services/income.service.ts` (`await lockAccounts(tx, [primaryAccount.id, incomeAccount.id], userId)`). Verified at **two distinct layers**:<br>1. **Live PostgreSQL 16 Database Integration (`server/tests/integration/db-income.test.ts` — `TEST-INC-01` & `TEST-INC-ATOM`):** Executes against a real PostgreSQL 16 service container (`whatsss_test`) in GitHub Actions CI, verifying that a committed income transaction sets `is_opening_locked = true` on both `Checking Bank` and `Salary` in PostgreSQL (`422 OPENING_BALANCE_LOCKED` on subsequent `PATCH` for both), and that an injected `allocationLine.create` failure inside `prisma.$transaction` triggers a real PostgreSQL rollback leaving both `Checking Bank` and `Salary` at `is_opening_locked = false` with zero persisted `Transaction` or `AllocationLine` rows.<br>2. **Mocked Unit & Supertest HTTP Integration (`server/tests/unit/partDHardening.test.ts` & `server/tests/integration/income.test.ts` — `TEST-OPEN-04` & `TEST-INC-ATOM`):** Fast isolated unit and HTTP-layer regression tests. |
| **`AUDIT-02`** | SingSlot Code Inspection (`@lephirada`, `@Phenwatsa`) | `FR-01`, `AC-01-2` | **Non-String Login Payload Guard (`auth.controller.ts`):** `login()` checked `!username || !password` without verifying `typeof username === 'string' && typeof password === 'string'`, risking unhandled errors if non-string JSON objects/arrays are sent. | **Accepted Defect** *(Code Audit Hardening)* | **Minor** | `@Apichaya251400` ([Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) | **Code Fix & Regression Completed ([PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43)):** Added strict `typeof` and `username.trim()` validation (without trimming `password`) in `server/src/controllers/auth.controller.ts` returning `401 INVALID_CREDENTIALS`, verified in `server/tests/integration/auth.test.ts` and `server/tests/unit/partDHardening.test.ts` (`AUDIT-02 Hardening`). |
| **`AUDIT-03`** | SingSlot Code Inspection (`@lephirada`, `@Phenwatsa`) | `NFR-SEC-03` (`TEST-SEC-06`) | **Bodyless Transaction Endpoint Guard (`contentType.ts`):** `JSON_BODY_REQUIRED_ENDPOINTS` in `server/src/middlewares/contentType.ts` listed `/api/auth/login` and `/opening-balance` but omitted `/api/transactions/income`, `/api/transactions/expense`, and `/api/transactions/repayment`. | **Accepted Defect** *(Code Audit Hardening)* | **Minor** | `@Apichaya251400` ([Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) | **Code Fix & Regression Completed ([PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43)):** Added all transaction creation endpoints to `JSON_BODY_REQUIRED_ENDPOINTS` in `server/src/middlewares/contentType.ts` and verified middleware HTTP responses (Tests A–E: missing body `400 MISSING_REQUEST_BODY`, missing/wrong Content-Type `400 INVALID_CONTENT_TYPE`, valid JSON `{}` reaching field validation, and case/slash variants) in `server/tests/integration/content-type.test.ts` and `server/tests/unit/partDHardening.test.ts`. |
| **`AUDIT-04`** | SingSlot Code Inspection (`@lephirada`, `@Phenwatsa`) | `UAT-S1-02` (Sub-check 2D)<br>`BR-07`, `AC-07-2` | **Client Over-Repayment Warning When Debt Is `0.00 THB` (`RepaymentForm.tsx`):** `isExceedingDebt` used `amountCents > debtCents && debtCents > 0`, omitting the inline over-repayment warning when `debtCents === 0`. | **Enhancement / Hardening** | **Minor** | `@Apichaya251400` ([Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) | **Code Fix & Regression Completed ([PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43)):** Updated `client/src/components/RepaymentForm.tsx` (`const isExceedingDebt = amountCents > debtCents;`) and verified zero-debt positive repayment rejection in `client/src/components/RepaymentForm.test.tsx` (`TEST-UI-REPAY-11`, `56/56` frontend tests passing). |

**Partner Finding Triage & Part D Status Summary:**
- **`DEF-OUT-01` (Critical — Accepted Defect):** Confirmed release-blocking security bypass of `BR-10` / `AC-02-2` when mixed-case paths (`/api/Accounts`, `/api/Reports/summary`) were requested by an authenticated `ADMIN`. Implementation and automated **RED → GREEN** regression testing are completed in [PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43) ([`docs/labs/lab-06/defect-resolution.md`](./defect-resolution.md)).
- **`DEF-OUT-02` (Not-a-Defect):** Confirmed intentional idempotent logout behavior. Both `AC-01-5` in [`docs/sprints/sprint-1/feature-contracts.md`](../../sprints/sprint-1/feature-contracts.md) and [`docs/system-sds.md`](../../system-sds.md) (Section 7.6 & Section 8) have been updated to explicitly reflect idempotent `200 OK` cookie clearing for unauthenticated callers, directly verified by `TEST-AUTH-LOGOUT-UNAUTHENTICATED` in `auth.test.ts` and `partDHardening.test.ts`.
- **`AUDIT-01` to `AUDIT-04` (Defense-in-Depth Hardening):** All four code-inspection hardening items have been implemented and verified by dedicated regression tests in [PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43), including live PostgreSQL 16 transactional dual-account lock and rollback verification in `server/tests/integration/db-income.test.ts` (`TEST-INC-01` & `TEST-INC-ATOM`).
- **Current Workflow State:** Implementation and automated regression testing are completed. Peer review (`@Pilaiwan3492`), release, Cloud Run redeployment, live health verification, and independent Partner retesting remain pending.

---

## 4. Natural Defect Resolution Superseding Controlled Exercise (Section 3.5 Compliance)

Because the SingSlot UAT Team identified a genuine, release-blocking Sprint 1 defect (`DEF-OUT-01`) during independent testing in [Issue #38 Comment `#7063056757`](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38#issuecomment-7063056757), the team executed **Part D (RED → GREEN Defect Resolution, PR Review, CI Verification, and Redeployment)** directly on the real partner-reported defect **`DEF-OUT-01`** (plus hardening items `AUDIT-01`..`AUDIT-04`), rather than relying on the placeholder controlled exercise candidate (`DEF-03`).

See [`docs/labs/lab-06/defect-resolution.md`](./defect-resolution.md) for the complete Part D RED-to-GREEN test evidence, code diff, and verification logs.
