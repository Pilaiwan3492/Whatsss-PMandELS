# Lab 6 — Part C: Defect Reporting & Triage Register

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Lab:** Lab 6 — Independent User Acceptance Testing & Defect Management  
> **Product Team:** Whatsss — Theme 7 (Personal Money and Expense Logging System)  
> **Partner Testing Team:** SingSlot — Karaoke Room Reservation & Management System  
> **Authors:** Pilaiwan Churdchu (`@Pilaiwan3492`), Aphichaya Klinhual (`@Apichaya251400`)  
> **Linked Tracking Issue:** [Issue #38](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38)

---

## 1. Defect Triage & Governance Framework

To establish a traceable, reasoned disposition for all findings, findings are classified under the following strict taxonomy.

### 1.1 Classification Taxonomies

- **Accepted Defect:** A confirmed contradiction between observed behavior and the agreed Sprint 1 specification or approved engineering contracts (`docs/srs.md`, `docs/sprints/sprint-1/feature-contracts.md`). Release-blocking defects (Critical/Major) require an automated reproducing test (**RED**), code correction (**GREEN**), PR review, CI verification, and redeployment for retest.
- **Duplicate:** A finding that describes an identical anomaly already tracked under an earlier Issue ID.
- **Not-a-Defect:** Observed behavior that conforms to the agreed Sprint 1 specification, expected error handling, or security access restrictions (e.g., HTTP 403 Forbidden for Admin ledger access).
- **Enhancement:** A suggested feature or scope addition beyond the agreed Sprint 1 boundary (deferred to Sprint 2/3).
- **Unverified Observation / Potential Enhancement Candidate:** A recorded finding or potential edge-case behavior that is not defined or required by the agreed specification/contracts and has not been proven through a controlled reproducing test.

### 1.2 Severity Levels

- **Critical:** Application crash, unhandled 500 error, data corruption, or total blockage of the core domain journey with zero workaround (blocks Sprint 1 release).
- **Major:** Severe business rule violation or security vulnerability (e.g., double booking permitted, unauthorized financial ledger exposure, or decimal allocation mismatch) (blocks Sprint 1 release).
- **Minor:** Non-blocking discrepancy, cosmetic or styling issue, or edge-case input handling that does not break ledger invariants.

---

## 2. Outgoing Findings Register (Partner Application: SingSlot)

During the independent user acceptance testing of **SingSlot Sprint 1** (`singslot-00004-6mv`, commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`), the Whatsss team executed all 5 agreed test cases (`UAT-01` to `UAT-05`).

| Finding ID | Tested Case | Subsystem / Endpoint | Observed Behavior | Specification Invariant | Severity | Disposition |
|:---:|:---:|---|---|---|:---:|---|
| **None** | `UAT-01`–`UAT-05` | Online Booking, Matrix, Access Control | All 5 cases passed with full contract compliance. | `FR-01`–`FR-06`, `BR-01`–`BR-08` | None | **No release-blocking defects were identified within the scope of the five executed Sprint 1 UAT cases (UAT-01 to UAT-05) against the recorded release revision (`singslot-00004-6mv`).** |

**Audit Summary:**

1. Concurrency and slot collision lock (`BR-01`, `BR-02`) reliably rejected overlapping reservations with HTTP 409 `SLOT_CONFLICT`.
2. Capacity limits (`BR-05`), operating hour boundaries (`BR-03`), and past slot rejections (`BR-04`) were enforced across both client UI controls and backend API endpoints.
3. Strict customer data isolation (`BR-07`) and role-based staff endpoint protection (`BR-08`) returned HTTP 403 `FORBIDDEN` without information leakage.
4. Relational database persistence across browser sessions and cross-role state synchronization between Customer and Staff views were verified.

> **Scope Limitation Statement:**  
> The zero-defect finding above applies strictly to the scope of the five executed Sprint 1 UAT cases (`UAT-01` to `UAT-05`) on the tested SingSlot release revision (`singslot-00004-6mv`, commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`). It does not constitute a blanket certification that the entire partner application is defect-free or that all untested functionality has passed.

---

## 3. Incoming Findings Register (Whatsss Application)

This register separates findings identified through internal audit and handoff verification from findings formally reported by the partner testing team. Each finding retains its actual source to ensure accurate traceability and avoid misrepresenting internal observations as partner-reported defects.

### 3.1 Internal Audit and Handoff Verification Findings

The following findings were identified through our team's internal audit and handoff verification of Whatsss. They were not submitted as formal defect reports by the SingSlot UAT Team.

| Finding ID | Reporter / Source | Related Test Case | Tested Endpoint / Operation | Expected Behavior | Observed API Response | Observed UI Observation | Evidence Reference | Classification Rationale | Disposition |
|:---:|:---:|:---:|---|---|:---:|---|---|---|:---:|
| **DEF-01** | Internal Audit / Handoff Verification | `UAT-S1-01` (Step 3: Multi-Split Expense Allocation) | `POST /api/transactions/expense` | Balanced multi-line expense allocation ($\sum \text{allocations.amount} = \text{total\_amount}$) accepted atomically per `BR-05` and `BR-06`. | `HTTP 201 Created` | Transaction receipt displayed successfully | Lab 5 baseline evidence `docs/labs/lab-05/evidence/c04-03-transaction-creation-recorded.png`; Unit test `server/tests/unit/transaction.test.ts` (`TEST-ALLOC-01`). *(Formal Lab 6 Cloud Run UAT evidence `A-EV-03` is pending partner execution by SingSlot).* | Conforms strictly to `BR-05` and `BR-06`. The observation verified mathematical balance and line creation, not a failure of decimal precision. | **Not-a-Defect** |
| **DEF-02** | Internal Audit / Handoff Verification | `UAT-S1-04` (Sub-check 4A: Administrator Denial of Financial Data) | `GET /api/accounts`, `GET /api/transactions`, UI `/dashboard` as `ADMIN` | Platform administrator possessing zero financial accounts is denied access to personal ledgers (`BR-10`, `NFR-SEC-02`, `AC-02-2`). | `HTTP 403 Forbidden` | Access denied / redirect to `/access-denied` (`Access Forbidden (403)` — `Security Policy (BR-10)`) | Lab 5 baseline evidence `docs/labs/lab-05/evidence/c04-05-br10-admin-access-denied-403.png`; Integration test `server/tests/integration/auth.test.ts` (`TEST-AUTH-ADMIN-DENIED`). *(Formal Lab 6 Cloud Run UAT evidence `A-EV-05` is pending partner execution by SingSlot).* | Expected security behavior. The HTTP 403 Forbidden response enforces the mandatory administrative isolation boundary required by `BR-10` and `NFR-SEC-02`. | **Not-a-Defect** |

**Internal Audit Summary & Evidence Traceability:**

- **DEF-01 (Balanced Multi-Split Allocation):**
  - *Tested Endpoint:* `POST /api/transactions/expense`
  - *Requirement Reference:* `BR-05` (atomic multi-line allocation creation) and `BR-06` (allocation balance validation).
  - *API Response:* `HTTP 201 Created`
  - *UI Observation:* Transaction receipt displayed successfully.
  - *Classification:* **Not-a-Defect**. The system successfully accepted a valid, balanced expense allocation where the split lines equaled the total amount (฿1,000 Dining + ฿2,000 Grocery = ฿3,000 Total). The observed behavior satisfies the contract. Direct Lab 6 partner UAT execution evidence for Whatsss (`A-EV-03`) remains pending partner execution by SingSlot; historical baseline evidence is referenced above.
  - *Final Disposition:* Not-a-Defect.
- **DEF-02 (Administrator Denial of Financial Ledgers):**
  - *Tested Endpoint:* `GET /api/accounts`, `GET /api/transactions`, `GET /api/reports/summary`, UI `/dashboard` as `ADMIN`.
  - *Requirement Reference:* `BR-10` (administrator financial ledger denial) and `NFR-SEC-02` (backend authorization guard).
  - *API Response:* `HTTP 403 Forbidden`
  - *UI Observation:* Access denied / application redirects to `/access-denied` displaying `Access Forbidden (403) — Security Policy (BR-10)` and hides financial navigation links.
  - *Classification:* **Not-a-Defect**. When an authenticated Administrator attempts to query personal financial endpoints or open the user dashboard, the system rejects the request with HTTP `403 Forbidden`. This response enforces the agreed security boundary. Direct Lab 6 partner UAT execution evidence for Whatsss (`A-EV-05`) remains pending partner execution by SingSlot; historical baseline evidence is referenced above.
  - *Final Disposition:* Not-a-Defect.

### 3.2 Formal Partner-Reported Findings (SingSlot UAT Team → Whatsss)

The Whatsss team monitors formal findings reported by the SingSlot UAT Team against the deployed Whatsss Cloud Run release `whatsss-00006-9j1` ([https://whatsss-sipqw4logq-as.a.run.app](https://whatsss-sipqw4logq-as.a.run.app)), baseline tag `v0.1.0-sprint1`.

| Finding ID | Reporter / Source | Linked Requirement | Description & Observation | Classification | Severity | Disposition & Evidence |
|:---:|:---:|:---:|---|:---:|:---:|---|
| **None received** | SingSlot UAT Team | N/A | No formal partner-reported defect findings have been recorded in this register at the time of this submission. | N/A | N/A | No partner finding is available for triage. Update this register if a formal report is received. |

**Partner Finding Status:** No formal partner-reported findings are currently recorded. Internal audit findings DEF-01 and DEF-02 above are not counted as partner submissions.

---

## 4. Controlled Defect Exercise Protocol (Section 3.5 Compliance)

Per Section 3.5 of the CPE334 Lab 6 specification:

> *"A sound Sprint 1 product is not penalized for having no natural defect... To demonstrate the defect-correction learning outcome, apply the same report, triage, reproducing-test (RED), fix (GREEN), review, release and independent-retest process for that exercise. Keep the exercise separate from the healthy accepted Sprint 1 release. Do not fabricate findings, substitute a planned enhancement, or deliberately break the live assessed release."*

### 4.1 Evaluation of Candidate Controlled Defect (`DEF-03`)

The team audited the project specifications to evaluate whether the previously suggested transaction-note whitespace trimming behavior qualifies as an agreed contractual defect.

#### 4.1.1 Contract Verification Results (Case B: Contract Does Not Require Trimming)

1. **SRS Audit (`docs/srs.md`):** Contains zero requirements regarding leading or trailing whitespace trimming or normalization for transaction notes.
2. **SDS Audit (`docs/system-sds.md`):** Defines `notes` as `VARCHAR(255) (NULLABLE)` without data sanitization or trimming constraints.
3. **Engineering Contracts Audit (`docs/sprints/sprint-1/feature-contracts.md`):** Feature `F-06` defines `notes` as an arbitrary text input (e.g., `"notes": "Dinner"`). It specifies no trimming rule or rejection for whitespace-padded input.

**Conclusion:** The project contracts do not require transaction-note whitespace normalization. Under the rubric decision rules (Case B), preserving raw whitespace cannot be classified as an Accepted Defect. Doing so would violate the rule against retroactively inventing requirements. Therefore, DEF-03 is classified as an **Unverified Observation / Potential Enhancement Candidate**.

#### 4.1.2 DEF-03 Status Matrix

| Attribute | Specification Details |
|---|---|
| **Candidate Finding ID** | **DEF-03** |
| **Origin / Source** | Controlled Engineering Exercise Candidate (Section 3.5 Protocol) — **NOT** a partner bug report |
| **Target Subsystem** | Transaction Processing — Transaction Note Field |
| **Linked Requirement** | None in Sprint 1 (`docs/srs.md`, `docs/system-sds.md`, `docs/sprints/sprint-1/feature-contracts.md` contain no note-trimming requirement) |
| **Observed / Candidate Behavior** | Leading or trailing whitespace in transaction notes (e.g., `"  Grocery supplies  "`) may be preserved without stripping. |
| **Classification** | **Unverified Observation / Potential Enhancement Candidate** |
| **Reproduction Status** | **Not Reproduced** (No automated RED reproducing test has been created or executed) |
| **Fix Status** | **On Hold — Not Implemented** (Pending selection/validation of a verified contractual requirement candidate) |
| **Retest Status** | **Not Retested** (Part D execution has not begun) |
| **Assigned Owner** | `@Apichaya251400` (Assigned under Part D / [Issue #37](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/37)) |

**Validation Statement:**  
DEF-03 is not an Accepted Defect. No automated RED reproducing test, code fix, PR, CI run, redeployment, or independent retest has been performed. Part D remains pending under Issue #37.

### 4.2 Required Execution Steps for Controlled Defect Resolution (Under Issue #37 / Part D)

When the team executes Part D under Issue #37, the following sequence will be followed:

1. **Candidate Requirement Validation:** Select a candidate behavior that violates an explicit, approved Sprint 1 requirement or engineering contract. If no existing requirement exists, the candidate cannot be triaged as a defect.
2. **Automated Reproduction (RED):** Author a test asserting the required contract behavior and run it against the existing codebase to verify failure (**RED**). Record the test command, file path, and failure trace.
3. **Code Correction (GREEN):** Implement the minimal code correction necessary to satisfy the requirement and run the test suite to verify success (**GREEN**) alongside the full regression suite (`npm test`).
4. **Fix PR & Peer Review:** Submit a separate fix PR (`fix/...`) into `staging-lab5`, reviewed and approved by `@Pilaiwan3492` (Zero Self-Merge Rule R-09).
5. **Isolated Deployment & Independent Retest:** Deploy the fix to an isolated environment separate from the healthy assessed release, and obtain independent retest verification.
