## 1. Pull Request Overview

* **Linked Issue:** Resolves #[Issue-Number]
* **Feature / Contract ID:** `F-XX` (or Deliverable Part: [Part A/B/C/D/E/F])
* **Target Branch:** `sprint-1` (or `main` for release PR)
* **Author:** @[Author-Username]
* **Assigned Reviewer:** @[Reviewer-Username] *(Course Rule: Authors must NOT approve their own PR)*

---

## 2. Summary of Changes
* *Concise description of changes, behavior implemented, or documentation updated.*

---

## 3. Verification & Automated Test Evidence
* **Test Command:** `npm test` (or relevant test execution command)
* **Tested Commit:** `[Commit Hash]`
* **Results:** Passing: X, Failing: 0, Skipped: 0
* **Specific Checks Executed:**
  - [ ] Valid/Normal domain workflow
  - [ ] Business rule / Negative boundary rejection
  - [ ] Role / Tenancy access restriction

```text
[Paste terminal test summary excerpt here]
```

---

## 4. Peer Review Checklist (Mandatory for Reviewer)
- [ ] Code/documentation conforms to frozen engineering baseline
- [ ] No extraneous scope outside Sprint 1 is introduced
- [ ] Business rules and security boundaries are enforced on the backend
- [ ] Automated test coverage exists and passes
- [ ] Specific feedback, questions, or findings recorded in review comment
