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
        State["Client State & Auth Context"]
        UI --> State
    end

    subgraph ServerLayer ["Application / API Layer (Node.js + Express)"]
        Router["Express Router & Dispatcher"]
        AuthM["AuthGuard Middleware (JWT / Session)"]
        RoleM["RoleGuard Middleware (USER vs ADMIN)"]
        
        subgraph DomainServices ["Domain Service Layer"]
            AuthSvc["Auth Service"]
            AccSvc["Account & Balance Service"]
            TxnSvc["Transaction & Allocation Engine"]
            AdminSvc["Admin Platform Service"]
        end
        
        Router --> AuthM --> RoleM
        RoleM --> AuthSvc
        RoleM --> AccSvc
        RoleM --> TxnSvc
        RoleM --> AdminSvc
    end

    subgraph DataLayer ["Persistence Layer (PostgreSQL 16)"]
        Prisma["Prisma ORM Client"]
        DB[(PostgreSQL Database)]
        
        DomainServices --> Prisma
        Prisma --> DB
    end

    State -- "HTTP/JSON Requests (REST)" --> Router
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
2. **Account Table:** Scoped to `user_id`. `type` is an enum of the five Theme 7 types. `opening_balance` defaults to `0.00`. `is_opening_locked` becomes `true` once a committed transaction references the account (`BR-02`).
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

## 7. Authentication and Authorization

### 7.1 Authentication Mechanism
* Users authenticate via username/email and password (`POST /api/auth/login`).
* Upon credential verification, the server issues a signed JSON Web Token (JWT) encapsulating `userId` and `role`.
* Token transport: Stored in an HTTP-only secure cookie or Authorization Bearer header.
* Session termination (`POST /api/auth/logout`) clears the authentication cookie and context.

### 7.2 Backend Authorization Guards
1. **`AuthGuard`:** Intercepts incoming requests, validates token signature and expiry, and attaches the authenticated user context (`req.user`) to the request object.
2. **`RoleGuard`:** Verifies whether `req.user.role` is authorized to access the invoked route.
3. **`TenantGuard / Tenancy Filter`:** In all financial domain queries, the database query filter unconditionally appends `userId: req.user.id`.

---

## 8. Role and Privacy Matrix

| Resource Domain / Operation | `USER` | `ADMIN` | Unauthenticated Request |
|---|:---:|:---:|:---:|
| Authenticate (`/api/auth/login`) | Allowed | Allowed | Allowed |
| Terminate Session (`/api/auth/logout`) | Allowed | Allowed | `401 Unauthorized` |
| Get Current User (`/api/auth/me`) | Allowed (Own Profile) | Allowed (Own Profile) | `401 Unauthorized` |
| View Platform User Directory (`/api/admin/users`) | `403 Forbidden` | Allowed | `401 Unauthorized` |
| Financial Accounts (`/api/accounts/*`) | Allowed (Own Accounts Only) | **`403 Forbidden`** | `401 Unauthorized` |
| Financial Transactions (`/api/transactions/*`) | Allowed (Own Transactions Only) | **`403 Forbidden`** | `401 Unauthorized` |
| Financial Summaries (`/api/reports/summary`) | Allowed (Own Summary Only) | **`403 Forbidden`** | `401 Unauthorized` |

---

## 9. Configuration and Environment

All runtime configuration is managed through externalized environment variables (`.env`). No secrets are committed to version control:

| Variable | Description | Default Local Value |
|---|---|---|
| `PORT` | Backend HTTP service port | `5000` |
| `NODE_ENV` | Runtime environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/whatsss_db?schema=public` |
| `JWT_SECRET` | Secret key for signing session tokens | `supersecret_local_dev_key_whatsss_2026` |
| `JWT_EXPIRES_IN` | Token duration | `1d` |

---

## 10. Deployment Approach

* **Sprint 1 Development:** Runs locally with PostgreSQL 16 hosted via Docker Compose (`docker compose up -d`) and the Express application executed locally via Node.js.
* **Lab 5 Preparation:** The architecture is stateless, container-ready, and requires only external environment configuration for future GCP Cloud Run and Cloud SQL deployment.
