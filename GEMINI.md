# Project ASTRIX: Permanent Context & Operating Directives

**System:** IoT Smart Umbrella Borrowing System for the University of Moratuwa (UoM)  
**Lead Developer:** Antigravity AI  

---

## 🔒 Strict Operating Rules (Never Break These)
1. **Rule 1 (Permission First):** Always explain what files you will create/modify and ask for explicit "Yes" / "Approved" before executing any file changes or package installs.
2. **Rule 2 (One Step at a Time):** Execute strictly ONE step at a time (Step 1 -> Step 7). After completing each step, update the status checklist in `ASTRIX_SPEC.md` so state persists across chat sessions.
3. **Rule 3 (Zero Build Breakages):** Every step must leave the codebase compiling and running cleanly (`npm run dev`) with zero TypeScript or Next.js build errors.
4. **Rule 4 (No Secrets in Code):** Never write API keys, passwords or fallback secrets into source files. Read them from environment variables only.
5. **Rule 5 (Trust the Session):** API routes must get the student from the session cookie, never from the request body.

---

## 🏛️ Master Architecture
* **Frontend & Fullstack API:** Next.js (App Router) + TypeScript + Tailwind CSS (Mobile container `max-w-md mx-auto`)
* **Database & Auth:** Supabase PostgreSQL, accessed only from API routes (keys in environment variables, never in code). Sessions are signed httpOnly cookies (`lib/session.ts`).
  * Tables: `users` (PK: `index_no`), `umbrellas` (PK: `slot` 1-4), `borrow_records` (PK: `record_id` UUID)
* **Hardware & IoT:** ESP32 Microcontroller + HiveMQ MQTT Broker
  * Topics: `astrix-umbrella/cabinet/command` (server ➔ cabinet) and `astrix-umbrella/cabinet/response` (cabinet ➔ server). See README for the 5 response cases.
* **ID Scanner:** Live On-Device Barcode & QR Scanner (`html5-qrcode`) for 100% private & accurate Student ID extraction
* **Transactional Email:** Gmail SMTP (`nodemailer`) with Resend fallback for OTP verification, rental receipts, and return confirmations

---

## 📁 Repository Structure
* `/app` - Next.js App Router (Screens: `/login`, `/signup`, `/verify`, `/profile`, `/dashboard` + API routes)
* `/lib` - `supabase.ts` (server admin client), `session.ts`, `mqtt.ts`, `types.ts`, and helper utilities
* `/components` - Reusable mobile UI components & bottom navigation
* `/worker` - `mqtt-listener.ts` (read-only cabinet MQTT monitor)
* `/firmware` - ESP32 Arduino sketch (`esp32_smart_umbrella.ino`) & CLI simulator (`mock_esp32.js`)
* `/supabase` - `schema.sql` (real schema) and `migrations/`
* `/_legacy_archive` - Preserved early Vite & Express drafts
