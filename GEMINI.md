# Project ASTRIX: Permanent Context & Operating Directives

**System:** IoT Smart Umbrella Borrowing System for the University of Moratuwa (UoM)  
**Lead Developer:** Antigravity AI  

---

## 🔒 Strict Operating Rules (Never Break These)
1. **Rule 1 (Permission First):** Always explain what files you will create/modify and ask for explicit "Yes" / "Approved" before executing any file changes or package installs.
2. **Rule 2 (One Step at a Time):** Execute strictly ONE step at a time (Step 1 -> Step 7). After completing each step, update the status checklist in `ASTRIX_SPEC.md` so state persists across chat sessions.
3. **Rule 3 (Zero Build Breakages):** Every step must leave the codebase compiling and running cleanly (`npm run dev`) with zero TypeScript or Next.js build errors.

---

## 🏛️ Master Architecture
* **Frontend & Fullstack API:** Next.js (App Router) + TypeScript + Tailwind CSS (Mobile container `max-w-md mx-auto`)
* **Database & Auth:** Supabase PostgreSQL (`https://ylmjqunzvhwzgyvlgauu.supabase.co`)
  * Tables: `users` (PK: `index_no`), `umbrellas` (PK: `slot` 1-4), `borrow_records` (PK: `record_id` UUID)
* **Hardware & IoT:** ESP32 Microcontroller + HiveMQ MQTT Broker
  * Topics: `astrix/uom/kiosk-01/command/unlock`, `astrix/uom/kiosk-01/event/removed`, `astrix/uom/kiosk-01/event/returned`, `astrix/uom/kiosk-01/status`
* **AI & Vision:** Google Gemini 2.5 Flash (`@google/genai`) for University Student ID OCR
* **Transactional Email:** Resend API for OTP verification, rental receipts, and return confirmations

---

## 📁 Repository Structure
* `/app` - Next.js App Router (Screens: `/login`, `/signup`, `/verify`, `/profile`, `/dashboard` + API routes)
* `/lib` - `supabase.ts` (browser & admin clients), `types.ts`, and helper utilities
* `/components` - Reusable mobile UI components & bottom navigation
* `/worker` - `mqtt-listener.ts` (HiveMQ Cloud event bridge)
* `/firmware` - ESP32 Arduino sketch (`esp32_smart_umbrella.ino`) & CLI simulator (`mock_esp32.js`)
* `/supabase` - Schema SQL documentation
* `/_legacy_archive` - Preserved early Vite & Express drafts
