# System-Level Software Design Specification (SDS)
## Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part C: System-Level SDS) & Deliverable 2 (Part D: Sprint 2/3 Schema & Architecture Evolution)  
> **Status:** Accepted Sprint 1 Baseline (`v0.1.0-sprint1`, Frozen) + Lab 7 `BR-07 v1.1` Amendment + Sprint 2 & Sprint 3 Release (`v0.2.0-sprint2-rc`, `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` on `main` via [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67)). **Release & Deployment:** Completed ([Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583), [Deploy demo #13](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654): https://whatsss-sipqw4logq-as.a.run.app) | **Automated Regression:** Passed | **Unauthenticated Smoke Checks:** Passed | **Authenticated Live Demonstrations:** Completed (`DEMO-LIVE-01`..`03`) | **Overall Part E:** **Completed**

### Document Revision History
| Version | Status | Date | Scope / Reference | Summary |
|---|---|---|---|---|
| `v0.1.0-sprint1` | **Accepted & Frozen Baseline** | 2026-11-08 | PR #14 (`f84e7b16`) | Original Sprint 1 System-Level SDS (`F-01`..`F-09`). |
| `v2.0-contract` | **Sprint 2 & 3 Contracted Architecture Evolution** | 2026-11-26 | `WP-07` / [Issue #55](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/55) | Adds Section 11 specifying consolidated Sprint 2/3 Prisma schema evolution (`AccountSubtype` discriminator for Credit Card vs. General Loan Taken resolving the Lab 7 `BR-07 v1.1` prerequisite, `Account.is_archived`, `Transaction.is_favorite`, and `TransactionAuditLog`), extended balance equations (`F-11`..`F-13`), and Admin governance routes (`F-19`). |
| `v2.1-wp12` | **WP-11 Merged & WP-12 Part C Implemented** | 2026-11-28 | `WP-11` ([PR #64](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/64) `f3cd70b`) & `WP-12` ([PR #66](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/66) `e23416a9fd3f3d8326e6e60799fb2bed9e3c5c2f`) | Records implemented `TransactionAuditLog.sequence_number` (`BIGSERIAL`, serialized as decimal string to preserve `BIGINT` precision) ordering under row locks (`GET /api/transactions/:id/audit-history` ordered `sequence_number DESC`), `PATCH /api/accounts/:id/archive` (`acquireAccountRowLocks`, `INVALID_ARCHIVE_PAYLOAD`), and clarifies §11.1 audit-history immutability boundary vs. `F-16` `PUT/PATCH /api/transactions/:id` corrections. |
| `v0.2.0-sprint2-rc` | **Part E Release, Cloud Run Deployment & Live Demo Completed** | 2026-11-28 | `WP-12` / [Issue #60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60) / [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67) (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`, Tag `v0.2.0-sprint2-rc`) | Merged `staging-lab5` (`WP-08`..`WP-12`) into `main`, passed [Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583), deployed via [Deploy demo #13](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654) (https://whatsss-sipqw4logq-as.a.run.app), and completed `SMOKE-LIVE-01`..`04` plus `DEMO-LIVE-01`..`03` (16 screenshots + `deliverable-2-report.pdf`). |

---

## 1. System Overview

**Whatsss** is engineered as a secure, three-tier modular monolithic web application. It delivers multi-tenant personal finance accounting, deterministic balance calculation, and privacy isolation between platform administration and private personal ledgers.

The application adheres to clean separation of concerns:
* **Presentation Layer:** Single Page Application (SPA) providing an intuitive interface for authentication, ledger management, transaction recording, and financial summary inspection.
* **Application / API Layer:** RESTful API service implementing domain logic, authentication guards, business rule validation, split allocation arithmetic, and tenancy authorization barriers.
* **Persistence Layer:** Relational database with strict relational constraints, referential integrity, and durable ACID transactions.

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Presentation Layer (Browser)"]
        UI["React 18 SPA (Vite + TypeScript)"]
        UIAuth["Auth Context (HttpOnly Cookie Transport)"]
        UI --> UIAuth
    end

    subgraph ServerLayer ["Application / API Layer (Node.js + Express)"]
        Router["Express Router & Dispatcher"]
        AuthM["AuthGuard Middleware (Cookie Verification)"]
        RoleM["RoleGuard Middleware (USER vs ADMIN)"]
        
        subgraph DomainServices ["Domain Service Layer"]
            AuthSvc["Auth Service"]
            AccSvc["Account & Balance Service"]
            TxnSvc["Transaction & Allocation Engine"]
        end
        
        Router --> AuthM --> RoleM
        RoleM --> AuthSvc
        RoleM --> AccSvc
        RoleM --> TxnSvc
    end

    subgraph DataLayer ["Persistence Layer (PostgreSQL 16)"]
        Prisma["Prisma ORM Client"]
        DB[(PostgreSQL Database)]
        
        DomainServices --> Prisma
        Prisma --> DB
    end

    UIAuth -- "HTTP/JSON Requests (Credentials via Cookie)" --> Router
```

---

## 3. Technology Stack (Team Decision)

The team selected this stack based on direct continuity from the TokTickIT individual labs (Labs 1–4) and its strong TypeScript type safety:

* **Frontend:** **React 18**, **Vite**, **TypeScript**, **Bootstrap 5** (Clean, responsive layout with rapid component iteration)
* **Backend:** **Node.js (v20+)**, **Express.js**, **TypeScript** (Strict type definitions matching database schemas)
* **Database & ORM:** **PostgreSQL 16**, **Prisma ORM** (Guaranteed decimal arithmetic, relational integrity, migrations, and seed scripts)
* **Automated Testing Suite:** **Vitest**, **Supertest** (In-memory and HTTP integration tests for rapid TDD cycles)
* **Local Containerization:** **Docker Compose** (Standardized local PostgreSQL environment)

---

## 4. Data Model & Entity Relationship (ER) Diagram

The system employs a normalized relational schema designed to support the five Theme 7 account types and flexible multi-line split allocations.

```mermaid
erDiagram
    User ||--o{ Account : "owns"
    User ||--o{ Transaction : "records"
    Account ||--o{ Transaction : "primary source/destination"
    Transaction ||--|{ AllocationLine : "contains (1..*)"
    Account ||--o{ AllocationLine : "allocated to/from"

    User {
        string id PK
        string username UK
        string email UK
        string password_hash
        string role "USER | ADMIN"
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    Account {
        string id PK
        string user_id FK
        string name
        string type "CASH | LOAN_TAKEN | LOAN_GIVEN | INCOME | EXPENSE"
        decimal opening_balance
        boolean is_opening_locked
        datetime created_at
        datetime updated_at
    }

    Transaction {
        string id PK
        string user_id FK
        string primary_account_id FK
        string form "PAYMENT_CHARGE | RECEIVE_MONEY"
        decimal total_amount
        date transaction_date
        string description
        datetime created_at
    }

    AllocationLine {
        string id PK
        string transaction_id FK
        string target_account_id FK
        decimal amount
        string notes
    }
```

### Data Dictionary, Database Constraints & Multi-Tenant Invariants

1. **User Table (`users`):**
   * `id`: UUID (Primary Key, default `gen_random_uuid()`).
   * `username`: VARCHAR(50) (NOT NULL, UNIQUE, case-insensitive index).
   * `email`: VARCHAR(254) (NOT NULL, UNIQUE, case-insensitive index matching ER Diagram).
   * `password_hash`: VARCHAR(255) (NOT NULL, salted one-way hash generated with bcrypt, work factor $\ge 10$, `NFR-SEC-01`).
   * `role`: ENUM(`'USER'`, `'ADMIN'`) (NOT NULL, default `'USER'`).
   * `is_active`: BOOLEAN (NOT NULL, default `true`).
   * `created_at`: TIMESTAMP WITH TIME ZONE (NOT NULL, default `NOW()`).
   * `updated_at`: TIMESTAMP WITH TIME ZONE (NOT NULL, default `NOW()`).

2. **Account Table (`accounts`):**
   * `id`: UUID (Primary Key, default `gen_random_uuid()`).
   * `user_id`: UUID (NOT NULL, Foreign Key references `users(id)` ON DELETE CASCADE).
   * `name`: VARCHAR(100) (NOT NULL).
   * `type`: ENUM(`'CASH'`, `'LOAN_TAKEN'`, `'LOAN_GIVEN'`, `'INCOME'`, `'EXPENSE'`) (NOT NULL).
   * `opening_balance`: DECIMAL(12, 2) (NOT NULL, default `0.00`, CHECK `opening_balance >= 0.00`).
   * `is_opening_locked`: BOOLEAN (NOT NULL, default `false`).
   * `created_at`: TIMESTAMP WITH TIME ZONE (NOT NULL, default `NOW()`).
   * `updated_at`: TIMESTAMP WITH TIME ZONE (NOT NULL, default `NOW()`).
   * **Constraints & Indexes:** `UNIQUE(user_id, name)`, `INDEX(user_id)`.

3. **Transaction Table (`transactions`):**
   * `id`: UUID (Primary Key, default `gen_random_uuid()`).
   * `user_id`: UUID (NOT NULL, Foreign Key references `users(id)` ON DELETE CASCADE).
   * `primary_account_id`: UUID (NOT NULL, Foreign Key references `accounts(id)` ON DELETE RESTRICT).
   * `form`: ENUM(`'PAYMENT_CHARGE'`, `'RECEIVE_MONEY'`) (NOT NULL).
   * `total_amount`: DECIMAL(12, 2) (NOT NULL, CHECK `total_amount > 0.00`).
   * `transaction_date`: DATE (NOT NULL).
   * `description`: VARCHAR(255) (NULLABLE).
   * `created_at`: TIMESTAMP WITH TIME ZONE (NOT NULL, default `NOW()`).
   * **Constraints & Indexes:** `INDEX(user_id, transaction_date)`.

4. **AllocationLine Table (`allocation_lines`):**
   * `id`: UUID (Primary Key, default `gen_random_uuid()`).
   * `transaction_id`: UUID (NOT NULL, Foreign Key references `transactions(id)` ON DELETE CASCADE).
   * `target_account_id`: UUID (NOT NULL, Foreign Key references `accounts(id)` ON DELETE RESTRICT).
   * `amount`: DECIMAL(12, 2) (NOT NULL, CHECK `amount > 0.00`).
   * `notes`: VARCHAR(255) (NULLABLE).
   * **Constraints & Indexes:** `INDEX(transaction_id)`, `INDEX(target_account_id)`.

5. **Relational Invariants, Atomicity & Concurrency Controls:**
   * **Transactional Atomicity (`prisma.$transaction`):** The creation of a `Transaction` header, all associated `AllocationLine` items, and the atomic locking of referenced opening balances are unconditionally executed inside a single database transaction. If any validation fails (e.g., allocation sum mismatch, unowned target account), the transaction aborts and rolls back completely; zero partial records are ever committed.
   * **Cross-Tenant Ownership Scoping on Target Accounts:** In addition to validating `primary_account.user_id === req.user.id`, the backend must explicitly verify that **every** `target_account_id` referenced in the allocation lines belongs to `req.user.id`. Any attempt to reference another tenant's account as a target account is rejected immediately with HTTP `404 Not Found` (resource existence concealment per `BR-01`).
   * **Concurrency-Safe Opening Balance Locking & Atomic Conditional Mutation:**
     Opening balance updates (`PATCH /api/accounts/:id/opening-balance`) are permitted only while `is_opening_locked = false`. When the first referencing transaction commits, the account is locked atomically using a conditional update:
     $$\text{UPDATE accounts SET is\_opening\_locked = true WHERE id = \$id AND is\_opening\_locked = false}$$
     Rejected or rolled-back transactions never lock the account. Future transaction adjustments or edits (Sprint 2) never unlock or modify the recorded opening balance.
     
     To eliminate race conditions between concurrent requests (e.g., Request A reading an unlocked state while Request B commits the first transaction), the `PATCH /api/accounts/:id/opening-balance` endpoint must execute an atomic conditional `UPDATE` asserting ownership and unlocked state simultaneously:
     ```sql
     UPDATE accounts
     SET opening_balance = $1, updated_at = NOW()
     WHERE id = $2
       AND user_id = $3
       AND is_opening_locked = false;
     ```
     The backend inspects the affected row count:
     - If `affectedRows === 0`: The backend checks whether the account exists for this user. If not found, it responds with HTTP `404 Not Found` (`NOT_FOUND`, `BR-01`). If the account exists but has `is_opening_locked = true`, it immediately rejects with HTTP `422 Unprocessable Entity` (`OPENING_BALANCE_LOCKED`). Under no circumstances is the opening balance overwritten after an account is locked.
     - If `affectedRows === 1`: The update succeeds and returns HTTP `200 OK`.
     
     Opening balance mutations adhere to standardized error envelopes:
     - **Validation Failure (`400 Bad Request`):**
       ```json
       {
         "success": false,
         "error": {
           "code": "INVALID_OPENING_BALANCE",
           "message": "Opening balance must be a non-negative numeric value with up to 2 decimal places.",
           "details": []
         }
       }
       ```
     - **Resource Not Found (`404 Not Found`):**
       ```json
       {
         "success": false,
         "error": {
           "code": "NOT_FOUND",
           "message": "Account not found.",
           "details": []
         }
       }
       ```
     - **Locked Account Rejection (`422 Unprocessable Entity`):**
       ```json
       {
         "success": false,
         "error": {
           "code": "OPENING_BALANCE_LOCKED",
           "message": "Opening balance cannot be updated after the first transaction.",
           "details": []
         }
       }
       ```

     Furthermore, transaction insertion binds the account locking statement within the exact same atomic `prisma.$transaction` block as the `Transaction` and `AllocationLine` inserts, guaranteeing strict linearizability between opening balance mutations and transaction creation.

---

## 5. Account and Transaction Relationships

```mermaid
flowchart LR
    subgraph Form1 ["Make Payment / Record Charge / Repay Debt"]
        SourceAcc["Primary Account\n(Cash or Loan Taken)"] -- "Deducts / Charges Total" --> Txn1["Transaction"]
        Txn1 -- "Allocates" --> Alloc1["Allocation 1 (Expense: Dining)"]
        Txn1 -- "Allocates" --> Alloc2["Allocation 2 (Expense: Grocery)"]
        Txn1 -- "Allocates" --> Alloc3["Allocation Line\n(Target: Loan Taken / Repayment)"]
    end

    subgraph Form2 ["Receive Money"]
        Txn2["Transaction"] -- "Deposits Total" --> DestAcc["Primary Account\n(Cash / Bank)"]
        Alloc4["Allocation Line (Target: Income: Salary)"] -- "Funds" --> Txn2
    end
```

### Ledger Transaction Semantics & Accounting Effects Matrix

Every financial event in Whatsss is recorded using the `Transaction` header and child `AllocationLine` items. The ledger strictly validates allowed account-type pairings and computes balances based on double-entry principles adapted for personal finance:

| Transaction Type | Transaction Form | Primary Account (`primary_account_id`) | Allocation Account (`target_account_id`) | Accounting & Ledger Invariant Effect |
|---|---|---|---|---|
| **Income Transaction** | `RECEIVE_MONEY` | Must be `CASH` (e.g. Bank Account) | Must be `INCOME` (e.g. Salary) | **`CASH` Balance increases** ($+ \text{amount}$)<br>**`Income` Summary increases** ($+ \text{amount}$)<br>Debt and Expenses are unaffected. |
| **Credit Card Purchase** | `PAYMENT_CHARGE` | Must be `LOAN_TAKEN` (Credit Card) | Must be `EXPENSE` (e.g. Dining, Grocery) | **`LOAN_TAKEN` Debt increases** ($+ \text{amount}$)<br>**`Expense` Summary increases** ($+ \sum \text{allocations}$)<br>Cash balance is unaffected. |
| **Debt Repayment** | `PAYMENT_CHARGE` | Must be `CASH` (Bank Account) | Must be `LOAN_TAKEN` (Credit Card) | **`CASH` Balance decreases** ($- \text{amount}$)<br>**`LOAN_TAKEN` Debt decreases (Liability Settlement)** ($- \text{amount}$)<br>**Zero effect on Expense Summary** (`BR-08`). |

### Balance Calculation Engine Invariants

All account balances and financial summaries are computed deterministically from persisted records:

1. **Cash Account Balance (Asset):**
   $$\text{Cash Balance} = \text{opening\_balance} + \sum \text{Inflows (RECEIVE\_MONEY to Cash)} - \sum \text{Outflows (PAYMENT\_CHARGE from Cash)}$$
   *For the Golden Journey:* Bank Account = $10,000.00 \text{ (Opening)} + 20,000.00 \text{ (Salary Inflow)} - 3,000.00 \text{ (Repayment Outflow)} = 27,000.00 \text{ THB}$.

2. **Loan Taken Outstanding Debt (Liability):**
   $$\text{Debt Balance} = \text{opening\_balance} + \sum \text{Charges (PAYMENT\_CHARGE on Loan Taken)} - \sum \text{Settlements (Allocations targeting Loan Taken)}$$
   *Crucial Accounting Rule:* When a Debt Repayment transaction is executed, the allocation line targets the `Loan Taken` account. In liability ledger evaluation, allocations targeting `Loan Taken` represent **debt reduction**, directly decrementing outstanding debt.
   *For the Golden Journey:* Credit Card Debt = $0.00 \text{ (Opening)} + 3,000.00 \text{ (Purchase Charge)} - 3,000.00 \text{ (Repayment Settlement)} = 0.00 \text{ THB}$.

3. **Income Summary:**
   $$\text{Total Income} = \sum \text{AllocationLine.amount where target\_account.type == 'INCOME'}$$
   *(Transfers, opening balances, and debt inflows are excluded per `BR-02`).*  
   *For the Golden Journey:* Total Income = $20,000.00 \text{ THB}$ (Salary).

4. **Expense Summary:**
   $$\text{Total Expense} = \sum \text{AllocationLine.amount where target\_account.type == 'EXPENSE'}$$
   *(Debt repayments, transfers, and opening balances are strictly excluded per `BR-02` and `BR-08`).*  
   *For the Golden Journey:* Total Expense = $1,000.00 \text{ (Dining)} + 2,000.00 \text{ (Grocery)} = 3,000.00 \text{ THB}$.

---

## 6. API Design Conventions

### 6.1 Architectural Style
* Standard RESTful conventions over HTTP/HTTPS with JSON payloads.
* Base URL prefix: `/api`

### 6.2 Standard Response Envelope
All successful API responses return a uniform JSON wrapper:
```json
{
  "success": true,
  "data": { ... }
}
```

### 6.3 Standard Error Envelope
All error responses adhere to a consistent error schema:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human readable explanation of failure",
    "details": []
  }
}
```

### 6.4 HTTP Status Code Conventions
* `200 OK`: Request succeeded (used for retrieval and updates).
* `201 Created`: Resource successfully created.
* `400 Bad Request`: Malformed JSON syntax, unparseable request body, missing or unsupported `Content-Type` on endpoints requiring a JSON body (`INVALID_CONTENT_TYPE`), malformed JSON request body (`INVALID_JSON_BODY`), schema syntax validation errors, or invalid opening balance values (`INVALID_OPENING_BALANCE`).
* `401 Unauthorized`: Missing, invalid, or expired authentication credentials (`BR-09`).
* `403 Forbidden`: Authenticated user lacks permission (e.g., ADMIN attempting to access financial records per `BR-10`), or CSRF origin verification failure (`CSRF_ORIGIN_REJECTED`).
* `404 Not Found`: Resource does not exist, or cross-tenant access attempt (resource existence concealment per `BR-01`; error code `NOT_FOUND`).
* `422 Unprocessable Entity`: Semantic domain or business rule violation (e.g., allocation sum does not equal total amount per `BR-06` [`ALLOCATION_SUM_MISMATCH`], or attempt to update a locked opening balance [`OPENING_BALANCE_LOCKED`]).

---

## 7. Authentication, Authorization & Security Architecture (Unified HttpOnly Cookie Approach)

To ensure robust security, avoid token leakage, and eliminate token storage inconsistencies between client and server, the application standardizes exclusively on **HttpOnly Cookies** and a strict middleware pipeline:

1. **Token Transport & Attributes:**
   * Upon successful login (`POST /api/auth/login`), the server signs a JWT containing payload `{ "id": user.id, "username": user.username, "role": user.role }` signed with `JWT_SECRET` and set with expiration `JWT_EXPIRES_IN` (default `1d`).
   * The token is set in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `token`.
   * **Production vs Development Secure Flag:** In production (`NODE_ENV === 'production'`), the `Secure` flag is enforced (requires HTTPS); in local development (`NODE_ENV !== 'production'`), `Secure` is omitted so the cookie persists over local HTTP (`http://localhost:5173`).
   * **Zero Body/Storage Leakage:** The JWT is **never returned in the JSON response body** and **never stored in `localStorage` or `sessionStorage`** on the client, neutralizing token exfiltration via Cross-Site Scripting (XSS).

2. **CORS & Preflight Handling Configuration:**
   * The Express API uses the `cors` package configured with `origin: process.env.CLIENT_URL || 'http://localhost:5173'` and `credentials: true`.
   * Wildcard origins (`*`) are strictly prohibited, ensuring credentials cannot be intercepted or exposed across arbitrary origins.
   * **CORS Preflight (OPTIONS) Handling:** Browser-initiated cross-origin requests utilizing custom headers or non-simple HTTP methods automatically trigger an HTTP `OPTIONS` preflight request. `OPTIONS` preflight requests are handled by CORS middleware before CSRF validation and authentication middleware:
     * **Trusted Preflight Handling:** Preflight requests from the configured trusted frontend origin receive authorizing CORS response headers (`Access-Control-Allow-Origin: process.env.CLIENT_URL`, `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`, `Access-Control-Allow-Credentials: true`, `Access-Control-Max-Age: 86400`) and terminate with HTTP `204 No Content` (or `200 OK`).
     * **Credentials Enforcement:** Credentials (`Access-Control-Allow-Credentials: true`) are permitted exclusively for configured trusted origins.
     * **Untrusted Origins Policy:** Untrusted origins must not receive an authorizing `Access-Control-Allow-Origin` header, preventing cross-origin access. Untrusted preflights are not required to return HTTP 403; the security condition is strictly enforced by withholding CORS authorization headers.
     * **Zero Execution:** `OPTIONS` preflight requests bypass CSRF validation and authentication guards, and must never execute business logic or perform database writes.

3. **CSRF Mitigation Architecture:**
   * **CORS vs. CSRF Separation:** CORS and CSRF validation are distinct, separate security controls. CORS governs cross-origin browser read permissions, whereas CSRF validation actively protects server-side state from unauthorized, forged mutations. Server-side Origin and Referer validation directly enforces CSRF rejection; CORS is not described or relied upon as the actual CSRF security mechanism.
   * **Applicable Methods:** CSRF validation applies strictly to state-changing HTTP methods: `POST`, `PUT`, `PATCH`, and `DELETE`.
   * **Safe Method Exemption:** Safe and idempotent methods (`GET`, `HEAD`, `OPTIONS`) are exempt from CSRF validation, ensuring standard read navigation and CORS preflight negotiations function normally.
   * **`SameSite=Lax` Cookie Policy:** Browsers automatically block cookie inclusion on cross-site subrequests (such as `fetch`/`XMLHttpRequest` from external domains).
   * **Strict Server-Side Origin & Referer Validation:**
     * **Origin Validation First:** The server inspects the request `Origin` header first, requiring an exact match against `process.env.CLIENT_URL` (scheme, hostname, and port must match identically; substring, regex wildcard, or partial hostname matching is strictly prohibited).
     * **Referer Fallback:** If the `Origin` header is absent, the middleware falls back to extracting and validating the origin component of the `Referer` header against `process.env.CLIENT_URL`.
     * **Rejection Criteria:** The server rejects requests when:
       1. The supplied origin does not match the configured trusted frontend origin.
       2. Both `Origin` and `Referer` headers are missing.
       3. The `Referer` header is malformed or unparseable.
       4. The scheme, hostname, or port does not match the trusted origin.
       5. The `Origin` value is literal `null`.
       6. The origin cannot be safely parsed or validated.
     * **Rejection Behavior:** Invalid or unverifiable CSRF requests return HTTP `403 Forbidden` with standardized error code `CSRF_ORIGIN_REJECTED` (`{ "success": false, "error": { "code": "CSRF_ORIGIN_REJECTED", "message": "Cross-site request forgery validation failed: Origin or Referer untrusted", "details": [] } }`).
     * **Zero Execution & Zero Writes:** A rejected CSRF request terminates immediately at the middleware layer; it must not execute the protected business operation or perform database writes.

4. **Dedicated JSON Content-Type Validation (`RequireJsonContentType`):**
   * **Dedicated Validation Middleware:** Standard `express.json()` alone does not guarantee rejection of all unsupported request content types. A dedicated validation middleware (`RequireJsonContentType`) is deployed for endpoints that require a JSON request body.
   * **Rejection of Unsupported Content Types:** For endpoints expecting a JSON request body, requests with missing or unsupported `Content-Type` values (e.g., standard HTML form submissions `application/x-www-form-urlencoded` or `multipart/form-data`) are rejected with HTTP `400 Bad Request` and error code `INVALID_CONTENT_TYPE`.
   * **Malformed JSON Body Handling:** The Express JSON parser (`express.json({ limit: '100kb' })`) processes JSON streams for validated requests; any malformed JSON body triggers the centralized error handler, returning HTTP `400 Bad Request` with error code `INVALID_JSON_BODY` (`{ "success": false, "error": { "code": "INVALID_JSON_BODY", "message": "Malformed JSON in request body", "details": [] } }`). These responses preserve HTTP 400 per existing API conventions and are not changed to HTTP 415.
   * **Conditional Scope:** It is applied conditionally to endpoints requiring a JSON request body, based on their defined API contracts:
     * `POST /api/auth/login`
     * `PATCH /api/accounts/:id/opening-balance`
     * `POST /api/transactions/income`
     * `POST /api/transactions/expense`
     * `POST /api/transactions/repayment`
     The middleware must not be applied indiscriminately to endpoints that do not require a JSON request body. Bodyless `POST /api/auth/logout` is explicitly excluded from JSON Content-Type validation.
   * **Bodyless Logout Compatibility (`POST /api/auth/logout`):** `POST /api/auth/logout` is a bodyless endpoint. It is not required to send `Content-Type: application/json` when it has no JSON request body. The logout endpoint must still undergo CSRF validation and applicable authentication/session checks; `RequireJsonContentType` must not incorrectly reject this bodyless request.

5. **Session Identification & Verification:**
   * Browser requests include the cookie automatically when the client configures `axios` or `fetch` with `credentials: 'include'`.
   * `GET /api/auth/me` validates the cookie JWT and returns the user's public profile and verified role (`FR-02`).

6. **Session Termination with Matching Attributes (Idempotent Logout):**
   * `POST /api/auth/logout` clears the authentication cookie by returning an expired cookie (`Max-Age=0`) with exact matching attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, and conditional `Secure` in production). Logout is idempotent and returns `200 OK` even when no active session cookie is present, without creating a new session or exposing private user information. Subsequent requests to protected endpoints return `401 Unauthorized` (`AC-01-5`, `FR-01`).

7. **Sequential Middleware Pipeline Order:**
   Every HTTP request flows through a deterministic, ordered sequence of middleware layers:
   ```mermaid
   flowchart TD
       Req["Incoming HTTP Request"] --> M1["1. CORS Middleware (Origin check & credentials policy)"]
       M1 -->|OPTIONS Preflight| EndOptions["Return CORS Preflight Response\n(204 No Content / 200 OK | Bypasses CSRF & Auth)"]
       M1 -->|GET / POST / PUT / PATCH / DELETE| M2["2. CSRF Origin/Referer Guard\n(Strict Origin/Referer check on POST/PUT/PATCH/DELETE | 403 Forbidden CSRF_ORIGIN_REJECTED)"]
       M2 --> M3{"Endpoint requires\nJSON request body?"}
       M3 -->|Yes| M3A["3. RequireJsonContentType\n(Rejects missing/unsupported Content-Type | 400 Bad Request INVALID_CONTENT_TYPE)"]
       M3A --> M3B["4. express.json()\n(Parses JSON body | 400 Bad Request INVALID_JSON_BODY on malformed syntax)"]
       M3 -->|No (e.g. GET, bodyless POST /api/auth/logout)| M4["5. CookieParser\n(Parses Cookie header into req.cookies.token)"]
       M3B --> M4
       M4 --> M5["6. AuthGuard\n(Verifies JWT cookie signature -> attaches req.user | 401 Unauthorized)"]
       M5 --> M6["7. RoleGuard\n(Checks req.user.role -> rejects ADMIN on financial routes with 403 Forbidden)"]
       M6 --> M7["8. Tenant Scoping\n(Injects userId: req.user.id into primary & target account queries | 404 Not Found)"]
       M7 --> Handler["9. Controller / Service\n(Executes domain business logic)"]
       Handler --> DBTx["10. Database Transaction\n(Atomic execution via prisma.$transaction)"]
       DBTx --> Res["11. Standard JSON Response Envelope\n(200 OK / 201 Created)"]
       M1 -.->|Errors| Err["Centralized Error Handler (Standard Error Envelope)"]
       M2 -.->|Errors| Err
       M3A -.->|Errors| Err
       M3B -.->|Errors| Err
       M5 -.->|Errors| Err
       M6 -.->|Errors| Err
       M7 -.->|Errors| Err
       Handler -.->|Errors| Err
       DBTx -.->|Errors| Err
   ```

---

## 8. Role and Privacy Matrix

| Resource Domain / Operation | `USER` | `ADMIN` | Unauthenticated Request |
|---|:---:|:---:|:---:|
| Authenticate (`/api/auth/login`) | Allowed | Allowed | Allowed |
| Terminate Session (`/api/auth/logout`) | Allowed | Allowed | Allowed (Idempotent `200 OK` Cookie Clear) |
| Get Current User (`/api/auth/me`) | Allowed (Own Profile) | Allowed (Own Profile) | `401 Unauthorized` |
| View Platform User Directory (`/api/admin/users`) | `403 Forbidden` | **Allowed** (`ADMIN` only per §11.5) | `401 Unauthorized` |
| Financial Accounts (`/api/accounts/*`) | Allowed (Own Accounts Only) | **`403 Forbidden`** | `401 Unauthorized` |
| Financial Transactions (`/api/transactions/*`) | Allowed (Own Transactions Only) | **`403 Forbidden`** | `401 Unauthorized` |
| Financial Summaries (`/api/reports/summary`) | Allowed (Own Summary Only) | **`403 Forbidden`** | `401 Unauthorized` |

---

## 9. Configuration and Environment

All runtime configuration is managed through externalized environment variables (`.env`). No secrets are committed to version control:

| Variable | Description | Example Placeholder Value |
|---|---|---|
| `PORT` | Backend HTTP service port | `5000` |
| `CLIENT_URL` | Allowed frontend origin for CORS | `http://localhost:5173` |
| `NODE_ENV` | Runtime environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/whatsss_db?schema=public` |
| `JWT_SECRET` | Secret key for signing session tokens | `replace_with_a_long_random_secret_for_local_development` |
| `JWT_EXPIRES_IN` | Token duration | `1d` |

---

## 10. Deployment Approach & Verification Status

### 10.1 Deployment Architecture
* **Sprint 1 Development:** Runs locally with PostgreSQL 16 hosted via Docker Compose (`docker compose up -d`) and the Express application executed locally via Node.js.
* **Cloud Production / Release Candidate Architecture:** Multi-stage `Dockerfile` (serving the compiled React SPA from Express and connecting to **Cloud SQL for PostgreSQL 16** via Prisma ORM) deployed to **Google Cloud Run** (`asia-southeast1`).

### 10.2 Intended GCP Cloud Run Deployment Configuration
* **CI/CD Workflow:** `.github/workflows/deploy.yml` authenticates to GCP via Workload Identity Federation (WIF), retrieves runtime secrets (`DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`) from Google Secret Manager, builds/pushes the container image to Artifact Registry (`asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss`), and deploys to Cloud Run service `whatsss`.
* **CI Quality Gate:** Both `.github/workflows/ci.yml` (`Main CI`) and `.github/workflows/deploy.yml` (`Test & Build Gate`) are configured to gate deployment prior to Cloud Run rollout. Configuration alone does not constitute deployment verification.

### 10.3 Deployment Verification Evidence (`v0.2.0-sprint2-rc`)

| Evidence Item | Status | Verified Value / Reference |
|---|---|---|
| **Release Commit & Tag (`main`)** | **Verified** | `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` (`v0.2.0-sprint2-rc`, [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67)) |
| **Main CI Gate on Release Commit** | **Verified (`success`)** | [Main CI #315 (`46151836583`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583) (`548/548` backend incl. Live PG16, `104/104` frontend) |
| **GCP Cloud Run Deploy Run** | **Verified (`success`)** | [Deploy demo #13 (`46151836654`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654) |
| **Deployed Cloud Run Revision** | **Verified** | `whatsss-00030-k42` (`100%` traffic; primary `https://whatsss-sipqw4logq-as.a.run.app`, regional `https://whatsss-1086708130644.asia-southeast1.run.app`) |
| **Container Image Digest** | **Verified** | `asia-southeast1-docker.pkg.dev/cpe334-whatsss-pmandels/whatsss/whatsss@sha256:76c621119e92ab98a2eaa557c76176f5ae9f1653326ddd7237b13cbed5eadcea` |
| **Unauthenticated Smoke Tests** | **Verified** | `SMOKE-LIVE-01`..`04` (`200 OK` SPA, `200 OK` `/api/health`, `401` on `/api/accounts` & `/api/auth/me`) |
| **Golden Journey & Live Feature Verification** | **Verified** | `DEMO-LIVE-01`..`03` (16 screenshots in `docs/sprints/sprint-2/evidence/` + [`docs/sprints/sprint-2/deliverable-2-report.pdf`](sprints/sprint-2/deliverable-2-report.pdf)) |
| **Part E Documentation PR (#68) Merge to `main`** | **Pending** | [PR #68](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/68) open on `docs/part-e-release-evidence`, awaiting teammate review & merge |
| **Backup & Disaster Recovery Restore Drill** | **Not Verified** | No Cloud SQL PITR or restore test executed (`§12.2`) |

---

## 11. Sprint 2 & Sprint 3 Schema, Ledger & Architecture Evolution (`v2.0-contract`, `WP-07` / Issue #55)

To support all Sprint 2 (`F-10`..`F-16`, `F-19`) and Sprint 3 (`F-17`, `F-18`) features while preserving 100% backward compatibility with the Sprint 1 Golden Domain Journey (`F-01`..`F-09`) and the Lab 7 `BR-07 v1.1` repayment rules, the relational data model and domain services are extended as follows (implemented in `WP-08` / [Issue #56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56)):

### 11.1 Consolidated Prisma Schema Evolution (`server/prisma/schema.prisma`)

1. **`AccountSubtype` Discriminator Enum & Normalized Case-Insensitive Account Name Uniqueness (`F-10`, `F-13`, `BR-07 v1.1` Prerequisite):**
   ```prisma
   enum AccountSubtype {
     DEFAULT
     CREDIT_CARD
     GENERAL_LOAN
   }
   ```
   * Added to `Account`:
     * `subtype AccountSubtype @default(DEFAULT)`
     * `normalized_name String @db.VarChar(100)` *(populated by `normalizeAccountName(name) = name.trim().replace(/\s+/g, ' ').toLowerCase()` across all layers)*
     * `is_archived Boolean @default(false)`
     * `@@unique([user_id, normalized_name])` *(plus PostgreSQL functional unique expression index `CREATE UNIQUE INDEX accounts_user_id_normalized_name_idx ON accounts (user_id, LOWER(REGEXP_REPLACE(BTRIM(name), '\s+', ' ', 'g')));` in the `WP-08` migration)*
   * **Account Name Normalization & Uniqueness Policy (`F-10`):**
     * Before persisting on `POST /api/accounts` or `PATCH /api/accounts/:id`, the display `name` is normalized by trimming leading/trailing whitespace and collapsing internal whitespace runs (`displayName = rawName.trim().replace(/\s+/g, ' ')`), and `normalized_name = displayName.toLowerCase()` is stored in `accounts.normalized_name`.
     * Both application-level pre-checks and database-level unique constraints (`@@unique([user_id, normalized_name])` / Prisma `P2002` unique constraint violation inside `prisma.$transaction`) map deterministically to **`HTTP 409 Conflict` (`DUPLICATE_ACCOUNT_NAME`)**. Concurrent requests attempting to create `"Checking Bank"`, `"checking bank"`, or `"  Checking   Bank  "` for the same user are serialized by the database unique index so at most **1** account record is created.
   * **Domain Separation & Migration Backfill Rule (`F-07` vs. `F-13`, `backfill_loan_taken_subtypes()`):**
     * Seeded `Visa Credit Card` and user-created credit card accounts have `type = LOAN_TAKEN` and `subtype = CREDIT_CARD`.
     * User-created general borrowing accounts (`F-13`, `FR-15`) have `type = LOAN_TAKEN` and `subtype = GENERAL_LOAN`.
     * The `WP-08` SQL migration function `backfill_loan_taken_subtypes()` deterministically classifies pre-migration `LOAN_TAKEN` accounts across 5 cases:
       1. **Credit Card Purchase History:** Legacy `LOAN_TAKEN` (`subtype = 'DEFAULT'`) with direct `PAYMENT_CHARGE` transactions (`primary_account_id = account.id`) $\rightarrow$ `CREDIT_CARD`.
       2. **General Loan Borrowing History:** Legacy `LOAN_TAKEN` (`subtype = 'DEFAULT'`) with `RECEIVE_MONEY` borrowing allocations from a `CASH` primary account and zero direct `PAYMENT_CHARGE` purchase charges $\rightarrow$ `GENERAL_LOAN`.
       3. **No Transaction History:** Legacy `LOAN_TAKEN` (`subtype = 'DEFAULT'`) with zero transactions $\rightarrow$ `CREDIT_CARD` (the documented default for Sprint 1 `LOAN_TAKEN` accounts).
       4. **Already Explicitly Assigned Subtype:** `LOAN_TAKEN` accounts that already have `subtype = 'CREDIT_CARD'` or `subtype = 'GENERAL_LOAN'` $\rightarrow$ preserved unchanged (never overwritten).
       5. **Mixed Transaction History:** Legacy `LOAN_TAKEN` (`subtype = 'DEFAULT'`) with both direct `PAYMENT_CHARGE` purchase charges and `RECEIVE_MONEY` borrowing allocations $\rightarrow$ deterministically classified as `CREDIT_CARD` so credit-card `BR-07 v1.1` repayment rules remain enforced on any account with direct credit card purchase charges.
     * `POST /api/transactions/repayment` (`F-07`) requires `toAccount.type === 'LOAN_TAKEN' && toAccount.subtype === 'CREDIT_CARD'` (enforcing `BR-07 v1.1` minimum repayment floor `max(500.00, 10%)` and `100.00 THB` partial cash reserve exclusively on credit cards).
     * `POST /api/transactions/loan-borrowing` and `POST /api/transactions/loan-repayment` (`F-13`) require `type === 'LOAN_TAKEN' && subtype === 'GENERAL_LOAN'`.

2. **`Transaction` Favorite & Update Tracking (`F-14`, `F-16`):**
   * Added to `Transaction`:
     * `is_favorite Boolean @default(false)` (`FR-16`)
     * `updated_at DateTime @default(now()) @updatedAt` (`FR-19`)
     * `audit_logs TransactionAuditLog[]` (`FR-21`)

3. **`TransactionAuditLog` Model, Immutability & Retention Policy (`F-16`, `F-18`, `FR-21`):**
   ```prisma
   model TransactionAuditLog {
     id                String      @id @default(uuid())
     // Monotonic database-allocated event order (BIGSERIAL) allocated under Transaction row locks.
     // Required instead of timestamp/UUID ordering because rapid/concurrent corrections can share identical timestamps.
     sequence_number   BigInt      @unique @default(autoincrement())
     transaction_id    String
     transaction       Transaction @relation(fields: [transaction_id], references: [id], onDelete: Restrict)
     user_id           String
     action            String      @default("CORRECTED") @db.VarChar(50)
     previous_snapshot Json
     new_snapshot      Json
     created_at        DateTime    @default(now())

     @@index([transaction_id, created_at(sort: Desc), id(sort: Desc)])
     @@index([transaction_id, sequence_number(sort: Desc)])
     @@index([user_id])
     @@map("transaction_audit_logs")
   }
   ```
   * **Cascade Deletion Prevention (`onDelete: Restrict`):** The foreign key from `transaction_audit_logs(transaction_id)` to `transactions(id)` uses **`onDelete: Restrict`** (never `onDelete: Cascade`). Any attempt to hard-delete a `Transaction` that has audit history is blocked at the database relational constraint level (`P2003` / `409 AUDIT_HISTORY_PROTECTED`) and at the application service layer.
   * **Audit Log Retention, Application API & Database-Level Immutability Policy (`WP-08` Migration & `WP-12` Verification):**
     * `TransactionAuditLog` is strictly **append-only**: records are inserted exclusively inside the atomic `prisma.$transaction` of `PUT /api/transactions/:id` (`F-16`) and are retained permanently for the lifetime of the tenant ledger.
     * **No Application API Update or Delete Surface for Audit History:** The application API exposes **no** update (`PUT`/`PATCH`) or delete (`DELETE`) endpoints on `/api/transactions/:id/audit-history` or `/api/transactions/:id/audit-history/:logId` (returning `405 Method Not Allowed` / `404` on unsupported methods), and exposes no `DELETE /api/transactions/:id` endpoint (`PUT /api/transactions/:id` and `PATCH /api/transactions/:id` remain valid exclusively for `F-16` transaction corrections that append new immutable audit logs). The service layer prohibits calling `transactionAuditLog.update`, `updateMany`, `delete`, or `deleteMany`. `sequence_number` (`BIGINT`) is serialized as a decimal string in API JSON responses to preserve precision beyond `Number.MAX_SAFE_INTEGER`. Snapshot allocation account/category labels are resolved in the UI from the tenant's account list with safe `target_account_id` fallback (storing denormalized historical category names at write time is a separate future enhancement).
     * **Database-Level Trigger Protection Against Direct Update or Delete:** In addition to `onDelete: Restrict`, the `WP-08` SQL migration installs a PostgreSQL `BEFORE UPDATE OR DELETE ON transaction_audit_logs` trigger (`prevent_audit_log_mutation()`) that raises a database exception (`ERRCODE = '55000'`, message `'TransactionAuditLog records are immutable and cannot be updated or deleted'`). Thus, even a direct SQL `UPDATE` or `DELETE` or raw Prisma `transactionAuditLog.update`/`delete` call is rejected directly by PostgreSQL (`TEST-AUDIT-05` in `WP-12`).

### 11.2 System-Wide Concurrency, Row-Locking & Archived Account Guard Policy

1. **Standardized Pessimistic Row-Locking & Separation of Responsibilities (`acquireAccountRowLocks` vs. `lockAccounts`):**
   * **`acquireAccountRowLocks(tx, accountIds, userId)` (Concurrency Serialization):**
     * Deduplicates and sorts `accountIds` in **lexicographical ascending UUID order (`[...new Set(accountIds)].sort()`)** and executes `SELECT id FROM accounts WHERE id IN (...) AND user_id = $userId FOR UPDATE` inside `prisma.$transaction`.
     * **Purpose:** Acquires PostgreSQL row-level write locks in a canonical deterministic order across all concurrent transactions (`F-04` income, `F-05` expense, `F-07` credit card repayment, `F-11` transfer, `F-12` loan given/recovery, `F-13` general borrowing/repayment, `F-14` duplicate, `F-16` correction, and `F-18` account archive), **preventing deadlocks and race conditions** before any account balance, debt, receivable, or `is_archived` check is evaluated.
   * **`lockAccounts(tx, accountIds, userId)` (Opening Balance Lifecycle `F-03`):**
     * Executes `UPDATE accounts SET is_opening_locked = true WHERE id IN (...) AND user_id = $userId AND is_opening_locked = false` inside the same `prisma.$transaction` after domain validations pass.
     * **Purpose:** Permanently locks the initial `opening_balance` (`AC-03-3`) upon the first committed transaction referencing the account. It does **not** replace `acquireAccountRowLocks`.

2. **System-Level Archived Account Guard (`is_archived` Enforcement Across All Workflows):**
   * Inside the same `prisma.$transaction` and **after** `acquireAccountRowLocks` has locked all referenced accounts (primary account and every allocation target account), every transaction creation, duplication, or correction workflow (`F-04`, `F-05`, `F-07`, `F-11`, `F-12`, `F-13`, `F-14`, `F-16`) inspects `account.is_archived`:
     * For new or duplicated transactions (`F-04`, `F-05`, `F-07`, `F-11`, `F-12`, `F-13`, `F-14`): if the `primary_account` or **any** `AllocationLine.target_account` has `is_archived === true`, the transaction aborts immediately with **`HTTP 422 Unprocessable Entity` (`ACCOUNT_ARCHIVED`)** and performs zero database writes.
     * For transaction corrections (`F-16`): if the correction introduces or references an archived `primary_account` or `target_account`, it is rejected with **`HTTP 422 Unprocessable Entity` (`ACCOUNT_ARCHIVED`)** and rolled back.
     * Because both `PATCH /api/accounts/:id/archive` (`F-18`) and all transaction creation endpoints acquire `SELECT ... FOR UPDATE` on the account row via `acquireAccountRowLocks`, a concurrent archive request and a concurrent transaction creation request on the same account are strictly serialized in PostgreSQL.

3. **Fail-Closed Active User Verification (`F-19`, `is_active` Enforcement):**
   * `authGuard.ts` verifies the signed JWT cookie **and** performs an authoritative database lookup (`prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, username: true, role: true, is_active: true } })`) on every protected request:
     * If the user record does not exist $\rightarrow$ `401 UNAUTHORIZED`.
     * If `user.is_active === false` $\rightarrow$ **`403 Forbidden` (`ACCOUNT_DISABLED`)** (immediately revoking access even if the user holds a previously issued, unexpired JWT cookie).
     * **Fail-Closed Database Error Policy:** If the database lookup throws or fails to verify `is_active`, `authGuard` **fails closed** (denies access with `503 SERVICE_UNAVAILABLE` / `AUTH_STATE_UNVERIFIABLE` and never falls back to trusting the stateless JWT payload).

### 11.3 Extended Ledger Accounting Matrix (`F-11`, `F-12`, `F-13`)

| Workflow & Feature | Endpoint | `Transaction.form` | `primary_account` | `AllocationLine.target_account` | Balance & Summary Invariant (`BR-02`, `BR-08`) |
|---|---|---|---|---|---|
| **Internal Cash Transfer (`F-11`, `FR-13`)** | `POST /api/transactions/transfer` | `PAYMENT_CHARGE` | Source `CASH` ($-\text{amount}$) | Destination `CASH` ($+\text{amount}$) | Source `CASH` decreases; Destination `CASH` increases; **`total_income` & `total_expense` unchanged (`BR-02`)**. |
| **Loan Given Disbursement (`F-12`, `FR-14`)** | `POST /api/transactions/loan-given` | `PAYMENT_CHARGE` | Source `CASH` ($-\text{amount}$) | `LOAN_GIVEN` ($+\text{amount}$ receivable) | `CASH` decreases; `LOAN_GIVEN` receivable increases; **`total_expense` unchanged (`BR-08`)**. |
| **Loan Given Recovery (`F-12`, `FR-14`)** | `POST /api/transactions/loan-recovery` | `RECEIVE_MONEY` | Destination `CASH` ($+\text{amount}$) | `LOAN_GIVEN` ($-\text{amount}$ receivable) | `CASH` increases; `LOAN_GIVEN` receivable decreases; **`total_income` unchanged (`BR-08`)**. |
| **General Loan Borrowing (`F-13`, `FR-15`)** | `POST /api/transactions/loan-borrowing` | `RECEIVE_MONEY` | Destination `CASH` ($+\text{amount}$) | `LOAN_TAKEN` (`GENERAL_LOAN`, $+\text{amount}$ debt) | `CASH` increases; General `LOAN_TAKEN` debt increases; **`total_income` unchanged (`BR-08`)**. |
| **General Loan Repayment (`F-13`, `FR-15`)** | `POST /api/transactions/loan-repayment` | `PAYMENT_CHARGE` | Source `CASH` ($-\text{amount}$) | `LOAN_TAKEN` (`GENERAL_LOAN`, $-\text{amount}$ debt) | `CASH` decreases; General `LOAN_TAKEN` debt decreases; **`total_expense` unchanged (`BR-08`)**. |

### 11.4 Extended Deterministic Balance Equations (`server/src/services/report.service.ts` & `server/src/controllers/account.controller.ts`)

1. **Cash Account Balance (`type === 'CASH'`):**
   $$\text{Cash Balance}(A) = A.\text{opening\_balance} + \sum_{\substack{T.\text{primary} = A \\ T.\text{form} = \text{RECEIVE\_MONEY}}} T.\text{total\_amount} + \sum_{\substack{L.\text{target} = A \\ T.\text{primary.type} = \text{CASH} \\ T.\text{form} = \text{PAYMENT\_CHARGE}}} L.\text{amount} - \sum_{\substack{T.\text{primary} = A \\ T.\text{form} = \text{PAYMENT\_CHARGE}}} T.\text{total\_amount}$$
2. **Loan Taken Liability Balance (`type === 'LOAN_TAKEN'`, both `CREDIT_CARD` and `GENERAL_LOAN`):**
   $$\text{Debt Balance}(L_T) = L_T.\text{opening\_balance} + \sum_{\substack{T.\text{primary} = L_T \\ T.\text{form} = \text{PAYMENT\_CHARGE}}} T.\text{total\_amount} + \sum_{\substack{L.\text{target} = L_T \\ T.\text{primary.type} = \text{CASH} \\ T.\text{form} = \text{RECEIVE\_MONEY}}} L.\text{amount} - \sum_{\substack{L.\text{target} = L_T \\ T.\text{primary.type} = \text{CASH} \\ T.\text{form} = \text{PAYMENT\_CHARGE}}} L.\text{amount}$$
3. **Loan Given Receivable Balance (`type === 'LOAN_GIVEN'`):**
   $$\text{Receivable Balance}(L_G) = L_G.\text{opening\_balance} + \sum_{\substack{L.\text{target} = L_G \\ T.\text{primary.type} = \text{CASH} \\ T.\text{form} = \text{PAYMENT\_CHARGE}}} L.\text{amount} - \sum_{\substack{L.\text{target} = L_G \\ T.\text{primary.type} = \text{CASH} \\ T.\text{form} = \text{RECEIVE\_MONEY}}} L.\text{amount}$$
4. **Total Income & Total Expense Summaries (`BR-02`, `BR-08`):**
   * `total_income`: sum of `AllocationLine.amount` where `target_account.type === 'INCOME'`.
   * `total_expense`: sum of `AllocationLine.amount` where `target_account.type === 'EXPENSE'`.

### 11.5 Updated Role & Privacy Matrix (`F-19`, `BR-10`)

| Endpoint Group | `USER` (`is_active = true`) | `ADMIN` (`is_active = true`) | Disabled User (`is_active = false`) | Unauthenticated |
|---|:---:|:---:|:---:|:---:|
| `GET /api/admin/users` (`FR-03`) | `403 ADMIN_ONLY_ENDPOINT` | **Allowed** (Non-financial user metadata only) | `403 ACCOUNT_DISABLED` | `401 UNAUTHORIZED` |
| `PATCH /api/admin/users/:id/status` (`FR-04`) | `403 ADMIN_ONLY_ENDPOINT` | **Allowed** (`422 CANNOT_DEACTIVATE_SELF` on self) | `403 ACCOUNT_DISABLED` | `401 UNAUTHORIZED` |

### 11.6 Sprint 3 Analytics & Governance Architecture (`F-17` & `F-18`, `WP-12`)

* **`F-17` Category Spending Reports (`GET /api/reports/categories`):**
  * **Query & Response Contract:** Accepts `startDate` and `endDate` (`YYYY-MM-DD`, validated with `400 INVALID_DATE_RANGE` when malformed or `startDate > endDate`) and returns `period.start_date` and `period.end_date` metadata alongside `total_expense` and `categories`.
  * **Aggregation & Exclusions:** Aggregates `AllocationLine.amount` where `target_account.type === 'EXPENSE'`, strictly excluding opening balances (`BR-02`), internal cash transfers (`BR-02`), credit card repayments (`BR-08`), and loan principal disbursements/recoveries/repayments (`BR-08`).
  * **Precision & Ordering:** Computes category percentage shares using `Prisma.Decimal` `ROUND_HALF_UP` to 2 decimal places, ordered deterministically by `total_amount DESC, category_name ASC`.
* **`F-18` Audited Correction History & Account Archival (`GET /api/transactions/:id/audit-history`, `PATCH /api/accounts/:id/archive`):**
  * **Audit History Ordering & Serialization:** Queries `transaction_audit_logs` ordered reverse-chronologically (newest first) by `sequence_number DESC` (with `created_at DESC, id DESC` fallback) and serializes `BIGINT` `sequence_number` as a decimal string to preserve precision above `Number.MAX_SAFE_INTEGER`.
  * **Multi-Layer Immutability:** Enforced via absence of mutation endpoints (`405`/`404`), relational foreign key `onDelete: Restrict` (`409 AUDIT_HISTORY_PROTECTED`), and the PostgreSQL `BEFORE UPDATE OR DELETE` trigger (`prevent_audit_log_mutation()`).
  * **Account Archival Restrictions & Guards:** `PATCH /api/accounts/:id/archive` enforces zero computed balance/debt/receivable (`422 ACCOUNT_BALANCE_NON_ZERO`) on `CASH`, `LOAN_TAKEN`, and `LOAN_GIVEN` accounts while allowing `INCOME`/`EXPENSE` category archival and unarchival across all 5 types; all transaction creation, duplication, and correction workflows reject any archived `primary_account` or `AllocationLine.target_account` under `acquireAccountRowLocks` with `422 ACCOUNT_ARCHIVED`.

---

## 12. Verified Capabilities, Known Limitations & Planned Enhancements

### 12.1 Verified Capabilities
* **Atomic Balance & Audit Trail (`NFR-DATA-01`):** Account balances and summaries are computed dynamically from persisted `Transaction` and `AllocationLine` rows inside `prisma.$transaction` with pessimistic row locking (`acquireAccountRowLocks`). `TransactionAuditLog` enforces append-only immutability via API boundaries, `onDelete: Restrict`, and the PostgreSQL `prevent_audit_log_mutation()` trigger, ordered reverse-chronologically by `sequence_number DESC` (with `created_at DESC, id DESC` fallback).
* **Deployed Cloud Run Candidate (`§10.3`):** Verified live on revision `whatsss-00030-k42` (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`, `v0.2.0-sprint2-rc`).

### 12.2 Known Limitations
* **Dynamic Audit Snapshot Label Resolution:** `TransactionAuditLog.previous_snapshot` and `new_snapshot` store `target_account_id` and `amount`, and the UI resolves account/category display names from current `Account` metadata. Consequently, audit snapshots **do not guarantee immutable historical display labels** if an account or category is later renamed via `F-10`.
* **Backup, Disaster Recovery, Monitoring & Alerting Not Yet Verified:** While Cloud SQL for PostgreSQL 16 and Cloud Run provide managed infrastructure, **automated backup restoration, disaster recovery (PITR) drills, automated audit retention pruning/archival jobs, and production monitoring/alerting policies have not been configured or verified with operational tests**; readiness claims must not be made until verified and evidenced.

### 12.3 Planned Enhancements
* **Denormalized Snapshot Labels:** Persist `target_account_name` inside `TransactionAuditLog` snapshots at write time so historical audit entries preserve exact point-in-time display labels.
* **Backup & Restore Verification (`NFR-DATA-02` Proposal):** Execute and document a Cloud SQL restore verification drill prior to any production SLA commitment.

---

## 13. API Versioning & Backward Compatibility Policy

* **Current Baseline:** All REST endpoints are currently served under the unversioned `/api/*` prefix (`v0.2.0-sprint2-rc`), matching the single-client React SPA bundled in the same container.
* **Backward Compatibility Rule:** Within the `/api/*` baseline, changes must be **additive only** (optional query parameters, new response fields, or new endpoints). Existing query parameters (e.g., `startDate` and `endDate` on `GET /api/reports/categories`), required request fields, error codes, and response structures must not be renamed or removed without a coordinated versioned migration.
* **Future Breaking Changes:** Any breaking contract change requires introducing an explicit versioned prefix (e.g., `/api/v2/*`) alongside a documented deprecation window for `/api/*`.
| `/api/accounts/*`, `/api/transactions/*`, `/api/reports/*` | **Allowed** (Own tenant records only, `BR-01`) | **`403 ADMIN_FINANCIAL_ACCESS_FORBIDDEN` (`BR-10`)** | `403 ACCOUNT_DISABLED` | `401 UNAUTHORIZED` |
