/* ============================================================================
   Plan engine — turns FUJI_PLAN_SPEC into dated weeks of sessions.
   Pure: no DOM, no storage. Classic script in the browser (FujiPlanEngine),
   CommonJS in tests.
   ============================================================================ */
(function (root) {
  "use strict";

  const EPS = 1e-9;

  /* ---------- dates (UTC, ISO strings) ---------- */
  function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    const [y1, m1, d1] = a.split("-").map(Number);
    const [y2, m2, d2] = b.split("-").map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  /* ---------- formatting ---------- */
  function fmtPace(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    const m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function round5(min) { return Math.max(5, Math.round(min / 5) * 5); }
  function half(km) { return Math.round(km * 2) / 2; }
  function runMinutes(spec, km, paceSec) { return round5(km * (paceSec || spec.paces.easyEstimateSec) / 60); }

  /* ---------- session factories ---------- */
  const EV = {
    easy: "Easy volume builds the aerobic base · TID for recreational runners: consistency beats the model (Rosenblat 2024; Seiler 2010)",
    walkrun: "Return after a break: 33→50→75% of pre-break load, run/walk is not 'too easy' (Daniels ch.9)",
    long: "Marathon specificity = continuous time on feet · late-race slowdown is the problem to train for (Fitzgerald ch.11; Daniels ch.16)",
    mp: "M-pace inside the long run: confidence, fueling practice, race rhythm (Daniels E/M/T/I/R)",
    t: "Threshold cruise intervals raise sustainable pace · keep it 'comfortably hard' (Daniels T pace; Casado 2023)",
    hill: "Course specificity: Bunkado climb ~1.2 km / ~100 m at km 20–22 · hills improve economy (Barnes 2013)",
    bike: "Non-impact aerobic volume · 80/20 applies to run + bike time (Fitzgerald ch.12)",
    strength: "High-load + plyometrics: the only strength mix with a reliable RE effect; injury protection at any speed (Llanos-Lagos 2024)",
    rest: "Recovery enables adaptation · bone and tendon adapt on the days off (ACSM ch.3; Kellmann 2018)",
    race: "Execution per the race-week plan — pace, not place",
    taper: "Amateur endurance taper: 20–30% volume cut, keep race-specific intensity (Mujika 2003; Norwegian taper)"
  };

  function rest(spec, extra) {
    return { type: "rest", title: "Rest", detail: extra || "Full rest. Walking and mobility fine. Sleep 8 h. Eat at maintenance.", duration: 0, hrTarget: "—", zone: "rest", evidence: EV.rest };
  }
  function bike(spec, min, note) {
    return { type: "bike", title: `Bike ${min}' Z1`, detail: `${note || "Steady Zone 1 spin"} · HR <${spec.paces.bike.hrCap} · cadence 85–95 rpm · easy enough to talk the whole way.`, duration: min, bikeMin: min, hrTarget: `<${spec.paces.bike.hrCap}`, zone: "z1", evidence: EV.bike };
  }
  function strength(spec, day, opts = {}) {
    const light = !!opts.light;
    const km = opts.km || 0;
    const title = `Strength ${day}${light ? " — light" : ""}${km ? ` + easy ${km} km` : ""}${opts.bikeMin ? ` + bike ${opts.bikeMin}'` : ""}`;
    const detail = [
      light ? "2 sets · ~75% 1RM · no plyo · keep neuromuscular tone" : "Follow the Strength view for this week's loads and plyometric cap",
      km ? `Easy ${km} km at <${spec.paces.easy.hrCap} bpm, ≥6 h from the lift` : "",
      opts.bikeMin ? `Bike ${opts.bikeMin}' Z1 after, HR <${spec.paces.bike.hrCap}` : ""
    ].filter(Boolean).join(" · ");
    const s = { type: day === "A" ? "strength_a" : "strength_b", title, detail, duration: (light ? 40 : 55) + (km ? runMinutes(spec, km) : 0) + (opts.bikeMin || 0), hrTarget: "strength", zone: "strength", evidence: EV.strength };
    if (km) s.distanceKm = km;
    if (opts.bikeMin) s.bikeMin = opts.bikeMin;
    return s;
  }
  function easy(spec, km, opts = {}) {
    const strides = opts.strides ? " + 6×20 s strides" : "";
    return {
      type: "easy_z1",
      title: `Easy ${km} km${strides}`,
      detail: `${fmtPace(spec.paces.easy.minSec)}–${fmtPace(spec.paces.easy.maxSec)} /km · HR <${spec.paces.easy.hrCap} · continuous · cadence ≥170 spm${opts.strides ? " · strides relaxed and tall, full recovery between" : ""}${opts.note ? " · " + opts.note : ""}`,
      duration: runMinutes(spec, km) + (opts.strides ? 5 : 0),
      distanceKm: km,
      hrTarget: `<${spec.paces.easy.hrCap} (Z1)`, zone: "z1", evidence: EV.easy
    };
  }
  function walkRun(spec, reps, km) {
    return {
      type: "walk_run", title: `Walk-run ${reps}×(2' run / 1' walk) · ${km} km`,
      detail: `Flat, one familiar daily trainer · run segments at recovery effort, HR <${spec.paces.recovery.hrCap} · stop if foot pain >3/10 during or next morning (decision rule 3) · this is Daniels' 33% return week`,
      duration: reps * 3 + 10, distanceKm: km, hrTarget: `<${spec.paces.recovery.hrCap}`, zone: "z1", evidence: EV.walkrun
    };
  }
  function quality(spec, key, km) {
    const T = spec.paces.threshold, G = spec.paces.goal;
    const t = `${fmtPace(T.minSec)}–${fmtPace(T.maxSec)} /km (HR ${T.hrMin}–${T.hrMax})`;
    switch (key) {
      case "strides":
        return easy(spec, km, { strides: true });
      case "incline_walk":
        return { type: "hill", title: `Incline walk 4×3' @ 6% · ${km} km`, detail: "Treadmill 6% incline · brisk walk, HR <150 · 2' flat between · first hill stimulus without impact · finish with 10' easy jog", duration: 45, distanceKm: km, hrTarget: "<150", zone: "z1", evidence: EV.hill };
      case "tcruise":
        return { type: "speed", title: `Cruise intervals 4×5' @ T · ${km} km`, detail: `WU 2 km easy · 4×5' at ${t} / 2' jog · CD 2 km · comfortably hard, never a race`, duration: 55, distanceKm: km, hrTarget: `${T.hrMin}–${T.hrMax}`, zone: "z2", evidence: EV.t };
      case "tcruise_short":
        return { type: "speed", title: `Cruise intervals 3×5' @ T · ${km} km`, detail: `WU 2 km · 3×5' at ${t} / 2' jog · CD 2 km · sharpen, don't drain — the 30 km is Saturday`, duration: 45, distanceKm: km, hrTarget: `${T.hrMin}–${T.hrMax}`, zone: "z2", evidence: EV.t };
      case "hills":
        return { type: "hill", title: `Hills 5×4' @ 6–8% · ${km} km`, detail: "Treadmill 6–8% or a long bridge ramp · 5×4' uphill at easy-moderate effort, HR ≤165, cadence first / walk or jog down · CD 10' · descend with short quick steps", duration: 55, distanceKm: km, hrTarget: "≤165", zone: "mixed", evidence: EV.hill };
      case "hills_light":
        return { type: "hill", title: `Light hills 4×3' @ 6% · ${km} km`, detail: "Down week · 4×3' at easy effort, HR ≤160 / jog down · keep the pattern, not the load", duration: 45, distanceKm: km, hrTarget: "≤160", zone: "mixed", evidence: EV.hill };
      case "hills_bunkado":
        return { type: "hill", title: `Bunkado rehearsal 2×8' @ 8% · ${km} km`, detail: "Treadmill 8% · 2×8' continuous uphill run at 9:30–10:00 /km, HR ≤168 / 5' flat easy between · this is the km 20–22 climb · CD 10' with fast light steps", duration: 55, distanceKm: km, hrTarget: "≤168", zone: "mixed", evidence: EV.hill };
      default:
        return easy(spec, km);
    }
  }
  function longRun(spec, ws, km, weekNum) {
    const mp = ws.mpKm || 0;
    const G = spec.paces.goal;
    const walkProtocol = (ws.phase === "build" || ws.phase === "peak" || ws.phase === "taper");
    const parts = [
      "Continuous — no stops",
      walkProtocol ? "planned 30 s walk every ~2.5 km from km 5 (race protocol rehearsal)" : "",
      `base at ${fmtPace(spec.paces.easy.minSec)}–${fmtPace(spec.paces.easy.maxSec)} /km, HR <${spec.paces.easy.hrCap}`,
      mp ? `last ${mp} km at ${G.target} /km (${fmtPace(G.minSec)}–${fmtPace(G.maxSec)}), HR cap ${G.hrCap} — slow down if HR exceeds it` : "",
      ws.fuel ? `${ws.fuel} g CHO/h from 45'` : "",
      ws.capMin ? `time cap ${Math.floor(ws.capMin / 60)}:${String(ws.capMin % 60).padStart(2, "0")} — stop at the cap even if short` : "",
      ws.descent ? "include 4–6 bridge descents (Rama VIII / Bhumibol) — short steps, high cadence, no braking" : "",
      "targets: stopped time <8%, cadence decay <5%, HR drift <8% — miss one and next week's long run repeats this distance",
      "same shoe every long run from here"
    ].filter(Boolean).join(" · ");
    const baseMin = runMinutes(spec, km - mp) + Math.round(mp * G.maxSec / 60);
    return {
      type: mp ? "mp_long" : "long_run",
      title: mp ? `Long run ${km} km · last ${mp} km @ ${G.target}` : `Long run ${km} km`,
      detail: parts,
      duration: ws.capMin ? Math.min(ws.capMin, round5(baseMin)) : round5(baseMin),
      distanceKm: km, mpKm: mp,
      hrTarget: mp ? `<${spec.paces.easy.hrCap} / ≤${G.hrCap}` : `<${spec.paces.easy.hrCap} (Z1)`,
      zone: mp ? "z2" : "z1",
      evidence: mp ? EV.mp : EV.long
    };
  }
  function raceSession(spec, raceId) {
    const race = spec.races.find(r => r.id === raceId);
    if (raceId === "fuji") {
      return { type: "tune_race", title: "Fuji Marathon — RACE DAY", detail: `09:00 start · Tier per the half test · 7:45 for 4 km, 7:30 to Saiko at HR ≤160, run the Bunkado climb, 7:45–7:55 around Saiko, short steps on the descent · 30 s walk at each aid station · 60 g CHO/h · layers off after 5 km`, duration: 340, distanceKm: 42.2, hrTarget: "≤160 → free after 36 km", zone: "z2", evidence: EV.race };
    }
    return { type: "tune_race", title: "ATM Bangkok Half — controlled test", detail: `02:00 start · 21.1 km continuous at 7:45 /km, average HR ≤160, stopped time <5% · gels every 5 km · this decides Tier 1 vs Tier 2 for Fuji (decision rule 5) · race kit and race shoe`, duration: 170, distanceKm: 21.1, hrTarget: "≤160", zone: "z2", evidence: EV.race, race: race ? race.id : raceId };
  }

  /* ---------- weekly patterns (Mon..Sun) ---------- */
  const QUALITY_KM = { strides: 6, incline_walk: 5, tcruise: 8, tcruise_short: 7, hills: 7, hills_light: 6, hills_bunkado: 8, easy: 6 };

  function splitEasy(remaining) {
    // Tue gets the larger share; Thursday carries a short run on the strength day when there is enough volume.
    if (remaining >= 12) return { tue: half(remaining - 4), thu: 4 };
    if (remaining >= 9) return { tue: half(remaining - 3), thu: 3 };
    return { tue: half(remaining), thu: 0 };
  }

  const PATTERNS = {
    bikeonly(spec, ws) {
      return [strength(spec, "A"), bike(spec, 60, "Gate not open yet — aerobic maintenance"), rest(spec), strength(spec, "B"), bike(spec, 60), bike(spec, 90, "Long spin"), rest(spec)];
    },
    walkrun(spec, ws) {
      const b = ws.bike || {};
      return [strength(spec, "A"), bike(spec, b.tue || 60), walkRun(spec, 8, 3), strength(spec, "B"), walkRun(spec, 10, 3), walkRun(spec, 12, 4), bike(spec, b.sun || 60)];
    },
    return(spec, ws) {
      const b = ws.bike || {};
      const wedKm = 5;
      const rem = ws.runKm - ws.longRunKm - wedKm;
      const { tue, thu } = splitEasy(rem);
      return [strength(spec, "A"), easy(spec, tue), easy(spec, wedKm, { note: "second easy day — continuous from here on" }), strength(spec, "B", { km: thu, bikeMin: b.thu }), rest(spec), longRun(spec, ws, ws.longRunKm), bike(spec, b.sun || 90, "Long spin")];
    },
    standard(spec, ws) {
      const b = ws.bike || {};
      const qKey = ws.quality || "easy";
      const wedKm = QUALITY_KM[qKey] || 6;
      const rem = ws.runKm - ws.longRunKm - wedKm;
      const { tue, thu } = splitEasy(rem);
      return [strength(spec, "A"), easy(spec, tue), quality(spec, qKey, wedKm), strength(spec, "B", { km: thu }), rest(spec, "Rest before the long run. Lay out the long-run kit and fuel."), longRun(spec, ws, ws.longRunKm), bike(spec, b.sun || 90, ws.down ? "Down week — long easy spin" : "Long spin · second long day without impact")];
    },
    racehalf(spec, ws) {
      return [
        strength(spec, "A", { light: true }),
        easy(spec, 6),
        easy(spec, 4, { strides: true }),
        easy(spec, 3, { note: "shakeout · early night — 02:00 start on Saturday" }),
        rest(spec, "Rest · sleep by 20:00 · bag and kit ready · carbs 7–8 g/kg"),
        raceSession(spec, "atmbkk"),
        rest(spec, "Walk 20' · 30 g protein + 100 g CHO within an hour of finishing")
      ];
    },
    taper(spec, ws) {
      const b = ws.bike || {};
      const s = [
        strength(spec, "A", { light: true }),
        easy(spec, 4),
        easy(spec, 5, { strides: true }),
        rest(spec),
        easy(spec, 3),
        longRun(spec, ws, ws.longRunKm),
        bike(spec, b.sun || 60, "Easy spin")
      ];
      s[0].detail += " · last lift of the block (D-13, Rønnestad 2014)";
      s[5].evidence = EV.taper;
      return s;
    },
    race(spec, ws) {
      return [
        easy(spec, 4, { note: "the hay is in the barn" }),
        easy(spec, 4, { strides: true }),
        rest(spec, "Rest · travel day · hydrate"),
        easy(spec, 3, { strides: true }),
        rest(spec, "Rest · carb load 10 g/kg (~850 g) D-3→D-1 · expect +1–2 kg"),
        { type: "recovery", title: "Shakeout 1 km + 2 strides", detail: "15' total · race tomorrow · kit check, gels counted, early night", duration: 15, distanceKm: 1, hrTarget: "<140", zone: "z1", evidence: EV.taper },
        raceSession(spec, "fuji")
      ];
    }
  };

  /* ---------- gate slip ---------- */
  function resolveWeeks(spec, gateDate) {
    const warnings = [];
    let slip = Math.floor(Math.max(0, daysBetween(spec.startDate, gateDate)) / 7);
    const maxSlip = Math.max(...Object.keys(spec.gateSlip || {}).map(Number), 0);
    if (slip > maxSlip) {
      warnings.push(`Gate slipped ${slip} weeks — only ${maxSlip} weeks of compression are defined; showing the ${maxSlip}-week compressed plan.`);
      slip = maxSlip;
    }
    if (slip === 0) return { weeks: spec.weeks.map(w => ({ ...w })), slip, warnings };
    const rule = spec.gateSlip[slip];
    if (rule.warning) warnings.push(rule.warning);
    const kept = spec.weeks.filter(w => !rule.drop.includes(w.w)).map(w => {
      const o = (rule.override || {})[w.w];
      return o ? { ...w, ...o } : { ...w };
    });
    const zeroWeeks = Array.from({ length: slip }, (_, i) => ({ w: -(i + 1), phase: "return", pattern: "bikeonly", runKm: 0, longRunKm: 0, mpKm: 0, quality: null, bike: {}, label: "gate closed" }));
    return { weeks: zeroWeeks.concat(kept), slip, warnings };
  }

  /* ---------- build ---------- */
  function buildWeek(spec, ws, weekNum) {
    const startDate = addDays(spec.startDate, (weekNum - 1) * 7);
    const phase = spec.phases.find(p => p.id === ws.phase) || spec.phases[0];
    const days = PATTERNS[ws.pattern || "standard"](spec, ws, weekNum);
    days.forEach((s, d) => { s.date = addDays(startDate, d); s.dow = d; });
    const bikeMin = days.reduce((sum, s) => sum + (s.bikeMin || 0), 0);
    return {
      weekNum, startDate, endDate: addDays(startDate, 6), phase,
      isRecovery: !!ws.down, label: ws.label || "", race: ws.race || null, quality: ws.quality || null,
      targetKm: ws.runKm, longRunKm: ws.longRunKm, mpKm: ws.mpKm || 0, capMin: ws.capMin || null,
      fuel: ws.fuel || null, bikeMin, specWeek: ws.w, days
    };
  }

  function buildPlan(spec, opts = {}) {
    const gateDate = opts.gateDate || spec.startDate;
    const { weeks: weekSpecs, slip, warnings } = resolveWeeks(spec, gateDate);
    const weeks = weekSpecs.map((ws, i) => buildWeek(spec, ws, i + 1));
    // phase ranges recomputed from the resolved weeks so views stay correct after a slip
    const phases = spec.phases.map(p => {
      const nums = weeks.filter(w => w.phase.id === p.id).map(w => w.weekNum);
      return { ...p, weeks: nums.length ? [Math.min(...nums), Math.max(...nums)] : p.weeks };
    });
    weeks.forEach(w => { w.phase = phases.find(p => p.id === w.phase.id); });
    return {
      id: spec.id, name: spec.name, startDate: spec.startDate, totalWeeks: weeks.length,
      gateDate, slip, rampCheckFromWeek: spec.rampCheckFromWeek + slip,
      phases, weeks, races: spec.races, warnings
    };
  }

  /* ---------- guards ---------- */
  function checkProgression(plan, guards) {
    const g = guards || (root.FUJI_PLAN_SPEC && root.FUJI_PLAN_SPEC.guards) || { weeklyRampMax: 0.15, longRunJumpMax: 1.25, longRunShareMax: 0.65 };
    const v = [];
    const from = plan.rampCheckFromWeek || 5;
    plan.weeks.forEach((week, i) => {
      if (week.weekNum < from || week.race) return;
      if (!week.isRecovery) {
        const prev = plan.weeks.slice(0, i).reverse().find(w => !w.isRecovery && !w.race && w.targetKm > 0);
        if (prev) {
          const ratio = week.targetKm / prev.targetKm;
          if (ratio > 1 + g.weeklyRampMax + EPS) v.push({ rule: "weekly-ramp", week: week.weekNum, ratio: +ratio.toFixed(3), limit: 1 + g.weeklyRampMax });
        }
      }
      const prior = plan.weeks.slice(Math.max(0, i - 2), i).map(w => w.longRunKm).filter(k => k > 0);
      if (prior.length) {
        const ratio = week.longRunKm / Math.max(...prior);
        if (ratio > g.longRunJumpMax + EPS) v.push({ rule: "long-run-jump", week: week.weekNum, ratio: +ratio.toFixed(3), limit: g.longRunJumpMax });
      }
      if (week.targetKm > 0) {
        const share = week.longRunKm / week.targetKm;
        if (share > g.longRunShareMax + EPS) v.push({ rule: "long-run-share", week: week.weekNum, ratio: +share.toFixed(3), limit: g.longRunShareMax });
      }
    });
    return v;
  }

  const api = { buildPlan, checkProgression, addDays, daysBetween, fmtPace };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FujiPlanEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
