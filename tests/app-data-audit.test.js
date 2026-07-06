const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");

function extractDeclaration(name, kind = "function") {
  const needle = kind === "const" ? `const ${name}` : `function ${name}`;
  const start = html.indexOf(needle);
  assert.notStrictEqual(start, -1, `Missing ${needle}`);
  if (kind === "const") {
    const end = html.indexOf(";", start);
    assert.notStrictEqual(end, -1, `Missing semicolon for ${name}`);
    return html.slice(start, end + 1);
  }

  const braceStart = html.indexOf("{", start);
  assert.notStrictEqual(braceStart, -1, `Missing opening brace for ${name}`);
  let depth = 0;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract function ${name}`);
}

const store = {};
const context = {
  STORAGE: {
    sessions: "fuji_sessions",
    strength: "fuji_strength_log",
    longruns: "fuji_long_runs",
    readiness: "fuji_readiness",
    settings: "fuji_settings",
    strava: "fuji_strava_sync"
  },
  Store: {
    get(key, fallback) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback;
    },
    set(key, value) {
      store[key] = value;
      return true;
    }
  },
  console
};

vm.createContext(context);
vm.runInContext([
  extractDeclaration("SESSION_STRAVA_FIELDS", "const"),
  extractDeclaration("isStravaTrainingActivity"),
  extractDeclaration("isPlainRecord"),
  extractDeclaration("storageDefaultForKey"),
  extractDeclaration("normalizeStorageValue"),
  extractDeclaration("hasSessionStravaMetadata"),
  extractDeclaration("clearStravaSessionFields"),
  extractDeclaration("stravaActivitiesForPicker"),
  extractDeclaration("auditStoredData"),
  extractDeclaration("repairStoredData")
].join("\n"), context);

const picked = vm.runInContext(`stravaActivitiesForPicker([
  { id: "run-a", name: "Morning Run", sportType: "Run", startDateLocal: "2026-07-07T07:00:00", localDate: "2026-07-07", durationMin: 30 },
  { id: "run-b", name: "Evening Run", sportType: "Run", startDateLocal: "2026-07-07T18:00:00", localDate: "2026-07-07", durationMin: 22 },
  { id: "walk-a", name: "Health walk", sportType: "Walk", startDateLocal: "2026-07-07T09:00:00", localDate: "2026-07-07", durationMin: 28 }
])`, context);
assert.deepStrictEqual(Array.from(picked).map(a => a.id), ["run-b", "run-a"], "Strava picker should keep all training runs and sort newest first");
const normalizedStrength = vm.runInContext("normalizeStorageValue(STORAGE.strength, { bad: true })", context);
assert.strictEqual(Array.isArray(normalizedStrength), true, "Invalid strength backup value should normalize to an array");
assert.strictEqual(normalizedStrength.length, 0, "Invalid strength backup value should normalize to an empty array");

store.fuji_sessions = {
  "2026-07-07": {
    status: "done",
    source: "manual",
    actualDistance: "5.2",
    stravaId: "stale-activity",
    stravaUrl: "https://www.strava.com/activities/stale-activity"
  }
};
store.fuji_strength_log = [];
store.fuji_readiness = {};
store.fuji_settings = {};
store.fuji_strava_sync = {};

const before = vm.runInContext("auditStoredData()", context);
assert.strictEqual(before.summary.issueCount, 1, "Audit should flag stale Strava fields on manual session");
assert.strictEqual(before.issues[0].code, "manual_strava_metadata");

const repair = vm.runInContext("repairStoredData()", context);
assert.strictEqual(repair.fixedCount, 1, "Repair should clean one stale manual session");
assert.strictEqual(store.fuji_sessions["2026-07-07"].source, "manual");
assert.strictEqual(store.fuji_sessions["2026-07-07"].stravaId, undefined);
assert.strictEqual(store.fuji_sessions["2026-07-07"].stravaUrl, undefined);

const after = vm.runInContext("auditStoredData()", context);
assert.strictEqual(after.summary.issueCount, 0, "Audit should be clean after safe repair");

console.log("app data audit tests passed");
