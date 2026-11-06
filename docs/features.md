# Feature Inventory & Product Baseline Catalog (Part B)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part B: Feature Inventory and Traceability)  
> **Status:** Authoritative Baseline (Frozen)  

---

## 1. Purpose and Identification Scheme

This document establishes the authoritative Feature Inventory for Whatsss. Each feature is assigned an immutable identifier `F-XX` (where `XX` is a two-digit integer). 

Features are partitioned into:
1. **Sprint 1 Core Features (`F-01` to `F-09`):** The foundational Golden Domain Journey slice implemented and verified in Deliverable 1.
2. **Later Sprints Product Backlog (`F-10` to `F-18`):** Remaining features required to fulfill the full Theme 7 product specification, allocated across Sprints 2 and 3.

---

## 2. Feature Inventory Matrix

| Feature ID | Feature Name | Primary Actor | Target Sprint | Category / Status | Summary Description |
|:---:|---|:---:|:---:|:---:|---|
| **`F-01`** | **Authentication & Session** | `USER`, `ADMIN` | **Sprint 1** | Required (Sprint 1) | User login, logout, and current user identity/role verification. |
| **`F-02`** | **Authorization & Privacy** | `USER`, `ADMIN` | **Sprint 1** | Required (Sprint 1) | Backend tenancy isolation (`BR-01`) and admin financial privacy enforcement (`BR-10`). |
| **`F-03`** | **Opening Balance** | `USER` | **Sprint 1** | Required (Sprint 1) | Record starting balance on eligible accounts (Bank) prior to transactions (`BR-02`). |
| **`F-04`** | **Income Transaction** | `USER` | **Sprint 1** | Required (Sprint 1) | Record salary received into bank account with date; updates cash balance and income summary (`BR-03`). |
| **`F-05`** | **Credit Card Purchase** | `USER` | **Sprint 1** | Required (Sprint 1) | Record purchase charged to credit card with date; increases debt and expense summary (`BR-04`). |
| **`F-06`** | **Multiple Allocations** | `USER` | **Sprint 1** | Required (Sprint 1) | Split credit purchase into Dining & Grocery lines; validates allocation sum equals total (`BR-05`, `BR-06`). |
| **`F-07`** | **Credit Card Repayment** | `USER` | **Sprint 1** | Required (Sprint 1) | Repay credit card from bank account; decreases cash and debt; not counted as expense (`BR-07`, `BR-08`). |
| **`F-08`** | **Balance & Summary** | `USER` | **Sprint 1** | Required (Sprint 1) | Real-time computation of bank balance, credit debt, total income, and total expenses. |
| **`F-09`** | **Transaction History** | `USER` | **Sprint 1** | Required (Sprint 1) | Display chronological list of persisted user transactions and allocation splits. |
| **`F-10`** | **Account Creation & Management** | `USER` | Sprint 2 | Required (Theme 7) | User custom creation, updating, and categorization of accounts across all 5 types. |
| **`F-11`** | **Internal Cash Transfer** | `USER` | Sprint 2 | Required (Theme 7) | Single-action internal transfer between Cash/Bank accounts without affecting income/expense. |
| **`F-12`** | **Loan Given & Recovery** | `USER` | Sprint 2 | Required (Theme 7) | Track money lent to third parties (`Loan Given`) and subsequent repayment recoveries. |
| **`F-13`** | **General Loan Taken & Repayment** | `USER` | Sprint 2 | Required (Theme 7) | Track money borrowed (`Loan Taken`) and subsequent loan principal repayments. |
| **`F-14`** | **Favorite & Duplicate Transactions** | `USER` | Sprint 2 | Required (Theme 7) | Mark transactions as favorites; duplicate existing transactions for rapid entry. |
| **`F-15`** | **Transaction Search & Filtering** | `USER` | Sprint 2 | Required (Theme 7) | Query transactions by date ranges, account, category, and transaction form. |
| **`F-16`** | **Transaction Corrections** | `USER` | Sprint 2 | Required (Theme 7) | Update and correct erroneous transaction entries while preserving ledger integrity. |
| **`F-17`** | **Category Spending Summaries & Reports** | `USER` | Sprint 3 | Required (Theme 7) | In-depth analytics, category spending breakdowns, and period financial summaries. |
| **`F-18`** | **Audited Correction History & Archival** | `USER` | Sprint 3 | Team Decision | Historical audit trail for corrected transactions and account soft-delete lifecycle. |

---

## 3. Sprint 1 Feature Specifications (High-Level Overview)

### Feature F-01: Authentication & Session
* **User Goal:** As a user or admin, I want to authenticate securely and terminate my session so my identity is verified.
* **Scope (Sprint 1):** Login with credentials, token generation, logout, and identity resolution endpoint (`/api/auth/me`).
* **Linked Requirements:** `FR-01`, `FR-02`, `NFR-SEC-01`, `BR-09`.

### Feature F-02: Authorization & Privacy
* **User Goal:** As a user, I want my financial records completely isolated from other users and platform administrators.
* **Scope (Sprint 1):** Backend tenancy check (reject cross-user access) and role guard (reject admin access to financial data).
* **Linked Requirements:** `BR-01`, `BR-09`, `BR-10`, `NFR-SEC-02`.

### Feature F-03: Opening Balance
* **User Goal:** As a user, I want to set an initial starting balance on my bank account before recording transactions.
* **Scope (Sprint 1):** Record opening balance on seeded bank account; exclude opening balance from income/expense calculations.
* **Linked Requirements:** `FR-05`, `BR-02`, `NFR-DATA-01`.

### Feature F-04: Income Transaction
* **User Goal:** As a user, I want to record my received salary into my bank account.
* **Scope (Sprint 1):** Record salary inflow with date; update receiving bank balance and income summary.
* **Linked Requirements:** `FR-06`, `BR-03`, `NFR-DATA-01`.

### Feature F-05: Credit Card Purchase
* **User Goal:** As a user, I want to record an expense transaction charged to my credit card.
* **Scope (Sprint 1):** Record credit charge with date; increase credit card liability balance.
* **Linked Requirements:** `FR-07`, `BR-04`, `NFR-DATA-01`.

### Feature F-06: Multiple Allocations
* **User Goal:** As a user, I want to split a single credit card purchase into Dining and Grocery allocations.
* **Scope (Sprint 1):** Multi-line split allocation engine; strictly enforce that $\sum \text{allocation} = \text{total}$.
* **Linked Requirements:** `FR-08`, `BR-05`, `BR-06`.

### Feature F-07: Credit Card Repayment
* **User Goal:** As a user, I want to pay off my credit card balance from my bank account.
* **Scope (Sprint 1):** Transfer funds from Bank to Credit Card; decrease bank balance and credit debt; exclude from expenses.
* **Linked Requirements:** `FR-09`, `BR-07`, `BR-08`.

### Feature F-08: Balance & Summary
* **User Goal:** As a user, I want to view my current bank balance, outstanding debt, and total income and expenses.
* **Scope (Sprint 1):** Computed summaries derived deterministically from persisted transactions.
* **Linked Requirements:** `FR-10`.

### Feature F-09: Transaction History
* **User Goal:** As a user, I want to inspect all my recorded transactions and their allocation breakdowns.
* **Scope (Sprint 1):** Query and display historical transactions and allocations belonging to the authenticated user.
* **Linked Requirements:** `FR-11`, `NFR-DATA-01`.
