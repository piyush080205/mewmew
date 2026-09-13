# Handoff Context — Jāgriti SOS Feature: Deployment Blocked on EAS Build

## Where things stand

1. **Feature implementation: DONE.** A full offline-first SOS + native background motion-detection system was implemented (native Kotlin under `frontend/android/app/src/main/java/com/nirbhay/safety/sos/`, Room DB, WorkManager retry, SMS/Internet transports, new backend endpoints). It compiles and a local debug APK built successfully on-device (`frontend/android/app/build/outputs/apk/debug/app-debug.apk`, ~273MB, all 4 ABIs). See `backend/schema_sos.sql`, `backend/server.py` (new `/api/sos/*` and `/api/emergency-contacts*` routes), and the whole `sos/` package for the implementation. This part does not need redoing.

2. **Backend: DEPLOYED, should be live.** Deploy path for this project (no Dockerfile-push-locally needed, no docker installed locally):
   - Zip `backend/` (excluding `venv/`, `__pycache__/`, `.env`) → upload to `s3://nirbhay-codebuild-source-164686058698/backend_build.zip`
   - `aws codebuild start-build --project-name nirbhay-backend-build --region ap-south-1` (this builds the Docker image in the cloud and pushes to ECR — succeeded on last run, build id `nirbhay-backend-build:479e5fbc-2379-4ebd-b58b-a682370d8cc9`)
   - App Runner does **not** auto-deploy new ECR images (`AutoDeploymentsEnabled: false` in `backend/_apprunner_service.json`), so you must explicitly run: `aws apprunner start-deployment --service-arn arn:aws:apprunner:ap-south-1:164686058698:service/nirbhay-backend/872781e929cc4f6bb6c894e91c3575dc --region ap-south-1` (already triggered, operation id `7864865135e04a9eb2f32da494dbf35f` — **verify it finished** with `aws apprunner describe-service --service-arn ... --query 'Service.Status'`, want `RUNNING`)
   - Prod URL: `https://t9rmwfjzi7.ap-south-1.awsapprunner.com` — health check `/api/health`. Confirm the new SOS routes are live by hitting `/api/sos/events?user_id=test` (should return 200/422, not 404).
   - **Still needs manual action**: paste `backend/schema_sos.sql` into the Supabase SQL editor to create the `emergency_contacts` and `sos_events` tables — this has NOT been done yet as far as this session confirmed.

3. **EAS Android build: BLOCKED, this is the actual open problem.**
   - Command used: `cd frontend && eas build -p android --profile preview --non-interactive --no-wait` (profile `preview` in `frontend/eas.json` produces an installable `.apk`, not `.aab`)
   - Two earlier attempts failed with a generic, unhelpful `EAS_BUILD_UNKNOWN_GRADLE_ERROR` and unreadable binary log files fetched via the signed GCS URL.
   - **Root cause found** by reading a downloaded plain-text build log (the user saved one to `D:\Desktop\Nirbhay\buildfailed.txt` — check there first if it still exists) — the real Gradle error is:
     ```
     Configuring project ':react-native-worklets' without an existing directory is not allowed.
     The configured projectDirectory '/home/expo/workingdir/build/frontend/android/D:/Desktop/Nirbhay/nirbhay1/frontend/node_modules/react-native-worklets/android' does not exist
     ```
     This is a mangled path: the EAS Linux container's own build path (`/home/expo/workingdir/build/frontend/android/`) got concatenated with a **local Windows absolute path** (`D:/Desktop/Nirbhay/nirbhay1/frontend/node_modules/...`) that leaked into the uploaded project archive.
   - **Confirmed source of the leak**: `frontend/android/build/generated/autolinking/autolinking.json` — this is a *generated* file (from a local Windows Gradle build) that bakes in the absolute local `node_modules` path for autolinked packages like `react-native-worklets`. It should never be uploaded to EAS; EAS's own container regenerates this during its build.
   - **I already added `frontend/.easignore`** to try to exclude `android/build/`, `android/.gradle/`, `android/app/build/`, `node_modules/`, `.git/`, etc. — but the build that ran *after* creating this file (id `d1e81280-060b-4333-b378-6e8d67a4fef8`) still showed the archive at 761MB (same ballpark as before), and it's not yet confirmed whether that specific autolinking.json got excluded or whether it errored again the same way. **Check that build's result first**: `cd frontend && eas build:view d1e81280-060b-4333-b378-6e8d67a4fef8 --json` — if `status` is `FINISHED`, `artifacts.buildUrl` is the APK download link, done. If `ERRORED`, the fix below still needs to be applied.
   - **Important gotcha**: presence of `.easignore` makes EAS use **only** `.easignore` and ignore `.gitignore` entirely — so anything `.gitignore` was excluding (build caches, `.expo/`, etc.) now needs to be explicitly re-added to `.easignore` too, or it'll leak into the archive. Diff `frontend/.gitignore` against `frontend/.easignore` and reconcile.

## Recommended next steps (in order)

1. Check `eas build:view d1e81280-060b-4333-b378-6e8d67a4fef8 --json` — it may already have succeeded.
2. If it failed the same way, make the `.easignore` patterns more explicit/robust — use `**` glob suffixes (some ignore-file parsers need `android/build/**` not just `android/build/`), e.g.:
   ```
   android/local.properties
   android/.gradle/**
   android/build/**
   android/app/build/**
   android/app/.cxx/**
   android/.cxx/**
   node_modules/**
   .git/**
   *.apk
   *.aab
   .expo/**
   ```
   Also consider just deleting `frontend/android/build/` and `frontend/android/app/build/` locally before the next EAS build attempt, as a belt-and-suspenders fix (they're regenerated by any Gradle build).
3. Re-run: `cd frontend && eas build -p android --profile preview --non-interactive --no-wait`, watch archive size drop meaningfully (should be well under 761MB once `node_modules` and build caches truly stop leaking in), then poll `eas build:view <id> --json` until `status: FINISHED` and grab `artifacts.buildUrl` — that's the shareable APK link the user wants.
4. Once APK link is confirmed working, remind the user to run `backend/schema_sos.sql` in Supabase (not yet done), and to test the app end-to-end per the verification scenarios in the original plan (physical-device testing of the 15 scenarios — cancel countdown, offline SMS, app-killed persistence, boot-resume, etc.)

## Environment notes for whoever picks this up

- Repo root: `D:\Desktop\Nirbhay\nirbhay1` (frontend in `frontend/`, backend in `backend/`). Git remote: `https://github.com/piyush080205/nirbhay1.git`, currently has substantial uncommitted local changes (the whole SOS feature) — **not yet pushed to GitHub**. Confirm with the user before pushing/committing.
- `frontend/android/local.properties` exists locally (gitignored) with `sdk.dir=C:/Users/wwwpi/AppData/Local/Android/Sdk` for local Windows Gradle builds — must stay excluded from EAS uploads (Linux container has its own SDK path).
- Local Gradle env needs `GRADLE_USER_HOME`, `TMP`, `TEMP` redirected off the C: drive (was full earlier, now has ~19.7GB free after cleanup) — set to `D:\gradle_home` / `D:\win_tmp` before any local `./gradlew` invocation, if doing more local builds.
- AWS account: `164686058698`, region `ap-south-1`. Resources: ECR repo `nirbhay-backend`, CodeBuild project `nirbhay-backend-build` (S3-zip-triggered, not git-webhook-triggered), App Runner service `nirbhay-backend`.
- EAS project: `@piyush08/nirbhay`, project id `1b0650df-33c5-4722-b632-e8b272eaf2d4`.
