# Sprint 1 Feature Engineering Contracts (Part E)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part E: Sprint 1 Feature Engineering Contracts)  
> **Status:** Authoritative Baseline (Frozen)  

---

## 1. Overview & Specification Standards

This document establishes the binding engineering contracts for all nine Sprint 1 features (`F-01` through `F-09`). Each contract specifies:
* Linked Functional Requirements, Business Rules, and NFRs
* Main domain flow and preconditions
* Stable Acceptance Criteria (`AC-XX`)
* Endpoint request/response definitions, HTTP status codes, and validation rules
* Database effects and dependencies

---

## 2. Feature Engineering Contracts

### Feature F-01: Authentication & Session Lifecycle
* **Feature ID:** `F-01`
* **Linked Requirements:** `FR-01`, `FR-02`, `NFR-SEC-01`, `BR-09`
* **Preconditions:** User credentials exist in the database with hashed password.
* **Main Workflow:**
  1. Client sends username and plaintext password to `POST /api/auth/login`.
  2. Server verifies password against bcrypt hash (`NFR-SEC-01`).
  3. Server generates signed JWT containing `userId` and `role`, returning it in an HTTP-only secure cookie and response body.
  4. Authenticated client queries `GET /api/auth/me` to obtain user profile and verified role (`FR-02`).
  5. Client sends `POST /api/auth/logout` to terminate the session; server clears the cookie.
* **Acceptance Criteria:**
  * `AC-01-1`: Valid credentials return `200 OK` with user profile and session token.
  * `AC-01-2`: Invalid credentials return `401 Unauthorized` with error code `INVALID_CREDENTIALS`.
  * `AC-01-3`: Calling `GET /api/auth/me` with valid session returns `200 OK` and current user identity and role.
  * `AC-01-4`: Calling `POST /api/auth/logout` clears session and subsequent protected requests return `401 Unauthorized`.
* **API Specifications:**
  * `POST /api/auth/login`: Body: `{ "username": "...", "password": "..." }` $\rightarrow$ `200 OK` or `401 Unauthorized`
  * `GET /api/auth/me`: Headers: Cookie/Bearer $\rightarrow$ `200 OK` `{ "user": { "id": "...", "username": "...", "role": "..." } }`
  * `POST /api/auth/logout`: Headers: Cookie/Bearer $\rightarrow$ `200 OK` `{ "message": "Logged out successfully" }`

---

### Feature F-02: Server-Side Authorization & Privacy Guards
* **Feature ID:** `F-02`
* **Linked Requirements:** `FR-03`, `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`
* **Preconditions:** Server receives request on a protected endpoint.
* **Main Workflow:**
  1. `AuthGuard` checks for valid session token; returns `401 Unauthorized` if absent or expired (`BR-09`).
  2. If an `ADMIN` requests any financial endpoint (`/api/accounts/*`, `/api/transactions/*`, `/api/reports/*`), server intercepts and rejects with `403 Forbidden` (`BR-10`).
  3. If an `ADMIN` requests `/api/admin/users`, server grants access and returns platform user directory (`FR-03`).
  4. If a `USER` requests another user's financial record by ID, database query scopes to `userId: req.user.id` and returns `404 Not Found` (`BR-01`).
* **Acceptance Criteria:**
  * `AC-02-1`: Unauthenticated requests to protected endpoints return `401 Unauthorized`.
  * `AC-02-2`: ADMIN requests to financial endpoints return `403 Forbidden` with zero sensitive payload leakage.
  * `AC-02-3`: ADMIN requests to `/api/admin/users` return `200 OK` with the list of registered users.
  * `AC-02-4`: USER requests attempting to read another user's account/transaction return `404 Not Found`.

---

### Feature F-03: Account Opening Balance Lifecycle
* **Feature ID:** `F-03`
* **Linked Requirements:** `FR-05`, `BR-02`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` owns an unlocked eligible account (Bank Account).
* **Main Workflow:**
  1. User submits opening balance amount via `PATCH /api/accounts/:id/opening-balance`.
  2. Server verifies the account belongs to user and `is_opening_locked` is `false`.
  3. Server updates `opening_balance` and sets `is_opening_locked = true` once a transaction is committed.
  4. Balance calculation engine incorporates opening balance into account balance without counting it as income or expense (`BR-02`).
* **Acceptance Criteria:**
  * `AC-03-1`: Submitting valid opening balance (e.g., `10000.00 THB`) on unlocked account returns `200 OK` and updates balance.
  * `AC-03-2`: Submitting negative amount or non-numeric balance returns `400 Bad Request`.
  * `AC-03-3`: Opening balance updates on an account with committed transactions return `422 Unprocessable Entity`.
* **API Specification:**
  * `PATCH /api/accounts/:id/opening-balance`: Body: `{ "opening_balance": 10000.00 }` $\rightarrow$ `200 OK` or `422 Unprocessable Entity`

---

### Feature F-04: Income Transaction Processing
* **Feature ID:** `F-04`
* **Linked Requirements:** `FR-06`, `BR-03`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` has an active Cash account (Bank) and an Income account (Salary).
* **Main Workflow:**
  1. User submits income transaction with destination Cash account ID, total amount, transaction date, and allocation to Income account.
  2. Server verifies account ownership and validates positive amount.
  3. In a database transaction, server creates `Transaction` and linked `AllocationLine`.
  4. System updates receiving bank balance and marks opening balance of bank account as locked.
* **Acceptance Criteria:**
  * `AC-04-1`: Submitting valid salary income (e.g., `20000.00 THB`) returns `201 Created` and increases bank balance by `20000.00`.
  * `AC-04-2`: Submitting income transaction with invalid/missing date or non-positive amount returns `400 Bad Request`.
* **API Specification:**
  * `POST /api/transactions/income`: Body: `{ "primary_account_id": "acc-bank", "total_amount": 20000.00, "transaction_date": "2026-11-06", "income_account_id": "acc-salary", "description": "Monthly Salary" }` $\rightarrow$ `201 Created`

---

### Feature F-05: Credit Card Purchase Processing
* **Feature ID:** `F-05`
* **Linked Requirements:** `FR-07`, `BR-04`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` has an active `Loan Taken` account (Credit Card).
* **Main Workflow:**
  1. User submits purchase transaction charged to credit card account with total amount, transaction date, and expense allocations.
  2. Server verifies total amount is positive and creates the transaction.
  3. System increases credit card debt balance by the total amount (`BR-04`).
* **Acceptance Criteria:**
  * `AC-05-1`: Submitting valid credit card purchase returns `201 Created` and increases credit card debt balance.
  * `AC-05-2`: Omitting credit card primary account ID returns `400 Bad Request`.

---

### Feature F-06: Multiple Allocations Engine
* **Feature ID:** `F-06`
* **Linked Requirements:** `FR-08`, `BR-05`, `BR-06`
* **Preconditions:** Transaction payload includes one or more allocation lines.
* **Main Workflow:**
  1. User submits credit purchase with multiple allocation lines (e.g., Dining: `1000.00`, Grocery: `2000.00`).
  2. Server computes $\sum \text{allocations.amount}$.
  3. If sum equals `total_amount` (`3000.00`), transaction succeeds (`BR-05`, `BR-06`).
  4. If sum does not equal `total_amount`, server rolls back and rejects with `422 Unprocessable Entity` (`BR-06`).
* **Acceptance Criteria:**
  * `AC-06-1`: Multi-line allocation where sum equals total amount (e.g., `1000 + 2000 = 3000`) returns `201 Created` and creates both allocation lines.
  * `AC-06-2`: Multi-line allocation where sum does not equal total amount (e.g., `1000 + 1500 != 3000`) returns `422 Unprocessable Entity` with error code `ALLOCATION_SUM_MISMATCH`.
* **API Specification:**
  * `POST /api/transactions/expense`: Body:
    ```json
    {
      "primary_account_id": "acc-credit-card",
      "total_amount": 3000.00,
      "transaction_date": "2026-11-06",
      "description": "Weekly shopping",
      "allocations": [
        { "target_account_id": "acc-dining", "amount": 1000.00, "notes": "Dinner" },
        { "target_account_id": "acc-grocery", "amount": 2000.00, "notes": "Supermarket" }
      ]
    }
    ```
    $\rightarrow$ `201 Created` or `422 Unprocessable Entity`

---

### Feature F-07: Credit Card Repayment Engine
* **Feature ID:** `F-07`
* **Linked Requirements:** `FR-09`, `BR-07`, `BR-08`
* **Preconditions:** Authenticated `USER` has Cash account (Bank) with sufficient funds and Credit Card account with debt.
* **Main Workflow:**
  1. User submits credit card repayment specifying funding bank account, target credit card account, repayment amount, and date.
  2. Server validates positive amount and verifies user owns both accounts.
  3. Server records transaction reducing bank balance and reducing credit card debt by an equal amount (`BR-07`).
  4. Server ensures repayment is classified as debt settlement and excluded from expense summary (`BR-08`).
* **Acceptance Criteria:**
  * `AC-07-1`: Submitting valid repayment (e.g., `3000.00 THB`) returns `201 Created`, decreases bank balance by `3000.00`, and decreases credit debt by `3000.00`.
  * `AC-07-2`: Verified that financial expense summary does not increase after repayment (`BR-08`).
* **API Specification:**
  * `POST /api/transactions/repayment`: Body: `{ "from_account_id": "acc-bank", "to_account_id": "acc-credit-card", "amount": 3000.00, "transaction_date": "2026-11-06" }` $\rightarrow$ `201 Created`

---

### Feature F-08: Balance & Financial Summary Engine
* **Feature ID:** `F-08`
* **Linked Requirements:** `FR-10`, `BR-02`, `BR-08`
* **Preconditions:** Authenticated `USER` queries summary endpoint.
* **Main Workflow:**
  1. Client sends `GET /api/reports/summary`.
  2. Server computes:
     * Cash Balance: $\text{Bank Opening} + \text{Salary} - \text{Repayment} = 10000 + 20000 - 3000 = 27000$
     * Debt Balance: $\text{Credit Opening} + \text{Purchases} - \text{Repayment} = 0 + 3000 - 3000 = 0$
     * Total Income: $\text{Salary} = 20000$ (Excludes Opening Balance per `BR-02`)
     * Total Expense: $\text{Dining} + \text{Grocery} = 1000 + 2000 = 3000$ (Excludes Repayment per `BR-08`)
  3. Server returns computed figures with `200 OK`.
* **Acceptance Criteria:**
  * `AC-08-1`: Calling summary endpoint returns exact deterministic figures matching the Golden Journey state.
  * `AC-08-2`: Opening balance is verified omitted from income summary; repayment is verified omitted from expense summary.

---

### Feature F-09: Transaction History Persistence
* **Feature ID:** `F-09`
* **Linked Requirements:** `FR-11`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` has recorded transactions.
* **Main Workflow:**
  1. Client sends `GET /api/transactions`.
  2. Server queries transactions belonging to `req.user.id` ordered by `transaction_date DESC`.
  3. Server returns list of transactions including nested allocation lines.
* **Acceptance Criteria:**
  * `AC-09-1`: Calling endpoint returns `200 OK` with all recorded transactions and allocation lines.
  * `AC-09-2`: Data persists and is returned identically across database reconnects / server restarts (`NFR-DATA-01`).
