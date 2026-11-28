# Project Deliverable 2 Report — Sprint 2 & Sprint 3 Release Candidate (`v0.2.0-sprint2-rc`)
## Project: Whatsss — Personal Finance Management Web Application

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents  
> **Semester:** 1/2026 | **Project Theme:** Theme 7 — Personal Money and Expense Logging System  
> **Deliverable:** Project Deliverable 2 (Parts C, D, and E)  
> **Release Candidate Tag:** `v0.2.0-sprint2-rc`  
> **Release Commit (`main`):** `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` ([PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67))  
> **Live Cloud Run URL:** https://whatsss-sipqw4logq-as.a.run.app  
> **Release & Deployment:** Completed (`467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade`, `v0.2.0-sprint2-rc`, [Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583), [Deploy demo #13](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654))  
> **Automated Regression:** Passed (`548/548` backend incl. Live PG16, `104/104` frontend)  
> **Unauthenticated Smoke Checks:** Passed  
> **Authenticated Live Demonstrations:** Pending  
> **Overall Part E:** **Pending** *(awaiting authenticated live demonstrations & screenshot/PDF bundle; Markdown is the repository source and no PDF has been generated yet)*

---

## 1. Release & Deployment Evidence

| Artifact / Check | Identifier / Reference | Verified Result |
|---|---|---|
| **Release SHA (`main`)** | `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` | Merged from `staging-lab5` via [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67) |
| **Release Tag** | `v0.2.0-sprint2-rc` | Points to `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` |
| **Main CI (`main`)** | [Run #315 (`46151836583`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583) | `completed / success` (`Backend Test & Build`, `Frontend Test & Build`, `Docker Container Build & Probe`, `Secret & Credential Leak Scan`, `Check C-03 Clean Clone Build & Run Verification`) |
| **GCP Cloud Run Deploy** | [Deploy demo #13 (`46151836654`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654) | `completed / success` (`Test & Build Gate / test-and-docker`, `Deploy to Cloud Run`) |
| **WP-12 Implementation SHA** | `e23416a9fd3f3d8326e6e60799fb2bed9e3c5c2f` | Verified by [Main CI #311 (`46109538015`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46109538015) & [C-01 #165 (`46109542107`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46109542107) |
| **Prior Doc Sync SHA (`55fe673`)** | `55fe67399522694f57ef2697cb3f701edb4a3594` | Verified by [Main CI #312 (`46110225554`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46110225554) & [C-01 #166 (`46110231193`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46110231193) |
| **WP-12 Teammate Review (PR #66)** | `@Apichaya251400` | `APPROVED` at `2026-11-28T13:38:40Z` on `de71fd0c62bb9e465cade68649fd16592e2362a0` |
| **Part E Doc PR (#68) Prior Heads** | `9fdae8be25e2af6482119d5051f4c04a0a2bbb14` / `188be001d1f455bab8a8eafad46c9fe2d1324e8b` | Verified by [C-01 #169 (`46152652691`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46152652691) & [C-01 #170 (`46153460161`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46153460161) (`completed / success`) |

---

## 2. Sprint 1–3 Feature Completion Summary

| Work Package | Features | Requirements | Status on `main` (`467eb4c`) |
|---|---|---|---|
| **Sprint 1 + Lab 6/7** | `F-01`..`F-09` | `FR-01`..`FR-11`, `BR-01`..`BR-10` | **Accepted & Preserved** (`v0.1.0-sprint1` + `9054b45`) |
| **`WP-08`** ([#56](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/56) / [PR #62](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/62)) | `F-10` Custom Accounts, `F-11` Cash Transfers | `FR-12`, `FR-13`, `BR-02` | **Released & Deployed (`467eb4c`)** |
| **`WP-09`** ([#57](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/57) / [PR #65](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/65)) | `F-12` Loan Given/Recovery, `F-13` General Loan Taken/Repayment | `FR-14`, `FR-15`, `BR-08` | **Released & Deployed (`467eb4c`)** |
| **`WP-10`** ([#58](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/58) / [PR #63](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/63)) | `F-14` Favorite & Duplicate, `F-15` Search & Filtering | `FR-16`, `FR-17`, `FR-18` | **Released & Deployed (`467eb4c`)** |
| **`WP-11`** ([#59](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/59) / [PR #64](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/64)) | `F-16` Transaction Corrections, `F-19` Admin User Governance | `FR-03`, `FR-04`, `FR-19`, `BR-10` | **Released & Deployed (`467eb4c`)** |
| **`WP-12`** ([#60](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/60) / [PR #66](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/66), [PR #67](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/67)) | `F-17` Category Spending Reports, `F-18` Audit History & Archival | `FR-20`, `FR-21`, `BR-01`, `BR-02`, `BR-08`, `BR-10` | **Released & Deployed (`467eb4c`)** |

---

## 3. Automated Regression & Test Evidence

- **Backend Full Suite (CI Live PostgreSQL 16 `whatsss_test` + Mock API + Unit):**
  - **42/42 test files, 548/548 tests passed (`0` failed, `0` skipped in CI)** and TypeScript build (`tsc`) clean on Release SHA `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` ([Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583)).
  - Local non-DB execution (`npx vitest run --pool=forks`): `42/42` files, `458 passed | 90 skipped (548)` (90 Live PG16 tests skipped locally when PostgreSQL is offline, executed in CI above).
- **Frontend Full Suite:**
  - **10/10 test files, 104/104 tests passed (`0` failed, `0` skipped)** and production build (`tsc -b && vite build`) clean on `e23416a9fd3f3d8326e6e60799fb2bed9e3c5c2f` and `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` ([Main CI #315](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836583)).
- **Key `WP-12` (`F-17` & `F-18`) Regression Coverage:**
  - `reports-categories.test.ts` (`5/5`, incl. `TEST-REP-CAT-01B` `ROUND_HALF_UP` half-cent tie)
  - `audit-history.test.ts` (`4/4`, incl. `TEST-AUDIT-01B` `BIGINT` decimal-string precision above `Number.MAX_SAFE_INTEGER`)
  - `account-archive.test.ts` (`2/2`), `archived-guards.test.ts` (`1/1`)
  - `db-reports-audit-archive.test.ts` (`5/5` in CI Live PG16, incl. `TEST-AUDIT-03` `loan-recovery`/`loan-repayment` archived guards, `TEST-AUDIT-05` DB immutability triggers, and `TEST-FAV-CORR-CONC-01`)
  - `DashboardPage.test.tsx` (`11/11`, incl. `TEST-UI-REP-CAT-01`..`04`), `AccountListPage.test.tsx` (`13/13`), `TransactionHistoryPage.test.tsx` (`16/16`, incl. `TEST-UI-AUDIT-01`..`04`)

---

## 4. Live Cloud Run Smoke Checks & Pending Evidence

### Verified Live Checks (`https://whatsss-sipqw4logq-as.a.run.app`)
Executed against the live Cloud Run service after [Deploy demo #13](https://github.com/Pilaiwan3492/Whatsss-PMandELS/actions/runs/46151836654):

| Evidence ID | Date / Time (UTC) | Action / Command | Expected Result | Actual Result | Endpoint / UI | Release SHA |
|---|---|---|---|---|---|---|
| `SMOKE-LIVE-01` | `2026-11-28T13:59:58Z` | `Invoke-WebRequest -Uri "https://whatsss-sipqw4logq-as.a.run.app/"` | `HTTP 200 OK`, `text/html`, SPA `<div id="root">` | `HTTP 200 OK`, `text/html; charset=UTF-8`, `hasRootDiv=True` | `GET /` (SPA) | `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` |
| `SMOKE-LIVE-02` | `2026-11-28T13:59:49Z` | `Invoke-RestMethod -Uri "https://whatsss-sipqw4logq-as.a.run.app/api/health"` | `HTTP 200 OK`, `status: "ok"`, matching `commitSha` | `HTTP 200 OK`, `{"status":"ok","commitSha":"467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade"}` | `GET /api/health` | `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` |
| `SMOKE-LIVE-03` | `2026-11-28T14:00:14Z` | `curl.exe -s "https://whatsss-sipqw4logq-as.a.run.app/api/reports/categories"` (unauth) | `HTTP 401 UNAUTHORIZED` (`Authentication required`) | `HTTP 401`, `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}` | `GET /api/reports/categories` | `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` |
| `SMOKE-LIVE-04` | `2026-11-28T14:00:14Z` | `curl.exe -s "https://whatsss-sipqw4logq-as.a.run.app/api/transactions/00000000-0000-0000-0000-000000000000/audit-history"` (unauth) | `HTTP 401 UNAUTHORIZED` (`Authentication required`) | `HTTP 401`, `{"success":false,"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}` | `GET /api/transactions/:id/audit-history` | `467eb4c8a7155c822fbaab8e1b4a52f9d5ae3ade` |

### Explicitly Pending Live Demonstration Items (Issue #60)
- **`DEMO-LIVE-01` (Sprint 1 Golden Journey Live Continuity):** Authenticated UI/API continuity re-verification on `https://whatsss-sipqw4logq-as.a.run.app` — **Pending** (credentials/interactive browser run not executed in this session).
- **`DEMO-LIVE-02` (Authenticated Sprint 2/3 Feature Demonstrations `F-10`..`F-19`):** Live authenticated walkthroughs of custom accounts, transfers, loans, favorites/search, corrections + audit history, account archival, category spending reports, and admin governance — **Pending**.
- **`DEMO-LIVE-03` (UI/API Screenshots & Final PDF Export):** Screenshot bundle and PDF export for final course submission — **Pending** *(Markdown is the repository source; no PDF has been generated yet)*.

---

## 5. Companion Part D & Verification Artifacts
- [SRS (`docs/srs.md`)](../../srs.md)
- [Feature Inventory (`docs/features.md`)](../../features.md)
- [System SDS (`docs/system-sds.md`)](../../system-sds.md)
- [Requirements Traceability Matrix (`docs/traceability.md`)](../../traceability.md)
- [Sprint 2 & 3 Test Specification (`docs/sprints/sprint-2/test-specification.md`)](./test-specification.md)
- [Sprint 3 Feature Contracts (`docs/sprints/sprint-3/feature-contracts.md`)](../sprint-3/feature-contracts.md)
