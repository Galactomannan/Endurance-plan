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
    strava: "fuji_strava_sync",
    archiveSessions: "fuji_archive_sessions"
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
  extractDeclaration("ARCHIVE_32_PHASES", "const"),
  extractDeclaration("archive32PhaseForWeek"),
  extractDeclaration("archive32IsRecoveryWeek"),
  extractDeclaration("archive32IsTuneRaceWeek"),
  extractDeclaration("archive32IsHillWeek"),
  extractDeclaration("archive32TargetKmFor"),
  extractDeclaration("archive32LongRunMinFor"),
  extractDeclaration("archive32DateForWeekDay"),
  extractDeclaration("archive32QualityForWeek"),
  extractDeclaration("archive32RaceForWeek"),
  extractDeclaration("archive32BuildWeekSummary"),
  extractDeclaration("ARCHIVE_32_WEEKS", "const"),
  extractDeclaration("isLegacyArchiveDateKey"),
  extractDeclaration("isPreResetCurrentSessionDate"),
  extractDeclaration("isStravaTrainingActivity"),
  extractDeclaration("isPlainRecord"),
  extractDeclaration("storageDefaultForKey"),
  extractDeclaration("normalizeStorageValue"),
  extractDeclaration("hasSessionStravaMetadata"),
  extractDeclaration("clearStravaSessionFields"),
  extractDeclaration("archive32LongRuns"),
  extractDeclaration("stravaActivitiesForPicker"),
  extractDeclaration("auditStoredData"),
  extractDeclaration("repairStoredData")
].join("\n"), context);

const archiveWeeks = vm.runInContext("ARCHIVE_32_WEEKS", context);
assert.strictEqual(archiveWeeks.length, 32, "Legacy archive should restore the original 32-week plan");
assert.strictEqual(archiveWeeks[0].phaseShort, "Base", "Archive W1 should start in the Base phase");
assert.strictEqual(archiveWeeks[7].race, "Trail 25k", "Archive should retain the Trail 25k race marker");
assert.strictEqual(archiveWeeks[14].race, "Hyrox", "Archive should retain the Hyrox race marker");
assert.strictEqual(archiveWeeks[31].race, "Fuji Marathon", "Archive should retain the Fuji race marker");

const archiveLongRuns = vm.runInContext("archive32LongRuns({ '2026-05-09': { actualDuration: '82', actualDistance: '9.5', source: 'strava' } })", context);
assert.ok(archiveLongRuns.length >= 28, "Archive should expose the old long-run progression");
assert.strictEqual(archiveLongRuns[0].week, 1, "Archive long-run progression should start at W1");
assert.strictEqual(archiveLongRuns[0].actualDuration, 82, "Archive long-run rows should attach logged Strava/manual data by date");
assert.strictEqual(archiveLongRuns[0].actualDistance, "9.5", "Archive long-run rows should keep logged distance");

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
store.fuji_archive_sessions = {};

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

store.fuji_sessions = {
  "2026-06-28": {
    status: "done",
    source: "strava",
    actualDistance: "25.0",
    actualDuration: "467",
    stravaId: "trail-25k"
  }
};
store.fuji_archive_sessions = {};

const mixedBefore = vm.runInContext("auditStoredData()", context);
assert.strictEqual(mixedBefore.summary.issueCount, 1, "Audit should flag pre-reset sessions in the current plan store");
assert.strictEqual(mixedBefore.issues[0].code, "legacy_session_in_current_store");
assert.strictEqual(mixedBefore.issues[0].safeFix, true);

const mixedRepair = vm.runInContext("repairStoredData()", context);
assert.strictEqual(mixedRepair.fixedCount, 1, "Repair should move one pre-reset session into archive storage");
assert.strictEqual(store.fuji_sessions["2026-06-28"], undefined);
assert.strictEqual(store.fuji_archive_sessions["2026-06-28"].stravaId, "trail-25k");
assert.strictEqual(store.fuji_archive_sessions["2026-06-28"].archivePlan, "legacy-32-week");

console.log("app data audit tests passed");
