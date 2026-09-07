/* ============================================================================
   Records — what actually happened, aggregated for the Data view and the
   load guard. Pure functions over the session log, the compact Strava list,
   the foot log and the readiness log. Classic script (FujiRecords), CommonJS
   in tests.
   ============================================================================ */
(function (root) {
  "use strict";

  const RUN_SPORTS = ["Run", "TrailRun", "VirtualRun"];
  const r1 = x => Math.round(x * 10) / 10;
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const isDone = lg => !!lg && (lg.status === "done" || lg.status === "modified");

  function addDaysISO(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }
  /* Monday-based week start aligned to the plan's first Monday (works before the plan too). */
  function weekStartFor(iso, planStart) {
    const n = Math.floor(daysBetween(planStart, iso) / 7);
    return addDaysISO(planStart, n * 7);
  }
  function paceToSec(p) {
    const m = String(p || "").match(/^(\d+):(\d{1,2})$/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  /* Running km per date: Strava runs first; manual run logs fill dates Strava does not cover. */
  function runsByDate(activities, log) {
    const byDate = {};
    (activities || []).forEach(a => {
      if (!RUN_SPORTS.includes(String(a.sportType)) || !a.localDate) return;
      const cur = byDate[a.localDate] || { km: 0, longest: 0 };
      cur.km = r1(cur.km + (Number(a.distanceKm) || 0));
      cur.longest = Math.max(cur.longest, Number(a.distanceKm) || 0);
      byDate[a.localDate] = cur;
    });
    Object.entries(log || {}).forEach(([date, lg]) => {
      if (byDate[date] || !isDone(lg) || !lg.actualDistance) return;
      if (lg.type === "bike" || lg.type === "rest" || lg.type === "strength_a" || lg.type === "strength_b") return;
      const km = parseFloat(lg.actualDistance) || 0;
      if (km > 0) byDate[date] = { km: r1(km), longest: km };
    });
    return byDate;
  }

  /* Weekly rows: `back` weeks before the current week, the current week, `ahead` plan weeks after. */
  function weeklyKm(byDate, plan, opts) {
    const o = { back: 8, ahead: 2, ...(opts || {}) };
    const planStart = plan.startDate;
    const curStart = weekStartFor(o.today, planStart);
    const planByStart = new Map((plan.weeks || []).map(w => [w.startDate, w]));
    const rows = [];
    for (let i = -o.back; i <= o.ahead; i++) {
      const start = addDaysISO(curStart, i * 7);
      let km = 0, longest = 0;
      for (let d = 0; d < 7; d++) {
        const r = byDate[addDaysISO(start, d)];
        if (r) { km += r.km; longest = Math.max(longest, r.longest); }
      }
      const pw = planByStart.get(start);
      rows.push({ start, km: r1(km), longest: r1(longest), planKm: pw ? pw.targetKm : null, planWeek: pw ? pw.weekNum : null, current: i === 0, future: i > 0, down: !!(pw && pw.isRecovery), race: pw ? pw.race || null : null });
    }
    return rows;
  }

  /* One long day per plan week: the race if there is one, else the long run, else Saturday. */
  function longDayOf(week) {
    return week.days.find(s => s.type === "tune_race") || week.days.find(s => s.type === "long_run" || s.type === "mp_long") || week.days[5];
  }
  function stopPctOf(lg) {
    if (lg && lg.intel && lg.intel.stopPct !== null && lg.intel.stopPct !== undefined) return lg.intel.stopPct;
    const mov = Number(lg && lg.actualDuration), el = Number(lg && lg.elapsedDuration);
    if (mov > 0 && el >= mov) return r1((el - mov) / el * 100);
    return null;
  }
  function longRunRows(plan, log, guards) {
    const g = { stopPctMax: 8, cadenceDecayMax: 5, hrDriftMax: 8, ...(guards || {}) };
    return (plan.weeks || []).map(w => {
      const s = longDayOf(w);
      const lg = (log || {})[s.date] || null;
      const done = isDone(lg);
      const stopPct = done ? stopPctOf(lg) : null;
      const cad = lg && lg.intel && lg.intel.cadenceDecayPct !== undefined ? lg.intel.cadenceDecayPct : null;
      const drift = lg && lg.intel && lg.intel.hrDriftPct !== undefined ? lg.intel.hrDriftPct : null;
      const flagged = done && ((stopPct !== null && stopPct > g.stopPctMax) || (cad !== null && cad < -g.cadenceDecayMax) || (drift !== null && drift > g.hrDriftMax));
      return {
        week: w.weekNum, date: s.date, title: s.title, type: s.type, race: s.type === "tune_race",
        plannedKm: s.distanceKm || 0, plannedMin: s.duration || 0, mpKm: s.mpKm || 0,
        done, skipped: !!lg && lg.status === "skipped",
        km: done && lg.actualDistance ? parseFloat(lg.actualDistance) : null,
        min: done && lg.actualDuration ? parseInt(lg.actualDuration, 10) : null,
        elapsed: done && lg.elapsedDuration ? parseInt(lg.elapsedDuration, 10) : null,
        pace: done ? lg.pace || "" : "", hr: done && lg.avgHR ? parseInt(lg.avgHR, 10) : null,
        stopPct, cadenceDecayPct: cad, hrDriftPct: drift, flagged,
        cadenceStartSpm: lg && lg.intel ? lg.intel.cadenceStartSpm || null : null,
        cadenceEndSpm: lg && lg.intel ? lg.intel.cadenceEndSpm || null : null
      };
    });
  }

  /* Median moving pace of steady runs (HR band, minimum distance) per month — the fitness signal. */
  function easyPaceTrend(activities, opts) {
    const o = { hrMin: 140, hrMax: 158, minKm: 6, ...(opts || {}) };
    const byMonth = new Map();
    (activities || []).forEach(a => {
      if (!RUN_SPORTS.includes(String(a.sportType))) return;
      if (!(Number(a.distanceKm) >= o.minKm)) return;
      const hr = Number(a.avgHR);
      if (!(hr >= o.hrMin && hr <= o.hrMax)) return;
      const sec = paceToSec(a.pace);
      if (!sec) return;
      const m = String(a.localDate || "").slice(0, 7);
      if (!m) return;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(sec);
    });
    return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, secs]) => ({ month, paceSec: Math.round(median(secs)), n: secs.length }));
  }

  /* Last n days of foot check-ins; level = worst bucket recorded that day. */
  function footStrip(foot, todayISO, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = addDaysISO(todayISO, -i);
      const f = (foot || {})[date];
      const levels = f ? [f.am, f.pm].filter(x => x === 0 || x === 1 || x === 2) : [];
      out.push({ date, level: levels.length ? Math.max(...levels) : null });
    }
    return out;
  }

  /* Heat: +0.5 % per °C of apparent temperature above the Bangkok reference the paces assume, ±10 % max. */
  function heatAdjustSec(baseSec, apparentC, refC, k) {
    if (apparentC === null || apparentC === undefined || !Number.isFinite(Number(apparentC))) return baseSec;
    const ref = refC === undefined ? 28 : refC, kk = k === undefined ? 0.005 : k;
    const adj = Math.max(-0.10, Math.min(0.10, kk * (Number(apparentC) - ref)));
    return Math.round(baseSec * (1 + adj));
  }

  function bodyStats(readiness) {
    const entries = Object.entries(readiness || {}).map(([date, v]) => ({ date, ...(v || {}) })).sort((a, b) => a.date.localeCompare(b.date));
    const nums = (key, n) => entries.filter(e => e[key] !== null && e[key] !== undefined && e[key] !== "" && !isNaN(parseFloat(e[key]))).slice(-n).map(e => parseFloat(e[key]));
    const w = nums("weight", 400);
    const w7 = nums("weight", 7), rhr = nums("rhr", 14), hrv = nums("hrv", 14), sl = nums("sleep", 7);
    return {
      weight: w.length ? w[w.length - 1] : null,
      weight7: w7.length ? r1(mean(w7)) : null,
      rhr14: rhr.length ? Math.round(mean(rhr)) : null,
      hrv14: hrv.length ? Math.round(mean(hrv)) : null,
      sleep7: sl.length ? r1(mean(sl)) : null,
      entries
    };
  }

  const api = { RUN_SPORTS, addDaysISO, daysBetween, weekStartFor, paceToSec, runsByDate, weeklyKm, longDayOf, longRunRows, easyPaceTrend, footStrip, heatAdjustSec, bodyStats };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FujiRecords = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
