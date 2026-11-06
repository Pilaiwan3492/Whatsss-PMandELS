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
* **Preconditions:** User credentials exist in the database with salted password hash.
* **Main Workflow:**
  1. Client sends username and plaintext password to `POST /api/auth/login`.
  2. Server verifies password against bcrypt hash (`NFR-SEC-01`).
  3. Server sets signed JWT in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `token`. In production (`NODE_ENV === 'production'`), the `Secure` flag is enabled; in local HTTP development, `Secure` is omitted so the cookie persists over local HTTP. No token is returned in the response body.
  4. Authenticated client queries `GET /api/auth/me` with cookie credentials to obtain user profile and verified role (`FR-02`).
  5. Client sends `POST /api/auth/logout` to terminate the session; server clears the cookie with matching attributes (`HttpOnly`, `SameSite=Lax`, `Path=/`, and conditional `Secure` in production) and `Max-Age=0`.
* **Acceptance Criteria:**
  * `AC-01-1`: Valid credentials return `200 OK` with user profile and set HttpOnly session cookie (`TEST-AUTH-01`).
  * `AC-01-2`: Invalid credentials return `401 Unauthorized` with error code `INVALID_CREDENTIALS` (`TEST-AUTH-02`).
  * `AC-01-3`: Calling `GET /api/auth/me` with valid session cookie returns `200 OK` and current user identity and role (`TEST-AUTH-03`).
  * `AC-01-4`: Passwords stored in database are cryptographically hashed using salted one-way hashing (`TEST-AUTH-04`, `NFR-SEC-01`).
  * `AC-01-5`: Calling `POST /api/auth/logout` clears session cookie with matching attributes; subsequent protected calls return `401 Unauthorized` (`TEST-AUTH-05`, `FR-01`).
* **UI Behavior:**
  * Login view displays username and password inputs with client-side non-empty validation. Submit button disables during submission and shows a loading state. On HTTP 200, user state updates in React Auth Context and navigates to the financial dashboard (`/dashboard`). On HTTP 401, a clear error banner displays "Invalid username or password".
  * Navigation bar contains user identity pill (`USER` / `ADMIN`) and a prominent "Logout" button. Clicking Logout triggers `POST /api/auth/logout`, clears client auth state, and redirects to `/login`.
* **API Specifications:**
  * `POST /api/auth/login`: Body: `{ "username": "...", "password": "..." }` $\rightarrow$ `200 OK` `{ "success": true, "data": { "user": { "id": "...", "username": "...", "role": "..." } } }` (Sets Header: `Set-Cookie: token=...; HttpOnly; SameSite=Lax; Path=/` with conditional `Secure` in production) or `401 Unauthorized`
  * `GET /api/auth/me`: Cookie: `token=...` $\rightarrow$ `200 OK` `{ "success": true, "data": { "user": { "id": "...", "username": "...", "role": "..." } } }`
  * `POST /api/auth/logout`: Cookie: `token=...` $\rightarrow$ `200 OK` `{ "success": true, "data": { "message": "Logged out successfully" } }` (Sets Header: `Set-Cookie: token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` with conditional `Secure` in production)

---

### Feature F-02: Server-Side Authorization & Privacy Guards
* **Feature ID:** `F-02`
* **Linked Requirements:** `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`
* **Preconditions:** Server receives request on a protected endpoint.
* **Main Workflow:**
  1. `AuthGuard` checks for valid session cookie; returns `401 Unauthorized` if absent or expired (`BR-09`).
  2. If an `ADMIN` requests any financial endpoint (`/api/accounts/*`, `/api/transactions/*`, `/api/reports/*`), server intercepts and rejects with `403 Forbidden` (`BR-10`).
  3. If a `USER` submits a request referencing another user's financial record (whether querying by ID, using another user's account as `primary_account_id`, or referencing another user's account as `target_account_id` in an allocation line), database query scopes to `userId: req.user.id` and returns `404 Not Found` (`BR-01`).
* **UI Behavior:**
  * Client router (`react-router`) evaluates authenticated status on route changes. Unauthenticated access to `/dashboard` redirects to `/login`.
  * For users authenticated as `ADMIN`, all financial UI elements (Accounts list, Record Transaction buttons, Financial Summary widgets) are hidden from the navigation bar. If an administrator manually enters `/dashboard` or financial URLs, the application displays a dedicated "Access Restricted: Platform Administrators have zero access to user personal ledgers" screen.
* **Acceptance Criteria:**
  * `AC-02-1`: Unauthenticated requests to protected endpoints return `401 Unauthorized` (`TEST-SEC-02`, `BR-09`).
  * `AC-02-2`: ADMIN requests to financial endpoints return `403 Forbidden` with zero sensitive payload leakage (`TEST-SEC-03`, `BR-10`).
  * `AC-02-3`: USER requests attempting to read or modify another user's financial record (including cross-tenant `primary_account_id` or allocation `target_account_id`) return `404 Not Found` (`TEST-SEC-01`, `BR-01`).

---

### Feature F-03: Account Opening Balance Lifecycle
* **Feature ID:** `F-03`
* **Linked Requirements:** `FR-05`, `BR-02`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` owns an eligible account (Checking Bank) with `is_opening_locked = false`.
* **Locking Rule:**
  > Opening Balance can be updated only before the first committed transaction references the account. The account's opening balance becomes locked atomically when the first referencing transaction is committed.
* **Main Workflow:**
  1. User submits opening balance amount via `PATCH /api/accounts/:id/opening-balance`.
  2. Server verifies the account belongs to user and `is_opening_locked` is `false`.
  3. Server updates `opening_balance`.
  4. Balance calculation engine incorporates opening balance into account balance without counting it as income or expense (`BR-02`).
  5. Once a transaction referencing the account commits, server atomically sets `is_opening_locked = true`. If a transaction fails or rolls back, the lock is not applied.
* **UI Behavior:**
  * Account Card in Accounts view shows "Set Opening Balance" button when `is_opening_locked = false`.
  * Clicking button opens modal with a currency-formatted numeric input (`0.00`).
  * If `is_opening_locked = true`, button is replaced by a disabled lock badge with tooltip: "Opening balance is locked permanently following first transaction".
* **Acceptance Criteria:**
  * `AC-03-1`: Submitting valid opening balance (e.g., `10000.00 THB`) on unlocked account returns `200 OK` and updates balance (`TEST-OPEN-01`).
  * `AC-03-2`: Submitting negative amount or non-numeric balance returns `400 Bad Request` (`TEST-OPEN-03`).
  * `AC-03-3`: Opening balance updates on an account with committed transactions return `422 Unprocessable Entity` (`OPENING_BALANCE_LOCKED`) (`TEST-OPEN-04`).
  * `AC-03-4`: Opening balance is verified omitted from income and expense summaries (`TEST-OPEN-02`, `BR-02`).
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
  3. In a database transaction, server creates `Transaction` (Transaction 1 of Golden Journey) and 1 linked `AllocationLine` targeting `Salary` account.
  4. System updates receiving bank balance and locks opening balance of bank account atomically.
* **UI Behavior:**
  * User clicks "Record Income" in dashboard action bar. Modal opens with fields: Destination Cash Account (dropdown defaulted to Checking Bank), Amount (numeric), Date (date picker defaulted to current date), Description (text), and Income Category (dropdown defaulted to Salary).
  * Form requires all fields; submit button disables and displays loading indicator during submission. On 201 Created, modal closes, bank balance updates in UI state, and transaction list prepends the new record. On error, a descriptive error message displays inline.
* **Acceptance Criteria:**
  * `AC-04-1`: Recording salary of 20000.00 THB on date 2026-11-06 returns 201 Created and increases bank balance by 20000.00 (`TEST-INC-01`, `BR-03`).
  * `AC-04-2`: Submitting income transaction with invalid/missing date or non-positive amount returns `400 Bad Request` (`TEST-INC-02`).
* **API Specification:**
  * `POST /api/transactions/income`: Body: `{ "primary_account_id": "acc-bank", "total_amount": 20000.00, "transaction_date": "2026-11-06", "income_account_id": "acc-salary", "description": "Monthly Salary" }` $\rightarrow$ `201 Created`

---

### Feature F-05: Credit Card Purchase Processing
* **Feature ID:** `F-05`
* **Linked Requirements:** `FR-07`, `BR-04`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` has an active `Loan Taken` account (Credit Card).
* **Main Workflow:**
  1. User submits purchase transaction charged to credit card account with total amount, transaction date, and expense allocations.
  2. Server verifies total amount is positive and creates the transaction (Transaction 2 of Golden Journey).
  3. System increases credit card debt balance by the total amount (`BR-04`).
* **UI Behavior:**
  * User clicks "Record Credit Card Purchase" button. Modal presents form with Primary Account selector (defaults to Credit Card), Transaction Date, Description, and Total Amount field.
  * Form integrates with the Multiple Allocations component (`F-06`). On successful submit, modal closes, Credit Card debt card updates immediately, and transaction table updates.
* **Acceptance Criteria:**
  * `AC-05-1`: Submitting valid credit card purchase returns `201 Created` and increases credit card debt balance (`TEST-EXP-01`, `BR-04`).
  * `AC-05-2`: Omitting credit card primary account ID returns `400 Bad Request` (`TEST-EXP-02`).

---

### Feature F-06: Multiple Allocations Engine
* **Feature ID:** `F-06`
* **Linked Requirements:** `FR-08`, `BR-05`, `BR-06`
* **Preconditions:** Transaction payload includes one or more allocation lines.
* **Main Workflow:**
  1. User submits credit purchase with multiple allocation lines (Dining: `1000.00`, Grocery: `2000.00`).
  2. Server computes $\sum \text{allocations.amount}$.
  3. If sum equals `total_amount` (`3000.00`), transaction succeeds and creates both allocation lines (`BR-05`, `BR-06`).
  4. If sum does not equal `total_amount`, server rolls back and rejects with `422 Unprocessable Entity` (`BR-06`).
* **UI Behavior:**
  * Inside the Expense Form, an "Allocations Breakdown" table allows dynamic addition/removal of allocation rows (`+ Add Split Line`).
  * Each row includes Category Account dropdown (e.g., Dining, Grocery), Amount input, and Notes.
  * Live client-side calculation calculates $\text{Remaining to Allocate} = \text{Total Amount} - \sum \text{Row Amounts}$.
  * If $\text{Remaining to Allocate} \neq 0.00$, a warning badge displays in amber and the Submit button is disabled. If an unbalanced request reaches the server, the server returns 422 and an inline alert displays "Allocations sum does not match total amount".
* **Acceptance Criteria:**
  * `AC-06-1`: Multi-line allocation where sum equals total amount (e.g., `1000 + 2000 = 3000`) returns `201 Created` and creates both allocation lines (`TEST-ALLOC-01`, `BR-05`).
  * `AC-06-2`: Multi-line allocation where sum does not equal total amount (e.g., `1000 + 1500 != 3000`) returns `422 Unprocessable Entity` with error code `ALLOCATION_SUM_MISMATCH` (`TEST-ALLOC-02`, `BR-06`).
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
* **Preconditions:** Authenticated `USER` has Cash account (Bank) and Credit Card account (`Loan Taken`) with debt.
* **Repayment Allocation Specification:**
  > Repayment records a Transaction (Transaction 3 of Golden Journey) with **1 Allocation Line** targeting the `Loan Taken` account of the credit card. Because the allocation target is of type `Loan Taken` (debt settlement) rather than `Expense`, the financial summary engine excludes this amount from the total expenses (`BR-08`).
* **Main Workflow:**
  1. User submits credit card repayment specifying funding bank account (`from_account_id`), target credit card account (`to_account_id`), repayment amount, and date.
  2. Server validates positive amount and verifies user owns both accounts.
  3. Server records transaction (Transaction 3) with 1 allocation line targeting the credit card account.
  4. Server atomically decreases bank balance by `3000.00` and decreases credit card debt by `3000.00` (`BR-07`).
  5. Server ensures repayment is excluded from expense summaries (`BR-08`).
* **UI Behavior:**
  * Credit Card Account Card presents a dedicated "Pay Credit Card" button.
  * Clicking opens modal displaying Current Outstanding Debt (e.g., `3,000.00 THB`) with "Pay in Full" quick-fill button, Funding Bank selector (displaying available balance), Repayment Amount input, and Transaction Date picker.
  * Client validation displays warning if amount exceeds debt or available bank funds. On 201 Created, modal closes, Credit Card debt badge transitions to `0.00 THB`, and Bank balance updates to `27,000.00 THB`.
* **Acceptance Criteria:**
  * `AC-07-1`: Submitting valid repayment equal to debt (e.g., `3000.00 THB`) returns `201 Created`, creates 1 allocation line targeting `Loan Taken`, decreases bank balance to `27000.00`, and decreases credit debt to `0.00` (`TEST-REPAY-01`, `BR-07`).
  * `AC-07-2`: Verified that financial expense summary does not increase after repayment (`TEST-REPAY-02`, `BR-08`).
  * `AC-07-3`: Submitting partial repayment strictly less than debt (e.g., `1500.00 THB` against `3000.00 THB` debt) returns `201 Created` and reduces debt to `1500.00 THB` (`TEST-REPAY-05`).
  * `AC-07-4`: Submitting repayment amount strictly exceeding outstanding debt returns `422 Unprocessable Entity` with error code `REPAYMENT_EXCEEDS_DEBT` (`TEST-REPAY-03`).
  * `AC-07-5`: Submitting repayment when source bank balance is insufficient returns `422 Unprocessable Entity` with error code `INSUFFICIENT_FUNDS` (`TEST-REPAY-04`).
  * `AC-07-6`: Submitting non-positive repayment amount ($\le 0.00$) or non-numeric value returns `400 Bad Request` with error code `INVALID_AMOUNT` (`TEST-REPAY-06`).
* **API Specification:**
  * `POST /api/transactions/repayment`: Body: `{ "from_account_id": "acc-bank", "to_account_id": "acc-credit-card", "amount": 3000.00, "transaction_date": "2026-11-06" }` $\rightarrow$ `201 Created` or `422 Unprocessable Entity`

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
* **UI Behavior:**
  * Top of dashboard displays 4 Summary Metric Cards: "Checking Bank Balance", "Credit Card Debt", "Total Income", and "Total Expenses".
  * Figures are formatted to 2 decimal places with currency symbol (`THB`). Cards show animated skeleton placeholders during data fetching and auto-refresh whenever an income, expense, or repayment mutation completes.
* **Acceptance Criteria:**
  * `AC-08-1`: Calling summary endpoint returns exact deterministic figures matching the Golden Journey state: Bank = `27000.00`, Debt = `0.00`, Income = `20000.00`, Expense = `3000.00` (`TEST-BAL-01`, `FR-10`).
* **API Specification:**
  * `GET /api/reports/summary`: Cookie: `token=...` $\rightarrow$ `200 OK` `{ "success": true, "data": { "bank_balance": 27000.00, "credit_debt": 0.00, "total_income": 20000.00, "total_expense": 3000.00 } }`

---

### Feature F-09: Transaction History Persistence
* **Feature ID:** `F-09`
* **Linked Requirements:** `FR-11`, `NFR-DATA-01`
* **Preconditions:** Authenticated `USER` has recorded transactions.
* **Main Workflow:**
  1. Client sends `GET /api/transactions`.
  2. Server queries transactions belonging to `req.user.id` ordered by `transaction_date DESC`.
  3. Server returns exactly 3 transactions recorded across the Golden Journey (Salary [1 allocation], CC Purchase [2 allocations], CC Repayment [1 allocation]) totaling 4 allocation lines.
* **UI Behavior:**
  * Main dashboard lower pane renders a responsive Transaction History Table with columns: Date, Form / Type badge, Primary Account, Split Allocations (individual category tag pills with amounts), and Total Amount.
  * Displays a clean empty-state placeholder ("No transactions recorded yet") prior to recording the first transaction. Table updates reactively upon creating transactions.
* **Acceptance Criteria:**
  * `AC-09-1`: Calling endpoint returns `200 OK` with exactly 3 recorded transactions and 4 allocation lines total (`TEST-HIST-01`, `FR-11`).
  * `AC-09-2`: Data persists and is returned identically across backend server process restarts (`TEST-PERSIST-01`, `NFR-DATA-01`).
* **API Specification:**
  * `GET /api/transactions`: Cookie: `token=...` $\rightarrow$ `200 OK` `{ "success": true, "data": { "transactions": [ ... ] } }`
