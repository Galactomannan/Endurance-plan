const test = require("node:test");
const assert = require("node:assert/strict");

const { createStore, STORAGE, SESSION_STRAVA_FIELDS, ARCHIVE_32_WEEKS, archive32LongRuns,
  isLegacyArchiveDateKey, isPreResetCurrentSessionDate, normalizeStorageValue, FOOT } = require("../js/store.js");

function memoryBackend(seed = {}) {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    dump: () => Object.fromEntries([...m.entries()].map(([k, v]) => [k, JSON.parse(v)]))
  };
}

test("store reads defaults, writes JSON and reports availability", () => {
  const be = memoryBackend();
  const S = createStore(be);
  assert.equal(S.ok, true);
  assert.deepEqual(S.get(STORAGE.sessions, {}), {});
  S.set(STORAGE.sessions, { "2026-09-09": { status: "done" } });
  assert.deepEqual(be.dump()[STORAGE.sessions], { "2026-09-09": { status: "done" } });
});

test("store survives a throwing backend (private mode) and marks itself unavailable", () => {
  const S = createStore({ getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() {} });
  assert.equal(S.ok, false);
  assert.deepEqual(S.get(STORAGE.sessions, {}), {});
  assert.equal(S.set(STORAGE.sessions, {}), false);
});

test("legacy archive: 32 weeks with race markers and long-run rows that attach logged data by date", () => {
  assert.equal(ARCHIVE_32_WEEKS.length, 32);
  assert.equal(ARCHIVE_32_WEEKS[0].phaseShort, "Base");
  assert.equal(ARCHIVE_32_WEEKS[7].race, "Trail 25k");
  assert.equal(ARCHIVE_32_WEEKS[14].race, "Hyrox");
  assert.equal(ARCHIVE_32_WEEKS[31].race, "Fuji Marathon");
  const rows = archive32LongRuns({ "2026-05-09": { actualDuration: "82", actualDistance: "9.5", source: "strava" } });
  assert.ok(rows.length >= 28);
  assert.equal(rows[0].week, 1);
  assert.equal(rows[0].actualDuration, 82);
  assert.equal(rows[0].actualDistance, "9.5");
  assert.equal(isLegacyArchiveDateKey("2026-06-28"), true);
  assert.equal(isPreResetCurrentSessionDate("2026-06-28"), true);
  assert.equal(isPreResetCurrentSessionDate("2026-09-09"), false);
});

test("normalizeStorageValue coerces bad backup shapes", () => {
  assert.deepEqual(normalizeStorageValue(STORAGE.strength, { bad: true }), []);
  assert.deepEqual(normalizeStorageValue(STORAGE.sessions, "nope"), {});
  assert.deepEqual(normalizeStorageValue(STORAGE.foot, [1]), {});
});

test("audit flags stale Strava metadata on a manual session and repair clears it", () => {
  const S = createStore(memoryBackend({
    [STORAGE.sessions]: { "2026-09-09": { status: "done", source: "manual", actualDistance: "5.2", stravaId: "stale", stravaUrl: "https://x" } }
  }));
  const before = S.audit();
  assert.equal(before.summary.issueCount, 1);
  assert.equal(before.issues[0].code, "manual_strava_metadata");
  const r = S.repair();
  assert.equal(r.fixedCount, 1);
  const s = S.get(STORAGE.sessions, {})["2026-09-09"];
  assert.equal(s.source, "manual");
  assert.equal(s.stravaId, undefined);
  assert.equal(s.stravaUrl, undefined);
  SESSION_STRAVA_FIELDS.forEach(f => assert.equal(s[f], undefined));
  assert.equal(S.audit().summary.issueCount, 0);
});

test("audit moves pre-reset sessions out of the current store into the archive", () => {
  const S = createStore(memoryBackend({
    [STORAGE.sessions]: { "2026-06-28": { status: "done", source: "strava", actualDistance: "25.0", actualDuration: "467", stravaId: "trail-25k" } }
  }));
  const before = S.audit();
  assert.equal(before.summary.issueCount, 1);
  assert.equal(before.issues[0].code, "legacy_session_in_current_store");
  assert.equal(before.issues[0].safeFix, true);
  const r = S.repair();
  assert.equal(r.fixedCount, 1);
  assert.equal(S.get(STORAGE.sessions, {})["2026-06-28"], undefined);
  const a = S.get(STORAGE.archiveSessions, {})["2026-06-28"];
  assert.equal(a.stravaId, "trail-25k");
  assert.equal(a.archivePlan, "legacy-32-week");
});

test("audit flags wrong shapes without offering a safe fix", () => {
  const S = createStore(memoryBackend({ [STORAGE.strength]: { not: "an array" }, [STORAGE.foot]: "bad" }));
  const a = S.audit();
  const codes = a.issues.map(i => i.code);
  assert.ok(codes.includes("storage_shape"));
  assert.equal(a.issues.every(i => i.safeFix === false), true);
});

test("session log: save merges, replace overwrites, delete removes", () => {
  const S = createStore(memoryBackend());
  S.saveSession("2026-09-12", { status: "done", actualDistance: "4.1" });
  S.saveSession("2026-09-12", { avgHR: "134" });
  assert.deepEqual(S.getSession("2026-09-12"), { status: "done", actualDistance: "4.1", avgHR: "134" });
  S.saveSession("2026-09-12", { status: "skipped" }, { replace: true });
  assert.deepEqual(S.getSession("2026-09-12"), { status: "skipped" });
  S.deleteSession("2026-09-12");
  assert.equal(S.getSession("2026-09-12"), null);
});

test("foot log stores morning and after-run buckets per date and reads back", () => {
  const S = createStore(memoryBackend());
  assert.deepEqual(FOOT.buckets.map(b => b.id), [0, 1, 2]);
  S.setFoot("2026-09-12", "am", 0);
  S.setFoot("2026-09-12", "pm", 1);
  assert.equal(S.getFoot("2026-09-12").am, 0);
  assert.equal(S.getFoot("2026-09-12").pm, 1);
  assert.equal(S.getFoot("2026-09-13"), null);
  assert.equal(S.footSwapsToBike("2026-09-12"), false);
  S.setFoot("2026-09-13", "am", 2);
  assert.equal(S.footSwapsToBike("2026-09-13"), true);
});

test("export includes every storage key and import normalizes and ignores unknown keys", () => {
  const S = createStore(memoryBackend());
  S.saveSession("2026-09-12", { status: "done" });
  const out = S.exportAll();
  Object.values(STORAGE).forEach(k => assert.ok(k in out, k));
  const S2 = createStore(memoryBackend());
  S2.importAll({ ...out, [STORAGE.strength]: "bad", junk: 1 });
  assert.deepEqual(S2.get(STORAGE.sessions), { "2026-09-12": { status: "done" } });
  assert.deepEqual(S2.get(STORAGE.strength), []);
  assert.throws(() => S2.importAll("nope"));
});
