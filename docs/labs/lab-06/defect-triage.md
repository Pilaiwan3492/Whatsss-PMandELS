# Lab 6 — Part C: Defect Reporting & Triage Register

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Lab:** Lab 6 — Independent User Acceptance Testing & Defect Management  
> **Product Team:** Whatsss — Theme 7 (Personal Money and Expense Logging System)  
> **Partner Testing Team:** SingSlot — Karaoke Room Reservation & Management System  
> **Authors:** Pilaiwan Churdchu (`@Pilaiwan3492`), Aphichaya Klinhual (`@Apichaya251400`)  
> **Linked Tracking Issue:** [Issue #38 (`ISSUE 17`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38)

---

## 1. Defect Triage & Governance Framework

To establish a traceable, reasoned disposition for all findings, findings are classified under the following strict taxonomy:

### 1.1 Classification Taxonomies
* **Accepted Defect:** Confirmed contradiction between observed behavior and the agreed Sprint 1 specification/contracts (`docs/srs.md`, `docs/sprints/sprint-1/feature-contracts.md`). Release-blocking defects (Critical/Major) require an automated reproducing test (**RED**), code correction (**GREEN**), PR review, CI verification, and redeployment for retest.
* **Duplicate:** Finding describes an identical anomaly already tracked under an earlier Issue ID.
* **Not-a-Defect:** Observed behavior conforms to the agreed Sprint 1 specification, expected error handling, or security access restriction (e.g., HTTP 403 Forbidden for Admin ledger access).
* **Enhancement:** Suggested feature or scope addition beyond the agreed Sprint 1 boundary (deferred to Sprint 2/3).

### 1.2 Severity Levels
* **Critical:** Application crash, unhandled 500 error, data corruption, or total blockage of the core domain journey with zero workaround (blocks Sprint 1 release).
* **Major:** Severe business rule violation or security vulnerability (e.g., double booking permitted, unauthorized financial ledger exposure, decimal allocation mismatch) (blocks Sprint 1 release).
* **Minor:** Non-blocking discrepancy, cosmetic or styling issue, or edge-case input handling that does not break ledger invariants.

---

## 2. Outgoing Findings Register (Partner Application: SingSlot)

During the independent user acceptance testing of **SingSlot Sprint 1** (`singslot-00004-6mv`, commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`), the Whatsss team executed all 5 agreed test cases (`UAT-01` to `UAT-05`).

| Finding ID | Tested Case | Subsystem / Endpoint | Observed Behavior | Specification Invariant | Severity | Disposition |
|:---:|:---:|---|---|---|:---:|---|
| *None* | `UAT-01`..`05` | Online Booking, Matrix, Access Control | All 5 cases passed with full contract compliance | `FR-01`..`06`, `BR-01`..`08` | None | **Zero Outgoing Defects Found.** All agreed Sprint 1 requirements verified. |

* **Audit Summary:**
  1. Concurrency and slot collision lock (`BR-01`, `BR-02`) reliably rejected overlapping reservations with HTTP 409 `SLOT_CONFLICT`.
  2. Capacity limits (`BR-05`), operating hour boundaries (`BR-03`), and past slot rejections (`BR-04`) were strictly enforced across both client UI controls and backend API endpoints.
  3. Strict customer data isolation (`BR-07`) and role-based staff endpoint protection (`BR-08`) returned HTTP 403 `FORBIDDEN` without information leakage.
  4. Relational database persistence across browser sessions and cross-role state synchronization between Customer and Staff views were verified.

---

## 3. Incoming Findings Register (Whatsss Application)

This register separates findings identified through internal audit and handoff verification from findings formally reported by the partner testing team. Each finding must retain its actual source to ensure accurate traceability and avoid misrepresenting internal observations as partner-reported defects.

### 3.1 Internal Audit and Handoff Verification Findings

The following findings were identified through our team's internal audit and handoff verification of Whatsss. They were not submitted as formal defect reports by the SingSlot UAT Team.

| Finding ID | Reporter / Source | Linked Requirement | Description & Observation | Classification | Severity | Disposition & Evidence |
|:---:|:---:|:---:|---|:---:|:---:|---|
| **DEF-01** | Internal Audit / Handoff Verification | `TC-UAT-01`<br>`BR-04` | Boundary test on expense split allocation decimal cents precision. Balanced allocation accepted (`200 OK`). | **Not-a-Defect** | None | Conforms strictly to `BR-04` and `WP-04` contract. |
| **DEF-02** | Internal Audit / Handoff Verification | `TC-UAT-03`<br>`BR-10` | Administrator attempts to view user financial transactions and receives `HTTP 403 Forbidden`. | **Not-a-Defect** | None | Intended security behavior per `BR-10` (financial privacy isolation) and `NFR-SEC-02`. |

**Internal Audit Summary:**
- DEF-01 was classified as Not-a-Defect because the observed balanced allocation behavior conforms to the specified decimal precision and allocation contract.
- DEF-02 was classified as Not-a-Defect because administrators must not access users' personal financial transaction data.

### 3.2 Formal Partner-Reported Findings (SingSlot UAT Team → Whatsss)

The Whatsss team monitors formal findings reported by the SingSlot UAT Team against the deployed Whatsss Cloud Run release `whatsss-00006-9j1` (`https://whatsss-sipqw4logq-as.a.run.app`, baseline tag `v0.1.0-sprint1`).

| Finding ID | Reporter / Source | Linked Requirement | Description & Observation | Classification | Severity | Disposition & Evidence |
|:---:|:---:|:---:|---|:---:|:---:|---|
| *None received* | SingSlot UAT Team | N/A | No formal partner-reported defect findings have been recorded in this register at the time of this submission. | N/A | N/A | No partner finding to triage. Update this register if a formal report is received. |

**Partner Finding Status:** No formal partner-reported findings are currently recorded. Internal audit findings DEF-01 and DEF-02 above are not counted as partner submissions.

---

## 4. Controlled Defect Exercise Protocol (Section 3.5 Compliance)

Per Section 3.5 of the CPE334 Lab 6 specification:
> *"A sound Sprint 1 product is not penalized for having no natural defect... To demonstrate the defect-correction learning outcome, apply the same report, triage, reproducing-test (RED), fix (GREEN), review, release and independent-retest process for that exercise. Keep the exercise separate from the healthy accepted Sprint 1 release. Do not fabricate findings, substitute a planned enhancement, or deliberately break the live assessed release."*

### 4.1 Candidate Controlled Defect Under Investigation (`DEF-03`)
In the event that the SingSlot UAT Team identifies zero release-blocking defects on our live deployment, our team has prepared the following candidate controlled exercise:

| Attribute | Specification Details |
|---|---|
| **Candidate Defect ID** | **DEF-03** |
| **Origin / Source** | Controlled Engineering Exercise (Section 3.5 Protocol) — **NOT** an incoming partner bug report |
| **Target Subsystem** | Transaction Processing (`WP-04` Expense Split Allocation) |
| **Linked Requirement** | `BR-04` (Split Allocation Invariant) & `FR-07` (Transaction Note Recording) |
| **Reported Anomaly** | When a user submits an expense transaction with untrimmed whitespace in the note field (e.g. `"  Grocery supplies  "`), the raw leading/trailing whitespace is preserved in the database instead of being normalized/trimmed. |
| **Classification** | **Accepted Defect** *(Controlled Exercise)* |
| **Severity Assessment** | **Minor** (Non-blocking edge-case data sanitization; does not violate ledger balance or financial invariants). |
| **Assigned Owner** | `@Apichaya251400` (Assigned under Part D / [Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) |
| **Current Fix Status** | **PENDING EXECUTION UNDER PART D** |

### 4.2 Required Execution Steps for DEF-03 Resolution (Under Issue #37 / Part D)
To ensure complete traceability without unsupported claims:
1. **RED:** Add an automated unit test in `server/tests/unit/` asserting that transaction notes are trimmed on creation, and run it against the existing codebase to verify failure (**RED**).
2. **GREEN:** Update the input sanitization logic in the backend transaction service and re-run tests to verify pass (**GREEN**) alongside the full regression suite (`npm test`).
3. **PR & Code Review:** Submit a fix branch (`fix/def-03-note-trimming`) into `staging-lab5`, reviewed and approved by `@Pilaiwan3492`.
4. **Deploy & Retest:** Deploy the corrected revision to Cloud Run and verify health before partner re-test sign-off.
