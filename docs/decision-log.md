# Architecture & Engineering Decision Log

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Project:** Whatsss — Personal Money and Expense Logging System (Theme 7)  
> **Team Members:** Pilaiwan Churdchu (67070503492), Aphichaya Klinhual (67070503447)  

---

## 1. Decision Status Definitions
* **Approved Baseline:** Evaluated, confirmed by both team members, and forms an authoritative contract.
* **Proposed / In Review:** Active proposal awaiting formal team review.
* **Superseded:** Replaced by a subsequent decision record.

---

## 2. Decision Register

| DEC ID | Decision Title | Status | Primary Related Requirements |
|---|---|:---:|---|
| **DEC-01** | Technology Stack Selection (React + Express + PostgreSQL + Prisma) | **Approved Baseline** | `NFR-DATA-01`, Architecture |
| **DEC-02** | Five Account Types & Instance Mapping Model | **Approved Baseline** | `FR-05`, `BR-02`, Theme 7 Spec |
| **DEC-03** | Tenancy Isolation & Cross-User Resource Concealment | **Approved Baseline** | `BR-01`, `NFR-SEC-02` |
| **DEC-04** | Administrative Separation & Financial Privacy Barrier | **Approved Baseline** | `BR-10`, `NFR-SEC-02` |
| **DEC-05** | Split Allocation Balance Integrity Validation | **Approved Baseline** | `BR-05`, `BR-06`, `FR-08` |
| **DEC-06** | Debt Repayment Invariant & Expense Double-Count Exclusion | **Approved Baseline** | `BR-07`, `BR-08`, `FR-09`, `FR-10` |
| **DEC-07** | Session Authentication Transport via HttpOnly Cookies | **Approved Baseline** | `FR-01`, `NFR-SEC-02`, Security |

---

## 3. Approved Decision Records

### DEC-01: Technology Stack Selection
* **Context:** The project requires a robust full-stack architecture supporting relational integrity, decimal precision, and rapid test feedback.
* **Decision:** The team decided to adopt React 18 (Vite + TypeScript) for the frontend, Node.js with Express and TypeScript for the backend, and PostgreSQL 16 with Prisma ORM for persistence.
* **Rationale:** Direct continuation from TokTickIT Labs 1–4; ensures type safety across database queries and API models.

### DEC-02: Five Account Types & Instance Mapping Model
* **Context:** Theme 7 defines five fundamental account types (`Cash`, `Loan Taken`, `Loan Given`, `Income`, `Expense`).
* **Decision:** In the relational schema, the `Account` entity specifies an immutable `type` enum. For Sprint 1, reproducible instances are seeded (`Checking Bank` as Cash, `Visa Credit Card` as Loan Taken, `Salary` as Income, `Dining` and `Grocery` as Expense).
* **Rationale:** Establishes the full domain model upfront while allowing the Golden Journey to operate cleanly without requiring full custom account management workflows in Sprint 1.

### DEC-03: Tenancy Isolation & Cross-User Resource Concealment
* **Context:** Preventing unauthorized access to other users' financial records is a core requirement (`BR-01`).
* **Decision:** Whenever a user queries a financial resource by ID that does not belong to them, the server returns HTTP `404 Not Found` rather than `403 Forbidden`.
* **Rationale:** Prevents ID enumeration attacks by concealing whether the targeted private record exists.

### DEC-04: Administrative Separation & Financial Privacy Barrier
* **Context:** Theme 7 specifies an Administrator role while strictly barring administrators from accessing user financial records (`BR-10`).
* **Decision:** In Sprint 1, all financial endpoints strictly reject requests from users with `role === 'ADMIN'` with HTTP `403 Forbidden`. Advanced platform user administration and directory views are scheduled as product baseline capabilities in Sprint 2.
* **Rationale:** Enforces strict role boundary isolation at the backend routing level while keeping Sprint 1 focused on the Golden Journey.

### DEC-05: Split Allocation Balance Integrity Validation
* **Context:** Real-world purchases can be split across multiple categories (`BR-05`). The system must enforce mathematical balance (`BR-06`).
* **Decision:** In `POST /api/transactions/expense`, the backend arithmetically sums all allocation line amounts and verifies equality with `total_amount`. If the sum does not match, the entire transaction is rolled back and rejected with HTTP `422 Unprocessable Entity`.
* **Rationale:** Guarantees ledger balance integrity before any record is committed to the database.

### DEC-06: Debt Repayment Invariant & Expense Double-Count Exclusion
* **Context:** Paying off a credit card debt reduces bank balance and reduces debt (`BR-07`), but must not be recorded as a new expense (`BR-08`).
* **Decision:** Credit card repayment transactions are categorized as debt settlement events. The summary calculation engine includes only allocations pointing to `Expense` accounts in the expense total, ignoring repayments.
* **Rationale:** Preserves financial metric accuracy and prevents artificial inflation of user expenditures.

### DEC-07: Session Authentication Transport via HttpOnly Cookies
* **Context:** The application requires secure session credential transport resistant to client-side script interception (XSS).
* **Decision:** The team standardized on HttpOnly, SameSite=Lax cookies for JWT session transport. JWT is not returned in the JSON response body and client applications do not use localStorage or sessionStorage for token storage.
* **Rationale:** Eliminates token handling discrepancies between services and provides clean, browser-native credential handling.
