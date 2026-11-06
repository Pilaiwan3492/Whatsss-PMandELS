# Whatsss — Personal Finance Management Web Application

> **CPE 334 Introduction to Software Engineering in the Age of AI Agents**  
> Semester 1/2026 | Group Project  
> **Assigned Theme:** Theme 7 — Personal Money and Expense Logging System  

---

## 👥 Development Team (Pair Arrangement)
* **Pilaiwan Churdchu** (Student ID: 67070503492)
* **Aphichaya Klinhual** (Student ID: 67070503447)

---

## 📌 Project Overview

**Whatsss** is a personal finance management web application engineered for multi-user environments. Each user maintains complete privacy over their personal ledgers. The platform supports five distinct account categories (Cash, Loan Taken, Loan Given, Income, and Expense), enforces mathematical balance validation via multi-line allocation splits, and strictly separates platform administration from private user financial data.

### Frozen Engineering Baseline
* **Product Scope:** Covers the complete Theme 7 Personal Money and Expense Logging System specification across a three-sprint development lifecycle.
* **Sprint 1 Implementation Scope:** Restricted strictly to the foundational **Golden Domain Journey** (`F-01` to `F-09`) with authentication, backend authorization, persistence, and automated verification.

---

## 🎯 Sprint 1 Goal & Golden Domain Journey

The goal of Sprint 1 is to deliver a verified, runnable vertical slice that executes the complete Theme 7 domain journey through UI, API, and database:

1. **Opening Balance:** Record an opening balance for a Checking Bank Account (`10,000.00 THB`).
2. **Salary Inflow:** Record salary received into the bank account (`20,000.00 THB` to `Salary` income).
3. **Credit Card Purchase:** Record a credit card purchase (`3,000.00 THB`) with split allocations across `Dining` (`1,000.00 THB`) and `Grocery` (`2,000.00 THB`).
4. **Credit Card Repayment:** Record full credit card debt repayment (`3,000.00 THB`) paid from the bank account.
5. **Expected Verification Outcome:**
   * **Bank Balance:** `27,000.00 THB`
   * **Credit Card Debt:** `0.00 THB`
   * **Income Summary:** `20,000.00 THB`
   * **Expense Summary:** `3,000.00 THB` (Repayment is strictly excluded from Expense per `BR-08`)
   * **Category Breakdown:** Dining `1,000.00 THB`, Grocery `2,000.00 THB`
   * **Security:** Unauthenticated requests rejected (`401`); ADMIN barred from user financial data (`403`); cross-tenant access concealed (`404`).

---

## 🛠 Technology Stack (Team Decision)

* **Frontend:** React 18, Vite, TypeScript, Bootstrap 5
* **Backend:** Node.js, Express.js, TypeScript
* **Database & ORM:** PostgreSQL 16, Prisma ORM
* **Automated Testing Suite:** Vitest, Supertest
* **Containerization:** Docker & Docker Compose (PostgreSQL local service; Cloud deployment planned for Lab 5)

---

## 📁 Repository Structure

```text
Whatsss-PMandELS/
├── README.md                          # Authoritative Project Guide & Baseline
├── .gitignore                         # Git exclusion rules
├── .env.example                       # Local environment configuration template
├── docker-compose.yml                 # Local PostgreSQL 16 container definition
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature.md                 # GitHub Issue template linked to FR/AC/DoD
│   │   └── documentation.md           # Template for engineering doc updates
│   └── PULL_REQUEST_TEMPLATE.md       # Enforces teammate substantive review & test evidence
├── docs/                              # Engineering Deliverable Documentation
│   ├── deliverable-1-header.md        # Deliverable 1 Preamble & Navigation Index
│   ├── srs.md                         # Part A: Software Requirements Specification
│   ├── features.md                    # Part B: Feature Inventory (F-01..F-18)
│   ├── traceability.md                # Part B: Requirements-to-Feature-to-Sprint Matrix
│   ├── system-sds.md                  # Part C: System-Level Software Design Specification
│   ├── decision-log.md                # Architecture & Engineering Decision Records
│   ├── contribution-log.md            # Dual-student contribution and review log
│   ├── ai-use-declaration.md          # Section 8.4 AI Usage Declaration
│   └── sprints/
│       ├── plan.md                    # Part D: Three-Sprint Product Roadmap
│       └── sprint-1/
│           ├── scope.md               # Sprint 1 Frozen Scope Agreement
│           ├── feature-contracts.md   # Part E: Feature SDS & API Contracts (F-01..F-09)
│           ├── test-data.md           # Seed Data & Environment Setup Specification
│           ├── test-specification.md  # Software Test Specification (STS)
│           ├── dod.md                 # Product Definition of Done
│           └── evidence-index.md      # Part F: Test logs, commit evidence & results
├── client/                            # [Sprint 1 Frontend] React + Vite + TypeScript
└── server/                            # [Sprint 1 Backend] Express + TypeScript + Prisma
```

---

## 🚀 Local Setup & Development Guide

### 1. Prerequisites
* **Node.js**: v20 LTS or higher (`node -v`)
* **npm**: v10 or higher (`npm -v`)
* **Docker & Docker Compose**: Docker Desktop installed and running (`docker compose version`)

### 2. Configure Environment Variables
```bash
# Clone the repository
git clone https://github.com/Pilaiwan3492/Whatsss-PMandELS.git
cd Whatsss-PMandELS

# Copy local environment template
cp .env.example .env
```

### 3. Start Local PostgreSQL Database
```bash
# Start PostgreSQL service in background
docker compose up -d

# Verify container health
docker compose ps
```

### 4. Development Workspaces (Planned for Feature Implementation)
* **Backend:** Located in `server/` (runs on port 5000)
* **Frontend:** Located in `client/` (runs on port 5173)
