# Product Definition of Done (DoD) — Sprint 1
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 1 (Part E: Definition of Done)  
> **Status:** Authoritative Baseline (Frozen)  

---

## 1. Overview & Purpose

The **Product Definition of Done (DoD)** establishes the non-negotiable quality and completion criteria that every Sprint 1 feature (`F-01` to `F-09`) and the integrated Sprint 1 release on `main` must satisfy before being considered complete and accepted for Deliverable 1 assessment.

---

## 2. Sprint 1 Definition of Done Checklist

A feature or release candidate is declared **DONE** only when all of the following criteria are supported by concrete execution evidence:

### 2.1 Functional & Domain Integrity
- [ ] **Golden Domain Journey Complete:** User can perform the 4 core steps (Opening balance $\rightarrow$ Salary inflow $\rightarrow$ Split CC purchase $\rightarrow$ CC repayment) and retrieve exact expected final figures.
- [ ] **Business Rules Enforced:**
  - `BR-01`: Tenancy isolation verified (cross-user access returns `404 Not Found`).
  - `BR-02`: Opening balance excluded from income and expense summaries.
  - `BR-03`: Income increases cash balance and income summary.
  - `BR-04`: Credit purchase increases credit card debt and expense summary.
  - `BR-05` & `BR-06`: Split allocations enforced; unmatched sums rejected with `422 Unprocessable Entity`.
  - `BR-07` & `BR-08`: Debt repayment decreases cash and debt; strictly excluded from expense summary.
  - `BR-09`: Unauthenticated requests rejected with `401 Unauthorized`.
  - `BR-10`: ADMIN role blocked from viewing/modifying user financial data with `403 Forbidden`.

### 2.2 Relational Data Persistence & Durability
- [ ] Data models adhere to PostgreSQL schema via Prisma ORM with strict relational constraints.
- [ ] Deterministic seed script (`npx prisma db seed`) executes cleanly and idempotently.
- [ ] Data persists and remains verifiable across backend server process restarts (`NFR-DATA-01`).

### 2.3 Automated Testing & TDD Evidence
- [ ] All planned automated test cases (`TEST-AUTH-01..05`, `TEST-SEC-01..03`, `TEST-OPEN-01..04`, `TEST-INC-01..02`, `TEST-EXP-01..02`, `TEST-ALLOC-01..02`, `TEST-REPAY-01..06`, `TEST-BAL-01`, `TEST-HIST-01`, `TEST-PERSIST-01`, `TEST-E2E-01`) pass with zero failures and zero skipped tests.
- [ ] Meaningful negative and boundary tests are executed (e.g., allocation sum mismatch, unauthenticated access, admin financial intrusion).
- [ ] TDD red/green commit history or test excerpt evidence is preserved for core rule validation (`BR-06`).

### 2.4 Code Quality, Architecture & Build
- [ ] Code is formatted and passes TypeScript compilation (`npm run build`) without errors.
- [ ] No hardcoded secrets, database passwords, or production credentials exist in version control.
- [ ] Environment configuration is externalized via `.env.example`.

### 2.5 Git Workflow & Teammate Peer Review
- [ ] Features developed on bounded branches branching from sprint staging.
- [ ] Pull Requests opened with completed PR template, linked to relevant Issues and Feature Contracts.
- [ ] Teammate code review completed with substantive feedback or inspection finding recorded (Course Rule: Authors do NOT approve their own PRs).
- [ ] Integrated release candidate merged into `main` and tagged with `v0.1.0-sprint1`.

### 2.6 Deliverable Documentation & Reproduction
- [ ] Deliverable documentation (Parts A through F) updated and consistent with released behavior.
- [ ] README setup instructions verified locally on a fresh clone.
