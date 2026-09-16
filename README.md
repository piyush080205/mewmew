
# Jāgriti – Autonomous Women Safety System

![Jāgriti Logo](frontend/assets/images/icon.png)

**Jāgriti** is a women-safety mobile app built around an
**offline-first, multi-signal SOS system**: it detects potential emergencies from motion
sensors, confirms with the user before acting, and gets the alert out through whichever
channel is actually available — on-device SMS, phone call, or the internet — without
depending on connectivity.

It also supports WhatsApp-style **live location sharing** so a trusted contact can watch
someone's trip in real time via a link, no app install required.

---

## Architecture

```
frontend/            Expo (React Native + expo-router) app — UI, auth, trips, live sharing
frontend/android/app/src/main/java/com/nirbhay/safety/
                      Native Kotlin layer — background motion monitoring & offline SOS,
                      since this cannot be done reliably from JS alone on Android
backend/              FastAPI service — Supabase-backed API, deployed on AWS App Runner
```

### Native Android SOS pipeline (`frontend/android/.../safety/sos/`)

- `MotionForegroundService` + `MotionFeatureExtractor` — a foreground service samples
  accelerometer/gyroscope and derives motion features (impact, jerk, rotation, inactivity).
- `EmergencyConfidenceEngine` — fuses those features into a confidence score instead of a
  single threshold (impact → abnormal movement → inactivity → high confidence).
- `EmergencyConfirmationController` — shows an "Are you safe?" countdown before an SOS
  is raised, so normal activity (walking, sitting, a dropped phone) doesn't trigger alerts.
- `SosEventRepository` + Room (`data/`) — every SOS is persisted locally first
  (`PENDING → SMS_ATTEMPTED → SENT → SERVER_SYNCED`) so it survives process death and
  offline periods.
- `CommunicationManager` — tries transports in priority order:
  1. **`SmsTransport`** — free, on-device SMS to emergency contacts (works with just cellular).
  2. **`CallTransport`** — fallback emergency call.
  3. **`InternetTransport`** — syncs the event to the backend when online, and also fetches
     the trip's live-share link to send as a free follow-up SMS.
  4. **`BluetoothRelayTransport`** — stubbed for a future nearby-device relay; never claims
     success today.
- `SosSyncWorker` (WorkManager) — retries the internet sync later if it fails immediately.

### Backend (`backend/`)

FastAPI + Supabase (Postgres). Key routers:
- `routers/trips.py` + `risk_engine.py` — autonomous trip tracking and rule-based risk scoring.
- `routers/sos.py` — account settings, emergency contacts, and `/api/sos/sync` for the
  offline-first SOS events described above (also mints/returns live-share links).
- `routers/safety.py`, `routers/chat.py` — safety-check flow and in-app safety chat.

Deployed as a Docker container on **AWS App Runner**, built via **AWS CodeBuild**
(see `backend/buildspec.yml`, `backend/Dockerfile`).

---

## Prerequisites

- **Node.js 18+** and **Yarn** (`npm install -g yarn`)
- **Python 3.9+**
- A **Supabase** project (Postgres + auth)
- **Expo Go** or a development build, for running on a physical Android device
- Android Studio / JDK, only if building the native `android/` project locally

---

## Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Create `backend/.env`:

```env
SUPABASE_URL=
SUPABASE_SECRET_KEY=

# Optional / best-effort backup SMS gateway (on-device SMS is the primary channel)
FAST2SMS_API_KEY=

# Cellular/IP geolocation fallback when GPS is unavailable
UNWIRED_LABS_API_KEY=

# Safety chat
GEMINI_API_KEY=

# Origin the live-sharing web page is served from
PUBLIC_BASE_URL=http://localhost:8001
```

Apply the database schema once, by running the setup helper and pasting the printed SQL
into the Supabase SQL Editor (the Supabase REST client can't run DDL directly):

```bash
python setup_supabase.py
# also run schema_live_sharing.sql, schema_trip_sharing.sql,
# schema_city_safety.sql, schema_user_settings.sql, schema_location_events_columns.sql,
# schema_siliguri_safety.sql
```

`schema_siliguri_safety.sql` creates `police_stations` and `safety_support_locations` tables
(independently web-verified Siliguri, West Bengal police/hospital/fire/transit data — see
`output/siliguri_source_audit.csv` at the repo root for the full corrections trail) and adds
a curated `Siliguri` row to `city_safety_data` so `/api/safety/city-data` returns it for
Siliguri-area coordinates, the same way Delhi is curated today.

---

## Frontend Setup

```bash
cd frontend
yarn install
```

Create `frontend/.env`:

```env
EXPO_PUBLIC_BACKEND_URL="http://YOUR_LOCAL_IP:8001"
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Find your local IP with `ipconfig` (Windows) / `ifconfig` (macOS/Linux) if testing on a
physical device over the same network.

Run with Expo Go (JS-only features):

```bash
npx expo start --tunnel
```

The native background-motion/offline-SOS pipeline only exists in the custom
`android/` project, so to test it you need a development or EAS build rather than Expo Go:

```bash
npx expo run:android
# or, for a distributable build:
npx eas build -p android --profile preview
```

---

## Deployment

- **Backend**: pushed as a container to AWS App Runner. Trigger a rebuild via CodeBuild,
  then `aws apprunner start-deployment --service-arn <arn>`.
- **Mobile app**: built via EAS (`eas.json` has `development`, `preview`, and `production`
  profiles). Run `npx eas build -p android --profile preview` after backend-affecting or
  native changes; check status with `npx eas build:list`.

---

## Notes

- Offline SOS is designed to never claim a communication path exists when it doesn't — if
  there's no cellular, Wi-Fi, or Bluetooth relay available, the event is persisted locally
  and sent as soon as one becomes available.
- Keep the phone screen locked and disable battery optimization for the app when testing
  background motion detection.
- `buildfailed.txt` / `next.md` in the repo root are working notes, not documentation.

---

## Team

- **Piyush** — Founder
- **Mehak Sharma** — Co-founder

---

**Jāgriti – Safety that doesn't wait for permission.**
