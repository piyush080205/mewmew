# Until now

## Backend performance optimization + invite gate removal

- Removed `/api/validate-invite` and the `invites` table dependency from `backend/server.py`. Frontend `tripStore.ts` had unused invite state (`isInviteVerified` etc.) that was never wired to anything — left as-is.
- Switched Supabase access from the sync client to the async client (`supabase.acreate_client`), via a lazily-created singleton in `backend/supabase_client.py` (`get_supabase()`). All DB calls in `server.py` are now `await`ed instead of blocking the event loop.
- Added a FastAPI `lifespan` handler in `server.py` that creates one pooled `httpx.AsyncClient` for the whole process (SMS, cellular triangulation, Overpass, Nominatim) instead of opening a new connection per request.
- Removed the read-modify-write pattern that fetched the full `trips` row and rewrote a growing JSON array (`trips.locations` / `trips.motion_events`) on every location/motion update. `location_events` and `sensor_events` are now the source of truth:
  - `add_location` inserts `latitude, longitude, accuracy, source, accuracy_radius` into `location_events`.
  - `add_motion_event` merges computed `accel_variance`, `gyro_variance`, `is_panic` into the existing `sensor_data` JSON column on `sensor_events` (no schema change needed there).
  - `evaluate_risk_rules(trip_id)` now queries `location_events`/`sensor_events` with a time window (last 30s/60s, or last 5 rows) instead of scanning the trip's full history — cost stays flat as a trip goes on.
  - `get_debug_info` rewritten to pull last-location/recent-motion/counts from the event tables.
  - `trips.risk_events` was intentionally left as a JSON array — rare writes (only on detection), so out of scope.
- Parallelized the independent Overpass lookups (`get_nearby_police_stations` + `get_safe_spots`) in `/api/routes/analyze` via `asyncio.gather`.
- Removed hot-path `print()` debug statements.

**Files touched:** `backend/server.py`, `backend/supabase_client.py`.

### Known gap / needs your action
Couldn't verify against live Supabase — the project URL in `backend/.env` (`bfjkwczsgdtydolfhfvq.supabase.co`) doesn't resolve from this machine (DNS failure), so it may be paused, deleted, or the URL is stale. Once reachable, run this in the Supabase SQL editor before relying on the new code path:

```sql
alter table location_events
  add column if not exists accuracy double precision,
  add column if not exists source text,
  add column if not exists accuracy_radius double precision;

create index if not exists location_events_user_created_idx
  on location_events (user_id, created_at);

create index if not exists sensor_events_user_created_idx
  on sensor_events (user_id, created_at);
```
This assumes both tables have a `created_at` timestamp column (Supabase's default when a table is created via the dashboard) — worth double-checking column names actually match before relying on the time-window queries.

## Frontend: Expo SDK upgrade

- Project was pinned to Expo SDK 56 but the user's installed Expo Go app is SDK 57 — they're incompatible (Expo Go only runs the SDK it ships with).
- Upgraded `frontend/package.json` to SDK 57 (`npm install expo@^57.0.0` + `npx expo install --fix`): `react-native` 0.85.3 → 0.86.3, `react-native-reanimated` → 4.5.1, `react-native-worklets` → 0.10.1, plus the various `expo-*` packages.
- Cleaned up `frontend/app.json` schema errors surfaced by `expo-doctor`: removed deprecated `privacy` and `newArchEnabled` top-level fields, and `android.edgeToEdgeEnabled` (all no longer valid/needed in SDK 57's config schema).
- Remaining `expo-doctor` warnings are pre-existing and out of scope: app icon / adaptive icon aren't square (317x279 instead of square), and a note that `android/`+`ios/` native folders exist alongside app.json config (only matters for EAS Build, not for local Expo Go testing).

## Local dev environment

- Backend runs locally via `uvicorn server:app --host 0.0.0.0 --port 8001 --reload` from `backend/` (using the venv at `backend/venv`).
- Frontend `.env` (`EXPO_PUBLIC_BACKEND_URL`) was pointed at the local backend (`http://<LAN-IP>:8001/api`) instead of the deployed Render backend, so Expo Go / the browser build talk to local code. **Remember to point it back at the Render URL before shipping**, or before testing production behavior.
- The machine's LAN IP changed at least once during the session (`192.168.1.11` → `192.168.1.21`) — if `.env`'s backend URL or any QR code goes stale, re-check `ipconfig` and update both.

### Phone (Expo Go) testing — RESOLVED
`index.tsx` and `debug.tsx` were restored (see below), which fixed the earlier `Uncaught Error: java.io.IOException: Failed to download remote update` that came from the standalone EAS-built "Nirbhay" app trying (and failing) to fetch an OTA update. Once Expo Go itself was used with a fresh QR scan, a **second, separate** instance of the same error appeared — this one was a real networking issue, root-caused and fixed; see "Networking: AP isolation" below.

### Browser testing — confirmed working
`http://localhost:8081/` shows an "Unmatched Route" screen — a pre-existing, separate bug where the client-side redirect from `/` to `/routes` (done in `app/_layout.tsx`'s `useEffect`) doesn't fire reliably on Expo web. Not caused by anything in this session's changes.
`http://localhost:8081/routes` loads correctly — verified via Claude-in-Chrome browser automation, "Safe Routes" screen renders fully with live data, no console errors. Use this URL directly when testing in a browser.

## Restored screens: `index.tsx`, `debug.tsx`

The user pasted the full source of three previously-missing screens (`index.tsx`, `debug.tsx`, `invite.tsx`) recovered from elsewhere. Per the user's earlier explicit decision to remove the invite gate, **only `index.tsx` and `debug.tsx` were restored** — `invite.tsx` and its backend endpoint were deliberately left out.

- Added `frontend/app/index.tsx` (home screen: start/end trip, guardian numbers, tracking status, feature cards) and `frontend/app/debug.tsx` (health check, trip debug info, risk-rule reference) verbatim — both lined up cleanly against the existing `tripStore.ts`, `services/api.ts`, `BackgroundMotionService.ts`, `MapView.tsx`, `SafetyCheckModal.tsx` with no signature mismatches.
- Removed a stale redirect in `frontend/app/_layout.tsx` (`if (!segments[0]) router.replace('/routes')`) that was added back when there was no `index.tsx` — left in place it would have made the restored home screen permanently unreachable. Added explicit `<Stack.Screen name="index" />` / `<Stack.Screen name="debug" />` entries.

## jāgriti visual rebrand

Full rebrand from "Nirbhay" (dark theme) to "jāgriti" (light theme) per `design_handoff_jagriti_rebrand/README.md` and its `jagriti-reference.html` mockup.

- New `frontend/constants/theme.ts` — single source of truth for all colors/fonts (`colors.*`, `fonts.*`), replacing ~250 hardcoded hex literals across the app.
- New `frontend/components/Logo.tsx` — SVG logo mark (circle + swoosh) via `react-native-svg` (newly added dependency).
- Manrope font family (`@expo-google-fonts/manrope`) loaded via `useFonts()` in `_layout.tsx`, gating render behind `fontsLoaded`.
- `app.json`: `name` → `"jāgriti"` only. `slug`/`scheme`/`bundleIdentifier`/`package`/icon/splash deliberately left untouched — riskier to change (EAS/store config) and/or explicitly out of scope per the README ("not covered in this pass").
- Color/font token migration applied to all 6 files named in the README plus `debug.tsx` (found with the same stale dark palette during exploration, added to scope): `app/index.tsx`, `app/chat-safety.tsx`, `app/debug.tsx`, `app/routes.tsx`, `components/MapView.tsx`, `components/SafetyCheckModal.tsx`. Work was split across 4 parallel sub-agents; the `routes.tsx` agent couldn't run its own verification (sandboxed, no shell access) — I ran `npx tsc --noEmit --ignoreDeprecations 6.0` myself afterward and confirmed **zero errors project-wide**.
- **Not done, explicitly out of scope:** app icon and splash screen assets — still old branding. Flag separately if the user wants those redesigned too.

## Networking: AP isolation broke phone testing entirely

After the rebrand, a fresh Expo Go connection to the LAN dev server (`exp://192.168.1.21:8081`) still failed with `Failed to download remote update`, even after confirming: correct IP, Metro actually running, and (after adding one) a Windows Firewall allow-rule for port 8081. Root cause turned out to be the **Wi-Fi router itself** ("Airtel_Kiss to Connect ?") — AP/client isolation, a common default on Indian ISP routers, silently blocks device-to-device LAN traffic even on the same SSID/same internet. Confirmed by checking Metro's own logs: zero connection attempts ever arrived from the phone, despite the phone reporting it tried.

**Fix — tunnel mode for everything, LAN mode does not work on this network:**
- Metro/JS bundle: `npx expo start --tunnel -c` (uses Expo's own bundled ngrok relay, e.g. `https://mfzhedc-piyush08-8081.exp.direct`).
- **Also needed a second tunnel for the backend API** — the Metro tunnel only carries the JS bundle; `fetch()` calls from the app still hit `EXPO_PUBLIC_BACKEND_URL` directly, which was still the LAN IP and thus still blocked by the same AP isolation (surfaced as `NoRouteToHostException: Host unreachable` on Start Trip / health check). Fixed by tunneling the backend too via `npx localtunnel --port 8001` (no signup needed, unlike raw `ngrok.exe` which requires its own auth token — Expo's bundled ngrok works without one but the standalone CLI binary doesn't). `frontend/.env`'s `EXPO_PUBLIC_BACKEND_URL` was pointed at the resulting `https://<subdomain>.loca.lt` URL, then Metro restarted with `-c` to pick it up (`EXPO_PUBLIC_*` vars are baked in at bundle time, not hot-reloadable).
- Both tunnel URLs are **ephemeral** — they change every time the tunnel process restarts. Next session: regenerate both, update `.env` with the new backend tunnel URL, restart Metro with `-c`.
- `WINDOWS_SETUP.md` was rewritten (was very stale — referenced MongoDB, Yarn, wrong `.env` format) to reflect the actual current stack (Supabase backend) and this tunnel requirement.

## Outstanding / unresolved

- Tunnel URLs are ephemeral (see above) — don't reuse the exact URLs written into this doc or `.env` from a prior session without checking they're still live.
- App icon / splash screen assets still show old "Nirbhay" branding — out of scope for the rebrand pass, revisit if wanted.
- All local dev servers (backend uvicorn, Metro/Expo tunnel, localtunnel) were stopped at the end of this session per the user's request. **One exception**: the backend `uvicorn` process (last seen on port 8001) was started in a terminal window outside this session's reach — `Stop-Process` couldn't find its PID even though `netstat`/`Get-NetTCPConnection` showed it still listening, meaning it's running in a session/desktop context this tool can't touch. The user needs to close that terminal window manually (`Ctrl+C` or close the window) — not yet confirmed done.
