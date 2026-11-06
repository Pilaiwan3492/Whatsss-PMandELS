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
| **Part A** | **SRS and Product Scope (10 pts)**<br>Stakeholder context, actors, boundaries, full product FRs, BRs, NFRs, assumptions, and sprint allocations. | `docs/srs.md` | Actors (`USER`, `ADMIN`, `Unauthenticated Visitor`), `FR-01..FR-20`, `BR-01..BR-10`, `NFR-SEC-01..02`, `NFR-DATA-01` | Pages 3–8 |
| **Part B** | **Feature Inventory & Traceability (10 pts)**<br>Feature catalog mapped to baseline requirements and planned sprints. | `docs/features.md`<br>`docs/traceability.md` | Feature IDs: Sprint 1 (`F-01..F-09`), Later Sprints (`F-10..F-18`). Requirements-to-feature-to-sprint traceability matrix. | Pages 9–13 |
| **Part C** | **System-Level SDS (15 pts)**<br>Architecture, ER diagram, data dictionary, API approach, role matrix, and deployment plan. | `docs/system-sds.md` | Tech Stack (React + Express + PostgreSQL + Prisma), Entities (`User`, `Account`, `Transaction`, `AllocationLine`), Role Matrix (`USER` vs `ADMIN`) | Pages 14–22 |
| **Part D** | **Three-Sprint Plan (5 pts)**<br>Sprint goals, feature allocation, dependencies, and Golden Slice justification. | `docs/sprints/plan.md` | Sprint 1 (Foundational Golden Slice), Sprint 2 (Core Expansion Backlog), Sprint 3 (Hardening & Reporting) | Pages 23–25 |
| **Part E** | **Sprint 1 Engineering Contracts (20 pts)**<br>Feature SDS, UI/API specs, AC, STS, and Product Definition of Done. | `docs/sprints/sprint-1/feature-contracts.md`<br>`docs/sprints/sprint-1/test-specification.md`<br>`docs/sprints/sprint-1/dod.md` | Feature contracts for `F-01..F-09`, Acceptance Criteria (`AC-01..AC-XX`), Test Specifications (`TEST-01..TEST-XX`), Product DoD | Pages 26–36 |
| **Part F** | **Working Sprint 1 & Verification (20 pts)**<br>Execution evidence, test logs, TDD red/green excerpts, PR reviews, contributions, and limitations. | `docs/sprints/sprint-1/evidence-index.md`<br>`docs/contribution-log.md`<br>`docs/ai-use-declaration.md` | Golden Journey Evidence (Steps 1–5), Negative Rejection Demos (`BR-06`, `BR-09`, `BR-10`), Test suite execution logs, Git PR reviews, Contribution Log | Pages 37–48 |

*\* Note: Page numbers (Pages 3–48) are layout estimates and will be finalized upon assembling the compiled PDF for submission on LEB2.*
