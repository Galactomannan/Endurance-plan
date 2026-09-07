/* ============================================================================
   Road to Fuji — 14-week rebuild · plan as data
   Loaded as a classic <script> in the browser (defines FUJI_PLAN_SPEC) and via
   require() in tests. Numbers here are the approved plan from
   docs/superpowers/specs/2026-09-07-fuji-rebuild-plan-design.md — change the
   data, not the engine, when the plan changes.
   ============================================================================ */
(function (root) {
  "use strict";

  const SPEC = {
    id: "fuji-2026-rebuild-14w",
    name: "Road to Fuji — 14-week rebuild",
    startDate: "2026-09-07",          // Monday of W1
    totalWeeks: 14,
    baseKm: 32,                       // sustainable pre-injury weekly base the return ramp is scaled from
    rampCheckFromWeek: 5,             // first week at 100% of base — progression guards apply from here

    athlete: {
      name: "James", age: 30, sex: "Male", weight: 85.7, height: 176,
      vo2max: 55.1, hrMax: 197,
      vt1_hr: 155, vt1_speed: 8.1, vt1_pace: "7:24",
      vt2_hr: 171, vt2_speed: 10.0, vt2_pace: "6:00",
      vvo2max: 13.9, testDate: "4 April 2026",
      injury: { date: "2026-08-29", site: "right lateral foot", note: "after the 27 km run · gated return, symptom-led" }
    },

    /* Paces in seconds per km · HR caps are for Bangkok heat (28–32 °C) */
    paces: {
      recovery: { label: "Recovery", minSec: 555, maxSec: 600, hrCap: 140 },
      easy:     { label: "Easy (E)", minSec: 510, maxSec: 555, hrCap: 150 },
      goal:     { label: "Goal / M", minSec: 445, maxSec: 460, hrCap: 162, target: "7:30" },
      threshold:{ label: "Threshold (T)", minSec: 405, maxSec: 420, hrMin: 165, hrMax: 170 },
      bike:     { label: "Bike Z1", hrCap: 140 },
      easyEstimateSec: 525            // 8:45 — used only to turn km into minutes for the views
    },

    phases: [
      { id: "return", name: "Return", short: "Return", weeks: [1, 3], color: "#34D399", tid: [95, 5, 0],
        focus: "Symptom-led return · walk-run then continuous easy · bike carries the aerobic load (Daniels 33→50→75%)." },
      { id: "base",   name: "Base",   short: "Base",   weeks: [4, 6], color: "#60A5FA", tid: [90, 8, 2],
        focus: "Back to 100% of base, then hold · strides and incline walking · plateau before building (Daniels 3–4 wk plateaus)." },
      { id: "build",  name: "Build",  short: "Build",  weeks: [7, 9], color: "#FF9F0A", tid: [82, 13, 5],
        focus: "Two quality days: cruise intervals or hills on Wednesday, long run with the first goal-pace segments · fueling practice starts." },
      { id: "peak",   name: "Peak",   short: "Peak",   weeks: [10, 12], color: "#F43F5E", tid: [80, 17, 3],
        focus: "Bunkado hill rehearsal, 30 km continuous at D-22, then the ATM Half as the pacing test that sets the race tier." },
      { id: "taper",  name: "Taper",  short: "Taper",  weeks: [13, 14], color: "#C084FC", tid: [85, 12, 3],
        focus: "−30% volume, keep goal-pace touches and strides, last lift D-13 · carb load D-3 · race Sunday." }
    ],

    /* One row per week. runKm includes the long run (and the race in race weeks).
       quality = Wednesday session key · bike = minutes by weekday · fuel = g CHO/h in the long run */
    weeks: [
      { w: 1,  phase: "return", pattern: "walkrun",  runKm: 10, longRunKm: 4,    mpKm: 0,  quality: null,             bike: { tue: 60, sun: 60 },  label: "walk-run" },
      { w: 2,  phase: "return", pattern: "return",   runKm: 16, longRunKm: 6,    mpKm: 0,  quality: null,             bike: { thu: 75, sun: 75 } },
      { w: 3,  phase: "return", pattern: "return",   runKm: 24, longRunKm: 9,    mpKm: 0,  quality: null,             bike: { sun: 90 } },
      { w: 4,  phase: "base",   pattern: "standard", runKm: 28, longRunKm: 12,   mpKm: 0,  quality: "strides",        bike: { sun: 90 } },
      { w: 5,  phase: "base",   pattern: "standard", runKm: 32, longRunKm: 14,   mpKm: 0,  quality: "incline_walk",   bike: { sun: 90 },  label: "plateau" },
      { w: 6,  phase: "base",   pattern: "standard", runKm: 24, longRunKm: 12,   mpKm: 0,  quality: "strides",        bike: { sun: 120 }, down: true },
      { w: 7,  phase: "build",  pattern: "standard", runKm: 36, longRunKm: 17,   mpKm: 0,  quality: "tcruise",        bike: { sun: 120 }, fuel: 30 },
      { w: 8,  phase: "build",  pattern: "standard", runKm: 40, longRunKm: 20,   mpKm: 4,  quality: "hills",          bike: { sun: 150 }, fuel: 30 },
      { w: 9,  phase: "build",  pattern: "standard", runKm: 30, longRunKm: 15,   mpKm: 0,  quality: "hills_light",    bike: { sun: 120 }, down: true, fuel: 30 },
      { w: 10, phase: "peak",   pattern: "standard", runKm: 46, longRunKm: 24,   mpKm: 8,  quality: "hills_bunkado",  bike: { sun: 90 },  fuel: 60, label: "peak volume" },
      { w: 11, phase: "peak",   pattern: "standard", runKm: 50, longRunKm: 30,   mpKm: 10, quality: "tcruise_short",  bike: { sun: 60 },  fuel: 60, capMin: 240, descent: true, label: "longest run · D-22" },
      { w: 12, phase: "peak",   pattern: "racehalf", runKm: 34, longRunKm: 21.1, mpKm: 0,  quality: null,             bike: {},           race: "atmbkk", label: "half test" },
      { w: 13, phase: "taper",  pattern: "taper",    runKm: 26, longRunKm: 14,   mpKm: 3,  quality: "strides",        bike: { sun: 60 } },
      { w: 14, phase: "taper",  pattern: "race",     runKm: 54, longRunKm: 42.2, mpKm: 0,  quality: null,             bike: {},           race: "fuji", label: "race week" }
    ],

    /* Gate slips: whole weeks between startDate and the first running day.
       Weeks are removed by their original number; overrides replace km/LR on the survivors. */
    gateSlip: {
      1: { drop: [6] },
      2: { drop: [6, 8], override: { 10: { runKm: 41, longRunKm: 21 }, 11: { runKm: 45, longRunKm: 26 } } },
      3: { drop: [5, 6, 8], override: { 7: { runKm: 32, longRunKm: 15 }, 10: { runKm: 36, longRunKm: 18 }, 11: { runKm: 40, longRunKm: 22 } },
           warning: "Gate slipped 3+ weeks — decision rule 1: this is the compressed plan; confirm Fuji is still the goal or make the half the A-race." }
    },

    /* Progression guards checked by plan-engine.checkProgression and the dashboard */
    guards: {
      weeklyRampMax: 0.15,      // vs previous non-down, non-race week
      longRunJumpMax: 1.25,     // vs longest of the prior two weeks
      longRunShareMax: 0.65,    // long run / weekly running km
      acwrCaution: 1.3,
      acwrDanger: 1.5,
      chronicFloorKm: 15,       // ACWR meaningless below this trailing average
      stopPctMax: 8,
      cadenceDecayMax: 5,       // percent
      hrDriftMax: 8             // percent
    },

    races: [
      { id: "trail", name: "The North Face Trail 25k", short: "Trail 25k", date: "2026-06-28", color: "#34D399", icon: "🏔",
        status: "done", result: "7:46:41", specs: { distance: "25.1 km", gain: "+1,153 m", surface: "Trail / mountain", temp: "~30 °C" },
        note: "7 h 46 on feet — harder day than Fuji. Relative Effort 500, the highest of the year." },
      { id: "hyrox", name: "Thai Hyrox · Doubles Men", short: "Hyrox", date: "2026-08-16", color: "#C084FC", icon: "💪",
        status: "done", result: "not recorded", specs: { format: "8×1 km run + 8 stations", division: "MEN OPEN" },
        note: "Not logged in Strava — add the result in Side Races if you want it on the record." },
      { id: "atmbkk", name: "Amazing Thailand Marathon Bangkok — Half", short: "BKK Half", date: "2026-11-28", color: "#60A5FA", icon: "🏃",
        status: "planned", tier: "Test · D-15", weekInPlan: 12, dayInPlan: 5, startTime: "02:00",
        goal: "7:45/km continuous · HR ≤160 · stops <5%",
        specs: { distance: "21.1 km", surface: "Road · flat", start: "02:00 Saturday", temp: "24–28 °C humid" },
        estimate: "2:43 – 2:48",
        impactNote: "Run as a controlled test, not a race. Pass = hold 7:45/km continuous at average HR ≤160 with <5% stopped time → Tier 1 at Fuji. Otherwise Tier 2. It is the only quality session of W12 (Daniels: a race is a Q day; drop the other Q)." },
      { id: "fuji", name: "Mt. Fuji International Marathon", short: "Fuji", date: "2026-12-13", color: "#FF6B00", icon: "🗻",
        status: "planned", tier: "A-race", weekInPlan: 14, dayInPlan: 6, startTime: "09:00",
        goal: "Finish inside 6:00 · Tier 1 ≈5:35–5:45",
        specs: { distance: "42.195 km", gain: "≈ +240 m", surface: "Road · Kawaguchi → Saiko loop", temp: "2–8 °C at 09:00" } }
    ],

    race: {
      id: "fuji",
      name: "Mt. Fuji International Marathon",
      date: "2026-12-13",
      startTime: "09:00",
      cutoffSec: 6 * 3600,
      location: "Funatsuhama, Fujikawaguchiko · 830–900 m",
      weather: "2–8 °C at the start, occasionally below zero, usually dry and clear",
      goal: "Finish inside the cutoff",
      goalPace: "7:30 → 7:30–8:00",
      targetHR: "≤160 bpm to Saiko",
      elevation: "≈240 m gain · 100 m climb at km 20–22 · 100 m descent at km 35",
      temp: "2–8 °C",
      cutoff: "6:00:00",
      checkpoints: [
        { name: "Kawaguchiko bridge", km: 12.1,   cutoffSec: 1 * 3600 + 57 * 60 },
        { name: "Terasaki",           km: 20.5,   cutoffSec: 3 * 3600 + 3 * 60 },
        { name: "Saiko #3",           km: 27.3,   cutoffSec: 4 * 3600,          hardest: true },
        { name: "Saiko #4",           km: 30.3,   cutoffSec: 4 * 3600 + 24 * 60 },
        { name: "Adawada",            km: 35.1,   cutoffSec: 5 * 3600 + 3 * 60 },
        { name: "Katsuyama",          km: 37.7,   cutoffSec: 5 * 3600 + 24 * 60 },
        { name: "Finish",             km: 42.195, cutoffSec: 6 * 3600 }
      ],
      profile: [
        { fromKm: 0,    toKm: 4,    terrain: "gentle climb toward Fuji", note: "cold start + adrenaline — hold back" },
        { fromKm: 4,    toKm: 12.1, terrain: "Kawaguchi lakeside, rolling", note: "bridge wind at 12 km" },
        { fromKm: 12.1, toKm: 20.5, terrain: "lakeside, walking-path section near 20 km", note: "finish fueling before the climb" },
        { fromKm: 20.5, toKm: 22,   terrain: "Bunkado climb · ~1.2 km · ~100 m", note: "run it at 9:30–10:00, cadence first" },
        { fromKm: 22,   toKm: 34,   terrain: "Saiko loop, mountain side, rolling", note: "checkpoint 3 at 27.3 is the tight one" },
        { fromKm: 34,   toKm: 36,   terrain: "~100 m descent", note: "short steps, high cadence, no braking — quads" },
        { fromKm: 36,   toKm: 42.2, terrain: "downhill / flat, bridge wind", note: "cadence, not stride length" }
      ],
      tiers: [
        { id: "tier1", label: "Tier 1 · 7:30 to Saiko", condition: "ATM Half passed: 7:45/km continuous, HR ≤160, stops <5%",
          walkBreaks: { everyKm: 2.5, fromKm: 5, sec: 30 },
          segments: [
            { fromKm: 0,    toKm: 4,      paceSec: 465, hrCap: 152, note: "gentle climb — 7:45, not 7:30" },
            { fromKm: 4,    toKm: 20.5,   paceSec: 450, hrCap: 160, note: "7:30 along Kawaguchi" },
            { fromKm: 20.5, toKm: 22,     paceSec: 585, hrCap: 168, note: "run the Bunkado climb" },
            { fromKm: 22,   toKm: 27.3,   paceSec: 465, hrCap: 160, note: "7:45 to checkpoint 3" },
            { fromKm: 27.3, toKm: 34,     paceSec: 470, hrCap: 160, note: "Saiko loop 7:50" },
            { fromKm: 34,   toKm: 36,     paceSec: 442, hrCap: null, note: "descent — short steps" },
            { fromKm: 36,   toKm: 42.195, paceSec: 472, hrCap: null, note: "bring it home" }
          ] },
        { id: "tier2", label: "Tier 2 · 8:00 flat", condition: "Fallback if the half test fails or the foot is not clear",
          walkBreaks: { everyKm: 2.5, fromKm: 2.5, sec: 30 },
          segments: [
            { fromKm: 0,    toKm: 20.5,   paceSec: 480, hrCap: 158, note: "8:00 with walk breaks from km 2.5" },
            { fromKm: 20.5, toKm: 22,     paceSec: 630, hrCap: 166, note: "climb — run/walk" },
            { fromKm: 22,   toKm: 42.195, paceSec: 480, hrCap: 160, note: "8:00 to the finish" }
          ] }
      ]
    },

    decisionRules: [
      { id: 1, when: "4 Oct 2026 (end of W4)", rule: "No continuous 9 km yet → choose the compressed plan or make the half the A-race." },
      { id: 2, when: "every week", rule: "Planned km above 1.5× the trailing 4-week average is capped; above 1.3× is flagged." },
      { id: 3, when: "any run", rule: "Foot pain >3/10 during or the morning after → three bike days, resume at the previous week's load." },
      { id: 4, when: "15 Nov 2026 (end of W10)", rule: "24 km long run at elapsed ≤8:15 with <8% stops not achieved → Tier 2 pacing; the half becomes the longest run." },
      { id: 5, when: "28 Nov 2026 (ATM Half)", rule: "7:45/km continuous at HR ≤160 with <5% stops → Tier 1. Otherwise Tier 2." }
    ]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = SPEC;
  root.FUJI_PLAN_SPEC = SPEC;
})(typeof globalThis !== "undefined" ? globalThis : this);
