# ☂️ Project ASTRIX: IoT Smart Umbrella Borrowing System
**University of Moratuwa (UoM) — Term 1 Engineering Project**
**Team Astrix**

---

## 📌 Summary
ASTRIX is a campus umbrella-sharing cabinet. Students register by scanning their university ID barcode, verify their email with a 6-digit code, then borrow or return umbrellas from a 4-slot ESP32 cabinet with servo locks, push-button docking sensors and RFID-tagged umbrellas.

---

## 🏛️ Architecture

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Web app & API** | **Next.js 15 (App Router)** | TypeScript, Tailwind CSS, deployed on Vercel |
| **Database** | **Supabase (PostgreSQL)** | Accessed only from API routes with the service-role key |
| **Sessions** | **Signed httpOnly cookie** | `lib/session.ts`, signed with `AUTH_SECRET` |
| **ID Scanner** | **`html5-qrcode`** | On-device barcode scanner with index-number validation |
| **IoT broker** | **HiveMQ (MQTT)** | Public test broker by default; set a private broker for real use |
| **Cabinet** | **ESP32-S3** | 4 servo locks, 4 push buttons, 4 RC522 RFID readers (`firmware/`) |
| **Email** | **Gmail SMTP (`nodemailer`)**, Resend fallback | Verification codes, borrow and return receipts |

### How a borrow works
1. The student taps **Borrow**. The browser calls `POST /api/borrow` (the session cookie identifies the student).
2. The API claims a free slot in the database, sends `{"action":"BORROW","slot":N}` to `astrix-umbrella/cabinet/command`, and waits up to 45 s for the cabinet's reply on `astrix-umbrella/cabinet/response`.
3. On `SUCCESS` the API records the loan and emails a receipt. On `FAIL` it frees the slot again.

Returns work the same way through `POST /api/return`. The return slot always comes from the student's loan (each umbrella has a home slot). The browser never writes to the database.

The cabinet runs all 4 slots at the same time, so several students can borrow or return at once (about 7–13 s each). If the cabinet never answers a borrow, the slot stays held (`availability = true`, `borrowed_user` set) until someone checks the cabinet and clears it, so an umbrella can't leave without a loan.

---

## 🗄️ Database
The real schema is in [`supabase/schema.sql`](supabase/schema.sql): `users`, `umbrellas` (slots 1–4) and `borrow_records`. Row level security is on with no policies, so only the server can read or write.

For the existing live database, run [`supabase/migrations/20261025_lockdown.sql`](supabase/migrations/20261025_lockdown.sql) once, **after** deploying this version.

| Slot | Umbrella tag UID |
| :--- | :--- |
| 1 | `53 01 B8 CC 33 00 01` |
| 2 | `53 07 B8 CC 33 00 01` |
| 3 | `53 08 B8 CC 33 00 01` |
| 4 | `53 09 B8 CC 33 00 01` |

---

## 📡 MQTT Contract

* **Command** (server ➔ cabinet): `astrix-umbrella/cabinet/command`
  * `{"action": "BORROW", "slot": 1}` or `{"action": "RETURN", "slot": 1}`
* **Response** (cabinet ➔ server): `astrix-umbrella/cabinet/response`, QoS 0

| Case | Response |
| :--- | :--- |
| Borrow success | `{"action":"BORROW","slot":X,"status":"SUCCESS","message":"Umbrella taken from Slot X. Closing the lock."}` |
| Borrow fail | `{"action":"BORROW","slot":X,"status":"FAIL","reason":"NOT_TAKEN","message":"Umbrella was NOT taken from Slot X after 5 checks. Closing the lock."}` |
| Return success | `{"action":"RETURN","slot":X,"status":"SUCCESS","message":"Umbrella X returned to Slot X. Closing the lock."}` |
| Return fail | `{"action":"RETURN","slot":X,"status":"FAIL","reason":"NO_UMBRELLA","message":"No umbrella returned to Slot X after 5 checks. Closing the lock."}` |
| Wrong umbrella | `{"action":"RETURN","slot":X,"status":"FAIL","reason":"WRONG_UMBRELLA","message":"Wrong umbrella in Slot X. Leaving the slot UNLOCKED - take it out and return Umbrella X."}` |

* **Slot state** (cabinet ➔ server): `astrix-umbrella/cabinet/slots`, **retained**. Sent whenever what is in a slot changes, and at least once a minute:
  `{"slots":[{"slot":1,"busy":false,"docked":true,"umbrella":1}, ...]}` (`umbrella` = number read on that slot's reader, `0` = unknown tag, `null` = no tag).
  `lib/cabinet-sync.ts` reads it (after `/api/me`, at most every 15 s) and fixes the database: if a slot's own umbrella is back while the database says it is out, the open loan is closed (e.g. a return done at the cabinet with `r1`). If a free slot is empty at the cabinet, the slot is marked out. Busy slots and loans younger than 60 s are left alone. A slot held by a borrow (`availability = true` with `borrowed_user` set) is only touched once it has looked the same for more than 60 s, longer than any real borrow: if its umbrella is still docked the hold is released (e.g. Borrow pressed while the cabinet was offline), and if the slot is empty the loan is recorded for the student who held it (the cabinet opened it but its answer was lost).

> ⚠️ On the public broker anyone can publish to these topics. Before real use, move to a private broker (e.g. HiveMQ Cloud free tier) and allow only the cabinet to publish responses and only the server to publish commands. Set `HIVEMQ_*` in Vercel and `MQTT_USER`/`MQTT_PASS` in the firmware.

---

## 💻 Running locally

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # http://localhost:3000
npm run typecheck
```

| Variable | Purpose |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database (server only) |
| `AUTH_SECRET` | Signs session cookies and signup tokens (≥ 32 random characters) |
| `DEV_INDEXES` | Index numbers that get the hardware testing console, e.g. `DEV001` |
| `HIVEMQ_BROKER_URL`, `HIVEMQ_USERNAME`, `HIVEMQ_PASSWORD` | MQTT broker (optional; public broker if empty) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` or `RESEND_API_KEY` | Email delivery |

Without an email provider, local development prints verification codes to the server console. In production, signup fails until email is configured.

### Hardware tools
* `npm run simulator` — interactive cabinet simulator (`firmware/mock_esp32.js`)
* `npx tsx worker/mqtt-listener.ts` — read-only monitor that prints every cabinet command and response
* `firmware/esp32_smart_umbrella.ino` — the cabinet firmware, all 4 slots in parallel (fill in WiFi, and broker login if using a private broker). The older one-slot-at-a-time version is tagged `v1.0-serial-cabinet` on the Darkempire2017 fork.

---

## 🔒 Security notes
* Secrets live only in environment variables. Never add fallback keys to source files.
* API routes take the student from the session cookie, never from the request body.
* Developer accounts are listed in `DEV_INDEXES`; there is no special password in the code.
* Rate limits in `lib/rate-limit.ts` are per server instance. For production, back them with a shared store (Upstash Redis or Vercel KV).
