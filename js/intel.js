/* ============================================================================
   Training intelligence — pure math over session logs and Strava streams.
   Everything here is deterministic and explainable; the dashboard shows the
   inputs next to every verdict. Classic script in the browser (FujiIntel),
   CommonJS in tests.
   ============================================================================ */
(function (root) {
  "use strict";

  const G = { longRunJumpMax: 1.25, weeklyCaution: 1.3, weeklyCap: 1.5, acwrCaution: 1.3, acwrDanger: 1.5, chronicFloorKm: 15 };

  function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
  function round1(x) { return Math.round(x * 10) / 10; }
  function round2(x) { return Math.round(x * 100) / 100; }

  /* ---------- formatting ---------- */
  function fmtHMS(sec) {
    if (!Number.isFinite(sec)) return "—";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function fmtPace(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    const m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /* ---------- single-run metrics ---------- */
  function stopPct(movingSec, elapsedSec) {
    if (!elapsedSec || elapsedSec <= 0) return null;
    return round1(Math.max(0, (elapsedSec - movingSec) / elapsedSec * 100));
  }

  // first quarter vs last quarter of the non-zero cadence samples; negative = decay
  function cadenceDecay(cad) {
    const v = (cad || []).filter(x => x > 0);
    if (v.length < 4) return null;
    const q = Math.ceil(v.length / 4);
    const first = mean(v.slice(0, q)), last = mean(v.slice(-q));
    if (!first) return null;
    return round2((last - first) / first * 100);
  }

  // Pa:Hr decoupling: efficiency (speed per beat) first half vs second half; positive = drift
  function hrDrift(hr, vel) {
    const n = Math.min((hr || []).length, (vel || []).length);
    if (n < 4) return null;
    const halfN = Math.floor(n / 2);
    const eff = (from, to) => {
      const hs = [], vs = [];
      for (let i = from; i < to; i++) { if (hr[i] > 0 && vel[i] > 0.5) { hs.push(hr[i]); vs.push(vel[i]); } }
      if (!hs.length) return null;
      return mean(vs) / mean(hs);
    };
    const e1 = eff(0, halfN), e2 = eff(halfN, n);
    if (!e1 || !e2) return null;
    return round2((e1 - e2) / e1 * 100);
  }

  function toSpm(cad) {
    const v = (cad || []).filter(x => x > 0);
    const m = mean(v);
    return m !== null && m < 120 ? 2 : 1; // Strava run cadence is one-leg rpm
  }

  function analyzeStreams(streams) {
    const t = streams.time || [], d = streams.distance || [], hr = streams.heartrate || [], cad = streams.cadence || [], vel = streams.velocity_smooth || [], mv = streams.moving;
    const n = t.length;
    if (n < 2) return null;
    const running = vel.filter(v => v > 0.5);
    const typicalV = running.length ? [...running].sort((a, b) => a - b)[Math.floor(running.length / 2)] : 2;
    let stopSec = 0, longestStop = 0, stops = 0;
    for (let i = 1; i < n; i++) {
      const dt = t[i] - t[i - 1];
      if (dt <= 0) continue;
      let stopped;
      if (Array.isArray(mv) && mv.length === n) {
        stopped = mv[i] ? 0 : dt;
      } else {
        const dd = (d[i] || 0) - (d[i - 1] || 0);
        const v = vel[i] > 0.5 ? vel[i] : typicalV;
        stopped = Math.max(0, dt - dd / v);
      }
      stopSec += stopped;
      if (stopped > longestStop) longestStop = stopped;
      if (stopped > 90) stops++;
    }
    const elapsedSec = t[n - 1];
    const movingSec = Math.max(0, elapsedSec - stopSec);
    const k = toSpm(cad);
    const cadV = cad.filter(x => x > 0);
    const q = Math.ceil(cadV.length / 4);
    const distanceKm = (d[n - 1] || 0) / 1000;
    return {
      elapsedSec, movingSec: Math.round(movingSec), stopSec: Math.round(stopSec),
      stopPct: stopPct(movingSec, elapsedSec), stops, longestStopSec: Math.round(longestStop),
      distanceKm: round1(distanceKm),
      movingPaceSec: distanceKm ? Math.round(movingSec / distanceKm) : null,
      elapsedPaceSec: distanceKm ? Math.round(elapsedSec / distanceKm) : null,
      cadenceStartSpm: cadV.length ? Math.round(mean(cadV.slice(0, q)) * k) : null,
      cadenceEndSpm: cadV.length ? Math.round(mean(cadV.slice(-q)) * k) : null,
      cadenceDecayPct: cadenceDecay(cad),
      hrAvg: hr.length ? Math.round(mean(hr.filter(x => x > 0))) : null,
      hrDriftPct: hrDrift(hr, vel),
      points: n
    };
  }

  /* ---------- weekly load ---------- */
  function acwrKm(weeklyKm, i) {
    const prev = weeklyKm.slice(Math.max(0, i - 4), i);
    const chronic = mean(prev);
    if (chronic === null || chronic < G.chronicFloorKm) return null;
    const acute = weeklyKm[i] || 0;
    const ratio = acute / chronic;
    return { ratio: +ratio.toFixed(3), acute, chronic: +chronic.toFixed(1), caution: ratio > G.acwrCaution, flag: ratio > G.acwrDanger };
  }

  function longRunJump(km, priorTwoWeeks) {
    const prior = (priorTwoWeeks || []).filter(x => x > 0);
    if (!prior.length) return { ratio: null, flag: false, max: null };
    const max = Math.max(...prior);
    const ratio = km / max;
    return { ratio: +ratio.toFixed(3), max, flag: ratio > G.longRunJumpMax };
  }

  function weeklyGuard(plannedKm, trailingKm) {
    const avg = mean((trailingKm || []).filter(x => x >= 0));
    if (!avg) return { capped: false, caution: false, capKm: null, ratio: null, avg: 0 };
    const ratio = plannedKm / avg;
    const capKm = Math.round(avg * G.weeklyCap);
    return { capped: plannedKm > capKm, caution: ratio > G.weeklyCaution, capKm, ratio: +ratio.toFixed(2), avg: +avg.toFixed(1) };
  }

  /* ---------- race projection ---------- */
  function walkBreaksTo(km, wb) {
    if (!wb || !wb.everyKm) return 0;
    if (km < wb.fromKm) return 0;
    return Math.floor((km - wb.fromKm) / wb.everyKm) + 1;
  }
  function runSecTo(km, segments) {
    let sec = 0;
    for (const s of segments) {
      if (km <= s.fromKm) break;
      sec += (Math.min(km, s.toKm) - s.fromKm) * s.paceSec;
    }
    return sec;
  }
  function raceProjection(tier, checkpoints) {
    const wb = tier.walkBreaks || null;
    const cps = checkpoints.map(c => {
      const arrivalSec = Math.round(runSecTo(c.km, tier.segments) + walkBreaksTo(c.km, wb) * (wb ? wb.sec : 0));
      return { ...c, arrivalSec, bufferSec: c.cutoffSec - arrivalSec };
    });
    const last = checkpoints[checkpoints.length - 1];
    const finishSec = cps[cps.length - 1].arrivalSec;
    return { tierId: tier.id, label: tier.label, checkpoints: cps, finishSec, finishKm: last.km, walkBreaks: walkBreaksTo(last.km, wb), avgPaceSec: Math.round(finishSec / last.km) };
  }

  const api = { stopPct, cadenceDecay, hrDrift, analyzeStreams, acwrKm, longRunJump, weeklyGuard, raceProjection, fmtHMS, fmtPace, GUARDS: G };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FujiIntel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
