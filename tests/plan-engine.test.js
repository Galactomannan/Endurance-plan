const test = require("node:test");
const assert = require("node:assert/strict");

const SPEC = require("../js/plan-spec.js");
const { buildPlan, checkProgression } = require("../js/plan-engine.js");

const QUALITY_TYPES = new Set(["speed", "hill", "mp_long", "tune_race"]);
const RUN_TYPES = new Set(["easy_z1", "speed", "hill", "long_run", "mp_long", "tune_race", "recovery", "walk_run"]);

test("plan has 14 weeks, starts Monday 7 Sep 2026, and pins both races to their real dates", () => {
  const plan = buildPlan(SPEC);
  assert.equal(plan.weeks.length, 14);
  assert.equal(plan.weeks[0].startDate, "2026-09-07");
  const half = plan.weeks[11].days[5];
  assert.equal(half.date, "2026-11-28");
  assert.equal(half.type, "tune_race");
  assert.match(half.title, /Half/);
  const fuji = plan.weeks[13].days[6];
  assert.equal(fuji.date, "2026-12-13");
  assert.equal(fuji.type, "tune_race");
  assert.match(fuji.title, /Fuji/);
});

test("every week has seven dated sessions with the fields the views render", () => {
  const plan = buildPlan(SPEC);
  plan.weeks.forEach((week, i) => {
    assert.equal(week.weekNum, i + 1);
    assert.equal(week.days.length, 7);
    assert.ok(week.phase && week.phase.name && week.phase.color, `W${i + 1} phase`);
    week.days.forEach((s, d) => {
      assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/, `W${i + 1} day ${d} date`);
      assert.equal(typeof s.type, "string");
      assert.equal(typeof s.title, "string");
      assert.equal(typeof s.detail, "string");
      assert.equal(typeof s.duration, "number");
      assert.equal(typeof s.zone, "string");
    });
  });
});

test("weekly running volume matches the approved table", () => {
  const plan = buildPlan(SPEC);
  assert.deepEqual(plan.weeks.map(w => w.targetKm), [10, 16, 24, 28, 32, 24, 36, 40, 30, 46, 50, 34, 26, 54]);
  assert.deepEqual(plan.weeks.map(w => w.longRunKm), [4, 6, 9, 12, 14, 12, 17, 20, 15, 24, 30, 21.1, 14, 42.2]);
});

test("the run kilometres inside each week add up to the weekly target", () => {
  const plan = buildPlan(SPEC);
  plan.weeks.forEach(week => {
    const km = week.days.reduce((sum, s) => sum + (s.distanceKm || 0), 0);
    assert.ok(Math.abs(km - week.targetKm) <= 0.6, `W${week.weekNum}: ${km} vs ${week.targetKm}`);
  });
});

test("no week schedules more than two quality sessions and quality days are separated", () => {
  const plan = buildPlan(SPEC);
  plan.weeks.forEach(week => {
    const qDays = week.days.map((s, d) => (QUALITY_TYPES.has(s.type) ? d : -1)).filter(d => d >= 0);
    assert.ok(qDays.length <= 2, `W${week.weekNum} has ${qDays.length} quality days`);
    if (qDays.length === 2) assert.ok(qDays[1] - qDays[0] >= 2, `W${week.weekNum} quality days adjacent`);
  });
});

test("progression guards pass on the base plan: ramp ≤15% from W5, long run ≤1.25× prior two weeks, LR ≤ ~60% of the week", () => {
  const plan = buildPlan(SPEC);
  assert.deepEqual(checkProgression(plan), []);
});

test("the return block uses walk-run in W1 and continuous easy running from W2", () => {
  const plan = buildPlan(SPEC);
  const w1Runs = plan.weeks[0].days.filter(s => RUN_TYPES.has(s.type));
  assert.ok(w1Runs.length >= 3);
  assert.ok(w1Runs.every(s => s.type === "walk_run"), "W1 runs are walk-run");
  assert.ok(plan.weeks[1].days.every(s => s.type !== "walk_run"), "W2 has no walk-run");
});

test("Sunday is a Zone 1 bike in build weeks and there are two strength days", () => {
  const plan = buildPlan(SPEC);
  const w8 = plan.weeks[7];
  assert.equal(w8.days[6].type, "bike");
  assert.equal(w8.days[0].type, "strength_a");
  assert.equal(w8.days[3].type, "strength_b");
  assert.equal(w8.days[4].type, "rest");
});

test("marathon-pace segments appear in long runs from W8 with the approved dose", () => {
  const plan = buildPlan(SPEC);
  const mp = plan.weeks.map(w => w.days[5].mpKm || 0);
  assert.deepEqual(mp.slice(0, 13), [0, 0, 0, 0, 0, 0, 0, 4, 0, 8, 10, 0, 3]);
  assert.equal(plan.weeks[9].days[5].type, "mp_long");
  assert.equal(plan.weeks[6].days[5].type, "long_run");
});

test("a one-week gate slip pushes the return block right, drops the first down week, keeps the race date and stays within guards", () => {
  const plan = buildPlan(SPEC, { gateDate: "2026-09-14" });
  assert.equal(plan.weeks.length, 14);
  assert.equal(plan.weeks[0].targetKm, 0);
  assert.ok(plan.weeks[0].days.every(s => !RUN_TYPES.has(s.type)), "W1 has no running");
  assert.equal(plan.weeks[1].targetKm, 10);
  assert.deepEqual(plan.weeks.map(w => w.targetKm), [0, 10, 16, 24, 28, 32, 36, 40, 30, 46, 50, 34, 26, 54]);
  assert.equal(plan.weeks[13].days[6].date, "2026-12-13");
  assert.equal(plan.weeks[11].days[5].date, "2026-11-28");
  assert.deepEqual(checkProgression(plan), []);
});

test("a two-week gate slip drops two weeks, scales the peak down and stays within guards", () => {
  const plan = buildPlan(SPEC, { gateDate: "2026-09-21" });
  assert.deepEqual(plan.weeks.map(w => w.targetKm), [0, 0, 10, 16, 24, 28, 32, 36, 30, 41, 45, 34, 26, 54]);
  assert.equal(plan.weeks[10].longRunKm, 26);
  assert.deepEqual(checkProgression(plan), []);
  assert.equal(plan.warnings.length, 0);
});

test("a three-week gate slip produces the compressed plan with a warning", () => {
  const plan = buildPlan(SPEC, { gateDate: "2026-09-28" });
  assert.equal(plan.weeks.length, 14);
  assert.deepEqual(plan.weeks.map(w => w.targetKm), [0, 0, 0, 10, 16, 24, 28, 32, 30, 36, 40, 34, 26, 54]);
  assert.deepEqual(checkProgression(plan), []);
  assert.ok(plan.warnings.some(w => /decision rule 1/i.test(w)));
});

test("checkProgression reports a long-run jump when the spec is tampered with", () => {
  const tampered = JSON.parse(JSON.stringify(SPEC));
  tampered.weeks[9].longRunKm = 30; // W10 jumps from 20 → 30
  const plan = buildPlan(tampered);
  const violations = checkProgression(plan);
  assert.ok(violations.some(v => v.rule === "long-run-jump" && v.week === 10), JSON.stringify(violations));
});
