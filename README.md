# James Endurance Plan 2026

Single-file, offline-first PWA (`index.html`) for James's 2026 endurance season — evidence-based, GXT-anchored training.

## Season

| Race | Date | Goal / Result |
|---|---|---|
| 🏔 The North Face Trail 25k | 28 Jun 2026 | ✅ Finished — **7:46:41** |
| 💪 Thai Hyrox · Doubles Men | 16 Aug 2026 (plan W6 Sun) | 75–90 min |
| 🏃 Amazing Thailand Marathon Bangkok — Half | 28 Nov 2026 (plan W21 Sat) | **Sub 2:30** (7:06/km) |
| 🏁 Fuji Marathon — A-race | 13 Dec 2026 (plan W23 Sun) | **Sub 5:00** (7:06/km) |

Half and Full goals are the exact same pace (7:06/km) — the Bangkok Half doubles as the full Fuji dress rehearsal, 15 days out.

## Plan

23-week rebuild starting **Mon 6 Jul 2026** (post-Trail reset), POL→PYR block periodization:

1. **Re-Base** W1–6 · polarized, 30→42 km/wk (Hyrox lands on the W6 recovery week)
2. **Build** W7–14 · POL→PYR bridge, 42→54 km/wk
3. **Race Specific** W15–21 · pyramidal @ 7:06/km, 50→60 km/wk, ends with the Bangkok Half
4. **Taper** W22–23 · 2-week taper into Fuji

## App

Vanilla HTML/CSS/JS + Chart.js (CDN). Data lives in `localStorage` (JSON export/import in Settings). Service worker (`sw.js`) gives offline support — bump `CACHE` when shipping a new `index.html`.
