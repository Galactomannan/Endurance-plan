const test = require("node:test");
const assert = require("node:assert/strict");

const SPEC = require("../js/plan-spec.js");
const Engine = require("../js/plan-engine.js");
const Sync = require("../js/strava-sync.js");

const PLAN = Engine.buildPlan(SPEC, { gateDate: SPEC.startDate });
const run = (o) => ({ id: "1", name: "Morning Run", sportType: "Run", localDate: "2026-09-12", startDateLocal: "2026-09-12T06:04:00", distanceKm: 4.1, durationMin: 46, elapsedMin: 48, avgHR: 134, pace: "11:18", url: "https://www.strava.com/activities/1", ...o });

test("training activities include runs, workouts and rides but not walks", () => {
  assert.equal(Sync.isStravaTrainingActivity({ sportType: "Run" }), true);
  assert.equal(Sync.isStravaTrainingActivity({ sportType: "Ride" }), true);
  assert.equal(Sync.isStravaTrainingActivity({ sportType: "VirtualRide" }), true);
  assert.equal(Sync.isStravaTrainingActivity({ sportType: "Workout" }), true);
  assert.equal(Sync.isStravaTrainingActivity({ sportType: "Walk" }), false);
});

test("picker keeps all training activities, newest first", () => {
  const picked = Sync.stravaActivitiesForPicker([
    run({ id: "a", startDateLocal: "2026-07-07T07:00:00", durationMin: 30 }),
    run({ id: "b", startDateLocal: "2026-07-07T18:00:00", durationMin: 22 }),
    { id: "w", sportType: "Walk", startDateLocal: "2026-07-07T09:00:00" }
  ]);
  assert.deepEqual(picked.map(a => a.id), ["b", "a"]);
});

test("activitiesForDay prefers the sport that matches the planned session, longest first", () => {
  const acts = [
    run({ id: "r1", durationMin: 30 }),
    run({ id: "r2", durationMin: 46 }),
    run({ id: "ride", sportType: "Ride", durationMin: 90 }),
    run({ id: "other", localDate: "2026-09-11" })
  ];
  const runDay = Sync.activitiesForDay(acts, "2026-09-12", { type: "walk_run" });
  assert.deepEqual(runDay.map(a => a.id), ["r2", "r1", "ride"]);
  const bikeDay = Sync.activitiesForDay(acts, "2026-09-12", { type: "bike" });
  assert.deepEqual(bikeDay.map(a => a.id), ["ride", "r2", "r1"]);
});

test("typeFromStravaActivity keeps the planned type except rides on non-bike days become bike", () => {
  assert.equal(Sync.typeFromStravaActivity(run(), { type: "walk_run" }), "walk_run");
  assert.equal(Sync.typeFromStravaActivity(run({ sportType: "Ride" }), { type: "easy_z1" }), "bike");
  assert.equal(Sync.typeFromStravaActivity(run(), { type: "rest" }), "easy_z1");
  assert.equal(Sync.typeFromStravaActivity(run({ sportType: "TrailRun" }), null), "long_run");
});

test("sessionPatchFromStravaActivity fills the log fields and keeps Strava metadata", () => {
  const planned = PLAN.weeks[0].days[5];
  const p = Sync.sessionPatchFromStravaActivity(run(), planned, {});
  assert.equal(p.source, "strava");
  assert.equal(p.stravaId, "1");
  assert.equal(p.actualDistance, "4.1");
  assert.equal(p.actualDuration, 46);
  assert.equal(p.elapsedDuration, 48);
  assert.equal(p.avgHR, 134);
  assert.equal(p.pace, "11:18");
  assert.equal(p.type, planned.type);
  assert.equal(p.title, planned.title);
  assert.ok(p.notes.includes("Morning Run"));
});

test("applyStravaActivitiesToSessions imports by date, skips manual logs, ignores days outside the plan", () => {
  const log = { "2026-09-11": { status: "done", source: "manual", actualDistance: "3.0" } };
  const acts = [
    run({ id: "sat", localDate: "2026-09-12" }),
    run({ id: "fri", localDate: "2026-09-11" }),
    run({ id: "old", localDate: "2026-08-29", distanceKm: 27 })
  ];
  const { log: next, summary } = Sync.applyStravaActivitiesToSessions(acts, log, PLAN);
  assert.equal(summary.imported, 1);
  assert.equal(summary.manualSkipped, 1);
  assert.equal(summary.outsidePlan, 1);
  assert.equal(next["2026-09-12"].stravaId, "sat");
  assert.equal(next["2026-09-12"].status, "done");
  assert.equal(next["2026-09-11"].source, "manual");
  const again = Sync.applyStravaActivitiesToSessions(acts, next, PLAN);
  assert.equal(again.summary.duplicates, 1);
  assert.equal(again.summary.imported, 0);
});

test("compactStravaActivities keeps a merged, date-sorted, capped list and preserves intel", () => {
  const prev = [{ id: "1", localDate: "2026-09-12", intel: { stopPct: 3 } }];
  const out = Sync.compactStravaActivities([run({ id: "1" }), run({ id: "2", localDate: "2026-09-10", sportType: "Ride" })], prev);
  assert.deepEqual(out.map(a => a.id), ["2", "1"]);
  assert.deepEqual(out[1].intel, { stopPct: 3 });
  assert.equal(out[0].sportType, "Ride");
  assert.equal(typeof out[0].distanceKm, "number");
});
