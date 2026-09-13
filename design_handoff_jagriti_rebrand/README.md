# Handoff: Nirbhay → jāgriti Rebrand & Light Theme

## Overview
Visual rebrand of the safety app from "Nirbhay" (dark theme) to "jāgriti" (light, periwinkle-blue theme matching the founder's business card). This package documents every change needed in the existing React Native / Expo codebase at `piyush080205/Nirbhay`.

## About the Design Files
`jagriti-reference.html` is an **HTML design reference** — a static mockup showing the intended look, not code to copy directly. Recreate these visuals in the existing React Native (`StyleSheet.create`, `Ionicons`) patterns already used in `frontend/app/*.tsx`. Fidelity: **high** — use the exact hex values and copy below.

## How to use this with Claude Code
Open a terminal in the repo root and run Claude Code, then paste:

> "Read design_handoff_jagriti_rebrand/README.md and jagriti-reference.html. Rebrand the app from 'Nirbhay' to 'jāgriti', switch the whole UI from the current dark theme to the light theme described (colors + copy in the README), keep all existing logic/state/API calls unchanged. Apply the color and text changes file by file as listed."

## Design Tokens

Replace dark palette with:
| Token | Old (dark) | New (jāgriti light) |
|---|---|---|
| Background | `#0f0f0f` | `#F8F8FC` |
| Card / surface | `#1a1a1a` / `#2a2a2a` | `#FFFFFF` |
| Border | none | `#E4E5F1` |
| Primary text | `#fff` | `#232538` |
| Muted text | `#888` | `#8A8DA3` / `#9497AC` |
| Primary accent (was blue `#3498db`) | `#3498db` | `#5A6FC4` (buttons/links use `#5A6FC4`, light tint bg `#EEF0FB`) |
| Success (tracking active, safe) | `#2ed573` | `#3E9C74` (bg tint `#E7F5EE`) |
| Danger (alerts, stop trip, high risk) | `#ff4757` / `#e74c3c` | `#D96570` (bg tint `#FBEAEC`) |
| Amber (unified 112, background protection accent) | `#f39c12` | `#D9A544` (bg tint `#FBF2E2`) |
| Purple (background protection icon, safe corridors) | `#9b59b6` / `#a29bfe` | `#7C6FD9` |

Font: Manrope (400/500/600/700/800) via Google Fonts, replacing system default. Logo wordmark "jāgriti" (lowercase, weight 800, `#232538`) with a mark: a small circle above an open curved swoosh, stroke/fill `#5A6FC4` — replaces the red shield-checkmark icon.

## Copy changes
- App name: "Nirbhay" → "jāgriti" everywhere (header title in `index.tsx`, page titles stay the same otherwise — e.g. "Safe Routes", "Chat Safety" copy is unchanged).
- Removed the "Autonomous Women Safety System" subtitle line under the header — drop it from `index.tsx`.
- Home screen decluttered: removed the four feature-explainer cards (GPS + Cellular Fallback, Panic Detection, Auto Alerts, Background Protection). Replaced with a single compact status line: "Background protection is on — you're covered even if the app is closed" (icon + one line, `#54566B` text, `#FFFFFF` card).
- Safe Routes "From" field: show **"Your Current Location"** instead of raw lat/long coordinates — swap the coordinate display for reverse-geocoded/plain label text in `routes.tsx`.
- All other strings (button labels, tips, emergency numbers, corridor descriptions) stay exactly as they are in the code today — this is a visual rebrand only, not a copy rewrite.

## Files to change (repo paths)
- `frontend/app/index.tsx` — header (shield icon → jāgriti mark + wordmark), all `StyleSheet` colors (container bg, statusCard, guardianCard, mainButton startButton/endButton, featureCard icon backgrounds, infoCard, riskBanner)
- `frontend/app/routes.tsx` — `StyleSheet` colors (container, delhiBanner, tabBar/tabActive, scoreCard, factorCard, transportCard, hotspotCard, corridorCard, emergencyCard, policeCard) + swap icon-container tint colors to the new accent tints above
- `frontend/app/chat-safety.tsx` — `StyleSheet` colors (container, infoCard, uploadButton dashed borders, riskCard, flagCard, safeCard, tipsCard)
- `frontend/components/SafetyCheckModal.tsx` — `StyleSheet` colors (overlay stays dark scrim, but `modal` background → `#FFFFFF`, text colors → `#232538`/`#8A8DA3`, timerCircle border → `#5A6FC4`, `yesButton`→`#3E9C74`, `noButton`→`#D96570`, `codeInput` bg → `#F1F2FA`)
- `frontend/components/MapView.tsx` — check for any hardcoded dark map style/tile colors, adjust markers to match new accent palette (current-location dot, GPS path, cellular path) — see legend colors in `jagriti-reference.html`
- App icon / splash (`frontend/app.json`, `frontend/assets/images/`) — not covered in this pass (in-app wordmark + mark only); flag separately if a standalone icon file is wanted

## Assets
No new binary assets — the logo mark is drawn as inline SVG (circle + curved path), can be implemented as an RN `Svg` component (`react-native-svg`, already likely available via Expo) or exported as a PNG/SVG icon asset.

## Reference file
`jagriti-reference.html` in this folder — open in a browser to see all 9 restyled screens side by side (Home, Live Trip, Safe Routes ×3 tabs, Chat Safety, Guardian & Settings, Safety Check alert ×2 steps).
