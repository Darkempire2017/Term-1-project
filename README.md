# ☂️ Project ASTRIX: IoT Smart Umbrella Borrowing System
**University of Moratuwa (UoM) — Term 1 Engineering Project**  
**Lead AI Architect:** Antigravity AI & Team Astrix  
**Repository Branch:** `main`

---

## 📌 Executive Summary
Project ASTRIX is an IoT-enabled campus umbrella sharing kiosk system designed for the University of Moratuwa. Students can scan their university student ID card with their phone to register, receive a 6-digit OTP, and borrow or return umbrellas at physical IoT station kiosks equipped with solenoid locks and NFC tags.

---

## 🏛️ Master Architecture & Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Fullstack Framework** | **Next.js 15 (App Router)** | TypeScript, Tailwind CSS, Turbopack (`next dev --turbopack`) |
| **Mobile UX Shell** | **Responsive Phone Viewport** | Centered mobile frame (`max-w-md mx-auto min-h-screen`) |
| **Database & Auth** | **Supabase (PostgreSQL)** | URL: `https://ylmjqunzvhwzgyvlgauu.supabase.co` |
| **AI Vision & OCR** | **Google Gemini 2.5 Flash** | `@google/genai` model `gemini-2.5-flash` for ID card extraction |
| **IoT Cloud Broker** | **HiveMQ Cloud** | MQTT over TLS (Port 8883) & WebSockets (Port 8884) |
| **Hardware / Firmware** | **ESP32 & Simulator** | RC522 NFC Reader, 4x Solenoid Relays, CLI simulator |
| **Transactional Email** | **Resend API** | 6-digit OTP verification, borrow & return receipts |

---

## 🗄️ Database Schema & Live State

The live Supabase database is active and populated with the following 3 tables:

### 1. `users` Table
* `index_no` (`VARCHAR(50)`, Primary Key) — Student Index Number (e.g. `210042A`)
* `username` (`VARCHAR(100)`) — Student Full Name (locked from ID card)
* `address` (`TEXT`) — Hall or Residential Address (locked from ID card)
* `email` (`VARCHAR(255)`) — Editable student contact email
* `password` (`VARCHAR(255)`) — Encrypted account password
* `verification_code` (`VARCHAR(10)`) — 6-digit OTP
* `verification_expires` (`TIMESTAMPTZ`) — OTP expiration timestamp
* `is_verified` (`BOOLEAN`) — Student verification state (`true` / `false`)

### 2. `umbrellas` Table (Pre-Seeded 1 to 4)
* `slot` (`INT`, Primary Key: 1, 2, 3, 4)
* `umbrella_id` (`VARCHAR(100)`) — Hardware RFID/NFC Tag UID:
  * **Slot 1:** `04A1B2C3D4`
  * **Slot 2:** `04B2C3D4E5`
  * **Slot 3:** `04C3D4E5F6`
  * **Slot 4:** `04D4E5F6A7`
* `availability` (`BOOLEAN`) — `true` when docked, `false` when checked out
* `borrowed_user` (`VARCHAR(50)`, Foreign Key -> `users.index_no`)

### 3. `borrow_records` Table
* `record_id` (`UUID`, Primary Key)
* `umbrella_id` (`VARCHAR(100)`) — Matches NFC tag
* `index_no` (`VARCHAR(50)`, Foreign Key -> `users.index_no`)
* `borrowed_time` (`TIMESTAMPTZ`)
* `due_time` (`TIMESTAMPTZ`, default `now() + 24 hours`)
* `returned_time` (`TIMESTAMPTZ`)
* `status` (`VARCHAR(20)`) — `'ACTIVE'` | `'RETURNED'` | `'OVERDUE'`

---

## 📡 MQTT Topic Contracts

* **Unlock Command:** `astrix/uom/kiosk-01/command/unlock`
  * Borrow: `{"action": "BORROW_UNLOCK", "slot": 1, "duration_ms": 5000, "index_no": "210042A"}`
  * Return: `{"action": "RETURN_UNLOCK", "slot": 2, "duration_ms": 8000, "index_no": "210042A"}`
* **Removal Event:** `astrix/uom/kiosk-01/event/removed`
  * `{"event": "UMBRELLA_REMOVED", "slot": 1, "umbrella_id": "04A1B2C3D4", "index_no": "210042A"}`
* **Return Event:** `astrix/uom/kiosk-01/event/returned`
  * `{"event": "UMBRELLA_RETURNED", "slot": 2, "umbrella_id": "04A1B2C3D4", "microswitch": true, "nfc_verified": true}`
* **Station Heartbeat:** `astrix/uom/kiosk-01/status`
  * `{"station_id": "kiosk-01", "online": true, "timestamp": 1792474441000}`

---

## 🚀 Progress Tracker & What Has Been Built (Steps 1 to 6)

### ✅ Completed Steps (1 to 6):
1. **Step 1: Foundation & Environment:**
   * Unified root Next.js App Router codebase with Tailwind CSS, Turbopack, and TypeScript.
   * Supabase client initialization in `lib/supabase.ts` (browser + admin service-role).
   * Archived legacy prototype files into `/_legacy_archive/`.
2. **Step 2: Mobile Shell & Viewports:**
   * Mobile phone container in `app/layout.tsx` (`max-w-md mx-auto min-h-screen`).
   * Simulated dynamic island status bar in `components/PhoneHeader.tsx`.
   * Bottom navigation bar in `components/BottomNav.tsx` (`Dashboard` | `Profile`).
   * View Mode Switcher in `components/DevToolbar.tsx` for toggling **Student POV (Clean Mode)**.
3. **Step 3: Screen 1 — Sign In & 2-Stage Sign Up:**
   * `app/api/ocr/route.ts`: Gemini 2.5 Flash OCR extracting student info with image clarity verification and rejection banner if blurry.
   * `app/signup/page.tsx` (Stage 1): Dedicated ID upload screen with camera capture and guidelines.
   * `app/signup/details/page.tsx` (Stage 2): Name, Index No, and Address are **locked and unchangeable**; student only inputs their email.
   * `app/login/page.tsx`: Index number and password authentication.
4. **Step 4: Screen 2 — Verify / Reset Password (`/verify`):**
   * 6-digit OTP verification inputs with auto-focus.
   * Password creation and verification.
   * Submitting automatically updates Supabase and **redirects back to `/login`** with a green confirmation banner and pre-filled index number.
5. **Step 5: Screen 3 — Student Profile (`/profile`):**
   * Student initials avatar, verified Moratuwa badge, university details, active loan status, and sign out button.
6. **Step 6: Screen 4 — Dynamic 2-State Dashboard (`/dashboard`):**
   * **State A (When Borrowing):** Shows `Available slot: Slot X`, active `Borrow Umbrella` button, disabled `Return` button, and visual 4-slot status matrix.
   * **State B (When Returning):** Shows `Borrowed Umbrella ID`, live elapsed timer (`Since when`), disabled `Borrow` button, and active `Return Umbrella` button.
7. **Step 7: Full API Routes, MQTT Worker, Simulator & Emails:**
   * `/api/auth/*` (Sign up with OTP, verification, login).
   * `/api/borrow` and `/api/return` with live Supabase transactions, 1-umbrella limits, and 24h due timers.
   * `lib/mqtt.ts`: Publishes `BORROW_UNLOCK` and `RETURN_UNLOCK` commands to `astrix/uom/kiosk-01/command/unlock`.
   * `lib/email.ts`: Resend email integration for verification OTPs, borrow receipts, and return receipts.
   * `worker/mqtt-listener.ts`: HiveMQ Cloud background event listener.
   * `firmware/mock_esp32.js`: Upgraded interactive hardware simulator with keyboard controls (`1-4`, `r`, `s`, `q`).

---

## 💻 Running the App & Simulating Hardware

```powershell
# 1. Install dependencies
npm install

# 2. Start Next.js Development Server (Turbopack)
npm run dev

# 3. Type check (without disturbing the running dev server)
npm run typecheck
```
* **Local Web App:** `http://localhost:3000`
* **Student Sign In:** `http://localhost:3000/login`
* **Student ID Upload:** `http://localhost:3000/signup`
* **Student Kiosk Dashboard:** `http://localhost:3000/dashboard`
* **Student Profile:** `http://localhost:3000/profile`

---

## 🤖 Instructions for AI Assistants (Antigravity / Cursor / Claude)

If you are an AI assistant taking over or collaborating on this codebase:
1. **Rule 1 (Permission First):** Always explain what files you plan to modify and ask for explicit "Approved" / "Yes" from the user before writing files.
2. **Rule 2 (One Step at a Time):** Follow the roadmap in `ASTRIX_SPEC.md` strictly. Update the checklist as steps finish.
3. **Rule 3 (Zero Build Breakages):** Keep the codebase compiling cleanly with `npm run typecheck`.
4. **Current Status:** Steps 1 through 6 are **100% complete**. You should immediately proceed to **Step 7**.
