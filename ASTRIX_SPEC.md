# ASTRIX Master Specification & Progress Tracker
**Project:** IoT Smart Umbrella Borrowing System (University of Moratuwa)  
**Last Updated:** 2026-10-25

---

## 📌 7-Step Implementation Roadmap & Live Checklist

- [x] **Step 1: Foundation & Environment Setup**
  - [x] Archive legacy `/frontend` and `/backend` into `/_legacy_archive/`
  - [x] Initialize Next.js (App Router), Tailwind CSS, and TypeScript in root
  - [x] Configure `.env.local` from `.env.example` (Supabase, AUTH_SECRET, HiveMQ, email)
  - [x] Create `lib/types.ts` and `lib/supabase.ts` (server-only admin client)
  - [x] Verify clean compilation (`npm run dev` / `npm run build`)
- [x] **Step 2: Mobile Shell & Navigation**
  - [x] Build `app/layout.tsx` with mobile phone container (`max-w-md mx-auto min-h-screen bg-white shadow-2xl relative flex flex-col`)
  - [x] Create Bottom Navigation Bar (`Dashboard` | `Profile`)
  - [x] Create Floating Dev Nav / State Switcher for rapid multi-screen browser testing
- [x] **Step 3: Screen 1 — Sign In (`/login`) & 2-Page Sign Up (`/signup` & `/signup/details`)**
  - [x] `/login`: Index No., Password with salted cryptographic verification (`lib/password.ts`)
  - [x] `/signup` (Screen 1A): Live Barcode Scanner Viewfinder (`html5-qrcode`) with targeting laser & checksum decoding
  - [x] iOS Safari WebKit viewfinder fix (`object-fit: cover`, absolute full-container layout, dynamic proportional `qrbox`)
  - [x] Rejection of non-UoM barcodes ("Invalid barcode. Please point camera at University Student ID")
  - [x] Real-time duplicate account detection ("Account already exists for Index Number [X]")
  - [x] `/signup/details` (Screen 1B): Barcode Index Number strictly locked/unchangeable; Student Name & Email editable (email empty by default)
  - [x] Tamper-proof HMAC verification token (`lib/auth-token.ts`) ensuring zero unverified database pollution
  - [x] `VERIFY` submission generating OTP and forwarding to `/verify`
  - [x] Password hashing with random 16-byte salt and `scrypt` for all user accounts
- [x] **Step 4: Screen 2 — Verify / Reset Password (`/verify`)**
  - [x] 6-digit OTP verification code inputs with auto-focus and clipboard pasting
  - [x] Secure Password Reset pipeline (`/api/auth/forgot-password`): looks up registered email by Index No., generates 15-minute OTP, and emails reset code via Gmail SMTP
  - [x] Smooth "Forgot Password?" modal on `/login` with masked email feedback
  - [x] New Password and Confirm Password validation
  - [x] Cryptographic password replacement in Supabase `users` table using `scrypt` with unique 16-byte random salt
  - [x] Instant post-reset sign-in and redirect to `/login?reset=success`
- [x] **Step 5: Screen 3 — User Profile (`/profile`)**
  - [x] User avatar, display name, and university Index Number from Supabase (or demo session)
  - [x] Rental history preview and logout button
  - [x] Bottom Navigation integration
- [x] **Step 6: Screen 4 — Dynamic 2-State Dashboard (`/dashboard`)**
  - [x] Real-time slot status from Supabase `umbrellas` table
  - [x] **State A ("When borrowing" - no active loan):** Shows `Available slot: [ X ]`, active `Borrow` button, disabled `Return` button
  - [x] **State B ("When returning" - active loan):** Shows borrowed `Umbrella ID`, elapsed time (`Since when`), disabled `Borrow` button, active `Return` button
  - [x] Dynamic Full-Screen Ambient Glow: Green on Borrow in progress, Blue on Return in progress, Red on Error states
  - [x] Bottom Navigation integration
- [x] **Step 7: Full API Routes, MQTT Worker, Simulator & Emails**
  - [x] `/api/auth/*` (Sign up, OTP verification, Login)
  - [x] `/api/borrow` and `/api/return` send the cabinet command, wait for the cabinet response, then record the result
  - [x] Read-only cabinet monitor `worker/mqtt-listener.ts` (no database writes)
  - [x] Gmail SMTP real email dispatch pipeline (`teamastrixhq@gmail.com`) for OTP, rental confirmation, and return receipt
  - [x] `/firmware/mock_esp32.js` simulator on `astrix-umbrella/cabinet/*` topics
- [x] **Step 8: Security & Hardware Audit Fixes (2026-10-25)**
  - [x] Secrets only from environment variables; no fallback keys in source
  - [x] Signed httpOnly session cookie; API routes ignore `index_no` in request bodies
  - [x] All database access moved to API routes (`/api/me`); RLS on with no anon policies
  - [x] Signup token stores a keyed hash of the code; signup can't overwrite a verified account
  - [x] Rate limits on login, signup, verify and forgot-password
  - [x] Removed unauthenticated `/api/*/complete` and `/api/event/removed` routes
  - [x] Real umbrella tag UIDs; working ESP32-S3 firmware in `firmware/`
  - [x] Dedicated 4-button hardware testing matrix (Borrow, Return, Open, Close) for DEV001 with non-blocking parallel execution
  - [x] Database reset: all 4 umbrellas set to available (`availability = true`, `borrowed_user = null`), borrow records cleared
  - [ ] Move to a private MQTT broker with per-client publish rules
  - [ ] Back the rate limiter with a shared store (Upstash / Vercel KV)

---

## 🗄️ Database Schema & Live State

### Live Database: Supabase (URL and keys in environment variables only)

### 1. `users` Table
| Column | Type | Constraints / Description |
| :--- | :--- | :--- |
| `index_no` | `VARCHAR(50)` | Primary Key (e.g. `210042A`) |
| `username` | `VARCHAR(100)` | Full student name |
| `email` | `VARCHAR(255)` | Student email |
| `password` | `VARCHAR(255)` | Hashed password (`scrypt`) |
| `verification_code` | `VARCHAR(10)` | 6-digit OTP |
| `verification_expires` | `TIMESTAMPTZ` | OTP expiration timestamp |
| `is_verified` | `BOOLEAN` | Default `false` |
| `created_at` | `TIMESTAMPTZ` | Default `now()` |
| `updated_at` | `TIMESTAMPTZ` | Default `now()` |

### 2. `umbrellas` Table (Pre-Seeded)
| Slot | Umbrella ID | Availability | Borrowed User |
| :--- | :--- | :--- | :--- |
| **1** | `53 01 B8 CC 33 00 01` | `true` | `null` |
| **2** | `53 07 B8 CC 33 00 01` | `true` | `null` |
| **3** | `53 08 B8 CC 33 00 01` | `true` | `null` |
| **4** | `53 09 B8 CC 33 00 01` | `true` | `null` |

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

## 📡 MQTT Interface Contracts (Astrix Umbrella Cabinet — Official Hardware Contract)

* **Broker:** `broker.hivemq.com` (QoS 0)
  * **ESP32 / Microcontroller (TCP):** Port `1883` (`mqtt://broker.hivemq.com:1883`)
  * **Web & Serverless / Vercel (WebSockets SSL):** Port `8884` (`wss://broker.hivemq.com:8884/mqtt`). API routes subscribe to the response topic, publish the command, and wait up to 45 s for the matching response
* **Command Topic (Server ➔ ESP32):** `astrix-umbrella/cabinet/command`
  * Borrow Command: `{"action": "BORROW", "slot": 1}`
  * Return Command: `{"action": "RETURN", "slot": 1}`
* **Response Topic (ESP32 ➔ Server):** `astrix-umbrella/cabinet/response`
  * **Case 1 (Borrow Success):** `{"action": "BORROW", "slot": 1, "status": "SUCCESS", "message": "Umbrella taken from Slot 1. Closing the lock."}`
  * **Case 2 (Borrow Fail - Not Taken):** `{"action": "BORROW", "slot": 1, "status": "FAIL", "reason": "NOT_TAKEN", "message": "Umbrella was NOT taken from Slot 1 after 5 checks. Closing the lock."}`
  * **Case 3 (Return Success):** `{"action": "RETURN", "slot": 1, "status": "SUCCESS", "message": "Umbrella 1 returned to Slot 1. Closing the lock."}`
  * **Case 4 (Return Fail - No Umbrella):** `{"action": "RETURN", "slot": 1, "status": "FAIL", "reason": "NO_UMBRELLA", "message": "No umbrella returned to Slot 1 after 5 checks. Closing the lock."}`
  * **Case 5 (Return Fail - Wrong Umbrella):** `{"action": "RETURN", "slot": 1, "status": "FAIL", "reason": "WRONG_UMBRELLA", "message": "Wrong umbrella in Slot 1. Leaving the slot UNLOCKED - take it out and return Umbrella 1."}`

---

## 🛠️ Developer & Hardware Testing Mode (`DEV001`)
* **Access:** developer accounts are listed in the `DEV_INDEXES` environment variable and must sign in with their own password. The server decides developer access from the session.
* **Zero-Loan Hardware Testing Mode:** `DEV001` is designated as a pure hardware testing account. **No loans are ever created or recorded in `borrow_records`** for `DEV001`. The developer is never trapped in "State B (Active Loan)" and is free to test hardware repeatedly.
* **Dual Actuation Buttons per Slot:** On the `DEV001` dashboard, each physical slot (1–4) features **two dedicated buttons**:
  * 🔓 **"Borrow"** button: Sends `{"action": "BORROW", "slot": X}` directly to HiveMQ.
  * 🔒 **"Return"** button: Sends `{"action": "RETURN", "slot": X}` directly to HiveMQ (no active loan required).
* **Hardware-Verified Confirmation:** Loans are only created on a Case 1 response and only closed on a Case 3 response, by the API route that sent the command.
