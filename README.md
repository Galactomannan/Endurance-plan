# James Endurance Plan 2026

Single-page, offline-first PWA (`index.html` + `js/`) for James's 2026 season — evidence-based training, now rebuilt as a **14-week return-to-run → Fuji Marathon finish** after the September foot injury.

## Season

| Race | Date | Goal / Result |
|---|---|---|
| 🏔 The North Face Trail 25k | 28 Jun 2026 | ✅ Finished — **7:46:41** |
| 💪 Thai Hyrox · Doubles Men | 16 Aug 2026 | done · result not logged |
| 🏃 Amazing Thailand Marathon Bangkok — Half | Sat 28 Nov 2026 · 02:00 (W12) | **controlled test: 7:45/km, HR ≤160, stops <5%** → sets the Fuji tier |
| 🗻 Mt. Fuji International Marathon — A-race | Sun 13 Dec 2026 · 09:00 (W14) | **finish inside the 6:00 cutoff** · Tier 1 = 7:30/km to Saiko (≈5:35–5:45) · Tier 2 = 8:00 flat (≈5:49) |

The course decides the plan: Saiko checkpoint #3 (27.3 km) closes at 13:00 — cumulative 8:47/km *after* the 100 m Bunkado climb, every stop counted.

## Plan

14 weeks from **Mon 7 Sep 2026** (the first walk-run week), race Sunday of W14. Design and evidence: [`docs/superpowers/specs/2026-09-07-fuji-rebuild-plan-design.md`](docs/superpowers/specs/2026-09-07-fuji-rebuild-plan-design.md).

1. **Return** W1–3 · walk-run → continuous easy, 10→24 km, bike carries the aerobic load (Daniels 33→50→75 %)
2. **Base** W4–6 · 28→32 km, plateau, down week
3. **Build** W7–9 · 36→40 km, cruise intervals / hills Wednesday, goal-pace segments in the long run
4. **Peak** W10–12 · 46→50 km, Bunkado hill rehearsal, **30 km continuous at D-22**, then the ATM Half test
5. **Taper** W13–14 · −30 %, last lift D-13, race

Guards (also enforced in code): weekly increase ≤15 % between non-down weeks · long run ≤1.25× the longest of the prior two weeks · ≤2 quality days · long run ≤65 % of the week · ACWR caution 1.3 / cap 1.5.

Strength + plyometrics: two sessions a week, foot/ankle rehab first, high-load compound lifts from W4, plyometric contacts capped 80 → 120 → 80, descent prep (eccentric step-downs, Nordics) from W7, last lift D-13.

## App

Vanilla HTML/CSS/JS + Chart.js (CDN). No build step.

- `js/plan-spec.js` — the plan as data (weeks, paces, phases, races, checkpoints, guards, decision rules)
- `js/plan-engine.js` — `buildPlan(spec, {gateDate})` → dated weeks of sessions; `checkProgression` returns guard violations
- `js/strength-program.js` — phase-aware strength/plyo sessions
- `js/intel.js` — stop %, cadence decay, HR drift, ACWR, long-run jump, race projection
- Data lives in `localStorage` (JSON export/import in Settings). Service worker (`sw.js`) gives offline support — bump `CACHE` when shipping.
- **Gate date** (Settings → Plan Configuration): the first running day after the injury. Slipping it re-shapes the plan without moving the race, the 30 km run or the half test.

```bash
npm test
```

## Strava Sync

Vercel serverless functions in `api/strava/*` handle OAuth and API calls; the browser never sees the client secret.

- `GET /api/strava/activities?days=90` — summaries (moving *and* elapsed time)
- `GET /api/strava/streams?id=…&points=400` — down-sampled time/distance/HR/cadence/velocity/moving streams, used to score long runs (stopped time, cadence decay, HR drift) on the dashboard's **Load & form guard**

Required Vercel environment variables:

| Variable | Value |
|---|---|
| `STRAVA_CLIENT_ID` | Strava API application client ID |
| `STRAVA_CLIENT_SECRET` | Strava API application client secret |
| `STRAVA_REDIRECT_ORIGIN` | Optional. Production origin, e.g. `https://endurance-plan.vercel.app` |

Set the Strava app's authorization callback domain to the deployed Vercel domain; the callback route is `/api/strava/callback`.

## Visual Asset

Dashboard hero photo: Mount Fuji above Lake Kawaguchi, by Marion & Christoph Aistleitner via Wikimedia Commons (CC0 1.0). Served as compressed derivatives (1920 px ≈ 140 KB desktop, 960 px ≈ 35 KB mobile).
