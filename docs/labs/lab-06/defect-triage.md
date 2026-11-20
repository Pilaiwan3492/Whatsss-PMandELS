# Lab 6 — Part C: Defect Reporting & Triage Register

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Lab:** Lab 6 — Independent User Acceptance Testing & Defect Management  
> **Product Team:** Whatsss — Theme 7 (Personal Money and Expense Logging System)  
> **Partner Testing Team:** SingSlot — Karaoke Room Reservation & Management System  
> **Authors:** Pilaiwan Churdchu (67070503492), Aphichaya Klinhual (67070503447)  

---

## 1. Outgoing Defect Reports (Findings on Partner App: SingSlot)

During the independent user acceptance testing of **SingSlot Sprint 1** (`singslot-00004-6mv`, commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`), our team executed all 5 agreed test cases (`UAT-01` to `UAT-05`).

### 1.1 Outgoing Findings Summary

| Finding ID | Linked Case | Observed Anomaly / Scope | Severity | Status | Disposition |
|:---:|:---:|---|:---:|:---:|---|
| *N/A* | `UAT-01`..`05` | **Zero Defects Found.** All 5 UAT cases passed completely without discrepancy against agreed Sprint 1 requirements (`FR-01`..`06`, `BR-01`..`08`). | None | Verified PASS | No outgoing defect report filed. Application meets Sprint 1 acceptance criteria. |

* **Audit Notes:**
  1. Concurrency and slot collision lock (`BR-01`, `BR-02`) reliably rejected overlapping reservations with HTTP 409 `SLOT_CONFLICT`.
  2. Capacity limits (`BR-05`), operating hour boundaries (`BR-03`), and past slot rejections (`BR-04`) were strictly enforced across both client UI controls and backend API endpoints.
  3. Strict customer data isolation (`BR-07`) and role-based staff endpoint protection (`BR-08`) returned HTTP 403 `FORBIDDEN` without information leakage.
  4. Relational database persistence across browser sessions and cross-role state synchronization between Customer and Staff views were verified.

---

## 2. Defect Triage & Severity Classification Framework

To ensure consistent, objective, and traceable defect governance on our own product (**Whatsss**), all findings received from the UAT Team or identified during verification are evaluated against the following criteria:

### 2.1 Severity Levels (Impact on User & Business Invariants)
* **Critical:** Complete system failure, crash, database corruption, or total blockage of the core domain journey with no workaround (blocks Sprint 1 acceptance).
* **Major:** Severe violation of core business rules (e.g., negative balance without overdraft, split allocation mismatch, unauthorized cross-user financial ledger disclosure) (blocks Sprint 1 acceptance).
* **Minor:** Cosmetic issue, styling glitch, minor label typo, or non-blocking UX discrepancy that does not compromise financial ledger invariants or core operations.

### 2.2 Disposition Classifications
* **Accepted Defect:** Confirmed contradiction between observed behavior and agreed Sprint 1 specification/contracts (`docs/srs.md`, `feature-contracts.md`). Must be corrected via RED/GREEN TDD and redeployed.
* **Duplicate:** Report describes a known issue already documented and tracked under an earlier Issue ID.
* **Not-a-Defect:** Reported behavior conforms to the agreed Sprint 1 specification, represents expected security denial (e.g., HTTP 403 for Admin ledger access), or was caused by invalid test preconditions.
* **Enhancement:** Feature or improvement outside the agreed Sprint 1 scope (deferred to Sprint 2 or 3).

---

## 3. Incoming Findings Triage Register (Whatsss Product)

The register below tracks all findings reported against the Whatsss application (`https://whatsss-sipqw4logq-as.a.run.app`, revision `whatsss-00006-9j1`, baseline tag `v0.1.0-sprint1`).

| Finding ID | Reporter / Source | Linked Case / Spec | Description & Preconditions | Expected Behavior | Observed Behavior | Classification | Severity | Assigned Owner | Disposition & Resolution Status |
|:---:|:---:|:---:|---|---|---|:---:|:---:|:---:|---|
| **DEF-01** | UAT Team / Partner | `TC-UAT-01`<br>`BR-04` | Boundary test on expense split allocation decimal cents precision | Allocation sum must strictly equal total expense amount to 2 decimal places | Balanced allocation correctly accepted (`200 OK`) | **Not-a-Defect** | None | Pilaiwan | Conforms to `BR-04` and `WP-04` specification. |
| **DEF-02** | UAT Team / Partner | `TC-UAT-03`<br>`BR-10` | Administrator attempts to view user transactions and receives HTTP 403 | Financial privacy isolation denies Admin access | Redirects to `/access-denied` with HTTP 403 Forbidden | **Not-a-Defect** | None | Aphichaya | Intended security behavior per `BR-10` and `NFR-SEC-02`. |
| **DEF-03** | Controlled Exercise<br>*(Sec 3.5)* | `WP-04`<br>`BR-04` | Input validation edge case for whitespace trimming on transaction note | Transaction note with leading/trailing spaces should be normalized | Raw whitespace preserved in ledger description | **Accepted Defect** *(Controlled)* | Minor | Aphichaya | Corrected via TDD RED/GREEN on fix branch, PR reviewed, and redeployed. |

---

## 4. Defect Resolution Lifecycle Workflow

For every **Accepted Defect**, our engineering team executes the following mandatory quality gates:
1. **RED:** Add an automated reproduction test asserting the expected behavior; execute against defective implementation to prove failure.
2. **GREEN:** Apply minimal code fix to satisfy the failing test and verify all existing unit/integration regression suites pass.
3. **PEER REVIEW:** Submit a Pull Request from a dedicated fix branch (`fix/<issue-id>-...`) into `staging-lab5`, reviewed and approved by the partner team member (Zero Self-Merge R-09).
4. **DEPLOY:** Automated CI/CD pipeline builds Docker container, pushes to Artifact Registry, runs migration job, deploys new revision to Cloud Run, and executes post-deployment smoke tests.
5. **INDEPENDENT RETEST:** Hand off corrected revision to the UAT Team for independent re-test and closure.
