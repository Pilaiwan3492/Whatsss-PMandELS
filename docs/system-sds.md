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

### Data Dictionary & Constraints
1. **User Table:** Holds authentication credentials and system role. Plaintext passwords are strictly forbidden (`NFR-SEC-01`).
2. **Account Table:** Scoped to `user_id`. `type` is an enum of the five Theme 7 types. `opening_balance` defaults to `0.00`. `is_opening_locked` becomes `true` atomically when the first referencing transaction is committed (`BR-02`).
3. **Transaction Table:** Represents the financial event header. `total_amount` must be positive (> 0.00). Includes `transaction_date` and references the primary account.
4. **AllocationLine Table:** Represents individual split lines. Foreign key points to `transaction_id` (CASCADE delete) and `target_account_id`.

---

## 5. Account and Transaction Relationships

```mermaid
flowchart LR
    subgraph Form1 ["Make Payment / Record Charge"]
        SourceAcc["Primary Account\n(Cash or Loan Taken)"] -- "Deducts / Charges Total" --> Txn1["Transaction"]
        Txn1 -- "Allocates" --> Alloc1["Allocation 1 (Expense: Dining)"]
        Txn1 -- "Allocates" --> Alloc2["Allocation 2 (Expense: Grocery)"]
        Txn1 -- "Allocates" --> Alloc3["Allocation 3 (Loan Repayment)"]
    end

    subgraph Form2 ["Receive Money"]
        Txn2["Transaction"] -- "Deposits Total" --> DestAcc["Primary Account\n(Cash / Bank)"]
        Alloc4["Allocation 1 (Income: Salary)"] -- "Funds" --> Txn2
        Alloc5["Allocation 2 (Borrowing / Transfer)"] -- "Funds" --> Txn2
    end
```

### Balance Invariants:
* **Cash Balance:** $\text{Opening Balance} + \sum \text{Cash Inflows} - \sum \text{Cash Outflows}$
* **Loan Taken Debt:** $\text{Opening Balance} + \sum \text{Charges} - \sum \text{Repayments}$
* **Income Summary:** $\sum \text{Allocations to Income accounts}$ (Excludes transfers and debt operations)
* **Expense Summary:** $\sum \text{Allocations to Expense accounts}$ (Excludes transfers and debt repayments per `BR-08`)

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
* `400 Bad Request`: Malformed JSON or schema syntax errors.
* `401 Unauthorized`: Missing, invalid, or expired authentication credentials (`BR-09`).
* `403 Forbidden`: Authenticated user lacks permission (e.g., ADMIN attempting to access financial records per `BR-10`).
* `404 Not Found`: Resource does not exist, or cross-tenant access attempt (resource existence concealment per `BR-01`).
* `422 Unprocessable Entity`: Semantic domain or business rule violation (e.g., allocation sum does not equal total amount per `BR-06`).

---

## 7. Authentication and Authorization (Unified HttpOnly Cookie Approach)

To ensure robust security and avoid token handling inconsistencies, the application standardizes exclusively on **HttpOnly Cookies**:

1. **Token Transport:**
   * Upon successful login (`POST /api/auth/login`), the server issues a signed JWT containing `userId` and `role`.
   * The token is set in an `HttpOnly`, `SameSite=Lax`, `Path=/` secure cookie named `token`.
   * The JWT is **never returned in the JSON response body** and is **never stored in `localStorage` or `sessionStorage`** on the client.
2. **Session Identification:**
   * Browser requests include the cookie automatically with credentials.
   * `GET /api/auth/me` validates the cookie and returns the user's public profile and role.
3. **Session Termination:**
   * `POST /api/auth/logout` clears the authentication cookie (`Max-Age=0`). Subsequent requests to protected endpoints return `401 Unauthorized`.
4. **Backend Authorization Guards:**
   * **`AuthGuard`:** Intercepts incoming requests, verifies cookie JWT, and attaches `req.user`.
   * **`RoleGuard`:** Verifies whether `req.user.role` is authorized (rejects ADMIN access to financial routes with `403 Forbidden`).
   * **`Tenant Filter`:** Financial domain queries unconditionally enforce `userId: req.user.id` (returns `404 Not Found` on mismatch).

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
| `NODE_ENV` | Runtime environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/whatsss_db?schema=public` |
| `JWT_SECRET` | Secret key for signing session tokens | `replace_with_a_long_random_secret_for_local_development` |
| `JWT_EXPIRES_IN` | Token duration | `1d` |

---

## 10. Deployment Approach

* **Sprint 1 Development:** Runs locally with PostgreSQL 16 hosted via Docker Compose (`docker compose up -d`) and the Express application executed locally via Node.js.
* **Lab 5 Preparation:** The architecture is stateless, container-ready, and requires only external environment configuration for future GCP Cloud Run and Cloud SQL deployment.
