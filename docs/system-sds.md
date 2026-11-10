# System-Level Software Design Specification (SDS)
## Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part C: System-Level SDS)  
> **Status:** Authoritative Baseline (Frozen)  

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

6. **Session Termination with Matching Attributes:**
   * `POST /api/auth/logout` clears the authentication cookie by returning an expired cookie (`Max-Age=0`) with exact matching attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, and conditional `Secure` in production). Subsequent requests to protected endpoints return `401 Unauthorized` (`FR-01`).

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
| Terminate Session (`/api/auth/logout`) | Allowed | Allowed | `401 Unauthorized` |
| Get Current User (`/api/auth/me`) | Allowed (Own Profile) | Allowed (Own Profile) | `401 Unauthorized` |
| View Platform User Directory (`/api/admin/users`) | `403 Forbidden` | Planned (Sprint 2) | `401 Unauthorized` |
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

## 10. Deployment Approach

* **Sprint 1 Development:** Runs locally with PostgreSQL 16 hosted via Docker Compose (`docker compose up -d`) and the Express application executed locally via Node.js.
* **Lab 5 Preparation:** The architecture is stateless, container-ready, and requires only external environment configuration for future GCP Cloud Run and Cloud SQL deployment.
