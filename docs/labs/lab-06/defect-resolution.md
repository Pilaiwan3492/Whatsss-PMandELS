# Lab 6 — Part D: Defect Resolution, RED-to-GREEN Regression Verification & Redeployment Readiness

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Deliverable:** Lab 6 — Independent User Acceptance Testing and Defect Management (Part D: 25 Points)  
> **Product Team:** Whatsss — Theme 7 (Personal Money and Expense Logging System)  
> **Defect Resolution Owner:** Aphichaya Klinhual (`@Apichaya251400`)  
> **Peer Reviewer:** Pilaiwan Churdchu (`@Pilaiwan3492`)  
> **Linked Tracking Issue:** [Issue #37 (`ISSUE 16` — Part D Defect Resolution)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)  
> **Source Partner Defect Report:** [Issue #38 Comment `#7063056757` by SingSlot UAT Team (`@lephirada` & `@Phenwatsa`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38#issuecomment-7063056757)  
> **Active Pull Request:** [PR #43 (`fix/37-defect-resolution-part-d -> staging-lab5`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43)

---

## 1. Part D Workflow Status Tracker (Strict Stage Separation)

> **Status Statement:**  
> Implementation and automated regression testing are completed. Peer review, release, Cloud Run redeployment, live health verification, and independent Partner retesting remain pending.

| Activity Stage | Meaning & Verification Criteria | Current Stage Status | Evidence / Reference |
|---|---|:---:|---|
| **1. Code Fix Completed** | Defective source code corrected on branch `fix/37-defect-resolution-part-d` | **COMPLETED** | `server/src/middlewares/roleGuard.ts`, `server/src/services/income.service.ts`, `server/src/controllers/auth.controller.ts`, `server/src/middlewares/contentType.ts`, `client/src/components/RepaymentForm.tsx` |
| **2. Regression RED → GREEN** | Reproducing test fails (**RED**) against defective implementation (`d5202f8`) and passes (**GREEN**) against corrected implementation alongside full backend (`154/154` unit) and frontend (`56/56`) suites | **COMPLETED** | `server/tests/unit/roleGuard.test.ts`, `server/tests/integration/access.test.ts`, `server/tests/integration/auth.test.ts`, `server/tests/integration/income.test.ts`, `server/tests/integration/content-type.test.ts`, `client/src/components/RepaymentForm.test.tsx`; Screenshots `EVD-PARTD-01` & `EVD-PARTD-02` |
| **3. PR Approved (`R-09`)** | Substantive peer review and approval of [PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43) by `@Pilaiwan3492` with passing GitHub Actions CI | **PENDING** | Awaiting final re-review and approval by `@Pilaiwan3492` on [PR #43](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/43) |
| **4. Release Completed** | Approved fix merged into `staging-lab5` and promoted to `main` | **PENDING** | Blocked until Stage 3 (`PR #43` peer approval) is completed |
| **5. Redeployment Completed** | Corrected container image deployed to Cloud Run service `whatsss` (`asia-southeast1`) via `deploy/release.sh` | **PENDING** | Blocked until Stage 4 (Release) is completed |
| **6. Health Verification Completed** | Live `/api/health` and `/api/ready` probes verified against the new Cloud Run revision and commit SHA | **PENDING** | Blocked until Stage 5 (Cloud Run Redeployment) is completed |
| **7. Partner Retest Completed** | Independent retest and updated Sprint 1 Acceptance Decision recorded by SingSlot UAT Team (`@lephirada` & `@Phenwatsa`) on [Issue #38](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38) | **PENDING** | Blocked until Stage 6 (Health Verification) and partner retest notification |

---

## 2. Executive Summary of All Six Partner Findings (`DEF-OUT-01`, `DEF-OUT-02`, `AUDIT-01`..`04`)

| Finding ID | Final Classification & Severity | Linked Requirement & UAT Case | Code Change Implemented | Regression Test Verification |
|:---:|:---:|:---:|---|---|
| **`DEF-OUT-01`** | **Accepted Defect**<br>**Critical (Release-Blocking)** | `UAT-S1-04` (Sub-check 4A)<br>`BR-10`, `AC-02-2`, `NFR-SEC-02` | Lowercased both `prefix` and `path` prior to stripping trailing slashes in `server/src/middlewares/roleGuard.ts`:<br>`const normalizedPrefix = prefix.toLowerCase().replace(/\/+$/, '');`<br>`const normalizedPath = path.toLowerCase().replace(/\/+$/, '');` | **`server/tests/unit/roleGuard.test.ts`** (`DEF-OUT-01 Regression`) and **`server/tests/integration/access.test.ts`** (`DEF-OUT-01 Regression`): verifies `/api/Accounts`, `/api/Accounts/`, `/API/ACCOUNTS`, `/api/Reports/summary`, `/api/Transactions` return `403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN` for `ADMIN` with zero financial payload, while allowing `USER` (`200 OK`) and preserving non-financial `ADMIN` routes (`/api/auth/me` -> `200 OK`). |
| **`DEF-OUT-02`** | **Not-a-Defect**<br>*(By Design / Idempotent Implementation)* | `AC-01-5`, `FR-01`, SDS Section 8 | **No production code change required.** Although `AC-01-5` specifies that calling `POST /api/auth/logout` clears the session cookie and subsequent protected calls return `401`, it does not explicitly state whether an unauthenticated logout request must return `200` or `401`. Treating `POST /api/auth/logout` as an idempotent operation (`router.post('/logout', logout)` without `authGuard`) is an intentional architectural design decision aligned with system behavior (`content-type.test.ts` Case A & D) so expired or unauthenticated tabs can clear cookies deterministically. To make this explicit in future specifications, the `AC-01-5` contract can be augmented with an explicit idempotent unauthenticated logout clause. | **`server/tests/integration/auth.test.ts`** & **`server/tests/unit/roleGuard.test.ts`** (`TEST-AUTH-LOGOUT-UNAUTHENTICATED`): sends `POST /api/auth/logout` **without any session cookie or Authorization header**, asserting `HTTP 200 OK`, `Set-Cookie: token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`, zero user PII leakage, and no session creation (`GET /api/auth/me` -> `401`). Authenticated logout test (`TEST-AUTH-05`) is retained. |
| **`AUDIT-01`** | **Accepted Defect**<br>**Minor (Code Audit Hardening)** | `UAT-S1-03`<br>`AC-03-3`, `BR-02` | Updated `server/src/services/income.service.ts` line 376 to lock both primary `CASH` and target `INCOME` accounts inside `prismaClient.$transaction`:<br>`await lockAccounts(tx, [primaryAccount.id, incomeAccount.id], userId);` | **`server/tests/unit/roleGuard.test.ts`** (`AUDIT-01 Hardening`) and **`server/tests/integration/income.test.ts`** (`TEST-OPEN-04` & `TEST-INC-ATOM`): initializes `Checking Bank` and `Salary` with `is_opening_locked = false`, commits an Income transaction, asserts both accounts have `is_opening_locked === true`, verifies subsequent `PATCH /api/accounts/:id/opening-balance` on both `Checking Bank` and `Salary` returns `HTTP 422 OPENING_BALANCE_LOCKED`, and simulates an `allocationLine.create` failure to verify that both `Checking Bank` and `Salary` roll back to `is_opening_locked === false` with zero persisted `Transaction` or `AllocationLine` records. |
| **`AUDIT-02`** | **Accepted Defect**<br>**Minor (Code Audit Hardening)** | `FR-01`, `AC-01-2` | Updated `server/src/controllers/auth.controller.ts` line 10 to validate string types without trimming the password:<br>`if (typeof username !== 'string' \|\| typeof password !== 'string' \|\| !username.trim() \|\| !password)` | **`server/tests/integration/auth.test.ts`** & **`server/tests/unit/roleGuard.test.ts`** (`AUDIT-02 Hardening`): tests Object username (`{ $gt: '' }`), Array username (`['user_demo']`), Number password (`12345`), empty username (`""`), whitespace-only username (`"   "`), and empty password (`""`), asserting `HTTP 401 INVALID_CREDENTIALS` with no stack trace while valid login (`TEST-AUTH-01`) continues to pass. |
| **`AUDIT-03`** | **Accepted Defect**<br>**Minor (Code Audit Hardening)** | `NFR-SEC-03` (`TEST-SEC-06`) | Added `'/api/transactions/income'`, `'/transactions/income'`, `'/api/transactions/expense'`, `'/transactions/expense'`, `'/api/transactions/repayment'`, and `'/transactions/repayment'` to `JSON_BODY_REQUIRED_ENDPOINTS` in `server/src/middlewares/contentType.ts`. | **`server/tests/integration/content-type.test.ts`** & **`server/tests/unit/roleGuard.test.ts`** (`AUDIT-03 Hardening` Tests A–E): executes actual middleware/HTTP requests verifying Test A (missing body -> `400 MISSING_REQUEST_BODY`), Test B (body without Content-Type -> `400 INVALID_CONTENT_TYPE`), Test C (`text/plain` -> `400 INVALID_CONTENT_TYPE`), Test D (valid `application/json` including `{}` passes middleware to field validation), Test E (uppercase & trailing slash variants `/api/Transactions/Income/`, `/API/TRANSACTIONS/EXPENSE`), and confirms `GET /api/transactions` is not blocked. |
| **`AUDIT-04`** | **Enhancement / Hardening**<br>**Minor** | `UAT-S1-02` (Sub-check 2D)<br>`BR-07`, `AC-07-2` | Updated `client/src/components/RepaymentForm.tsx` line 92 from `amountCents > debtCents && debtCents > 0` to:<br>`const isExceedingDebt = amountCents > debtCents;` | **`client/src/components/RepaymentForm.test.tsx`** (`TEST-UI-REPAY-11 (AUDIT-04 Regression)`): configures target credit card with `current_balance: 0.0` (`0.00 THB` debt) and bank balance `30000.0`, enters `100.00`, asserts inline `Exceeds debt` warning renders, `Confirm Repayment` button is disabled, and `recordRepayment()` is never called, while existing tests `TEST-UI-REPAY-01`..`10` (full/partial/over-debt/insufficient-cash) all pass. |

---

## 3. Detailed Walkthrough & RED-to-GREEN Evidence (`DEF-OUT-01` & Part D Suite)

### 3.1 Step 1 — Defective Baseline Identification & Reproducible RED Isolation Procedure
* **Defective Baseline Commit SHA (`staging-lab5`):** `d5202f8aaecaf22005828ec5ab56e6875d3f4ba7` (`d5202f8`, head of `staging-lab5` prior to `fix/37-defect-resolution-part-d`, containing the exact unmodified `server/src/middlewares/roleGuard.ts` implementation deployed on Cloud Run revision `whatsss-00020-65k` / commit `ba2f9dd`).
* **Defective Implementation in `server/src/middlewares/roleGuard.ts` (at `d5202f8aaecaf22005828ec5ab56e6875d3f4ba7`):**
  ```ts
  const normalizedPrefix = prefix.replace(/\/+$/, '');
  const normalizedPath = path.replace(/\/+$/, '');
  return (
    normalizedPath === normalizedPrefix ||
    normalizedPath.startsWith(`${normalizedPrefix}/`)
  );
  ```
* **Test Environment:** Windows 11 / Node.js `v24.14.0` / Vitest `v1.6.1` (`server/` working directory).
* **Exact Reproducible RED Procedure (File-Scoped Checkout Against Identical Test File):**
  1. Note that this RED run specifically isolates and proves **`DEF-OUT-01`** (`server/src/middlewares/roleGuard.ts`) by checking out **only** the defective `server/src/middlewares/roleGuard.ts` file from baseline commit `d5202f8aaecaf22005828ec5ab56e6875d3f4ba7` (`staging-lab5`) into the current branch (`fix/37-defect-resolution-part-d`), **rather than** checking out the entire repository to `d5202f8` (where `server/tests/unit/roleGuard.test.ts` did not yet exist).
  2. Keeping `server/tests/unit/roleGuard.test.ts` identical in the working tree guarantees that the **exact same test case and assertions** are executed in both the **RED** run (with `roleGuard.ts` from `d5202f8aaecaf22005828ec5ab56e6875d3f4ba7`) and the **GREEN** run (with corrected `roleGuard.ts` restored from `HEAD`).
  3. Exact commands used to reproduce RED and restore GREEN:
     ```powershell
     # 1. Check out the defective baseline roleGuard.ts from staging-lab5 (d5202f8aaecaf22005828ec5ab56e6875d3f4ba7)
     git checkout d5202f8aaecaf22005828ec5ab56e6875d3f4ba7 -- server/src/middlewares/roleGuard.ts

     # 2. Run the new test file against the defective roleGuard.ts (RED: DEF-OUT-01 fails while the other 7 tests pass)
     cd server
     npx vitest run tests/unit/roleGuard.test.ts

     # 3. Restore the corrected roleGuard.ts from the fix branch HEAD and re-run the exact same test file (GREEN: 8/8 pass)
     cd ..
     git checkout HEAD -- server/src/middlewares/roleGuard.ts
     cd server
     npx vitest run tests/unit/roleGuard.test.ts --reporter=verbose
     ```

---

### 3.2 Step 2 — Automated Reproducing Test Execution (`RED` on Defective `roleGuard.ts` from `d5202f8aaecaf22005828ec5ab56e6875d3f4ba7`)

* **Scope of RED Verification:** Specifically proves **`DEF-OUT-01`** (Case-Sensitivity Authorization Bypass in `roleGuard.ts`).
* **Test Name:** `Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > DEF-OUT-01 Regression (BR-10, AC-02-2): blocks ADMIN from mixed-case and uppercase financial routes (/api/Accounts, /api/Accounts/, /API/ACCOUNTS, /api/Reports/summary, /api/Transactions)`
* **Test File:** `server/tests/unit/roleGuard.test.ts` (line 84)
* **Exact Command Executed:**
  ```powershell
  git checkout d5202f8aaecaf22005828ec5ab56e6875d3f4ba7 -- server/src/middlewares/roleGuard.ts
  cd server
  npx vitest run tests/unit/roleGuard.test.ts
  ```
* **Expected Failing Assertion:** `expect(res.statusCode).toBe(403)` fails on `/api/Accounts` because the un-lowercased path bypasses `roleGuard`, leaving `res.statusCode` at `200` and calling `next()`.

#### Actual Verbatim Terminal Output (RED):
```text
 RUN  v1.6.1 C:/Users/User/Downloads/group_work_specs_v1/Whatsss-PMandELS/server

 ❯ tests/unit/roleGuard.test.ts  (8 tests | 1 failed) 18ms
   ❯ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > DEF-OUT-01 Regression (BR-10, AC-02-2): blocks ADMIN from mixed-case and uppercase financial routes (/api/Accounts, /api/Accounts/, /API/ACCOUNTS, /api/Reports/summary, /api/Transactions)
     → expected 200 to be 403 // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > DEF-OUT-01 Regression (BR-10, AC-02-2): blocks ADMIN from mixed-case and uppercase financial routes (/api/Accounts, /api/Accounts/, /API/ACCOUNTS, /api/Reports/summary, /api/Transactions)
AssertionError: expected 200 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 200

 ❯ tests/unit/roleGuard.test.ts:84:30
     82|       const { req, res, next } = createMockReqRes(route, route, 'ADMIN…
     83|       roleGuard(req, res, next);
     84|       expect(res.statusCode).toBe(403);
       |                              ^
     85|       expect(res.body).toEqual({
     86|         success: false,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  23:01:26
   Duration  843ms (transform 93ms, setup 0ms, collect 441ms, tests 18ms, environment 0ms, prepare 204ms)
```

#### Visual Evidence (`EVD-PARTD-01` — Verbatim RED Output):
![EVD-PARTD-01: Verbatim RED Failure Output on Defective roleGuard.ts](./evidence/partd-01-def-out-01-red-test.png)

---

### 3.3 Step 3 — Code Fix Applied (`server/src/middlewares/roleGuard.ts`)

```diff
--- a/server/src/middlewares/roleGuard.ts
+++ b/server/src/middlewares/roleGuard.ts
@@ -14,8 +14,8 @@ export function roleGuard(req: Request, res: Response, next: NextFunction): void
   const pathsToCheck = [fullPath, req.path];
   const isFinancialRoute = pathsToCheck.some(path =>
     financialPathPrefixes.some(prefix => {
-      const normalizedPrefix = prefix.replace(/\/+$/, '');
-      const normalizedPath = path.replace(/\/+$/, '');
+      const normalizedPrefix = prefix.toLowerCase().replace(/\/+$/, '');
+      const normalizedPath = path.toLowerCase().replace(/\/+$/, '');
       return (
         normalizedPath === normalizedPrefix ||
         normalizedPath.startsWith(`${normalizedPrefix}/`)
```

---

### 3.4 Step 4 & Step 5 — Automated Regression Verification (`GREEN` After Fix & Full Suite Run)

* **Exact Commands Executed:**
  ```powershell
  cd server
  npx vitest run tests/unit/roleGuard.test.ts --reporter=verbose
  npx vitest run tests/unit
  npm run build

  cd ../client
  npx vitest run
  npm run build
  ```

#### Actual Verbatim Terminal Output (GREEN — Backend Unit Suite `154 passed (154)`):
```text
 RUN  v1.6.1 C:/Users/User/Downloads/group_work_specs_v1/Whatsss-PMandELS/server

 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > blocks ADMIN from lowercase financial endpoints (/api/accounts, /api/transactions, /api/reports/summary) with 403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > DEF-OUT-01 Regression (BR-10, AC-02-2): blocks ADMIN from mixed-case and uppercase financial routes (/api/Accounts, /api/Accounts/, /API/ACCOUNTS, /api/Reports/summary, /api/Transactions)
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > allows USER role to proceed through financial routes regardless of path casing
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > does not block ADMIN on non-financial routes (/api/auth/me, /api/accountsXYZ)
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > TEST-AUTH-LOGOUT-UNAUTHENTICATED (DEF-OUT-02 Verification, AC-01-5): unauthenticated POST /api/auth/logout without cookie returns 200 OK and clears token cookie with configured attributes
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > AUDIT-01 Hardening (AC-03-3): recordIncome locks both primary Checking Bank and target Salary accounts atomically, and rolls back locks on transaction failure
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > AUDIT-02 Hardening: rejects non-string, empty, or whitespace-only username and non-string or empty password with 401 INVALID_CREDENTIALS
 ✓ tests/unit/roleGuard.test.ts > Unit Test: roleGuard Middleware & Part D Security/Audit Hardening (DEF-OUT-01, DEF-OUT-02, AUDIT-01..03) > AUDIT-03 Hardening: requireJsonContentType middleware rejects missing body (400 MISSING_REQUEST_BODY), missing/wrong Content-Type (400 INVALID_CONTENT_TYPE), and passes valid application/json across transaction routes and case/slash variants

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  23:02:00
   Duration  947ms (transform 101ms, setup 0ms, collect 475ms, tests 15ms, environment 0ms, prepare 242ms)

 RUN  v1.6.1 C:/Users/User/Downloads/group_work_specs_v1/Whatsss-PMandELS/server

 ✓ tests/unit/seed.test.ts  (36 tests) 1374ms
 ✓ tests/unit/testSafety.test.ts  (27 tests) 156ms
 ✓ tests/unit/roleGuard.test.ts  (8 tests) 21ms
 ✓ tests/unit/config.test.ts  (23 tests) 81ms
 ✓ tests/unit/health.test.ts  (11 tests) 22ms
 ✓ tests/unit/balance.test.ts  (5 tests) 47ms
 ✓ tests/unit/splitAllocation.test.ts  (15 tests) 21ms
 ✓ tests/unit/accountLock.test.ts  (9 tests) 16ms
 ✓ tests/unit/decimal.test.ts  (16 tests) 19ms
 ✓ tests/unit/password.test.ts  (4 tests) 691ms

 Test Files  10 passed (10)
      Tests  154 passed (154)
   Start at  23:02:04
   Duration  17.16s (transform 676ms, setup 1ms, collect 5.79s, tests 2.45s, environment 4ms, prepare 5.50s)
```

#### Actual Verbatim Terminal Output (GREEN — Frontend Client Suite `56 passed (56)`):
```text
 RUN  v1.6.1 C:/Users/User/Downloads/group_work_specs_v1/Whatsss-PMandELS/client

 ✓ src/components/IncomeForm.test.tsx  (8 tests) 599ms
 ✓ src/components/RepaymentForm.test.tsx  (11 tests) 745ms
 ✓ src/components/ProtectedRoute.test.tsx  (4 tests) 269ms
 ✓ src/pages/TransactionHistoryPage.test.tsx  (5 tests) 443ms
 ✓ src/components/ExpenseForm.test.tsx  (13 tests) 1243ms
 ✓ src/pages/DashboardPage.test.tsx  (7 tests) 551ms
 ✓ src/pages/AccountListPage.test.tsx  (8 tests) 801ms

 Test Files  7 passed (7)
      Tests  56 passed (56)
   Start at  21:54:42
   Duration  6.96s (transform 1.48s, setup 2ms, collect 12.89s, tests 4.65s, environment 22.42s, prepare 2.18s)
```

*(Note on Full-Stack Integration Tests: In `.github/workflows/ci-docker.yml` lines 83–91, the `Run Backend Automated Tests` step executes `npm test` (`vitest run`) against a live `postgres:16-alpine` service container, running all 10 unit test files, all 17 integration test files—including `access.test.ts`, `auth.test.ts`, `income.test.ts`, and `content-type.test.ts`—and the E2E suite `golden-journey.test.ts`.)*

#### Visual Evidence (`EVD-PARTD-02` — Verbatim GREEN Output):
![EVD-PARTD-02: Verbatim GREEN Passing Output After Fixing DEF-OUT-01 and AUDIT-01..03](./evidence/partd-02-def-out-01-green-test.png)

---

## 4. Detailed Technical Documentation for Findings `DEF-OUT-02` & `AUDIT-01`..`04`

### 4.1 `DEF-OUT-02`: Unauthenticated `POST /api/auth/logout` (`Not-a-Defect`)
* **Partner Observation:** Calling `POST /api/auth/logout` without attaching a session cookie returned `HTTP 200 OK` with a `Set-Cookie: token=; Max-Age=0` header.
* **Requirement & Architectural Design Analysis (`AC-01-5`, `FR-01`):**
  1. In [`docs/sprints/sprint-1/feature-contracts.md`](../../sprints/sprint-1/feature-contracts.md) (lines 33, 39, 46), `AC-01-5` specifies:
     > *"Calling `POST /api/auth/logout` clears session cookie with matching attributes; subsequent protected calls return `401 Unauthorized` (`TEST-AUTH-05`, `FR-01`)."*
  2. **Contract Scope Clarification:** `AC-01-5` defines the required cookie-clearing effect of logout and the `401 Unauthorized` requirement for subsequent protected calls, **but does not explicitly prescribe whether an unauthenticated `POST /api/auth/logout` request must return `200 OK` or `401 Unauthorized`**.
  3. **Idempotent Design Rationale:** In [`server/src/routes/auth.routes.ts`](../../../server/src/routes/auth.routes.ts) (line 9), `router.post('/logout', logout)` is intentionally mounted without `authGuard` as an **architectural design decision** (consistent with the system's existing `server/tests/integration/content-type.test.ts` Case A & D bodyless logout specification) so that logout is idempotent: if a user's session cookie has already expired or was cleared in another browser tab, clicking "Logout" deterministically clears cookie state and returns `200 OK` without throwing client-side errors or leaking any data.
  4. **Future Contract Hardening Note:** If future sprint contracts wish to formalize this design decision at the specification level, an explicit clause stating that `POST /api/auth/logout` is idempotent for both authenticated and unauthenticated callers can be added to `AC-01-5`.
* **Direct Unauthenticated Regression Verification (`TEST-AUTH-LOGOUT-UNAUTHENTICATED`):**
  Added `TEST-AUTH-LOGOUT-UNAUTHENTICATED` in `server/tests/integration/auth.test.ts` and `server/tests/unit/roleGuard.test.ts` which sends `POST /api/auth/logout` **with zero cookies and zero Authorization headers**, confirming:
  1. `HTTP 200 OK` with `{ "success": true, "data": { "message": "Logged out successfully" } }`.
  2. `Set-Cookie` clears `token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`.
  3. Zero user profile data or tokens are returned, and no session is created (`GET /api/auth/me` returns `401 UNAUTHORIZED`).
* **Final Classification:** **`Not-a-Defect`** *(Intentional Idempotent Logout Design Decision)*.

### 4.2 `AUDIT-01`: Income Target Account (`Salary`) Opening Balance Lock & Transactional Rollback (`AC-03-3`)
* **Implementation:** In `server/src/services/income.service.ts` (line 376), inside `prismaClient.$transaction(async (tx) => { ... })`, after validating that both `primaryAccount` (`CASH`) and `incomeAccount` (`INCOME`) exist and belong to `userId`, both accounts are locked atomically:
  ```ts
  await lockAccounts(tx, [primaryAccount.id, incomeAccount.id], userId);
  ```
* **Regression Verification (Both Commit Lock & Failure Rollback):**
  - `server/tests/unit/roleGuard.test.ts` (`AUDIT-01 Hardening`):
    1. **Commit Path:** Verifies both `Checking Bank` and `Salary` transition from `is_opening_locked: false` to `true` when `recordIncome()` succeeds.
    2. **Failure & Rollback Path:** Resets both accounts to `is_opening_locked: false`, simulates an `allocationLine.create` database failure inside `$transaction` after `lockAccounts` and `transaction.create` have run, asserts that `recordIncome()` rejects with the error, and verifies that **both `Checking Bank` and `Salary` roll back to `is_opening_locked === false` with `0` committed transactions and `0` committed allocation lines**.
  - `server/tests/integration/income.test.ts`:
    1. **`TEST-OPEN-04`:** Verifies that after `POST /api/transactions/income` commits (`201 Created`), calling `PATCH /api/accounts/${CHECKING_ID}/opening-balance` AND `PATCH /api/accounts/${SALARY_ID}/opening-balance` both return **`HTTP 422 Unprocessable Entity` (`OPENING_BALANCE_LOCKED`)** without mutating either opening balance.
    2. **`TEST-INC-ATOM`:** Simulates an `allocationLine.create` failure on `POST /api/transactions/income` (`HTTP 500`), asserting `checking.is_opening_locked === false`, `salary.is_opening_locked === false`, `mockTransactions` length `0`, and `mockAllocationLines` length `0`.

### 4.3 `AUDIT-02`: Login Payload Type Validation (`FR-01`, `AC-01-2`)
* **Implementation:** In `server/src/controllers/auth.controller.ts` (line 10):
  ```ts
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password)
  ```
  Note that `password` is **not** trimmed so valid passwords containing leading/trailing spaces are preserved without modification.
* **Regression Verification:** Verified in `server/tests/integration/auth.test.ts` and `server/tests/unit/roleGuard.test.ts` (`AUDIT-02 Hardening`) across Object username, Array username, Number password, empty string username, whitespace-only username, and empty string password—all returning `HTTP 401 INVALID_CREDENTIALS` with zero stack trace exposure.

### 4.4 `AUDIT-03`: Required JSON Body for Transaction Creation Endpoints (`NFR-SEC-03`)
* **Implementation:** Added `/api/transactions/income`, `/transactions/income`, `/api/transactions/expense`, `/transactions/expense`, `/api/transactions/repayment`, and `/transactions/repayment` to `JSON_BODY_REQUIRED_ENDPOINTS` in `server/src/middlewares/contentType.ts`.
* **Distinction Verified in Integration & Middleware Tests (`server/tests/integration/content-type.test.ts` & `server/tests/unit/roleGuard.test.ts`):**
  - **Test A (No Request Body):** `POST` without body -> `HTTP 400 Bad Request` (`MISSING_REQUEST_BODY`).
  - **Test B (Body Present, Missing `Content-Type`):** `POST` with payload and no `Content-Type` -> `HTTP 400 Bad Request` (`INVALID_CONTENT_TYPE`).
  - **Test C (Body Present, Wrong Media Type `text/plain`):** `POST` with `Content-Type: text/plain` -> `HTTP 400 Bad Request` (`INVALID_CONTENT_TYPE`).
  - **Test D (Valid `application/json` Body):** `POST` with `Content-Type: application/json` and `{}` passes `requireJsonContentType` and proceeds to controller field validation; valid payloads proceed to `201 Created`.
  - **Test E (Case & Trailing-Slash Variants):** `/api/Transactions/Income/`, `/API/TRANSACTIONS/EXPENSE`, `/api/Transactions/Repayment/` are normalized and enforced identically, while `GET /api/transactions` is unaffected.

### 4.5 `AUDIT-04`: Zero-Debt Over-Repayment Warning in `RepaymentForm.tsx` (`BR-07`)
* **Implementation:** Changed `client/src/components/RepaymentForm.tsx` line 92 to `const isExceedingDebt = amountCents > debtCents;`.
* **Regression Verification (`client/src/components/RepaymentForm.test.tsx`):**
  Added **`TEST-UI-REPAY-11 (AUDIT-04 Regression)`** with `Visa Credit Card` at `current_balance: 0.0` (`0.00 THB` debt) and `Checking Bank` at `30000.0 THB`. Entering `100.00` displays the `Exceeds debt` warning, keeps `Confirm Repayment` disabled (`submitBtn.disabled === true`), and prevents `recordRepayment()` from being invoked on click. All existing tests (`TEST-UI-REPAY-01` through `TEST-UI-REPAY-10`) continue to pass (`11/11` in `RepaymentForm.test.tsx`, `56/56` across client suite).
