const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeStreams, downsampleStreams, STREAM_KEYS } = require("../lib/streams.js");

test("normalizeStreams flattens Strava's key_by_type payload and ignores unknown keys", () => {
  const raw = {
    time: { data: [0, 5, 10], series_type: "time" },
    heartrate: { data: [120, 130, 140] },
    velocity_smooth: { data: [2.0, 2.1, 2.2] },
    weird: { data: [1, 2, 3] }
  };
  const s = normalizeStreams(raw);
  assert.deepEqual(s.time, [0, 5, 10]);
  assert.deepEqual(s.heartrate, [120, 130, 140]);
  assert.deepEqual(s.velocity_smooth, [2.0, 2.1, 2.2]);
  assert.equal(s.weird, undefined);
  assert.equal(s.cadence, undefined);
});

test("normalizeStreams tolerates the array form Strava returns without key_by_type", () => {
  const raw = [{ type: "time", data: [0, 1] }, { type: "distance", data: [0, 3] }];
  const s = normalizeStreams(raw);
  assert.deepEqual(s.time, [0, 1]);
  assert.deepEqual(s.distance, [0, 3]);
});

test("downsampleStreams keeps first and last samples, stays within maxPoints, and keeps arrays aligned", () => {
  const n = 1000;
  const streams = {
    time: Array.from({ length: n }, (_, i) => i),
    distance: Array.from({ length: n }, (_, i) => i * 2.5),
    heartrate: Array.from({ length: n }, (_, i) => 120 + (i % 40))
  };
  const d = downsampleStreams(streams, 80);
  assert.ok(d.time.length <= 80);
  assert.equal(d.time[0], 0);
  assert.equal(d.time[d.time.length - 1], n - 1);
  assert.equal(d.distance.length, d.time.length);
  assert.equal(d.heartrate.length, d.time.length);
  assert.equal(d.distance[d.distance.length - 1], (n - 1) * 2.5);
});

test("downsampleStreams leaves short streams untouched", () => {
  const streams = { time: [0, 1, 2], heartrate: [1, 2, 3] };
  assert.deepEqual(downsampleStreams(streams, 80), streams);
});

test("STREAM_KEYS lists what the API requests from Strava", () => {
  assert.deepEqual(STREAM_KEYS, ["time", "distance", "heartrate", "cadence", "velocity_smooth", "moving"]);
});
