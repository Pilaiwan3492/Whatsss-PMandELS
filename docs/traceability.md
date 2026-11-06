# Requirements to Feature & Sprint Traceability Matrix (Part B)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part B: Feature Inventory and Traceability)  
> **Status:** Authoritative Baseline (Frozen)  

---

## 1. Traceability Overview

This document provides end-to-end traceability across all baseline Functional Requirements (`FR`), Business Rules (`BR`), and Non-Functional Requirements (`NFR`), mapping each requirement to its implementing Feature (`F-XX`), target sprint, and verification method.

---

## 2. Requirements Traceability Matrix

### 2.1 Functional Requirements Traceability

| Requirement ID | Requirement Description | Implementing Feature(s) | Planned Sprint | Verification Method / Planned Test |
|---|---|---|:---:|---|
| **`FR-01`** | User login and session termination (logout) | `F-01` | **Sprint 1** | Automated API Integration (`TEST-AUTH-01`, `TEST-AUTH-03`) |
| **`FR-02`** | Current user identity and role resolution | `F-01` | **Sprint 1** | Automated API Integration (`TEST-AUTH-02`) |
| **`FR-03`** | Platform user directory inspection | `F-02` | **Sprint 1** | Automated API Integration (`TEST-ADMIN-01`) |
| **`FR-04`** | Platform user status governance | `F-02` | Later Sprints | Deferred to Sprint 2 / Lab 6 |
| **`FR-05`** | Opening balance recording on eligible accounts | `F-03` | **Sprint 1** | Automated Integration (`TEST-OPEN-01`) |
| **`FR-06`** | Income transaction processing with date | `F-04` | **Sprint 1** | Automated Integration (`TEST-INC-01`) |
| **`FR-07`** | Credit card purchase recording with date | `F-05`, `F-06` | **Sprint 1** | Automated Integration (`TEST-EXP-01`) |
| **`FR-08`** | Multi-line split allocations (Dining & Grocery) | `F-06` | **Sprint 1** | Unit & Integration (`TEST-ALLOC-01`, `TEST-ALLOC-02`) |
| **`FR-09`** | Credit card debt repayment from bank | `F-07` | **Sprint 1** | Automated Integration (`TEST-REPAY-01`) |
| **`FR-10`** | Deterministic balance and summary calculation | `F-08` | **Sprint 1** | Unit & Integration (`TEST-BAL-01`, `TEST-BAL-02`) |
| **`FR-11`** | Transaction history retrieval | `F-09` | **Sprint 1** | Automated Integration (`TEST-HIST-01`) |
| **`FR-12`** | Custom account lifecycle across 5 types | `F-10` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-13`** | Internal cash transfers between accounts | `F-11` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-14`** | Peer lending & repayment recovery (`Loan Given`) | `F-12` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-15`** | General borrowing & repayment (`Loan Taken`) | `F-13` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-16`** | Favorite transaction tagging | `F-14` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-17`** | Transaction duplication | `F-14` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-18`** | Transaction search and multi-criteria filtering | `F-15` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-19`** | Transaction corrections and adjustments | `F-16` | Sprint 2 | Planned Sprint 2 Contract |
| **`FR-20`** | Category spending distribution reports | `F-17` | Sprint 3 | Planned Sprint 3 Contract |

---

### 2.2 Business Rules Traceability

| Business Rule ID | Business Rule Statement | Implementing Feature(s) | Planned Sprint | Verification Method / Test ID |
|---|---|---|:---:|---|
| **`BR-01`** | User accesses only their own financial records | `F-02` | **Sprint 1** | Automated Security Integration (`TEST-SEC-01`) |
| **`BR-02`** | Opening balance excluded from income/expense | `F-03`, `F-08` | **Sprint 1** | Automated Calculation Check (`TEST-OPEN-02`) |
| **`BR-03`** | Income increases cash balance & income summary | `F-04`, `F-08` | **Sprint 1** | Automated Ledger Assertion (`TEST-INC-01`) |
| **`BR-04`** | CC purchase increases debt & expense summary | `F-05`, `F-08` | **Sprint 1** | Automated Ledger Assertion (`TEST-EXP-01`) |
| **`BR-05`** | Multi-line split allocation permitted | `F-06` | **Sprint 1** | Automated Allocation Test (`TEST-ALLOC-01`) |
| **`BR-06`** | Sum of allocations strictly equals total amount | `F-06` | **Sprint 1** | Negative Boundary Unit/API Test (`TEST-ALLOC-02`) |
| **`BR-07`** | Repayment reduces cash balance and credit debt | `F-07`, `F-08` | **Sprint 1** | Automated Ledger Assertion (`TEST-REPAY-01`) |
| **`BR-08`** | Repayment not counted as expense | `F-07`, `F-08` | **Sprint 1** | Summary Verification Assertion (`TEST-REPAY-02`) |
| **`BR-09`** | Unauthenticated requests rejected | `F-01`, `F-02` | **Sprint 1** | Automated Security Integration (`TEST-SEC-02`) |
| **`BR-10`** | ADMIN barred from viewing/modifying financial data | `F-02` | **Sprint 1** | Automated Role Barrier Test (`TEST-SEC-03`) |

---

### 2.3 Non-Functional Requirements Traceability

| NFR ID | Target Characteristic | Implementing Component / Feature | Planned Sprint | Verification Method |
|---|---|---|:---:|---|
| **`NFR-SEC-01`** | Password hashing (Salted one-way hash) | Auth Service (`F-01`) | **Sprint 1** | Direct schema and password verification test (`TEST-AUTH-04`) |
| **`NFR-SEC-02`** | Backend boundary & tenancy enforcement | AuthGuard & RoleGuard (`F-02`) | **Sprint 1** | Automated API tests asserting rejection & zero data leak (`TEST-SEC-01..03`) |
| **`NFR-DATA-01`** | Data persistence & durability across restarts | PostgreSQL & Prisma ORM (`F-03..F-09`) | **Sprint 1** | Automated database persistence test across session restart (`TEST-PERSIST-01`) |
