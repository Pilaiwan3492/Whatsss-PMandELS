# Software Test Specification (STS) — Sprint 1
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part E: Software Test Specification)  
> **Status:** Authoritative Baseline (Frozen)  

---

## 1. Test Specification Matrix

The following test suite maps each Acceptance Criteria (`AC-XX`) to an executable automated test case (`TEST-XX`), specifying test level, preconditions, inputs, and expected outcomes.

| Test ID | Linked AC | Target Feature | Test Level | Preconditions & Input | Expected Result |
|---|---|:---:|:---:|---|---|
| **`TEST-AUTH-01`** | `AC-01-1` | `F-01` | Integration | Seeded user submits correct username and password to `/api/auth/login`. | HTTP `200 OK`, valid JWT session token returned. |
| **`TEST-AUTH-02`** | `AC-01-2` | `F-01` | Integration | Submitting invalid password or nonexistent username to `/api/auth/login`. | HTTP `401 Unauthorized`, error code `INVALID_CREDENTIALS`. |
| **`TEST-AUTH-03`** | `AC-01-3` | `F-01` | Integration | Submitting valid token to `GET /api/auth/me`. | HTTP `200 OK`, profile returned with correct `role`. |
| **`TEST-AUTH-04`** | `AC-01-1`, `NFR-SEC-01` | `F-01` | Unit / DB | Inspecting stored password column for seeded test users in PostgreSQL. | Passwords match bcrypt hash format; no plaintext found. |
| **`TEST-SEC-01`** | `AC-02-4`, `BR-01` | `F-02` | Integration | `user_demo` submits request for `user_other`'s account ID. | HTTP `404 Not Found` (resource existence concealed). |
| **`TEST-SEC-02`** | `AC-02-1`, `BR-09` | `F-02` | Integration | Unauthenticated request sent to `/api/transactions`. | HTTP `401 Unauthorized`. |
| **`TEST-SEC-03`** | `AC-02-2`, `BR-10` | `F-02` | Integration | `admin_demo` submits request to `/api/reports/summary` or `/api/transactions`. | HTTP `403 Forbidden`, zero financial payload returned. |
| **`TEST-ADMIN-01`** | `AC-02-3`, `FR-03` | `F-02` | Integration | `admin_demo` submits request to `GET /api/admin/users`. | HTTP `200 OK`, list of registered users returned. |
| **`TEST-OPEN-01`** | `AC-03-1` | `F-03` | Integration | `user_demo` sets opening balance of `10000.00 THB` on Checking Bank. | HTTP `200 OK`, bank balance reflects `10000.00 THB`. |
| **`TEST-OPEN-02`** | `AC-03-1`, `BR-02` | `F-03` | Integration | Call `GET /api/reports/summary` immediately after setting opening balance. | Bank = `10000.00`, Income Summary = `0.00`, Expense Summary = `0.00`. |
| **`TEST-INC-01`** | `AC-04-1`, `BR-03` | `F-04` | Integration | Record salary of `20000.00 THB` into bank account with date `2026-11-06`. | HTTP `201 Created`, Bank Balance = `30000.00`, Income Summary = `20000.00`. |
| **`TEST-EXP-01`** | `AC-05-1`, `BR-04` | `F-05` | Integration | Record CC purchase of `3000.00 THB` with date `2026-11-06`. | HTTP `201 Created`, CC Debt increases by `3000.00`. |
| **`TEST-ALLOC-01`** | `AC-06-1`, `BR-05` | `F-06` | Integration | Submit split purchase: Dining `1000.00` + Grocery `2000.00` (Total `3000.00`). | HTTP `201 Created`, two allocation lines created in database. |
| **`TEST-ALLOC-02`** | `AC-06-2`, `BR-06` | `F-06` | Unit / API | Submit split purchase with unbalanced allocations (`1000 + 1500 != 3000`). | HTTP `422 Unprocessable Entity`, transaction rejected and rolled back. |
| **`TEST-REPAY-01`** | `AC-07-1`, `BR-07` | `F-07` | Integration | Submit CC repayment of `3000.00 THB` from Bank to Credit Card. | HTTP `201 Created`, Bank = `27000.00`, CC Debt = `0.00`. |
| **`TEST-REPAY-02`** | `AC-07-2`, `BR-08` | `F-07` | Integration | Query `GET /api/reports/summary` after repayment. | Expense Summary remains `3000.00` (Repayment not counted as expense). |
| **`TEST-BAL-01`** | `AC-08-1` | `F-08` | Unit | Execute balance calculator service against the 4 Golden Journey events. | Final balances: Bank `27000.00`, CC Debt `0.00`, Income `20000.00`, Expense `3000.00`. |
| **`TEST-HIST-01`** | `AC-09-1` | `F-09` | Integration | Query `GET /api/transactions` for `user_demo`. | HTTP `200 OK`, returns salary, split purchase, and repayment transactions in order. |
| **`TEST-PERSIST-01`** | `AC-09-2`, `NFR-DATA-01`| `F-09` | Integration | Re-instantiate database client connection and re-query transactions. | All committed transactions and balances match initial state identically. |
| **`TEST-E2E-01`** | All Golden ACs | All S1 | UI / E2E | Execute full Golden Journey sequence sequentially via UI / API workflow. | Complete journey passes with exact expected final figures. |
