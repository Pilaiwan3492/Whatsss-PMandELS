# Lab 6 Part B: Independent User Acceptance Testing (UAT) Execution Report

> **Course:** CPE 334 Introduction to Software Engineering in the Age of AI Agents (Semester 1/2026)  
> **Deliverable:** Lab 6 — Independent User Acceptance Testing and Defect Management (Part B: 25 Points)  
> **Independent UAT Team:** Whatsss Team (`@Pilaiwan3492` & `@Apichaya251400`)  
> **Partner Product Team Evaluated:** SingSlot Team (`@Phenwatsa` & `@lephirada`)  
> **Tracking Issues:** Whatsss Repo [`#40` (`ISSUE 18` — `UAT-03` & `UAT-04` by `@Apichaya251400`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/40) & [`#38` (`ISSUE 17` — `UAT-01`, `UAT-02` & `UAT-05` by `@Pilaiwan3492`)](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/38) | Partner Repo [`Phenwatsa/singslot-karaoke#35`](https://github.com/Phenwatsa/singslot-karaoke/issues/35)

---

## 1. Partner System & Tested Release Identification

| Attribute | Partner Specification / Observed Live Value |
| :--- | :--- |
| **Partner Application Name** | **SingSlot — Karaoke Room Reservation & Management System** |
| **Live Deployed URL** | [https://singslot-4o7kwmd5ma-as.a.run.app](https://singslot-4o7kwmd5ma-as.a.run.app) |
| **Partner GitHub Repository** | [https://github.com/Phenwatsa/singslot-karaoke](https://github.com/Phenwatsa/singslot-karaoke) |
| **Partner Handoff & UAT Plan (`Part A`)** | [`docs/labs/lab-06/handoff.md`](https://github.com/Phenwatsa/singslot-karaoke/blob/sprint-1-staging/docs/labs/lab-06/handoff.md) & [`docs/labs/lab-06/uat-cases.md`](https://github.com/Phenwatsa/singslot-karaoke/blob/sprint-1-staging/docs/labs/lab-06/uat-cases.md) |
| **GCP Project & Cloud Run Service** | `cpe334-singslot-en-038-p1` / `singslot` (`asia-southeast1`, Cloud SQL PostgreSQL 16: `singslot-pg`) |
| **Deployed Cloud Run Revision** | `singslot-00004-6mv` (`100%` traffic) |
| **Deployed Release Commit SHA (`main`)** | `aa5f109b97c157a143a7a9a94cd58dc02998467e` |
| **Sprint 1 Baseline Git Tag** | `v0.1.0-sprint1` |
| **UI Release Name / Badge** | `v1.0.1 - Cloud Verified` |
| **Server Operating Timezone** | `Asia/Bangkok` (UTC+7) |

---

## 2. Test Account Directory & Joint Team Assignment

In compliance with course security rules (**R-12**), secret passwords provided privately by the SingSlot Product Team are excluded from this repository and PDF report.

The assigned division of testing responsibilities between pair partners is:

| Account Label | Login Email | Role | Assigned UAT Cases | Assigned UAT Tester |
| :--- | :--- | :---: | :--- | :--- |
| **Customer 1 (Alice Customer)** | `customer1@singslot.local` | `CUSTOMER` | `UAT-01`, `UAT-03`, `UAT-04`, `UAT-05` | `@Pilaiwan3492` (`UAT-01`, `UAT-05`) / `@Apichaya251400` (`UAT-03`, `UAT-04`) |
| **Customer 2 (Bob Customer)** | `customer2@singslot.local` | `CUSTOMER` | `UAT-02`, `UAT-03`, `UAT-04` | `@Pilaiwan3492` (`UAT-02`) / `@Apichaya251400` (`UAT-03`, `UAT-04`) |
| **Staff (Cashier Staff)** | `staff@singslot.local` | `STAFF` | `UAT-05` | `@Pilaiwan3492` (`UAT-05`) |

* **Individual Ownership per Project Issue Backlog:**
  - **Issue #38 (`ISSUE 17`):** Owned by **Pilaiwan Churdchu (`@Pilaiwan3492`)** covering `UAT-01`, `UAT-02`, and `UAT-05`.
  - **Issue #40 (`ISSUE 18`):** Owned by **Aphichaya Klinhual (`@Apichaya251400`)** covering `UAT-03` and `UAT-04`.

---

## 3. Master UAT Execution Summary Table (`UAT-01` – `UAT-05`)

| Case ID | Category | Requirement & Contract Ref | Tested By | Date & Time (ICT) | Tested Version / Revision | Status | Actual Result Summary |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **UAT-01** | Normal Domain Journey | `FR-01`..`04`, `BR-01`..`03`, `BR-05`, `AC-04a`, `TEST-04a` | `@Pilaiwan3492` | `2026-11-20 23:25` | `singslot-00004-6mv` (`aa5f109`) | **`PASS`** | Logged in as Alice, selected Room `M01` on `2026-11-21`, booked Slots #4 & #5 (`14:00–16:00`, 2 hrs, 5 guests). Confirmed booking `BK-20261121-HPSK` (`b717094c-c557-41c8-bb02-850183cbc9ff`). Timeline matrix updated to Occupied (Red). |
| **UAT-02** | Business-Rule / Conflict | `FR-03`, `FR-04`, `BR-01`, `BR-02`, `AC-04b`, `TEST-04b` | `@Pilaiwan3492` | `2026-11-20 23:25` | `singslot-00004-6mv` (`aa5f109`) | **`PASS`** | Bob attempted 3-hour booking (`13:00–16:00`) on `M01` overlapping Alice's slots. Server rejected with HTTP 409 `SLOT_CONFLICT`. Modal displayed alert banner. Slot #3 remained open, zero double-booking. |
| **UAT-03** | Boundary Validation | `FR-03`, `FR-04`, `BR-01`, `BR-03`..`05`, `AC-04c/d`, `TEST-04c/d` | `@Apichaya251400` | `2026-11-20 20:51` | `singslot-00004-6mv` (`aa5f109`) | **`PASS`** | UI calendar popover disabled past dates (`1–19 Nov 2026` prior to `2026-11-20`), disabled `3/4/5 Hours (Exceeds 24:00)` when `Slot #12 (22:00–23:00)` was selected, and disabled `+` at `4 Guests` on Room `S01` (`id: c0a3cee2-57c6-4bbb-bf71-ae17c03061b9`). Direct `POST /api/bookings/online` boundary calls returned `HTTP 400 Bad Request` with exact error codes `CANNOT_BOOK_PAST_SLOT`, `EXCEEDS_CAPACITY`, and `INVALID_DURATION`. |
| **UAT-04** | Forbidden Role / Ownership | `FR-01`, `FR-05`, `FR-06`, `BR-07`, `BR-08`, `AC-01c`, `AC-05`, `AC-05b`, `TEST-01c`, `TEST-05`, `TEST-05b` | `@Apichaya251400` | `2026-11-20 20:53` | `singslot-00004-6mv` (`aa5f109`) | **`PASS`** | Sub-checks UAT-04A (Customer Ownership Isolation) and UAT-04B (Customer vs Staff Authorization) verified. Customer 1 owned 2 bookings (`BK-20261115-MQRX` and `BK-20261113-IA4Q`). Customer 2 had zero bookings (`count: 0`). Calling cross-customer detail API (`GET /api/bookings/718f0d84...`) and staff master schedule API (`GET /api/bookings/master?date=2026-11-21`) both returned HTTP 403 Forbidden (`FORBIDDEN`). Master Schedule navbar link hidden for Customer role. |
| **UAT-05** | State Persistence & Synchronization | `FR-05`, `FR-06`, `BR-07`, `BR-08`, `AC-05`, `AC-06`, `TEST-05`, `TEST-06` | `@Pilaiwan3492` | `2026-11-20 23:25` | `singslot-00004-6mv` (`aa5f109`) | **`PASS`** | Hard reload (`Ctrl+F5`) retained Alice's booking. Staff logged in, accessed Master Schedule across all 9 rooms. Alice's `14:00–16:00` block displayed. Staff clicked block and viewed full details via role override (`BR-07`). |

> **Scoped Execution Statement:**  
> All 5 agreed Sprint 1 UAT cases (`UAT-01` to `UAT-05`) passed within their executed live UI/API scope against release revision `singslot-00004-6mv` (commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`). Subsequent code-level concurrency, schema, and security inspection identified 4 additional outgoing findings (`DEF-SS-01`–`DEF-SS-04`), formally reported at [`Phenwatsa/singslot-karaoke#35` (comment `7060029335`)](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335) and tracked in [`defect-triage.md`](defect-triage.md).

---

## 4. Detailed Case-by-Case Execution & Verification

### 🧪 Case `UAT-01`: End-to-End Online Booking Flow (Normal Domain Journey)
* **Category:** Normal Domain Journey
* **Requirement Reference:** `FR-01` (Authentication), `FR-02` (Room Catalog), `FR-03` (Availability Query), `FR-04` (Online Booking), `BR-01` (Contiguous Slot Rule: 1–5 consecutive hours), `BR-02` (Exclusive Room Lock), `BR-03` (Operating Hours Boundary: 10:00–24:00, slots 0..13), `BR-05` (Capacity Limit), `AC-01`, `AC-02`, `AC-03`, `AC-04a`, `TEST-01`, `TEST-02`, `TEST-03`, `TEST-04a`
* **Assigned Tester:** `@Pilaiwan3492` (Pilaiwan Churdchu)
* **Date & Time Executed:** `2026-11-20 23:25:04 ICT (UTC+7)`
* **Tested App Version / Commit:** `https://singslot-4o7kwmd5ma-as.a.run.app` | Cloud Run Revision: `singslot-00004-6mv` | Commit SHA: `aa5f109b97c157a143a7a9a94cd58dc02998467e` | Git Tag: `v0.1.0-sprint1` | UI Badge: `v1.0.1 - Cloud Verified`
* **Role & Account Used:** `customer1@singslot.local` (Alice Customer, Role: `CUSTOMER`)

#### Actual Input Values Used
- **Account:** `customer1@singslot.local`
- **Target Date:** `2026-11-21` (Tomorrow)
- **Room:** `M01` (`MEDIUM`, max capacity 8)
- **Start Slot:** `Slot #4` (`14:00 – 15:00`)
- **Duration:** `2 Hours` (`14:00 – 16:00`, spanning Slot #4 & Slot #5)
- **Party Size:** `5 Guests`

#### Actual Results Observed
1. **Catalog Rendering & User Session (`FR-01`, `FR-02`, `AC-02` — Evidence `EVD-UAT-01`):** Navigated to live app, clicked "Sign In", authenticated as Alice Customer. Top navbar rendered Alice Customer with role "Customer". Room catalog displayed all 9 rooms across Small (`S01–S03`), Medium (`M01–M03`), and Large (`L01–L03`) tiers.
2. **Timeline Availability Matrix (`FR-03`, `AC-03` — Evidence `EVD-UAT-02`):** Switched to "Time Slot Matrix", opened date popover, selected `21/11/2026`. Verified Room `M01` showed Slot #4 and Slot #5 marked as green "Open".
3. **Modal Configuration (`BR-01`, `BR-05` — Evidence `EVD-UAT-03`):** Clicked Slot #4 (14:00–15:00) in Room `M01`. In booking modal, selected `2 Hours` duration. The calculated window showed `14:00 - 16:00 (2 hrs)`. Incremented party size to `5 Guests`.
4. **Confirmation Receipt (`FR-04`, `AC-04a`, `TEST-04a` — Evidence `EVD-UAT-04`):** Clicked "CONFIRM RESERVATION (14:00 - 16:00)". Received HTTP 201 Created. Modal transitioned to confirmation receipt displaying unique Booking Code **`BK-20261121-HPSK`** (ID: `b717094c-c557-41c8-bb02-850183cbc9ff`), Room `M01`, `21/11/2026`, `14:00 - 16:00`, 5 guests.
5. **Timeline Refresh (`AC-03` — Evidence `EVD-UAT-05`):** Clicked "Done & Return to Schedule". Time Slot Matrix refreshed, and Room `M01` Slots #4 & #5 now visibly displayed as occupied/red.
* **Execution Status:** **`PASS`**

---

### 🧪 Case `UAT-02`: Slot Overlap Conflict Prevention (Business-Rule / Conflict)
* **Category:** Business-Rule or Boundary Case
* **Requirement Reference:** `FR-03` (Availability Query), `FR-04` (Online Booking), `BR-01` (Contiguous Slot Rule), `BR-02` (Exclusive Room Lock), `AC-03`, `AC-04b`, `TEST-03`, `TEST-04b`
* **Assigned Tester:** `@Pilaiwan3492` (Pilaiwan Churdchu)
* **Date & Time Executed:** `2026-11-20 23:25:18 ICT (UTC+7)`
* **Precondition:** Room `M01` Slots #4 & #5 (`14:00–16:00`) occupied by Alice's booking `BK-20261121-HPSK`.
* **Role & Account Used:** `customer2@singslot.local` (Bob Customer, Role: `CUSTOMER`)

#### Actual Input Values Used
- **Account:** `customer2@singslot.local`
- **Target Date:** `2026-11-21`
- **Room:** `M01`
- **Attempted Start Slot:** `Slot #3` (`13:00 – 14:00`, open)
- **Attempted Duration:** `3 Hours` (`13:00 – 16:00`, overlapping occupied Slots #4 & #5)
- **Party Size:** `4 Guests`

#### Actual Results Observed
1. **Conflict Setup in UI (`AC-03` — Evidence `EVD-UAT-06`):** Signed in as Bob (`customer2@singslot.local`). In Time Slot Matrix for `21/11/2026`, confirmed `M01` Slots #4 & #5 were locked/occupied. Clicked open `Slot #3` (13:00–14:00), selected `3 Hours` duration (`13:00 – 16:00`), set party size to 4 guests.
2. **Conflict Rejection Banner (`BR-01`, `BR-02`, `AC-04b`, `TEST-04b` — Evidence `EVD-UAT-07`):** Clicked "CONFIRM RESERVATION (13:00 - 16:00)". The server rejected the request with **HTTP 409 Conflict** (`SLOT_CONFLICT`). The UI modal displayed an alert banner: *"One or more requested slots are already occupied."*
3. **Direct API Conflict Check:** Sent identical payload to `POST /api/bookings/online` via fetch:
   ```json
   {
     "success": false,
     "error": {
       "code": "SLOT_CONFLICT",
       "message": "One or more requested slots are already occupied."
     }
   }
   ```
4. **Integrity Verified:** Zero duplicate bookings created. Slot #3 remained open/green, and Slots #4 & #5 remained strictly committed to Alice.
* **Execution Status:** **`PASS`**

---

### 🧪 Case `UAT-03`: Past Slot, Operating Window & Capacity Boundary Enforcement (Boundary Validation)
* **Category:** Business-Rule or Boundary Case
* **Requirement Reference:** `FR-03` (Availability Query), `FR-04` (Online Booking), `BR-01` (Contiguous Slot Rule: 1–5 hours), `BR-03` (Operating Hours Boundary: 10:00–24:00, slots `0..13`), `BR-04` (Past Slot Rejection in `Asia/Bangkok`), `BR-05` (Capacity Limit), `AC-04c`, `AC-04d`, `TEST-04c`, `TEST-04d`
* **Assigned Tester:** `@Apichaya251400` (Aphichaya Klinhual, tracked under [Issue #40](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/40) / [PR #41](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/41))
* **Partner Issue Cross-Reference:** [`Phenwatsa/singslot-karaoke#35`](https://github.com/Phenwatsa/singslot-karaoke/issues/35)
* **Date & Time Executed:** `2026-11-20 20:51 ICT (UTC+7)`
* **Tested App Version / Commit:** `https://singslot-4o7kwmd5ma-as.a.run.app` | Cloud Run Revision: `singslot-00004-6mv` | Commit SHA: `aa5f109b97c157a143a7a9a94cd58dc02998467e` | Git Tag: `v0.1.0-sprint1` | UI Badge: `v1.0.1 - Cloud Verified`
* **Roles & Accounts Used:**
  - `customer1@singslot.local` (`Alice Customer`, Role: `CUSTOMER`) for interactive UI boundary verification.
  - `customer2@singslot.local` (`Bob Customer`, Role: `CUSTOMER`) Bearer token for direct HTTP API boundary verification against `POST /api/bookings/online`.

#### Actual Input Values Used
1. **Target Room:** Room `S01` (`id: "c0a3cee2-57c6-4bbb-bf71-ae17c03061b9"`, `SMALL • max 4 pax`, `capacity: 4`)
2. **Boundary Input A (Operating Window & Max Duration — `BR-01`, `BR-03`):**
   - Selected `Booking Date = 21/11/2026` (`2026-11-21`, Tomorrow relative to `2026-11-20` `Asia/Bangkok` server date).
   - Inspected `Duration (1–5 Hours)` dropdown at `Start Time Slot = Slot #0 (10:00 - 11:00)` and after switching `Start Time Slot` to `Slot #12 (22:00 - 23:00)`.
   - Direct API payloads sent to `POST /api/bookings/online`:
     - Max Duration Overflow (`> 5 hours`): `{ "roomId": "c0a3cee2-57c6-4bbb-bf71-ae17c03061b9", "bookingDate": "2026-11-21", "startSlot": 0, "durationHours": 6, "partySize": 2 }`
     - Operating Window Overflow (`startSlot: 12, durationHours: 3` -> end slot `14 > 13`): `{ "roomId": "c0a3cee2-57c6-4bbb-bf71-ae17c03061b9", "bookingDate": "2026-11-21", "startSlot": 12, "durationHours": 3, "partySize": 2 }`
3. **Boundary Input B (Capacity Limit — `BR-05`, `AC-04d`, `TEST-04d`):**
   - In Room `S01` (`max 4 pax`) booking modal, clicked `+` on `Party Size (Guests)` from `2` -> `3` -> `4`.
   - Direct API payload sent to `POST /api/bookings/online`: `{ "roomId": "c0a3cee2-57c6-4bbb-bf71-ae17c03061b9", "bookingDate": "2026-11-21", "startSlot": 0, "durationHours": 1, "partySize": 6 }`
4. **Boundary Input C (Past Date Rejection — `BR-04`, `AC-04c`, `TEST-04c`):**
   - Opened `Booking Date` calendar popover (`November 2026`) on `2026-11-20` (`Asia/Bangkok`) and inspected dates `1` through `19`.
   - Direct API payload sent to `POST /api/bookings/online`: `{ "roomId": "c0a3cee2-57c6-4bbb-bf71-ae17c03061b9", "bookingDate": "2026-11-19", "startSlot": 0, "durationHours": 1, "partySize": 2 }`

#### Actual Results Observed
1. **UI Past Date Picker Guard (`BR-04` — Evidence `EV-UAT03-01` / `EVD-UAT-10`):**
   - Calendar popover (`November 2026`) disabled all dates prior to `2026-11-20` (`1` through `19` November 2026 had `disabled` attributes and muted styling). Dates from `20` November onward were selectable.
2. **UI Operating Window & Max Duration Boundary (`BR-01`, `BR-03` — Evidence `EV-UAT03-02` / `EVD-UAT-09`):**
   - At `Slot #12 (22:00 - 23:00)`, options `1 Hour` and `2 Hours` were selectable (`22:00 - 24:00`), whereas options `3 Hours (Exceeds 24:00)`, `4 Hours (Exceeds 24:00)`, and `5 Hours (Exceeds 24:00)` were disabled.
3. **UI Capacity Limit Stepper (`BR-05`, `AC-04d` — Evidence `EV-UAT03-03` / `EVD-UAT-08`):**
   - On Room `S01` (`SMALL • max 4 pax`), clicking `+` incremented party size up to `4`. At `4`, the `+` button disabled with helper text `Room capacity: up to 4 guests`.
4. **Direct Backend API Boundary Enforcement (`POST /api/bookings/online`):**
   - Past Date (`bookingDate: "2026-11-19"`): Returned **`HTTP 400 Bad Request`** (`CANNOT_BOOK_PAST_SLOT` — *"Cannot book slots in the past or currently in progress."*).
   - Over-Capacity (`partySize: 6` on `S01`): Returned **`HTTP 400 Bad Request`** (`EXCEEDS_CAPACITY` — *"Party size (6) exceeds room capacity (4)."*).
   - Exceed Max Duration (`durationHours: 6`): Returned **`HTTP 400 Bad Request`** (`INVALID_DURATION` — *"Duration must be between 1 and 5 contiguous hours and end within operating hours (10:00 - 24:00, slots 0..13)."*).
   - Operating Window Overflow (`startSlot: 12, durationHours: 3`): Returned **`HTTP 400 Bad Request`** (`INVALID_DURATION`).
* **Execution Status:** **`PASS`**

---

### 🧪 Case `UAT-04`: Customer Data Isolation & Staff Authorization Boundary (Forbidden Role / Ownership)
* **Category:** Forbidden Role / Ownership Case
* **Requirement Reference:** `FR-01` (Authentication), `FR-05` (Customer My Bookings & Booking Detail), `FR-06` (Staff Master Schedule Access Restriction), `BR-07` (Data Isolation & Ownership Boundary), `BR-08` (Staff Operational Boundary), `AC-01c`, `AC-05`, `AC-05b`, `TEST-01c`, `TEST-05`, `TEST-05b`
* **Assigned Tester:** `@Apichaya251400` (Aphichaya Klinhual, tracked under [Issue #40](https://github.com/Pilaiwan3492/Whatsss-PMandELS/issues/40) / [PR #41](https://github.com/Pilaiwan3492/Whatsss-PMandELS/pull/41))
* **Partner Issue Cross-Reference:** [`Phenwatsa/singslot-karaoke#35`](https://github.com/Phenwatsa/singslot-karaoke/issues/35)
* **Date & Time Executed:** `2026-11-20 20:53 ICT (UTC+7)`
* **Tested App Version / Commit:** `https://singslot-4o7kwmd5ma-as.a.run.app` | Cloud Run Revision: `singslot-00004-6mv` | Commit SHA: `aa5f109b97c157a143a7a9a94cd58dc02998467e` | Git Tag: `v0.1.0-sprint1` | UI Badge: `v1.0.1 - Cloud Verified`
* **Roles & Accounts Used:**
  - `customer1@singslot.local` (`Alice Customer`, Role: `CUSTOMER`) — Booking Owner
  - `customer2@singslot.local` (`Bob Customer`, Role: `CUSTOMER`) — Unauthorized Third-Party Customer

#### Sub-Checks and Target Endpoints
- **Target Booking (Customer 1):** Code `BK-20261115-MQRX`, ID `718f0d84-2657-4a87-ad6a-487235d6a1f6`, Room `L01`, `2026-11-15`, Slots #3–#6 (`13:00 - 17:00`, 4 hrs).
- **Target Endpoints:**
  - `GET /api/bookings/my` (Authenticated user's booking list)
  - `GET /api/bookings/718f0d84-2657-4a87-ad6a-487235d6a1f6` (Cross-customer detail endpoint)
  - `GET /api/bookings/master?date=2026-11-21` (Staff-only master schedule endpoint)

#### Detailed Verification by Sub-Check

##### Sub-Check UAT-04A: Customer Ownership Isolation (`BR-07`, `AC-05b`, `TEST-05b`)
- **Actor:** Customer 2 (`customer2@singslot.local`, Bob Customer)
- **Target Resource:** Customer 1's booking (`BK-20261115-MQRX`, ID `718f0d84-2657-4a87-ad6a-487235d6a1f6`)
- **Expected Result:** Customer 2 cannot access Customer 1's booking. `GET /api/bookings/my` returns only Customer 2's bookings (`count: 0`). Calling the direct detail endpoint returns HTTP 403 Forbidden (`FORBIDDEN`). Zero customer PII leaked.
- **Actual Result Observed:**
  1. Signed in as Customer 2 (Bob). Navigated to "My Bookings": `GET /api/bookings/my` returned **`HTTP 200 OK`** with `count: 0, bookings: []` (`No Reservations Found`). Zero records from Customer 1 appeared. (Evidence `EV-UAT04-03` / `EVD-UAT-11`).
  2. Directly called `GET /api/bookings/718f0d84-2657-4a87-ad6a-487235d6a1f6` with Customer 2's Bearer token. Server returned **`HTTP 403 Forbidden`** with body:
     ```json
     {
       "success": false,
       "error": {
         "code": "FORBIDDEN",
         "message": "You are not authorized to view this booking."
       }
     }
     ```
     (Evidence `EVD-UAT-12`).
- **Disposition:** **`PASS`** — Ownership boundary strictly enforced.

##### Sub-Check UAT-04B: Customer vs Staff Authorization Boundary (`BR-08`, `AC-01c`, `TEST-01c`)
- **Actor:** Customer 2 (`customer2@singslot.local`, Role: `CUSTOMER`)
- **Target Resource:** Staff Master Schedule (`GET /api/bookings/master?date=2026-11-21`)
- **Expected Result:** A Customer role is denied operational staff privileges. The UI navigation bar must not render the `Master Schedule` button. Calling the endpoint directly returns HTTP 403 Forbidden (`FORBIDDEN`).
- **Actual Result Observed:**
  1. In the UI navbar for Customer 2, only `Rooms & Slots` and `My Bookings` were visible; `Master Schedule` was completely omitted. (Evidence `EV-UAT04-03` / `EVD-UAT-11`).
  2. Directly called `GET /api/bookings/master?date=2026-11-21` with Customer 2's Bearer token. Server returned **`HTTP 403 Forbidden`** with body:
     ```json
     {
       "success": false,
       "error": {
         "code": "FORBIDDEN",
         "message": "Access denied: insufficient permissions"
       }
     }
     ```
     (Evidence `EVD-UAT-12`).
- **Disposition:** **`PASS`** — Role-based staff operational boundary strictly enforced.

* **Overall Case Status:** **`PASS`**

---

### 🧪 Case `UAT-05`: State Synchronization & History Persistence (State / History / Persistence)
* **Category:** State / History / Persistence Case
* **Requirement Reference:** `FR-05` (Customer My Bookings & Booking Detail), `FR-06` (Staff Master Schedule), `BR-07` (Staff Override to Inspect Any Booking), `BR-08` (Staff Operational Boundary), `AC-05`, `AC-06`, `TEST-05`, `TEST-06`
* **Assigned Tester:** `@Pilaiwan3492` (Pilaiwan Churdchu)
* **Date & Time Executed:** `2026-11-20 23:25:50 ICT (UTC+7)`
* **Synthetic Inputs:**
  - Booking ID: `b717094c-c557-41c8-bb02-850183cbc9ff` (`BK-20261121-HPSK`)
  - Target Date: `2026-11-21`
  - Staff Account: `staff@singslot.local` (Cashier Staff)

#### Actual Results Observed
1. **Persistence Across Reloads (`FR-05`, `AC-05` — Evidence `EVD-UAT-13`):** Re-authenticated as Alice (`customer1@singslot.local`) and opened "My Bookings". Performed hard browser reload (`Ctrl + F5`). Session and reservation persisted intact. Clicked Alice's booking card: modal opened showing `CONFIRMED` status, booking code `BK-20261121-HPSK`, Room `M01`, `14:00 - 16:00 (2 hrs)`, 5 guests, and discrete slot badges (`Slot #4`, `Slot #5`).
2. **Staff Role & Navigation Access (`FR-06`, `BR-08`):** Signed out Alice and signed in as Staff (`staff@singslot.local`). Top navbar rendered "Cashier Staff", role label "Staff Manager", and exposed the "Master Schedule" button.
3. **Staff Master Schedule Synchronization (`AC-06`, `TEST-06` — Evidence `EVD-UAT-14`):** Clicked "Master Schedule", selected `21/11/2026`. Global schedule loaded all 9 rooms (`S01–S03`, `M01–M03`, `L01–L03`). Room `M01` showed the continuous reserved block `14:00–16:00` attributed to Alice Customer.
4. **Staff Override Detail Access (`BR-07` — Evidence `EVD-UAT-15`):** Clicked the occupied block. Staff Booking Detail modal opened via authorized staff override (`GET /api/bookings/:id`), displaying customer contact details (`Alice Customer`, phone `0898765432`, `5 Guests`, `Slots #4 & #5`).
* **Execution Status:** **`PASS`**

> **Synthetic Test Data & Privacy Notice:**  
> All customer names (`Alice Customer`), email addresses (`customer1@singslot.local`), and contact numbers (`0898765432`) displayed in the reservation details modal and master schedule are synthetic test fixtures provisioned for the UAT exercise. No real personal identifiable information (PII) is involved or exposed.

---

## 5. Evidence Catalog & Screen Captures

The current evidence set in `docs/labs/lab-06/evidence/` contains exactly 15 PNG screenshot files (`EVD-UAT-01` through `EVD-UAT-15`). These are the consolidated evidence files used by this report.

For traceability, the original six screenshots from PR #41 are preserved separately in `docs/labs/lab-06/screenshots/` under their original evidence IDs (`EV-UAT03-01` through `EV-UAT04-03`). The original files are source evidence and are not counted as additional files in the 15-file consolidated evidence set.

The mapping between the original source evidence and the consolidated evidence is documented below. Original evidence IDs and consolidated evidence IDs must remain distinct.

| Evidence ID | Linked Case | Description | Source File Reference |
|---|---|---|---|
| **EVD-UAT-01** | UAT-01 | Browse Rooms catalog with 9 suites and logged-in user Alice | `evidence/uat01-01-browse-rooms-catalog.png` |
| **EVD-UAT-02** | UAT-01 | Time Slot Matrix for `21/11/2026` showing M01 Slots #4 & #5 open | `evidence/uat01-02-matrix-before-booking.png` |
| **EVD-UAT-03** | UAT-01 | Booking modal configured: M01, 2 hrs (14:00–16:00), 5 guests | `evidence/uat01-03-booking-modal-filled.png` |
| **EVD-UAT-04** | UAT-01 | Booking confirmation receipt showing code `BK-20261121-HPSK` | `evidence/uat01-04-booking-confirmation-receipt.png` |
| **EVD-UAT-05** | UAT-01 | Time Slot Matrix refreshed with M01 Slots #4 & #5 locked (Red) | `evidence/uat01-05-matrix-after-booking-occupied.png` |
| **EVD-UAT-06** | UAT-02 | Bob's attempt to book 3-hour overlapping slot (13:00–16:00) | `evidence/uat02-01-conflict-attempt-filled.png` |
| **EVD-UAT-07** | UAT-02 | Overlap conflict rejection banner (HTTP 409 `SLOT_CONFLICT`) | `evidence/uat02-02-conflict-rejection-banner.png` |
| **EVD-UAT-08** | UAT-03 | Capacity stepper disabled at 4 guests on Small Suite S01 | `evidence/uat03-01-capacity-boundary.png` *(cf. `screenshots/uat03-03-capacity-limit-s01-max4.png`)* |
| **EVD-UAT-09** | UAT-03 | Operating window boundary guard past midnight (Slot 12) | `evidence/uat03-02-operating-window-boundary.png` *(cf. `screenshots/uat03-02-operating-window-slot12-duration.png`)* |
| **EVD-UAT-10** | UAT-03 | Date picker popup with past calendar days disabled | `evidence/uat03-03-past-date-picker-boundary.png` *(cf. `screenshots/uat03-01-past-date-picker-disabled.png`)* |
| **EVD-UAT-11** | UAT-04 | Bob's My Bookings screen excluding Alice's reservation | `evidence/uat04-01-my-bookings-isolated.png` *(cf. `screenshots/uat04-03-customer2-isolated-my-bookings.png`)* |
| **EVD-UAT-12** | UAT-04 | Terminal / API verification of 403 Forbidden on cross-data & staff | `evidence/uat04-02-cross-customer-and-staff-403-rejection.png` |
| **EVD-UAT-13** | UAT-05 | Customer booking details persisted across browser hard reload | `evidence/uat05-01-customer-details-persisted.png` |
| **EVD-UAT-14** | UAT-05 | Staff Master Schedule across all 9 rooms showing M01 booked | `evidence/uat05-02-staff-master-schedule.png` |
| **EVD-UAT-15** | UAT-05 | Staff reservation details modal with authorized PII override | `evidence/uat05-03-staff-booking-detail-modal.png` |

### 5.1 Original Evidence Traceability (PR #41)

The following table identifies the six original screenshots preserved from PR #41. These files retain their original evidence IDs and are separate from the 15 consolidated evidence files listed above.

| Original Evidence ID | UAT Case | Original Screenshot File | Related Consolidated Evidence |
|---|---|---|---|
| `EV-UAT03-01` | UAT-03 | [`uat03-01-past-date-picker-disabled.png`](screenshots/uat03-01-past-date-picker-disabled.png) | `EVD-UAT-10` |
| `EV-UAT03-02` | UAT-03 | [`uat03-02-operating-window-slot12-duration.png`](screenshots/uat03-02-operating-window-slot12-duration.png) | `EVD-UAT-09` |
| `EV-UAT03-03` | UAT-03 | [`uat03-03-capacity-limit-s01-max4.png`](screenshots/uat03-03-capacity-limit-s01-max4.png) | `EVD-UAT-08` |
| `EV-UAT04-01` | UAT-04 | [`uat04-01-customer1-my-bookings.png`](screenshots/uat04-01-customer1-my-bookings.png) | Original source evidence |
| `EV-UAT04-02` | UAT-04 | [`uat04-02-customer1-reservation-detail-200.png`](screenshots/uat04-02-customer1-reservation-detail-200.png) | Original source evidence |
| `EV-UAT04-03` | UAT-04 | [`uat04-03-customer2-isolated-my-bookings.png`](screenshots/uat04-03-customer2-isolated-my-bookings.png) | `EVD-UAT-11` |

**Evidence ID Convention:**
- `EV-UATxx-yy` identifies original source screenshots preserved from PR #41.
- `EVD-UAT-xx` identifies consolidated screenshot evidence files stored in the current PR #42 evidence directory.
- The two ID formats must not be treated as interchangeable. Where no consolidated copy exists, the original source screenshot remains the direct evidence reference.

---

## 6. Outgoing Findings & Scope Summary (To SingSlot)

Based on the independent execution of all 5 agreed UAT test cases (`UAT-01` through `UAT-05`) and subsequent source-level concurrency, schema, and security inspection of release `singslot-00004-6mv` (commit `aa5f109b97c157a143a7a9a94cd58dc02998467e`):
- **Total UAT Cases Executed:** 5
- **Passing UAT Cases:** 5 (`100%` within executed live UI/API scope)
- **Failing UAT Cases:** 0
- **Blocked UAT Cases:** 0
- **Outgoing Code/Audit Defect Reports Filed:** **4** (`DEF-SS-01` to `DEF-SS-04`) — posted at [`Phenwatsa/singslot-karaoke#35#issuecomment-7060029335`](https://github.com/Phenwatsa/singslot-karaoke/issues/35#issuecomment-7060029335) and detailed in [`docs/labs/lab-06/defect-triage.md`](defect-triage.md#2-outgoing-findings-register-partner-application-singslot):
  - `DEF-SS-01` (**Critical**): TOCTOU race condition between `BookingSlot` and `RoomBlock` outside `prisma.$transaction`.
  - `DEF-SS-02` (**High / Latent**): `CANCELLED` booking status would permanently lock `booking_slots` due to unconditional `@@unique([roomId, bookingDate, slotIndex])`.
  - `DEF-SS-03` (**High**): Unhandled `P2002` `HTTP 500` crash on 4-char `bookingCode` collision.
  - `DEF-SS-04` (**Medium**): Permissive wildcard `cors()` and JWT stored in `localStorage`.

**Formal Scope Statement:**  
All five executed Sprint 1 UAT cases (`UAT-01` to `UAT-05`) passed during live functional testing. The four outgoing findings (`DEF-SS-01`–`DEF-SS-04`) were identified via independent source-level inspection of the exact deployed commit (`aa5f109b97c157a143a7a9a94cd58dc02998467e`) and submitted to the SingSlot team for triage and retest verification.
