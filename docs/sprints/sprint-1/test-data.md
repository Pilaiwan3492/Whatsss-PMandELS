# Sprint 1 Test Data & Environment Setup Specification

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Project:** Whatsss — Personal Finance Management Web Application (Theme 7)  
> **Deliverable:** Project Deliverable 1 (Test Environment & Seed Data Specification)  
> **Status:** Authoritative Baseline (Frozen)  

---

## 1. Purpose

This document specifies the deterministic seed data and local test environment setup required for Sprint 1 development, automated test execution, and rubric evaluation. Seed data provides reproducible accounts and user profiles to demonstrate the Golden Domain Journey without requiring full custom account management workflows.

---

## 2. Seeded Test Users

All user passwords are encrypted using salted one-way hashing (`bcrypt` work factor $\ge 10$) prior to persistence (`NFR-SEC-01`).

| Username | Role | Primary Verification Purpose | Initial Status |
|---|:---:|---|:---:|
| `user_demo` | `USER` | Primary subject for Golden Domain Journey execution (Steps 1–5). | `Active` |
| `user_other` | `USER` | Secondary user employed to verify cross-tenant data isolation (`BR-01`). | `Active` |
| `admin_demo` | `ADMIN` | Administrative user employed to verify role separation and financial privacy barrier (`BR-10`). | `Active` |

---

## 3. Seeded Account Instances (Theme 7 Domain Mapping)

In accordance with Theme 7 specifications, accounts belong to one of five immutable types. The following accounts are pre-seeded for `user_demo`:

| Account Name | Account Type | Description & Domain Role | Initial Balance | Initial Lock Status |
|---|:---:|---|:---:|:---:|
| **Checking Bank** | `CASH` | Primary liquid account used to deposit salary and fund credit card debt repayment. | `0.00 THB` | Unlocked (`false`) |
| **Visa Credit Card** | `LOAN_TAKEN` | Primary liability account used to record charged purchases and track outstanding debt. | `0.00 THB` | Unlocked (`false`) |
| **Salary** | `INCOME` | Income categorization account for incoming salary payments. | `0.00 THB` | N/A (Flow Account) |
| **Dining** | `EXPENSE` | Expense categorization account for restaurant and meal expenditures. | `0.00 THB` | N/A (Flow Account) |
| **Grocery** | `EXPENSE` | Expense categorization account for supermarket and household expenditures. | `0.00 THB` | N/A (Flow Account) |

*Note: Identical matching accounts are seeded for `user_other` under separate ownership IDs to facilitate automated cross-tenant isolation tests (`TEST-SEC-01`).*

---

## 4. Database Setup & Seed Execution Procedure

The seed procedure is automated via the Prisma seed script located at `server/prisma/seed.ts`.

### Execution Command:
```bash
# From the server directory:
npx prisma migrate dev
npx prisma db seed
```

### Deterministic Seed Invariants:
1. Re-running the seed script resets or upserts the baseline users and accounts deterministically.
2. All financial records are scoped strictly to their respective owner's `user_id`.
3. Initial opening balances for all accounts start at `0.00 THB` until the user performs the opening balance journey step (`F-03`).
