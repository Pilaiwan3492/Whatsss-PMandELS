# Software Requirements Specification (SRS)
## Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part A: SRS and Product Scope)  
> **Status:** Accepted Sprint 1 Baseline (`v0.1.0-sprint1`, Frozen) + Proposed Lab 7 Maintenance Amendment (`BR-07 v1.1`, PR #51 — **Pending Substantive Teammate Review**; Instructor/TA Sprint 1 CR pre-approval waived per official Lab 7 Spec Sheet Change announcement)

### Document Revision History
| Version | Status | Date | Scope / Reference | Summary |
|---|---|---|---|---|
| `v0.1.0-sprint1` | **Accepted & Frozen Baseline** | 2026-11-08 | PR #14 (`f84e7b16`) | Original Sprint 1 SRS and Business Rules (`BR-01`..`BR-10`). |
| `v1.1-draft` | **Proposed (Pending Substantive Teammate Review)** | 2026-11-25 | Lab 7 / PR #51 / Issue #47 | Proposes `BR-07 v1.1` amendment to `F-07` Credit Card Repayment (`FR-09`); does not alter accepted baseline until teammate review and RED/GREEN evidence are completed. |

---

## 1. Stakeholder Problem, Context & Purpose

### 1.1 Stakeholder Problem
Individuals often struggle to maintain an accurate and honest record of their personal financial health across various financial instruments—such as cash, bank accounts, credit cards, and informal personal loans. Conventional personal expense tracking tools frequently fall short in two critical areas:
1. **Inflexible Transaction Categorization:** Real-world purchases often involve a single checkout that spans multiple expense categories (e.g., a supermarket trip covering both groceries and household dining). Systems lacking split allocations force users to manually compute or misrepresent expenditures.
2. **Conflating Debt and Transfers with Income/Expense:** Paying off a credit card balance or transferring money between bank accounts does not represent a new expense or income. Treating debt settlements as expenses artificially inflates expenditure metrics and distorts a user's true financial standing.

### 1.2 Chosen Context
**Whatsss** is a web application designed for multi-user personal finance management where each user maintains complete privacy over their personal ledger. The system organizes finances across five distinct account types, enforces mathematical balance integrity through multi-line allocation splits, and strictly separates platform administration from private user financial data.

### 1.3 Purpose of this Specification
This document establishes the authoritative Software Requirements Specification (SRS) for the **entire Whatsss product vision** in accordance with CPE 334 Theme 7 specifications. It identifies system actors, product boundaries, functional requirements (FR), business rules (BR), measurable non-functional requirements (NFR), and explicitly allocates each functional requirement to its target implementation sprint.

---

## 2. System Actors & Security Boundaries

### 2.1 Actors and Roles
The system defines two authenticated user roles and recognizes one unauthenticated request state:

1. **Standard User (`USER`):**
   * An authenticated individual who manages their personal financial records.
   * **Scope of Authority:** Full read and write access to their own financial accounts, opening balances, transactions, allocation lines, and financial summaries.
   * **Boundary:** Barred from accessing, viewing, or modifying records belonging to any other user. Cross-user access attempts are rejected and resource existence is concealed.

2. **Platform Administrator (`ADMIN`):**
   * An authenticated administrative user responsible for platform operations and account governance.
   * **Scope of Authority:** Authenticates via platform login. User directory and account activation governance are specified as product-level capabilities planned for Sprint 2.
   * **Boundary:** **Strictly barred from accessing, viewing, or modifying any user's financial accounts, transactions, balances, or summaries.** Backend access control unconditionally enforces this separation (`BR-10`).

3. **Unauthenticated Visitor:**
   * An anonymous client interacting with the system without valid authentication credentials.
   * **Scope of Authority:** Permitted only to view public landing/login interfaces and submit authentication credentials.
   * **Boundary:** Excluded from all protected application resources and endpoints (`BR-09`).

### 2.2 Security and Privacy Boundaries
* **Tenancy Isolation:** Financial data is partitioned strictly by user identity. Every financial query and mutation must enforce user ownership.
* **Administrative Separation of Concerns:** Administrative authority grants zero privilege over private user ledgers.

---

## 3. Product Scope: Inclusions and Exclusions

### 3.1 In-Scope Product Capabilities (Entire Vision)
* **Five Account Types:** Structured management of `Cash`, `Loan Taken`, `Loan Given`, `Income`, and `Expense` accounts.
* **Opening Balance Management:** Ability to record an opening balance on asset and liability accounts prior to entering transactions.
* **Dual Transaction Forms with Allocation Splits:**
  * *Payment / Charge:* Deducting from Cash or charging to Loan Taken, with allocation lines distributed across Expense, debt repayments, loans given, or cash transfers.
  * *Receive Money:* Inflow into Cash, with allocation lines distributed across Income, debt borrowings, loan repayments received, or cash transfers.
* **Transaction Date Support:** Every transaction includes a user-specified transaction date.
* **Balance & Financial Reporting:** Real-time computed account balances, outstanding debt balances, and true income/expense summaries excluding transfers and repayments.
* **Product Enhancements (Later Sprints):** User custom account creation, single-action internal cash transfers, peer lending (`Loan Given`), general borrowing (`Loan Taken`), favorite transactions, transaction duplication, search and filtering, category spending distributions, platform user administration, and audited correction history with archival lifecycle (`FR-21`).

### 3.2 Out-of-Scope Capabilities (Explicit Exclusions)
* Automatic bank feed integrations and real banking APIs.
* Real-money payment gateway processing or external payment processing.
* Multi-currency conversion or live exchange rate feeds (system standardizes on THB).
* Period-based budgeting, shared household budgets, and collaborative ledgers.
* Automatic scheduled recurring transactions.
* External third-party email and SMS notification delivery services.

---

## 4. Functional Requirements (FR)

Requirements are partitioned into **Sprint 1 Core Requirements** (the verified Golden Domain Journey slice) and **Later Sprints Product Requirements** (Theme 7 full product backlog).

### 4.1 Sprint 1 Core Requirements (Deliverable 1 Baseline)

| Requirement ID | Requirement Title | Description | Target Sprint |
|---|---|---|:---:|
| **`FR-01`** | **User Authentication** | The system shall authenticate users using username/email and password credentials and provide session termination (logout). | **Sprint 1** |
| **`FR-02`** | **Identity and Role Resolution** | The system shall identify the current authenticated user and return their system role (`USER` or `ADMIN`). | **Sprint 1** |
| **`FR-05`** | **Opening Balance Recording** | The system shall allow a user to record an initial opening balance for an eligible account (such as a bank account) before transactions reference it. | **Sprint 1** |
| **`FR-06`** | **Income Transaction Processing** | The system shall allow a user to record received income (such as salary) into a Cash account with a transaction date, increasing the cash balance and income total. | **Sprint 1** |
| **`FR-07`** | **Credit Card Purchase Recording** | The system shall allow a user to record an expense transaction charged to a credit card account with a transaction date, increasing outstanding debt and expense totals. | **Sprint 1** |
| **`FR-08`** | **Multi-Line Split Allocations** | The system shall allow a single transaction to be allocated across multiple distinct category accounts (such as Dining and Grocery). | **Sprint 1** |
| **`FR-09`** | **Credit Card Debt Settlement** | The system shall allow a user to record a debt repayment transferring funds from a Cash account to a credit card account, reducing cash balance and debt without increasing expenses. | **Sprint 1** |
| **`FR-10`** | **Deterministic Balance and Summary** | The system shall compute and display real-time cash balances, outstanding credit card debt, total income, and total expenses. | **Sprint 1** |
| **`FR-11`** | **Transaction History Retrieval** | The system shall display the chronological history of recorded transactions and their allocation breakdowns for the authenticated user. | **Sprint 1** |

### 4.2 Later Sprints Product Requirements (Theme 7 Full Vision)

| Requirement ID | Requirement Title | Description | Target Sprint |
|---|---|---|:---:|
| **`FR-03`** | **Platform User Directory** | The system shall allow an administrator to view the directory of registered platform user accounts. | Sprint 2 |
| **`FR-04`** | **User Access Governance** | The system shall allow an administrator to toggle user account access status (`Active` / `Disabled`). | Sprint 2 |
| **`FR-12`** | **Custom Account Management** | The system shall allow users to create, update, and manage accounts across all five account types (`Cash`, `Loan Taken`, `Loan Given`, `Income`, `Expense`). | Sprint 2 |
| **`FR-13`** | **Internal Cash Transfer** | The system shall allow users to record internal fund transfers between their own Cash accounts without impacting income or expense summaries. | Sprint 2 |
| **`FR-14`** | **Peer Lending Management** | The system shall allow users to record loans given to third parties (`Loan Given`) and subsequent loan repayments received. | Sprint 2 |
| **`FR-15`** | **General Borrowing Management** | The system shall allow users to record money borrowed (`Loan Taken`) and subsequent loan principal repayments. | Sprint 2 |
| **`FR-16`** | **Favorite Transaction Management** | The system shall allow users to mark frequently used transactions as favorites and view a filtered list of favorite transactions for quick access. | Sprint 2 |
| **`FR-17`** | **Transaction Duplication** | The system shall allow users to duplicate an existing transaction to pre-fill a new editable transaction. | Sprint 2 |
| **`FR-18`** | **Transaction Search & Filtering** | The system shall allow users to search and filter transactions by date range, account, and category. | Sprint 2 |
| **`FR-19`** | **Transaction Corrections** | The system shall allow users to correct or adjust previously recorded transactions. | Sprint 2 |
| **`FR-20`** | **Category Spending Reports** | The system shall compute and display detailed category-wise spending distributions and analytics over selectable periods. | Sprint 3 |
| **`FR-21`** | **Audited Correction History & Archival** | The system shall maintain an immutable audit history of modified transactions and support soft-delete archival lifecycle (Approved Team Scope Addition). | Sprint 3 |

---

## 5. Business Rules (BR)

The system strictly enforces the following domain rules:

* **`BR-01 (Tenancy Isolation):`** A user shall access only their own financial accounts, transactions, and summaries. Any attempt to inspect or modify another user's financial resource shall be rejected and concealed.
* **`BR-02 (Opening Balance & Internal Transfer Exclusion):`** Opening balances establish starting account balances and must not be counted as income or expenses in financial summaries. Furthermore, internal cash transfers between a user's own Cash accounts (`FR-13`) shall not impact or be counted as income or expenses.
* **`BR-03 (Income Inflow):`** Income transactions shall increase the balance of the destination Cash account and increase the user's income summary by the allocated amount.
* **`BR-04 (Credit Charge Invariant):`** Purchases charged to a credit card account shall increase the outstanding liability of that credit card and increase the expense summary by the transaction amount.
* **`BR-05 (Multi-Line Allocation Support):`** A transaction may contain one or more allocation lines distributing the total transaction amount.
* **`BR-06 (Allocation Balance Integrity):`** The total transaction amount must strictly equal the mathematical sum of all individual allocation line amounts:
  $$\sum \text{allocation.amount} = \text{transaction.total\_amount}$$
  Any transaction where the allocation sum does not equal the total amount shall be rejected.
* **`BR-07 (Debt Settlement Invariant — Accepted Sprint 1 Baseline `v0.1.0-sprint1`):`** A credit card repayment shall reduce the funding Cash account balance and reduce the outstanding credit card debt balance by an equal amount.
  * **`BR-07 v1.1 (Proposed Lab 7 Amendment — 2026-11-25, PR #51, Pending Teammate Review & Blocker Resolution):`**
    * *Previous Behavior (`v0.1.0-sprint1`):* Any positive repayment (`0.00 < amount <= currentDebt` and `amount <= currentCashBalance`, max 2 decimal places) was accepted with no minimum repayment floor and no cash reserve buffer.
    * *New Proposed Behavior:* Applies **only** to eligible Credit Card Debt Settlement (`F-07` / `FR-09`) from a `CASH` account (`from_account_id`) to an eligible Credit Card `LOAN_TAKEN` account (`to_account_id`), and **not** to generic `LOAN_TAKEN` borrowing (`FR-15`) or other account types (`LOAN_GIVEN`, `INCOME`, `EXPENSE`, internal `CASH` transfers `FR-13`):
      1. **Minimum Repayment Floor (`MIN_REPAYMENT_NOT_MET`, HTTP `422`):** For latest outstanding debt $\ge 500.00$ THB, `minRepayment = max(500.00, roundHalfUp2(currentDebt * 0.10))` using 2-decimal `ROUND_HALF_UP` arithmetic (capped at `currentDebt`; full settlement always satisfies the floor). For $0.00 < \text{currentDebt} < 500.00$ THB, partial repayment is prohibited and full settlement (`amount == currentDebt`) is required.
      2. **Minimum Cash Reserve (`MINIMUM_CASH_RESERVE_VIOLATION`, HTTP `422`):** Partial repayments (`amount < currentDebt`) must leave `currentCashBalance - repaymentAmount >= 100.00` THB. Full settlement (`repaymentAmount == currentDebt`) waives the `100.00` THB reserve restriction, **but sufficient funds (`currentCashBalance >= repaymentAmount`) are still required** (`422 INSUFFICIENT_FUNDS`).
      3. **Zero Debt (`ZERO_OUTSTANDING_DEBT`, HTTP `422`):** If latest outstanding debt is `0.00` THB, reject the request and create no records.
      4. **Eligible Target Scope (`INVALID_ACCOUNT_TYPE`, HTTP `400`):** `F-07` accepts only `CASH` (`from_account_id`) $\rightarrow$ `LOAN_TAKEN` (`to_account_id`) and rejects `LOAN_GIVEN`, `CASH`, `INCOME`, and `EXPENSE` targets.
    * *Design Decision (Credit Card vs. Generic `LOAN_TAKEN`):* In Sprint 1 (`schema.prisma`, `seed.ts`), `FR-15` (Generic Borrowing) is deferred to Sprint 2, so `Visa Credit Card` is the only `LOAN_TAKEN` account and no generic `LOAN_TAKEN` borrowing accounts exist. Keeping schema changes out of scope for Lab 7 Sprint 1 maintenance, `F-07` enforces `toAccount.type === 'LOAN_TAKEN'` in Sprint 1; **Sprint 2 (`FR-15`) must add an explicit account subtype/discriminator or separate borrowing endpoint before any generic `LOAN_TAKEN` borrowing account is created**.
    * *Product Rationale:* Whatsss-specific product/business policies chosen by the team (not universal banking regulations, legal requirements, or financial advice) to prevent micro-repayments, encourage meaningful debt reduction, maintain a `100.00 THB` partial-payment cash buffer, and allow full payoff of small balances.
    * *Traceability:* `docs/labs/lab-07/change-request-and-impact.md` (PR #51, Issue #47); `AC-07-7`..`AC-07-10`; `TEST-REPAY-07`..`16`.
* **`BR-08 (Debt Settlement & Financing Cashflow Exclusion):`** Debt repayments shall not be counted as an expense, because the underlying expenditure was already recognized when the charge occurred. Furthermore, proceeds from borrowings (`Loan Taken`, `FR-15`) and recoveries of loans given (`Loan Given`, `FR-14`) shall not be counted as income, and principal disbursed as loans given shall not be counted as expenses.
* **`BR-09 (Authentication Boundary):`** Any unauthenticated request attempting to access protected financial or administrative resources shall be rejected.
* **`BR-10 (Administrative Financial Privacy):`** Administrators shall have no access to view, query, or modify users' financial accounts, transactions, balances, or summaries. All financial endpoints shall enforce this exclusion on the backend.

---

## 6. Non-Functional Requirements (NFR)

The system must satisfy the following measurable non-functional requirements:

### `NFR-SEC-01: Password Hashing Security`
* **Target:** All user passwords stored in the system must be cryptographically hashed using a salted one-way hashing algorithm (such as bcrypt with work factor $\ge 10$ or Argon2). Plaintext passwords must never be stored in persistent storage or logs.
* **Verification Method:** Direct automated inspection of the database user schema and seeded test account credential records.

### `NFR-SEC-02: Backend Security Boundary & Tenancy Enforcement`
* **Target:** Unauthenticated requests and requests from unauthorized roles (`ADMIN` querying financial data, or `USER` querying another user's records) must be rejected at the backend API layer without disclosing sensitive financial payloads.
* **Verification Method:** Automated API integration tests asserting proper access rejection and zero leakage of financial data payloads.

### `NFR-DATA-01: Data Persistence & Durability`
* **Target:** All committed user accounts, opening balances, transactions, and allocation splits must be durably stored in a relational database and survive backend server restarts without data loss or corruption.
* **Verification Method:** Automated persistence integration tests executing a write, stopping/restarting the backend server process, and verifying exact record retrieval from the persistent database.

---

## 7. Assumptions and Dependencies

1. **Local Development Baseline:** Sprint 1 runs in a local environment with Dockerized PostgreSQL and Node.js; cloud deployment on GCP is scheduled for Lab 5.
2. **Deterministic Seed Environment:** Seeded accounts and test users (`USER` and `ADMIN`) are provided for local reproduction and evaluation of the Golden Domain Journey.
3. **Single Currency:** All monetary values are recorded and computed in Thai Baht (`THB`) with two decimal places of precision.


## 8. Lab 7 Maintenance Amendment and Revision History

- **v1.0 — Accepted Sprint 1 baseline (`v0.1.0-sprint1`):** Preserve the original accepted SRS and its historical baseline (`f84e7b16`).
- **v1.1 — Proposed Lab 7 amendment (PR #51):** Proposes the F-07 / BR-07 repayment minimum, small-debt full-settlement, cash-reserve, zero-debt, and Sprint 1 `LOAN_TAKEN` scoping clarifications. Instructor/TA pre-approval for Sprint 1 Change Requests is waived per official Lab 7 Spec Sheet Change announcement; substantive teammate review (`@Apichaya251400`) and RED/GREEN + regression evidence remain required before implementation/merge.
- **Sprint 2 (`FR-15`) prerequisite:** Before Sprint 2 introduces generic `LOAN_TAKEN` borrowing (`FR-15`), an explicit account subtype/discriminator or separate borrowing endpoint must be added so generic borrowing records never enter `F-07`.
