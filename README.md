# Endurance 2026

A personal, offline-first training app for one season: the 14-week rebuild from the September foot injury to the **Mt. Fuji International Marathon** (Sun 13 Dec 2026, 6-hour cutoff), with the **ATM Bangkok Half** (Sat 28 Nov, 02:00) as the pacing test.

It is a plan and a logbook, not something to use mid-run. Live at https://endurance-plan.vercel.app, installed to the iPhone home screen.

## Screens

| Tab | What it is |
|---|---|
| **Today** | The day's session on the season dial, the Bangkok forecast turned into an expected easy pace, and the log button |
| **Plan** | The week as a timeline with the logged numbers under each day; the 14-week season one tap away |
| **Data** | Weekly km against the plan, the load guard (ACWR, week ratio, long-run jump, stopped time, cadence decay, HR drift), the logged intensity distribution against the phase target, the long-run build curve, every long run, weekly time on task split run and bike, the easy-pace trend at HR 140–158, morning numbers and sweat rate |
| **Race** | Course profile and checkpoints with Tier 1 / Tier 2 arrival times, the pacing tiers, race morning, fuel, gear checklist, what to do about cramp, bonk and over-drinking, the half test, results |
| **More** | Strength (the two weekly sessions and their log), Athlete (lab numbers, zones, paces), Archive (the 32-week plan before the injury), Evidence (one line per rule with its source), Settings |

Logging a session pulls the matching Strava activity for that day (distance, moving and elapsed time, heart rate) and computes stopped time against the 8 % guard. Everything is editable.

Charts are hand-drawn SVG in the app's own language; there is no chart library.

## Plan

14 weeks from **Mon 7 Sep 2026**. Design and evidence: [`docs/superpowers/specs/2026-09-07-fuji-rebuild-plan-design.md`](docs/superpowers/specs/2026-09-07-fuji-rebuild-plan-design.md).

1. **Return** W1–3 · walk-run → continuous easy, 10→24 km, bike carries the aerobic load
2. **Base** W4–6 · 28→32 km, plateau, down week
3. **Build** W7–9 · 36→40 km, cruise intervals / hills Wednesday, goal-pace segments in the long run
4. **Peak** W10–12 · 46→50 km, Bunkado hill rehearsal, 30 km continuous at D-22, the half test
5. **Taper** W13–14 · −30 %, last lift D-13, race

Guards enforced in code: weekly increase ≤ 15 % · long run ≤ 1.25× the longest of the prior two weeks · long run ≤ 65 % of the week · ACWR watch 1.3 / cap 1.5 · stopped time < 8 % · cadence decay < 5 % · HR drift < 8 %.

## Code

Vanilla HTML/CSS/JS, no build step, no runtime dependencies.

- `index.html` — the views and sheets
- `css/app.css` — the design system: one graphite tone, orange only for "now"
- `js/plan-spec.js` — the plan as data · `js/plan-engine.js` — dated weeks + progression guards
- `js/strength-program.js` — the strength and plyometric program by week
- `js/intel.js` — stop %, cadence decay, HR drift, ACWR, long-run jump, race projection
- `js/store.js` — storage, audit/repair, the legacy archive · `js/strava-sync.js` — Strava → log mapping · `js/records.js` — aggregations for Data
- `sw.js` — offline cache. HTML, JS and CSS are network-first so a new page never runs against last release's modules; the cache is the offline fallback. Bump `CACHE` with every release
- Data lives in `localStorage`; export/import JSON in Settings. Add `?today=YYYY-MM-DD` to the URL to preview another day.

```bash
npm test
```

## Strava

Vercel serverless functions in `api/strava/*` handle OAuth and API calls; the browser never sees the client secret.

- `GET /api/strava/activities?days=90` — summaries with moving *and* elapsed time
- `GET /api/strava/streams?id=…&points=400` — down-sampled streams used to score long runs

| Variable | Value |
|---|---|
| `STRAVA_CLIENT_ID` | Strava API application client ID |
| `STRAVA_CLIENT_SECRET` | Strava API application client secret |
| `STRAVA_REDIRECT_ORIGIN` | Optional. Production origin, e.g. `https://endurance-plan.vercel.app` |

The Strava app's callback domain must be the deployed domain; the callback route is `/api/strava/callback`.
