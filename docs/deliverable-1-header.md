# CPE 334 Project Deliverable 1: Engineering Baseline and Working Sprint 1
## Document Preamble, Team Identification & Navigation Index

**Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
**Semester:** 1/2026 | Due Date: 8 November 2026 at 23:59 | Total: 80 Points (8% of Grade)  
**Submission Portal:** LEB2 (Self-contained PDF per Team)  

---

## 1. Project Identification & Submission Metadata

| Attribute | Details |
|---|---|
| **Product Name** | **Whatsss** — Personal Finance Management Web Application |
| **Assigned Theme** | **Theme 7: Personal Money and Expense Logging System** |
| **Repository URL** | [https://github.com/Pilaiwan3492/Whatsss-PMandELS](https://github.com/Pilaiwan3492/Whatsss-PMandELS) |
| **Submitted Release Tag** | `v0.1.0-sprint1` *(To be tagged upon final Sprint 1 merge into main)* |
| **Submitted Commit Hash** | `[To be recorded upon final Sprint 1 release commit on main]` |
| **Team Member 1** | Pilaiwan Churdchu (Student ID: 67070503492) |
| **Team Member 2** | Aphichaya Klinhual (Student ID: 67070503447) |

---

## 2. Deliverable Navigation Table (Section 4.3 Requirement)

The table below maps the rubric parts (A through F) to their respective repository documents, traceable IDs, and report sections.

| Rubric Part | Description & Topic | Target Repository Artifact | Key Traceable IDs Included | Target PDF Page Estimates* |
|---|---|---|---|:---:|
| **Part A** | **SRS and Product Scope (10 pts)**<br>Stakeholder context, actors, boundaries, full product FRs, BRs, NFRs, assumptions, and sprint allocations. | `docs/srs.md` | Actors (`USER`, `ADMIN`, `Unauthenticated Visitor`), Sprint 1 (`FR-01..02`, `FR-05..11`), Later Sprints (`FR-03..04`, `FR-12..20`), `BR-01..10`, `NFR-SEC-01..02`, `NFR-DATA-01` | Pages 3–8 |
| **Part B** | **Feature Inventory & Traceability (10 pts)**<br>Feature catalog mapped to baseline requirements and planned sprints. | `docs/features.md`<br>`docs/traceability.md` | Feature IDs: Sprint 1 (`F-01..F-09`), Later Sprints (`F-10..F-18`). Requirements-to-feature-to-sprint traceability matrix. | Pages 9–13 |
| **Part C** | **System-Level SDS (15 pts)**<br>Architecture, ER diagram, data dictionary, API approach, role matrix, and deployment plan. | `docs/system-sds.md` | Tech Stack (React + Express + PostgreSQL + Prisma), Entities (`User`, `Account`, `Transaction`, `AllocationLine`), Role Matrix (`USER` vs `ADMIN`), HttpOnly Cookie Session | Pages 14–22 |
| **Part D** | **Three-Sprint Plan (5 pts)**<br>Sprint goals, feature allocation, dependencies, and Golden Slice justification. | `docs/sprints/plan.md` | Sprint 1 (Foundational Golden Slice), Sprint 2 (Core Expansion Backlog), Sprint 3 (Hardening & Reporting) | Pages 23–25 |
| **Part E** | **Sprint 1 Engineering Contracts (20 pts)**<br>Feature SDS, UI/API specs, AC, STS, and Product Definition of Done. | `docs/sprints/sprint-1/feature-contracts.md`<br>`docs/sprints/sprint-1/test-specification.md`<br>`docs/sprints/sprint-1/dod.md`<br>`docs/sprints/sprint-1/issue-backlog.md` | Feature contracts for `F-01..F-09`, Work Packages (`WP-01..WP-06`), Acceptance Criteria (`AC-01..AC-09`), Test Specifications (`TEST-AUTH`, `TEST-SEC`, `TEST-OPEN`, `TEST-INC`, `TEST-EXP`, `TEST-ALLOC`, `TEST-REPAY`, `TEST-BAL`, `TEST-HIST`, `TEST-PERSIST`, `TEST-E2E`), Product DoD | Pages 26–36 |
| **Part F** | **Working Sprint 1 & Verification (20 pts)**<br>Execution evidence, test logs, TDD red/green excerpts, PR reviews, contributions, and limitations. | `docs/sprints/sprint-1/evidence-index.md`<br>`docs/contribution-log.md`<br>`docs/ai-use-declaration.md` | Golden Journey Evidence (Steps 1–5 across 3 transactions), Negative Rejection Demos (`BR-06`, `BR-09`, `BR-10`), Test suite execution logs, Git PR reviews, Contribution Log | Pages 37–48 |

*\* Note: Page numbers (Pages 3–48) are layout estimates and will be finalized upon assembling the compiled PDF for submission on LEB2.*

---

## 3. Planned Local Setup & Test Reproduction Procedure

### Step 1 — Start PostgreSQL via Docker Compose
```bash
docker compose up -d
docker compose ps
```

### Step 2 — Backend Service Setup (Terminal 1)
```bash
cd server
npm install
npx prisma migrate dev
npx prisma db seed
npm test
npm run dev
# Backend listening at http://localhost:5000
```

### Step 3 — Frontend Client Setup (Terminal 2)
```bash
cd client
npm install
npm run dev
# Frontend listening at http://localhost:5173
```

### Step 4 — Golden Domain Journey Verification Sequence (3 Transactions)
1. Login as `user_demo` via HttpOnly cookie session.
2. Query current user identity (`GET /api/auth/me`).
3. Set opening balance for Checking Bank Account (`10,000.00 THB`, `BR-02`).
4. Record salary received (Transaction 1: `20,000.00 THB` to `Salary` income account).
5. Record split credit card purchase (Transaction 2: `3,000.00 THB` across `Dining` `1,000.00` and `Grocery` `2,000.00`, `BR-05`, `BR-06`).
6. Record credit card debt repayment (Transaction 3: `3,000.00 THB` from Bank to Credit Card, `BR-07`, `BR-08`).
7. Verify final balances: Bank = `27,000.00 THB`, Debt = `0.00 THB`, Income = `20,000.00 THB`, Expense = `3,000.00 THB`, and exactly 3 transactions with 4 allocation lines in history.
8. Login as `admin_demo`.
9. Verify ADMIN access to financial endpoints is rejected with `403 Forbidden` (`BR-10`).
10. Verify cross-user access returns `404 Not Found` (`BR-01`) and unauthenticated request returns `401 Unauthorized` (`BR-09`).
