const test = require("node:test");
const assert = require("node:assert/strict");

const I = require("../js/intel.js");
const SPEC = require("../js/plan-spec.js");
const run27k = require("./fixtures/run-27k-streams.json");

test("stopPct is the share of elapsed time spent not moving", () => {
  assert.ok(Math.abs(I.stopPct(13279, 16621) - 20.1) < 0.1);
  assert.equal(I.stopPct(1800, 1800), 0);
  assert.equal(I.stopPct(0, 0), null);
});

test("cadenceDecay compares the first and last quarter of the run and ignores zeros", () => {
  const cad = [80, 80, 80, 80, 0, 76, 76, 76, 72, 72, 72, 72];
  assert.ok(Math.abs(I.cadenceDecay(cad) - (-10)) < 0.01, String(I.cadenceDecay(cad)));
  assert.equal(I.cadenceDecay([0, 0, 0]), null);
});

test("hrDrift is the Pa:Hr efficiency loss between halves", () => {
  const hr = [150, 150, 150, 150, 160, 160, 160, 160];
  const vel = [2, 2, 2, 2, 2, 2, 2, 2];
  assert.ok(Math.abs(I.hrDrift(hr, vel) - 6.25) < 0.01, String(I.hrDrift(hr, vel)));
  assert.equal(I.hrDrift([150, 150], [0, 0]), null);
});

test("analyzeStreams on the 29 Aug 27 km run finds the stops and the cadence collapse", () => {
  const r = I.analyzeStreams(run27k);
  assert.ok(r.stopPct >= 12 && r.stopPct <= 30, `stopPct ${r.stopPct}`);
  assert.ok(r.cadenceDecayPct <= -8, `cadence decay ${r.cadenceDecayPct}`);
  assert.ok(r.cadenceStartSpm >= 155 && r.cadenceStartSpm <= 170, `start cadence ${r.cadenceStartSpm}`);
  assert.ok(r.longestStopSec >= 400, `longest stop ${r.longestStopSec}`);
  assert.ok(r.stops >= 4, `stops ${r.stops}`);
  assert.ok(Math.abs(r.distanceKm - 27.0) < 0.1);
  assert.equal(r.elapsedSec, 16621);
  assert.equal(typeof r.hrDriftPct, "number");
});

test("acwrKm returns null below the 15 km chronic floor and flags above 1.5", () => {
  assert.equal(I.acwrKm([2, 14, 0, 2, 35], 4), null);
  const r = I.acwrKm([24, 36, 40, 30, 46], 4);
  assert.ok(Math.abs(r.ratio - 46 / 32.5) < 0.001);
  assert.equal(r.flag, false);
  assert.equal(I.acwrKm([30, 30, 30, 30, 47], 4).flag, true);
});

test("longRunJump flags 27 km after 10.1 and 14.1 km but not 22 after 18", () => {
  const bad = I.longRunJump(27, [14.1, 10.1]);
  assert.ok(Math.abs(bad.ratio - 27 / 14.1) < 0.001);
  assert.equal(bad.flag, true);
  const ok = I.longRunJump(22, [18, 15]);
  assert.equal(ok.flag, false);
  assert.equal(I.longRunJump(22, []).ratio, null);
});

test("weeklyGuard warns above 1.3× and caps above 1.5× the trailing four-week average", () => {
  const warned = I.weeklyGuard(47, [41.6, 40.7, 29.5, 31]);
  assert.equal(warned.caution, true);
  assert.equal(warned.capped, false);
  const capped = I.weeklyGuard(55, [24, 28, 32, 24]);
  assert.equal(capped.capped, true);
  assert.equal(capped.capKm, 41);
  const fine = I.weeklyGuard(30, [24, 28, 32, 24]);
  assert.equal(fine.caution, false);
  assert.equal(fine.capped, false);
  assert.equal(I.weeklyGuard(20, [0, 0, 0, 0]).capped, false);
});

test("raceProjection tier 1 clears every Fuji checkpoint with at least 15 minutes", () => {
  const p = I.raceProjection(SPEC.race.tiers[0], SPEC.race.checkpoints);
  assert.equal(p.checkpoints.length, SPEC.race.checkpoints.length);
  const minBuffer = Math.min(...p.checkpoints.map(c => c.bufferSec));
  assert.ok(minBuffer >= 15 * 60, `min buffer ${minBuffer}`);
  assert.ok(p.finishSec < 6 * 3600 && p.finishSec > 5 * 3600 + 30 * 60, `finish ${p.finishSec}`);
});

test("raceProjection tier 2 still finishes inside the cutoff", () => {
  const p = I.raceProjection(SPEC.race.tiers[1], SPEC.race.checkpoints);
  assert.ok(p.finishSec < 6 * 3600, `finish ${p.finishSec}`);
  assert.ok(p.checkpoints.every(c => c.bufferSec > 0));
});

test("fmtHMS and fmtPace format seconds for the views", () => {
  assert.equal(I.fmtHMS(20620), "5:43:40");
  assert.equal(I.fmtPace(450), "7:30");
  assert.equal(I.fmtPace(NaN), "—");
});
