# Whatsss — Sprint 1 Frozen Scope Agreement

> **CPE 334 Project Deliverable 1**  
> Semester 1/2026 | Milestone Due: 8 November 2026 at 23:59  
> **Status:** Frozen Baseline Agreement  

---

## 1. Sprint Goal
Develop a working, tested personal finance management system vertical slice that allows authenticated users to record an opening bank balance, receive salary, record credit card purchases with multiple expense allocations, and repay credit card debt. The system must calculate the resulting bank balance and credit card debt correctly, display income and expense summaries and transaction history, and enforce user data privacy.

---

## 2. Included Features (Sprint 1 Golden Slice)

| Feature ID | Feature Name | Core Functionality |
|:---:|---|---|
| **`F-01`** | **Authentication & Session** | User login, logout, and current user identity/role verification. |
| **`F-02`** | **Authorization & Privacy** | Backend-enforced tenancy isolation (`BR-01`) and administrator financial privacy exclusion (`BR-10`). |
| **`F-03`** | **Opening Balance** | Record initial starting balance on eligible accounts (Bank Account). |
| **`F-04`** | **Income Transaction** | Record salary received into bank account with date, updating cash balance and income summary. |
| **`F-05`** | **Credit Card Purchase** | Record purchase charged to credit card with date, increasing debt and expense summary. |
| **`F-06`** | **Multiple Allocations** | Split credit card purchase into Dining and Grocery allocations; enforce sum validation (`BR-06`). |
| **`F-07`** | **Credit Card Repayment** | Repay credit card balance from bank account; decrease cash and debt; exclude from expenses (`BR-08`). |
| **`F-08`** | **Balance & Summary** | Real-time computation of bank balance, credit debt, total income, and total expenses. |
| **`F-09`** | **Transaction History** | Display chronological list of persisted transactions and allocation breakdowns. |

---

## 3. Explicitly Excluded from Sprint 1 (Deferred to Sprints 2–3)
* Full user custom account creation and deletion (`F-10`).
* Internal cash transfers between accounts (`F-11`).
* Peer lending (`Loan Given`) and borrowing (`Loan Taken`) beyond credit card repayment (`F-12`, `F-13`).
* Favorite and duplicate transactions (`F-14`).
* Multi-criteria transaction search and filtering (`F-15`).
* Transaction adjustments and reversals (`F-16`).
* Category spending distribution reports (`F-17`).
* Advanced platform administration dashboards and user self-registration.
* Completed Docker, CI/CD, and GCP cloud deployment (scheduled for Lab 5).
