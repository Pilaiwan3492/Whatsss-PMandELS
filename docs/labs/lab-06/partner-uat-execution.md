# Lab 6 — Part B: Independent UAT Execution Report

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Testing Role:** Independent UAT Team (Whatsss Team — Theme 7)  
> **Target Application Under Test:** **SingSlot — Karaoke Room Reservation & Management System**  
> **Product Team:** Phenwatsa & Partner Team  
> **Execution Date:** 20 November 2026  
> **Tested Application Revision:** `singslot-00004-6mv` (GCP Cloud Run `asia-southeast1`)  
> **Tested Commit SHA:** `aa5f109b97c157a143a7a9a94cd58dc02998467e` (`v0.1.0-sprint1`)  
> **UI Release Badge:** `v1.0.1 - Cloud Verified`  
> **Deployed Live URL:** [https://singslot-4o7kwmd5ma-as.a.run.app](https://singslot-4o7kwmd5ma-as.a.run.app)  
> **Independent UAT Testers:**  
> 1. Pilaiwan Churdchu (Student ID: 67070503492)  
> 2. Aphichaya Klinhual (Student ID: 67070503447)  

---

## 1. Test Environment & Target Metadata

| Attribute | Recorded Baseline & Live State |
|---|---|
| **Application Name** | SingSlot — Karaoke Room Reservation & Management System |
| **Product Repository** | [https://github.com/Phenwatsa/singslot-karaoke](https://github.com/Phenwatsa/singslot-karaoke) |
| **GCP Cloud Run Service** | `singslot` (`asia-southeast1`) |
| **Deployed Revision ID** | `singslot-00004-6mv` |
| **Tested Commit SHA** | `aa5f109b97c157a143a7a9a94cd58dc02998467e` |
| **Git Tag Baseline** | `v0.1.0-sprint1` |
| **Live Web App URL** | `https://singslot-4o7kwmd5ma-as.a.run.app` |
| **Evaluated Test Date** | `2026-11-21` (Tomorrow, UTC+7 Asia/Bangkok) |
| **Test Accounts Used** | • Customer 1: `customer1@singslot.local` (Alice Customer)<br>• Customer 2: `customer2@singslot.local` (Bob Customer)<br>• Staff: `staff@singslot.local` (Cashier Staff) |

---

## 2. Test Execution Summary Matrix

Both student testers independently executed all 5 agreed Sprint 1 UAT test cases supplied in the SingSlot handoff package.

| Case ID | Category | Requirement & Contract Ref | Primary Tester | Execution Date & Time (UTC+7) | Result | Summary of Actual Behavior |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **UAT-01** | Normal Domain Journey | `FR-01`..`04`, `BR-01`..`03`, `BR-05`, `AC-04a` | Pilaiwan Churdchu & Aphichaya Klinhual | 2026-11-20 23:25 | **PASS** | Successfully logged in as Alice, selected Room `M01` on `2026-11-21`, booked Slots #4 & #5 (14:00–16:00, 2 hrs, 5 guests). Created Booking `BK-20261121-HPSK`. Timeline matrix refreshed to Occupied (Red). |
| **UAT-02** | Business-Rule / Conflict Prevention | `FR-03`, `FR-04`, `BR-01`, `BR-02`, `AC-04b` | Aphichaya Klinhual | 2026-11-20 23:25 | **PASS** | Bob attempted 3-hour booking (13:00–16:00) on `M01` overlapping Alice's slots. Server rejected with HTTP 409 `SLOT_CONFLICT`. UI displayed conflict banner. Slot 3 remained Open, zero double-booking. |
| **UAT-03** | Boundary Validation | `FR-04`, `BR-01`, `BR-03`..`05`, `AC-04c/d` | Pilaiwan Churdchu | 2026-11-20 23:25 | **PASS** | Capacity stepper on `S01` disabled at max 4 pax. Past dates disabled in picker. Direct API calls rejected with HTTP 400: `CANNOT_BOOK_PAST_SLOT`, `EXCEEDS_CAPACITY`, and `INVALID_DURATION`. |
| **UAT-04** | Forbidden Role / Ownership | `FR-05`, `FR-06`, `BR-07`, `BR-08`, `AC-01c`, `AC-05b` | Aphichaya Klinhual | 2026-11-20 23:25 | **PASS** | Bob's "My Bookings" completely excludes Alice's booking. Direct `GET /api/bookings/:aliceId` returned HTTP 403 `FORBIDDEN`. Customer token to `/api/bookings/master` returned HTTP 403 `FORBIDDEN`. |
| **UAT-05** | State Persistence & Synchronization | `FR-05`, `FR-06`, `BR-07`, `BR-08`, `AC-05`, `AC-06` | Pilaiwan Churdchu & Aphichaya Klinhual | 2026-11-20 23:25 | **PASS** | Hard reload retained Alice's booking. Staff logged in, accessed Master Schedule across all 9 rooms. Alice's `14:00–16:00` block displayed. Staff clicked block and viewed full details via role override. |

---

## 3. Detailed Case-by-Case Execution & Verification

### 3.1 Case UAT-01: End-to-End Online Booking Flow (Normal Domain Journey)
* **Category:** Normal Domain Journey
* **Requirement Reference:** `FR-01`, `FR-02`, `FR-03`, `FR-04`, `BR-01`, `BR-02`, `BR-03`, `BR-05`, `AC-01`..`AC-04a`
* **Testers:** Pilaiwan Churdchu (67070503492) & Aphichaya Klinhual (67070503447)
* **Date & Time:** 2026-11-20 23:25:04 (UTC+7)
* **Synthetic Inputs:**
  - Account: `customer1@singslot.local` (Alice Customer)
  - Target Date: `2026-11-21` (Tomorrow)
  - Room: `M01` (MEDIUM, capacity 8)
  - Start Slot: `Slot #4` (`14:00 – 15:00`)
  - Duration: `2 Hours` (`14:00 – 16:00`, spanning Slot #4 & Slot #5)
  - Party Size: `5 Guests`
* **Actual Observed Execution:**
  1. Navigated to `https://singslot-4o7kwmd5ma-as.a.run.app`. Clicked "Sign In" and authenticated as `customer1@singslot.local`.
  2. Verified top navigation bar updated with user avatar, name "Alice Customer", and role badge "Customer".
  3. The "Browse Rooms" catalog rendered all 9 rooms across tiers (`S01–S03` Small 4 pax, `M01–M03` Medium 8 pax, `L01–L03` Large 12 pax) (`EVD-UAT-01`).
  4. Switched to "Time Slot Matrix", opened date popover, and picked `21/11/2026`. Verified Room `M01` showed Slot #4 and Slot #5 marked as green "Open" (`EVD-UAT-02`).
  5. Clicked on Slot #4 (14:00–15:00). The "Reserve a Karaoke Room" modal opened with Room `M01` pre-selected.
  6. Selected `2 Hours` in the duration dropdown. The calculated window showed `14:00 - 16:00 (2 hrs)`. Incremented party size from 2 to 5 guests (`EVD-UAT-03`).
  7. Clicked "CONFIRM RESERVATION (14:00 - 16:00)". The server responded with HTTP 201 Created and displayed the confirmation receipt modal with booking code **`BK-20261121-HPSK`** (`EVD-UAT-04`).
  8. Clicked "Done & Return to Schedule". The Time Slot Matrix refreshed, and Room `M01` Slots #4 & #5 now visibly displayed as occupied/red (`EVD-UAT-05`).
* **Verdict:** **PASS** (Zero discrepancies; booking code `BK-20261121-HPSK` committed in Cloud SQL).

---

### 3.2 Case UAT-02: Slot Overlap Conflict Prevention (Business Rule / Boundary)
* **Category:** Business-Rule or Boundary Case
* **Requirement Reference:** `FR-03`, `FR-04`, `BR-01`, `BR-02`, `AC-03`, `AC-04b`
* **Tester:** Aphichaya Klinhual (67070503447)
* **Date & Time:** 2026-11-20 23:25:18 (UTC+7)
* **Precondition:** Room `M01` Slots #4 & #5 (`14:00–16:00`) occupied by Alice's booking `BK-20261121-HPSK`.
* **Synthetic Inputs:**
  - Account: `customer2@singslot.local` (Bob Customer)
  - Target Date: `2026-11-21`
  - Room: `M01`
  - Attempted Start Slot: `Slot #3` (`13:00 – 14:00`, which is open)
  - Attempted Duration: `3 Hours` (`13:00 – 16:00`, overlapping occupied Slots #4 & #5)
  - Party Size: `4 Guests`
* **Actual Observed Execution:**
  1. Signed out Alice and signed in as Bob (`customer2@singslot.local`).
  2. Opened Time Slot Matrix for `21/11/2026`. Confirmed `M01` Slots #4 & #5 were locked/occupied.
  3. Clicked open `Slot #3` (13:00–14:00), selected `3 Hours` duration (interval `13:00 – 16:00`), and set party size to 4 (`EVD-UAT-06`).
  4. Clicked "CONFIRM RESERVATION (13:00 - 16:00)".
  5. The server immediately rejected the request with **HTTP 409 Conflict** (`SLOT_CONFLICT`).
  6. The UI modal remained open and presented an alert banner: *"One or more requested slots are already occupied."* (`EVD-UAT-07`).
  7. Direct API test confirmed response:
     ```json
     {
       "success": false,
       "error": {
         "code": "SLOT_CONFLICT",
         "message": "One or more requested slots are already occupied."
       }
     }
     ```
  8. Slot #3 remained open/green; zero database records were created or modified.
* **Verdict:** **PASS** (Strict concurrency & slot conflict integrity enforced).

---

### 3.3 Case UAT-03: Past Slot, Operating Window & Capacity Boundary Enforcement
* **Category:** Business-Rule or Boundary Case
* **Requirement Reference:** `FR-03`, `FR-04`, `BR-01`, `BR-03`, `BR-04`, `BR-05`, `AC-04c`, `AC-04d`
* **Tester:** Pilaiwan Churdchu (67070503492)
* **Date & Time:** 2026-11-20 23:25:24 (UTC+7)
* **Synthetic Inputs:**
  - Boundary A (Capacity Limit): Room `S01` (`SMALL`, max 4 pax) -> party size `6`
  - Boundary B (Operating Window): Room `S01` -> Start Slot #12 (22:00) with duration >2 hrs (exceeding Slot 13 / 24:00) and API duration `6`
  - Boundary C (Past Date): Yesterday `2026-11-19`
* **Actual Observed Execution:**
  1. Opened Room `S01` (`SMALL • max 4 pax`) in booking modal.
  2. In UI party size stepper, clicked `+` until 4 guests. The `+` button automatically disabled at **`4 Guests`** (`EVD-UAT-08`).
  3. Changed Start Slot to `Slot #12` (22:00–23:00). Duration options extending past midnight (Slot 13 / 24:00) were blocked (`EVD-UAT-09`).
  4. Inspected the calendar date picker: all dates prior to today's date in `Asia/Bangkok` were greyed out / unclickable (`EVD-UAT-10`).
  5. Executed backend API validation tests against `POST /api/bookings/online`:
     - Past date (`2026-11-19`): **HTTP 400 Bad Request** with code `CANNOT_BOOK_PAST_SLOT` (*"Cannot book slots in the past or currently in progress."*).
     - Over-capacity (`partySize: 6` on `S01`): **HTTP 400 Bad Request** with code `EXCEEDS_CAPACITY` (*"Party size (6) exceeds room capacity (4)."*).
     - Over-duration (`durationHours: 6`): **HTTP 400 Bad Request** with code `INVALID_DURATION` (*"Duration must be between 1 and 5 contiguous hours and end within operating hours (10:00 - 24:00, slots 0..13)."*).
* **Verdict:** **PASS** (All 3 boundaries strictly enforced in both UI controls and backend API).

---

### 3.4 Case UAT-04: Customer Data Isolation & Staff Authorization Boundary
* **Category:** Forbidden Role / Ownership Case
* **Requirement Reference:** `FR-01`, `FR-05`, `FR-06`, `BR-07`, `BR-08`, `AC-01c`, `AC-05`, `AC-05b`
* **Tester:** Aphichaya Klinhual (67070503447)
* **Date & Time:** 2026-11-20 23:25:27 (UTC+7)
* **Synthetic Inputs:**
  - Customer 1 Booking ID: `b717094c-c557-41c8-bb02-850183cbc9ff` (`BK-20261121-HPSK`)
  - Authenticated Caller: `customer2@singslot.local` (Bob Customer)
* **Actual Observed Execution:**
  1. Logged in as Bob (`customer2@singslot.local`) and opened "My Bookings".
  2. Verified that Alice's booking `BK-20261121-HPSK` did NOT appear anywhere in Bob's view (`EVD-UAT-11`).
  3. Verified the top navigation bar for Bob: only "Rooms & Slots" and "My Bookings" were displayed; "Master Schedule" was not rendered.
  4. Issued direct API call `GET /api/bookings/b717094c-c557-41c8-bb02-850183cbc9ff` with Bob's Bearer token:
     - Response: **HTTP 403 Forbidden** (`FORBIDDEN`) with message *"You are not authorized to view this booking."* Zero customer details or PII disclosed (`EVD-UAT-12`).
  5. Issued direct API call `GET /api/bookings/master?date=2026-11-21` with Bob's Bearer token:
     - Response: **HTTP 403 Forbidden** (`FORBIDDEN`) with message *"Access denied: insufficient permissions"* (`EVD-UAT-12`).
* **Verdict:** **PASS** (Zero cross-tenant data leakage; role-based access control verified).

---

### 3.5 Case UAT-05: State Synchronization & History Persistence
* **Category:** State / History / Persistence Case
* **Requirement Reference:** `FR-05`, `FR-06`, `BR-07`, `BR-08`, `AC-05`, `AC-06`
* **Testers:** Pilaiwan Churdchu (67070503492) & Aphichaya Klinhual (67070503447)
* **Date & Time:** 2026-11-20 23:25:50 (UTC+7)
* **Synthetic Inputs:**
  - Booking ID: `b717094c-c557-41c8-bb02-850183cbc9ff` (`BK-20261121-HPSK`)
  - Target Date: `2026-11-21`
  - Staff Account: `staff@singslot.local` (Cashier Staff)
* **Actual Observed Execution:**
  1. Re-authenticated as Alice (`customer1@singslot.local`) and opened "My Bookings".
  2. Executed a hard page reload (`Ctrl + F5`). The active session and booking card persisted intact.
  3. Clicked Alice's booking card: the Reservation Details modal displayed `CONFIRMED` status, code `BK-20261121-HPSK`, Room `M01`, `14:00 - 16:00 (2 hrs)`, 5 guests, and discrete slot badges (`Slot #4`, `Slot #5`) (`EVD-UAT-13`).
  4. Signed out and signed in as Staff (`staff@singslot.local`). The navigation bar displayed "Cashier Staff", role label "Staff Manager", and the "Master Schedule" button.
  5. Navigated to "Master Schedule" and selected `21/11/2026`.
  6. The master schedule loaded all 9 rooms (`S01–S03`, `M01–M03`, `L01–L03`). Room `M01` displayed the reserved block `14:00–16:00` attributed to Alice Customer (`EVD-UAT-14`).
  7. Clicked the occupied block: the Staff Booking Detail modal opened via authorized staff override (`BR-07`), showing full customer contact details (`Alice Customer`, phone `0898765432`, `5 Guests`, `Slots #4 & #5`) (`EVD-UAT-15`).
* **Verdict:** **PASS** (Relational persistence in Cloud SQL and staff-customer state synchronization fully verified).

---

## 4. Evidence Catalog & Screen Captures

| Evidence ID | Linked Case | Description | Source File Reference |
|---|---|---|---|
| **EVD-UAT-01** | UAT-01 | Browse Rooms catalog with 9 suites and logged-in user Alice | `evidence/uat01-01-browse-rooms-catalog.png` |
| **EVD-UAT-02** | UAT-01 | Time Slot Matrix for `21/11/2026` showing M01 Slots #4 & #5 open | `evidence/uat01-02-matrix-before-booking.png` |
| **EVD-UAT-03** | UAT-01 | Booking modal configured: M01, 2 hrs (14:00–16:00), 5 guests | `evidence/uat01-03-booking-modal-filled.png` |
| **EVD-UAT-04** | UAT-01 | Booking confirmation receipt showing code `BK-20261121-HPSK` | `evidence/uat01-04-booking-confirmation-receipt.png` |
| **EVD-UAT-05** | UAT-01 | Time Slot Matrix refreshed with M01 Slots #4 & #5 locked (Red) | `evidence/uat01-05-matrix-after-booking-occupied.png` |
| **EVD-UAT-06** | UAT-02 | Bob's attempt to book 3-hour overlapping slot (13:00–16:00) | `evidence/uat02-01-conflict-attempt-filled.png` |
| **EVD-UAT-07** | UAT-02 | Overlap conflict rejection banner (HTTP 409 `SLOT_CONFLICT`) | `evidence/uat02-02-conflict-rejection-banner.png` |
| **EVD-UAT-08** | UAT-03 | Capacity stepper disabled at 4 guests on Small Suite S01 | `evidence/uat03-01-capacity-boundary.png` |
| **EVD-UAT-09** | UAT-03 | Operating window boundary guard past midnight (Slot 12) | `evidence/uat03-02-operating-window-boundary.png` |
| **EVD-UAT-10** | UAT-03 | Date picker popup with past calendar days disabled | `evidence/uat03-03-past-date-picker-boundary.png` |
| **EVD-UAT-11** | UAT-04 | Bob's My Bookings screen excluding Alice's reservation | `evidence/uat04-01-my-bookings-isolated.png` |
| **EVD-UAT-12** | UAT-04 | Terminal / API verification of 403 Forbidden on cross-data & staff | `evidence/uat04-02-cross-customer-and-staff-403-rejection.png` |
| **EVD-UAT-13** | UAT-05 | Customer booking details persisted across browser hard reload | `evidence/uat05-01-customer-details-persisted.png` |
| **EVD-UAT-14** | UAT-05 | Staff Master Schedule across all 9 rooms showing M01 booked | `evidence/uat05-02-staff-master-schedule.png` |
| **EVD-UAT-15** | UAT-05 | Staff reservation details modal with authorized PII override | `evidence/uat05-03-staff-booking-detail-modal.png` |
