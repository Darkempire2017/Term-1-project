# ASTRIX Master Specification & Progress Tracker
**Project:** IoT Smart Umbrella Borrowing System (University of Moratuwa)  
**Last Updated:** 2026-10-21

---

## 📌 7-Step Implementation Roadmap & Live Checklist

- [x] **Step 1: Foundation & Environment Setup**
  - [x] Archive legacy `/frontend` and `/backend` into `/_legacy_archive/`
  - [x] Initialize Next.js (App Router), Tailwind CSS, and TypeScript in root
  - [x] Configure `.env.local` with Supabase, HiveMQ, Resend, and Gemini keys
  - [x] Create `lib/types.ts` and `lib/supabase.ts` (browser + admin client)
  - [x] Verify clean compilation (`npm run dev` / `npm run build`)
- [x] **Step 2: Mobile Shell & Navigation**
  - [x] Build `app/layout.tsx` with mobile phone container (`max-w-md mx-auto min-h-screen bg-white shadow-2xl relative flex flex-col`)
  - [x] Create Bottom Navigation Bar (`Dashboard` | `Profile`)
  - [x] Create Floating Dev Nav / State Switcher for rapid multi-screen browser testing
- [x] **Step 3: Screen 1 — Sign In (`/login`) & 2-Page Sign Up (`/signup` & `/signup/details`)**
  - [x] `/login`: Index No., Password, Forgot Password, Sign In, Sign Up link
  - [x] `/signup` (Screen 1A): Dedicated ID upload page with Gemini clarity verification & rejection alert
  - [x] `/signup/details` (Screen 1B): Extracted ID fields are UNCHANGEABLE / LOCKED, email is the ONLY editable field
  - [x] `/api/ocr`: Gemini 3.8 Flash OCR verifying card legibility with JSON mode, real dynamic extraction, and rejection handling
  - [x] `VERIFY` submission generating OTP and forwarding to `/verify`
- [x] **Step 4: Screen 2 — Verify / Reset Password (`/verify`)**
  - [x] 6-digit OTP verification code inputs
  - [x] New Password and Verify Password fields
  - [x] Submission and redirect to login/dashboard
- [x] **Step 5: Screen 3 — User Profile (`/profile`)**
  - [x] User avatar, display name, and university Index Number from Supabase (or demo session)
  - [x] Rental history preview and logout button
  - [x] Bottom Navigation integration
- [x] **Step 6: Screen 4 — Dynamic 2-State Dashboard (`/dashboard`)**
  - [x] Real-time slot status from Supabase `umbrellas` table
  - [x] **State A ("When borrowing" - no active loan):** Shows `Available slot: [ X ]`, active `Borrow` button, disabled `Return` button
  - [x] **State B ("When returning" - active loan):** Shows borrowed `Umbrella ID`, elapsed time (`Since when`), disabled `Borrow` button, active `Return` button
  - [x] Bottom Navigation integration
- [x] **Step 7: Full API Routes, MQTT Worker, Simulator & Emails**
  - [x] `/api/auth/*` (Sign up, OTP verification, Login)
  - [x] `/api/borrow` and `/api/return` with MQTT publish & simulation fallback
  - [x] Background worker `worker/mqtt-listener.ts` listening to `astrix/uom/kiosk-01/#`
  - [x] Resend email dispatch pipeline (OTP, rental confirmation, return receipt)
  - [x] Update `/firmware/mock_esp32.js` for `astrix/uom/kiosk-01/*` topics

---

## 🗄️ Database Schema & Live State

### Live Database: `https://ylmjqunzvhwzgyvlgauu.supabase.co`

### 1. `users` Table
| Column | Type | Constraints / Description |
| :--- | :--- | :--- |
| `index_no` | `VARCHAR(50)` | Primary Key (e.g. `210042A`) |
| `username` | `VARCHAR(100)` | Full student name |
| `address` | `TEXT` | Residential or hall address |
| `email` | `VARCHAR(255)` | Student email |
| `password` | `VARCHAR(255)` | Hashed password |
| `verification_code` | `VARCHAR(10)` | 6-digit OTP |
| `verification_expires` | `TIMESTAMPTZ` | OTP expiration timestamp |
| `is_verified` | `BOOLEAN` | Default `false` |
| `created_at` | `TIMESTAMPTZ` | Default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Default `now()` |

### 2. `umbrellas` Table (Pre-Seeded)
| Slot | Umbrella ID | Availability | Borrowed User |
| :--- | :--- | :--- | :--- |
| **1** | `04A1B2C3D4` | `true` | `null` |
| **2** | `04B2C3D4E5` | `true` | `null` |
| **3** | `04C3D4E5F6` | `true` | `null` |
| **4** | `04D4E5F6A7` | `true` | `null` |

### 3. `borrow_records` Table
| Column | Type | Constraints / Description |
| :--- | :--- | :--- |
| `record_id` | `UUID` | Primary Key (`gen_random_uuid()`) |
| `umbrella_id` | `VARCHAR(100)` | Matches umbrella RFID tag |
| `index_no` | `VARCHAR(50)` | Foreign Key -> `users.index_no` |
| `borrowed_time` | `TIMESTAMPTZ` | Default `now()` |
| `due_time` | `TIMESTAMPTZ` | Default `borrowed_time + 24 hours` |
| `returned_time` | `TIMESTAMPTZ` | Nullable until returned |
| `status` | `VARCHAR(20)` | `'ACTIVE'` \| `'RETURNED'` \| `'OVERDUE'` |
| `created_at` | `TIMESTAMPTZ` | Default `now()` |

---

## 📡 MQTT Interface Contracts (HiveMQ Cloud)

* **Command Topic:** `astrix/uom/kiosk-01/command/unlock`
  * Borrow: `{"action": "BORROW_UNLOCK", "slot": 1, "duration_ms": 5000, "index_no": "210042A"}`
  * Return: `{"action": "RETURN_UNLOCK", "slot": 2, "duration_ms": 8000, "index_no": "210042A"}`
* **Removal Event Topic:** `astrix/uom/kiosk-01/event/removed`
  * Payload: `{"event": "UMBRELLA_REMOVED", "slot": 1, "umbrella_id": "04A1B2C3D4", "index_no": "210042A"}`
* **Return Event Topic:** `astrix/uom/kiosk-01/event/returned`
  * Payload: `{"event": "UMBRELLA_RETURNED", "slot": 2, "umbrella_id": "04A1B2C3D4", "microswitch": true, "nfc_verified": true}`
* **Heartbeat Topic:** `astrix/uom/kiosk-01/status`
  * Payload: `{"station_id": "kiosk-01", "online": true, "timestamp": 1792474441000}`
