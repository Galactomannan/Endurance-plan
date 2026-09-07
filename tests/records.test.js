const test = require("node:test");
const assert = require("node:assert/strict");

const SPEC = require("../js/plan-spec.js");
const Engine = require("../js/plan-engine.js");
const R = require("../js/records.js");

const PLAN = Engine.buildPlan(SPEC, { gateDate: SPEC.startDate });

test("runsByDate merges Strava runs (all sports counted by type) with manual logs, Strava winning per date", () => {
  const acts = [
    { id: "1", sportType: "Run", localDate: "2026-09-12", distanceKm: 4.1 },
    { id: "2", sportType: "Run", localDate: "2026-09-12", distanceKm: 2.0 },
    { id: "3", sportType: "Ride", localDate: "2026-09-13", distanceKm: 30 }
  ];
  const log = { "2026-09-12": { status: "done", actualDistance: "9" }, "2026-09-11": { status: "done", actualDistance: "3.1", type: "walk_run" }, "2026-09-10": { status: "done", actualDistance: "30", type: "bike" } };
  const by = R.runsByDate(acts, log);
  assert.equal(by["2026-09-12"].km, 6.1);
  assert.equal(by["2026-09-12"].longest, 4.1);
  assert.equal(by["2026-09-11"].km, 3.1);
  assert.equal(by["2026-09-13"], undefined);
  assert.equal(by["2026-09-10"], undefined);
});

test("weeklyKm builds trailing + plan weeks with actual and planned km", () => {
  const by = { "2026-08-31": { km: 3.9, longest: 3.9 }, "2026-09-09": { km: 3.1, longest: 3.1 }, "2026-09-12": { km: 4.1, longest: 4.1 } };
  const rows = R.weeklyKm(by, PLAN, { today: "2026-09-12", back: 2, ahead: 2 });
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map(r => r.start), ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  assert.equal(rows[1].km, 3.9);
  assert.equal(rows[1].planKm, null);
  assert.equal(rows[2].km, 7.2);
  assert.equal(rows[2].planKm, 10);
  assert.equal(rows[2].current, true);
  assert.equal(rows[3].planKm, 16);
  assert.equal(rows[3].km, 0);
  assert.equal(rows[3].future, true);
});

test("longRunRows lists long runs and races with stop% from intel or elapsed time", () => {
  const log = {
    "2026-09-12": { status: "done", actualDistance: "4.1", actualDuration: "46", elapsedDuration: "48", pace: "11:18", avgHR: "134" },
    "2026-09-19": { status: "done", actualDistance: "6.0", actualDuration: "55", intel: { stopPct: 12.5, cadenceDecayPct: -6, hrDriftPct: 3 } }
  };
  const rows = R.longRunRows(PLAN, log, SPEC.guards);
  assert.equal(rows.length, PLAN.weeks.length);
  assert.equal(rows[0].date, "2026-09-12");
  assert.equal(rows[0].stopPct, 4.2);
  assert.equal(rows[0].flagged, false);
  assert.equal(rows[1].stopPct, 12.5);
  assert.equal(rows[1].flagged, true);
  assert.equal(rows[2].done, false);
});

test("easyPaceTrend groups steady runs by month and takes the median moving pace", () => {
  const acts = [
    { sportType: "Run", localDate: "2026-02-07", distanceKm: 21.3, avgHR: 148, pace: "9:35" },
    { sportType: "Run", localDate: "2026-02-14", distanceKm: 8, avgHR: 150, pace: "10:41" },
    { sportType: "Run", localDate: "2026-02-20", distanceKm: 8, avgHR: 152, pace: "10:15" },
    { sportType: "Run", localDate: "2026-08-08", distanceKm: 21.2, avgHR: 156, pace: "8:14" },
    { sportType: "Run", localDate: "2026-08-15", distanceKm: 5, avgHR: 150, pace: "8:00" },
    { sportType: "Run", localDate: "2026-08-22", distanceKm: 10.1, avgHR: 170, pace: "7:52" },
    { sportType: "Ride", localDate: "2026-08-23", distanceKm: 40, avgHR: 130, pace: "2:00" }
  ];
  const t = R.easyPaceTrend(acts, { hrMin: 140, hrMax: 158, minKm: 6 });
  assert.deepEqual(t.map(p => p.month), ["2026-02", "2026-08"]);
  assert.equal(t[0].paceSec, 615);
  assert.equal(t[0].n, 3);
  assert.equal(t[1].paceSec, 494);
  assert.equal(t[1].n, 1);
});

test("footStrip returns one cell per day ending today with the bucket or null", () => {
  const foot = { "2026-09-12": { am: 0, pm: 1 }, "2026-09-05": { am: 2 } };
  const s = R.footStrip(foot, "2026-09-12", 14);
  assert.equal(s.length, 14);
  assert.equal(s[13].date, "2026-09-12");
  assert.equal(s[13].level, 1);
  assert.equal(s[6].level, 2);
  assert.equal(s[0].level, null);
});

test("heatAdjustSec slows the pace band above the reference temperature and speeds it below, clamped to ±10%", () => {
  assert.equal(R.heatAdjustSec(510, 28), 510);
  assert.equal(R.heatAdjustSec(510, 36), 530);
  assert.equal(R.heatAdjustSec(510, 5), 459);
  assert.equal(R.heatAdjustSec(510, 60), 561);
  assert.equal(R.heatAdjustSec(510, null), 510);
});

test("bodyStats returns latest weight and rolling averages from readiness entries", () => {
  const r = { "2026-09-10": { weight: "85.9", rhr: "52", hrv: "60", sleep: "7" }, "2026-09-12": { weight: "85.5", rhr: "50", sleep: "6.5" } };
  const s = R.bodyStats(r);
  assert.equal(s.weight, 85.5);
  assert.equal(s.weight7, 85.7);
  assert.equal(s.rhr14, 51);
  assert.equal(s.hrv14, 60);
  assert.equal(s.sleep7, 6.8);
  assert.equal(R.bodyStats({}).weight, null);
});

test("zoneForSession maps logged and planned types to training zones", () => {
  assert.equal(R.zoneForSession({ type: "easy_z1" }, null), "z1");
  assert.equal(R.zoneForSession({ type: "walk_run" }, null), "z1");
  assert.equal(R.zoneForSession({ type: "bike" }, null), "z1");
  assert.equal(R.zoneForSession({ type: "mp_long" }, null), "z2");
  assert.equal(R.zoneForSession({ type: "tune_race" }, null), "z2");
  assert.equal(R.zoneForSession({ type: "hill" }, null), "mixed");
  assert.equal(R.zoneForSession({}, { zone: "z2" }), "z2");
  assert.equal(R.zoneForSession({ type: "strength_a" }, { zone: "strength" }), null);
  assert.equal(R.zoneForSession(null, null), null);
});

test("tidForWeek splits logged minutes into zones and reports them against the phase target", () => {
  const week = PLAN.weeks[6];
  const day = i => week.days[i].date;
  const log = {
    [day(1)]: { status: "done", type: "easy_z1", actualDuration: "60" },
    [day(2)]: { status: "done", type: "speed", actualDuration: "40" },
    [day(5)]: { status: "done", type: "long_run", actualDuration: "100" },
    [day(6)]: { status: "skipped", type: "bike", actualDuration: "90" }
  };
  const t = R.tidForWeek(week, log);
  assert.equal(t.minutes, 200);
  assert.equal(t.z1, 80);
  assert.equal(t.z2, 20);
  assert.equal(t.z3, 0);
  assert.deepEqual(t.target, week.phase.tid);
  const empty = R.tidForWeek(week, {});
  assert.equal(empty.minutes, 0);
  assert.equal(empty.z1, 0);
});

test("tidForWeek falls back to the planned duration and splits a mixed session", () => {
  const week = PLAN.weeks[7];
  const hill = week.days.find(d => d.type === "hill");
  const t = R.tidForWeek(week, { [hill.date]: { status: "done", type: "hill" } });
  assert.equal(t.minutes, hill.duration);
  assert.equal(t.z1 + t.z2 + t.z3, 100);
  assert.ok(t.z1 > t.z2 && t.z2 > t.z3);
});

test("sweatRate returns loss, rate, dehydration percent and replacement targets", () => {
  const s = R.sweatRate({ pre: 85.2, post: 83.8, fluidMl: 700, durMin: 90 });
  assert.equal(s.lossKg, 1.4);
  assert.equal(s.sweatLh, 1.4);
  assert.equal(s.dehydPct, 1.6);
  assert.equal(s.level, "ok");
  assert.equal(s.duringMlH, 1120);
  assert.equal(s.replaceL, 2.1);
  assert.equal(R.sweatRate({ pre: 85, post: 82, fluidMl: 0, durMin: 120 }).level, "high");
  assert.equal(R.sweatRate({ pre: 85, post: 82.5, fluidMl: 0, durMin: 120 }).level, "watch");
  assert.equal(R.sweatRate({ pre: 85, post: 86, fluidMl: 0, durMin: 60 }), null);
  assert.equal(R.sweatRate({ pre: 85, post: 84, fluidMl: 0, durMin: 0 }), null);
});

test("minutesByDate splits Strava time into run and bike, with manual logs filling the gaps", () => {
  const acts = [
    { id: "1", sportType: "Run", localDate: "2026-09-12", durationMin: 46 },
    { id: "2", sportType: "Run", localDate: "2026-09-12", durationMin: 20 },
    { id: "3", sportType: "Ride", localDate: "2026-09-13", durationMin: 61 },
    { id: "4", sportType: "Walk", localDate: "2026-09-13", durationMin: 30 }
  ];
  const log = {
    "2026-09-12": { status: "done", type: "walk_run", actualDuration: "46" },
    "2026-09-11": { status: "done", type: "walk_run", actualDuration: "35" },
    "2026-09-10": { status: "done", type: "bike", actualDuration: "60" },
    "2026-09-09": { status: "skipped", type: "walk_run", actualDuration: "40" },
    "2026-09-08": { status: "done", type: "strength_a", actualDuration: "55" }
  };
  const m = R.minutesByDate(acts, log);
  assert.equal(m["2026-09-12"].runMin, 66);
  assert.equal(m["2026-09-12"].bikeMin, 0);
  assert.equal(m["2026-09-13"].bikeMin, 61);
  assert.equal(m["2026-09-13"].runMin, 0);
  assert.equal(m["2026-09-11"].runMin, 35);
  assert.equal(m["2026-09-10"].bikeMin, 60);
  assert.equal(m["2026-09-09"], undefined);
  assert.equal(m["2026-09-08"], undefined);
});

test("weeklyLoad totals run and bike minutes per week against what the plan asked for", () => {
  const byMin = { "2026-09-09": { runMin: 35, bikeMin: 0 }, "2026-09-12": { runMin: 46, bikeMin: 0 }, "2026-09-08": { runMin: 0, bikeMin: 61 } };
  const rows = R.weeklyLoad(byMin, PLAN, { today: "2026-09-12", back: 1, ahead: 1 });
  assert.equal(rows.length, 3);
  const w1 = rows[1];
  assert.equal(w1.start, "2026-09-07");
  assert.equal(w1.planWeek, 1);
  assert.equal(w1.current, true);
  assert.equal(w1.runMin, 81);
  assert.equal(w1.bikeMin, 61);
  assert.equal(w1.planRunMin, 120);
  assert.equal(w1.planBikeMin, 120);
  assert.equal(rows[0].planWeek, null);
  assert.equal(rows[2].planWeek, 2);
  assert.equal(rows[2].future, true);
  assert.equal(rows[2].runMin, 0);
});

test("weeklyLoad counts strength and race days in neither bucket but keeps the plan's own totals", () => {
  const rows = R.weeklyLoad({}, PLAN, { today: "2026-12-13", back: 0, ahead: 0 });
  const race = rows[0];
  assert.equal(race.planWeek, 14);
  assert.ok(race.planRunMin >= 340, `race week run minutes ${race.planRunMin}`);
  assert.equal(race.planBikeMin, 0);
});
