# Step Up — project notes

For a fresh AI session with no memory of this project. Read this before doing
any Step Up work; verify claims (file paths, function names) rather than
trusting this blindly, since it will drift as the project evolves.

## What this is

A personal, voice-guided workout tracker PWA for Paul. Built the same way as
his other project, Plumb (`C:\Users\green\OneDrive\Documents\Plumb\plumb`):
Vite + vanilla JS, no framework, deployed to GitHub Pages, Supabase for data.
The full product brief and the reasoning behind every scope decision lives in
the approved plan at `C:\Users\green\.claude\plans\peaceful-wibbling-octopus.md`
— read that for the "why", this file is just "where things stand."

## Stack

- Vite + vanilla JS + `vite-plugin-pwa` (injectManifest strategy — a
  hand-written `src/sw.js`, not the default generated one, because push
  notifications need custom `push`/`notificationclick` handlers)
- Supabase (`@supabase/supabase-js` SDK, unlike Plumb which uses raw fetch —
  Step Up's schema is more relational so the SDK earns its keep)
- Supabase project: "step-up", ref `gfbwlelzwjwlgdakapwt`, region
  `ap-southeast-2`, org `easybeinggreen`. Free tier, $0/month.
- Web Speech API for voice (`SpeechRecognition` + `SpeechSynthesis`) — free,
  built into Chrome, no API keys
- Open-Meteo for weather (free, no key)
- Web Push (VAPID) + a Supabase Edge Function + `pg_cron` for the 7:30 alarm

## Current status (as of 2026-08-24) — MVP complete, all 5 build-order steps done

**Built and verified working** (verified live against Supabase in the
Browser preview tool — see the plan's build order):

1. **Scaffold + data** — repo at `C:\Users\green\OneDrive\Documents\StepUp\step-up`,
   full schema applied (`supabase/schema.sql`), 83 exercises seeded from
   `workouts.md`, 2 starter routines ("Upper Body & Abs Day", "Glutes &
   Calves Day") with a handful of exercises wired to targets — **not** all 83
   exercises are slotted into a routine yet, that's a routine-editor UI job
   for later. Manual tap-based logging verified end-to-end.
2. **Voice** (`src/voice.js`) — `SpeechRecognition` command parsing (no LLM,
   just keyword/number regex) for "start"/"done"/"skip"/"finish"/"increase
   weight to N kilos"/"skip today"; `SpeechSynthesis` targeting "Google UK
   English Female" for coaching. `src/screens/session.js` has a "🔊 Guided
   workout" button that runs the full flow autonomously: warm-up countdown →
   per-exercise announce + counted reps/hold at that exercise's
   `default_seconds_per_rep` pace → auto-logs each set → rest reminder
   ("take a drink") between sets → cool-down → praise. A per-card 🎙 button
   updates that exercise's weight by voice mid-workout (verified: logging a
   heavier weight updates `routine_exercises.target_weight_kg`, so next time
   defaults to it). Verified the loop runs and stops cleanly; actual mic
   input can only be verified on Paul's real Android Chrome, not in the
   sandboxed preview browser (no mic access there).
3. **Plan generator** (`src/plan.js`) — rule-based, alternates routine
   category day to day (Upper Body / Lower Body) based on the most recent
   `plan_days` entry, skips categories an active `constraints` row blocks.
   `ensureTodayPlan()` creates today's row on first Home-screen load if none
   exists. Verified: skip/undo-skip/swap-routine/start→finish→plan marked
   "done" all round-trip correctly against Supabase.
4. **Weather + body metrics** — `src/weather.js` fetches Brisbane's current
   temperature (Open-Meteo, hardcoded lat/long, no geolocation permission
   needed) and stores it on `workout_sessions.temperature_c` at session
   start (verified: real temperature logged). `src/screens/metrics.js` is a
   manual weight/waist/chest/hips entry screen (Paul's scale isn't
   Bluetooth). Weekly review (`src/screens/review.js`) aggregates the last 7
   days: sets/top-weight/volume per exercise, recent session notes.
5. **Push notifications** — real Web Push, not an OS-alarm workaround (this
   is what Paul chose over the simpler alternative when asked). VAPID keys
   and the cron→edge-function shared secret live in **Supabase Vault**, never
   in this repo, an env var, or an Edge Function secret (there's no MCP tool
   available to set Edge Function secrets, which is *why* Vault was used
   instead — see `get_app_secret()` in `supabase/schema.sql`). Two
   `pg_cron` jobs (`stepup-morning-alarm` 07:30 Brisbane, `stepup-not-started-nudge`
   07:50 Brisbane — both stored as UTC since Brisbane has no DST) call the
   `send-nudge` Edge Function (`supabase/functions/send-nudge/index.ts`,
   deployed, `verify_jwt=false` + custom `x-cron-secret` header check since
   pg_cron can't hold a Supabase JWT) which sends Web Push via VAPID to every
   row in `push_subscriptions`, pruning expired ones (404/410 responses).
   The nudge variant checks whether a session already started today and
   skips sending if so. **Verified via curl**: correct secret → 200 sent:0,
   wrong secret → 401. Client-side subscribe flow is
   `src/screens/settings.js` ("Enable daily reminder" button) —
   **this specific piece (the actual subscribe + receiving a real push) can
   only be verified on Paul's real Android phone**, not in this sandbox.

**Not yet built** (all explicitly Phase 2 in the plan, not oversights):
Garmin metric ingestion, Strava walk import, live voice-adjustable rep tempo
("faster"/"slower" mid-set — tempo calibration UI itself is also still
missing, only the seeded `default_seconds_per_rep` guesses exist so far),
LLM-backed free-text exercise Q&A.

**Known rough edges to polish, not blockers:**
- PWA icons are 1x1 placeholders (`public/icons/icon-192.png` /
  `icon-512.png`) — replace with real artwork before install-time polish
  matters.
- Only 2 of the 83 seeded exercises' worth of routines exist — a proper
  routine-editor UI (or just more seeded routine_exercises rows) is needed
  before the full exercise library is actually reachable day to day.
- `src/screens/settings.js` currently only has the push-notification
  opt-in; tempo calibration and default-schedule-cadence settings (both
  explicitly deferred to "tune later in-app" during the original
  conversation) still need a UI.

## Decisions made, and why

- **No Piper TTS bundle** (unlike Plumb) — Step Up talks constantly during a
  workout, so latency matters more than offline capability; browser
  `SpeechSynthesis` targeting "Google UK English Female" is the plan. Can add
  Piper later if offline turns out to matter.
- **Real push notifications, not an OS-alarm workaround** — Paul explicitly
  chose this over the simpler "set your own Android alarm" option, accepting
  the extra build cost, because the whole point of the app is that *it*
  delivers routine, not that he remembers to open it.
- **Secrets in Supabase Vault, not Edge Function env vars** — there is no MCP
  tool available in this environment to set Edge Function secrets (only
  `deploy_edge_function`, no `secrets set` equivalent). Vault + a
  `security definer` SQL function restricted to `service_role`/`postgres`
  solves this without ever exposing the private key to me, to git, or to the
  client bundle. If a future session gains a secrets-management tool, this
  could be simplified, but there's no urgency — it works and it's arguably
  more secure than a plain env var anyway.
- **Garmin metrics ingestion and Strava import are Phase 2** — Garmin's
  Health API needs partner approval, not casually available to a solo app;
  not worth blocking the MVP on.
- **Directional exercise variants consolidated** — the handwritten notes list
  e.g. "Crunch x5 L" / "Crunch x5 R" as separate lines; seeded as one
  `exercises` row each with "alternate L/R" implied, since that's more useful
  for logging than duplicate rows.

## Setup / dev quickstart

```bash
cd C:\Users\green\OneDrive\Documents\StepUp\step-up
npm install
npm run dev
```

`.env` already has the real Supabase URL/anon key and the VAPID *public* key
for the `step-up` project (gitignored, not committed). `.env.example` is the
template for a fresh checkout. The VAPID *private* key and the cron shared
secret are Vault-only — there is no local copy anywhere, including in this
session's memory beyond what's already been written to Vault.

Not yet pushed to GitHub — no remote repo created yet, ask Paul before doing
so (per the git safety rules: never push without being asked). He deferred
this deliberately until voice + the plan generator existed, and both are now
in — worth asking again since the MVP is now feature-complete.
