# jāgriti – Windows Startup Guide

Quick reference for running the app locally on Windows. This assumes prerequisites (Node.js, Python 3.9+, Git) are already installed and dependencies are already set up (`pip install -r requirements.txt` in `backend/`, `npm install` in `frontend/`). If this is a first-time setup, see the [First-time setup](#first-time-setup) section at the bottom.

---

## 1. Start the backend

Open a PowerShell/Command Prompt window:

```powershell
cd D:\Desktop\Nirbhay\nirbhay1\backend
venv\Scripts\activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend uses **Supabase** (not MongoDB) — connection details live in `backend\.env` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`). Keep this terminal open.

Verify it's up: open `http://localhost:8001/docs` in a browser.

---

## 2. Start the frontend

Open a **second** PowerShell window:

```powershell
cd D:\Desktop\Nirbhay\nirbhay1\frontend
npx expo start --tunnel -c
```

- `--tunnel` is **required**, not optional, if your router has AP/client isolation (common on home ISP routers) — plain LAN mode (`npx expo start`) will silently fail to connect from your phone with `Failed to download remote update`. Tunnel mode routes through a relay so it works regardless.
- `-c` clears the Metro bundler cache — use it after changing `.env` or after pulling changes that touch fonts/theme, since `EXPO_PUBLIC_*` env vars are baked into the bundle at start time and won't hot-reload.
- Wait for `Tunnel ready.` in the terminal before scanning.

`frontend\.env` must point at the backend's **bare origin**, no `/api` suffix (every fetch call in the app appends `/api/...` itself):

```env
EXPO_PUBLIC_BACKEND_URL=http://<your-LAN-IP>:8001
```

---

## 3. Connect from your phone

1. Install **Expo Go** (Play Store / App Store) if not already installed.
2. Fully close Expo Go if it was previously open (don't just background it).
3. Reopen Expo Go → **Scan QR code** → scan the QR printed in the tunnel terminal.
4. Don't reopen from Expo Go's "recent projects" list after a restart — always do a fresh scan, since a stale entry can point at an old session.

If you only need to test in a browser (no phone), press `w` in the Expo terminal instead.

---

## 4. Stopping

`Ctrl + C` in both terminal windows.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Uncaught Error: java.io.IOException: Failed to download remote update` on phone | Phone can't reach the dev server directly (AP isolation, firewall) | Use `--tunnel` (see above) |
| `Port 8081 is being used by another process` | A previous Metro instance is still running | Find and close that terminal, or `netstat -ano \| findstr :8081` then `Stop-Process -Id <PID> -Force` |
| 404 on trip creation | `.env` has a trailing `/api` in `EXPO_PUBLIC_BACKEND_URL` | Remove it — must be the bare origin — then restart Metro with `-c` |
| 500 error, `getaddrinfo failed` | Supabase URL not resolving from this machine/network | Check Supabase project status/URL in the Supabase dashboard |
| Env var change not taking effect | `EXPO_PUBLIC_*` vars are baked into the JS bundle at start time | Kill Metro and restart with `npx expo start --tunnel -c` |

---

## First-time setup

If dependencies aren't installed yet:

**Backend:**
```powershell
cd D:\Desktop\Nirbhay\nirbhay1\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```
Create `backend\.env` with `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `FAST2SMS_API_KEY`, `UNWIRED_LABS_API_KEY`, `GEMINI_API_KEY`.

**Frontend:**
```powershell
cd D:\Desktop\Nirbhay\nirbhay1\frontend
npm install
```
Create `frontend\.env` with `EXPO_PUBLIC_BACKEND_URL` (see section 2 above).

Then follow steps 1–3 above.
