/* ============================================================================
   Data layer — storage keys, a backend-injectable store, the legacy 32-week
   archive, and the audit/repair rules that keep saved data honest.
   Classic script in the browser (FujiStore), CommonJS in tests.
   ============================================================================ */
(function (root) {
  "use strict";

  const STORAGE = {
    sessions: "fuji_sessions",
    strength: "fuji_strength_log",
    longruns: "fuji_long_runs",
    readiness: "fuji_readiness",
    settings: "fuji_settings",
    strava: "fuji_strava_sync",
    archiveSessions: "fuji_archive_sessions",
    foot: "fuji_foot"
  };

  const SESSION_STRAVA_FIELDS = [
    "stravaId", "stravaName", "stravaSport", "stravaUrl", "stravaStartDate",
    "maxHR", "avgWatts", "weightedWatts", "elevationGain"
  ];

  /* Foot check-in buckets (decision rule 3: above 3/10 → three bike days) */
  const FOOT = {
    buckets: [
      { id: 0, label: "0", short: "0", text: "no pain" },
      { id: 1, label: "1 – 3", short: "1–3", text: "mild" },
      { id: 2, label: "above 3", short: ">3", text: "above 3 · bike" }
    ],
    swapLevel: 2
  };

  /* ---------- legacy 32-week archive (May → Dec 2026) ---------- */
  const ARCHIVE_32_PHASES = [
    { name: "Base Building", short: "Base", weeks: [1, 8], kmRange: [35, 46], tid: [82, 3, 15], color: "#30D158" },
    { name: "Build", short: "Build", weeks: [9, 18], kmRange: [44, 58], tid: [78, 12, 10], color: "#FF9F0A" },
    { name: "Race Specific", short: "Spec", weeks: [19, 27], kmRange: [54, 64], tid: [77, 18, 5], color: "#FF453A" },
    { name: "Taper", short: "Taper", weeks: [28, 32], kmRange: [64, 28], tid: [80, 12, 8], color: "#0A84FF" }
  ];
  function archive32PhaseForWeek(w) {
    for (const p of ARCHIVE_32_PHASES) { if (w >= p.weeks[0] && w <= p.weeks[1]) return p; }
    return ARCHIVE_32_PHASES[ARCHIVE_32_PHASES.length - 1];
  }
  function archive32IsRecoveryWeek(w) { return w % 3 === 0 && w < 28; }
  function archive32IsTuneRaceWeek(w) { return w === 26; }
  function archive32IsHillWeek(w) { return [8, 14, 20].includes(w); }
  function archive32TargetKmFor(w) {
    const p = archive32PhaseForWeek(w);
    const len = p.weeks[1] - p.weeks[0];
    const wIn = w - p.weeks[0];
    let km = p.kmRange[0] + (p.kmRange[1] - p.kmRange[0]) * (len ? wIn / len : 0);
    if (archive32IsRecoveryWeek(w)) km *= 0.7;
    if (archive32IsTuneRaceWeek(w)) km *= 0.85;
    return Math.round(km);
  }
  function archive32LongRunMinFor(w) {
    let m;
    if (w <= 8) m = 80 + (w - 1) * (30 / 7);
    else if (w <= 18) m = 105 + (w - 9) * (40 / 9);
    else if (w <= 27) m = 135 + (w - 19) * (25 / 8);
    else m = 150 - (w - 28) * (95 / 4);
    if (archive32IsRecoveryWeek(w)) m *= 0.7;
    if (archive32IsTuneRaceWeek(w)) m = 110;
    return Math.min(180, Math.max(35, Math.round(m / 5) * 5));
  }
  function archive32DateForWeekDay(weekIndex, dayIndex) {
    const d = new Date(Date.UTC(2026, 4, 4 + (weekIndex - 1) * 7 + dayIndex));
    return d.toISOString().slice(0, 10);
  }
  function archive32QualityForWeek(w) {
    if (archive32IsRecoveryWeek(w)) return "Easy fartlek recovery touch";
    if (archive32IsHillWeek(w)) return "Hill repeats 8 x 60s";
    if (w <= 2) return "Fartlek 6 x 2min";
    if (w <= 5) return "VO2max 5 x 3min";
    if (w <= 8) return "VO2max 5 x 4min";
    if (w === 10 || w === 11) return "VO2max 4 x 4min";
    if (w === 13) return "Tempo 2 x 10min";
    if (w === 16) return "Threshold 3 x 8min";
    if (w === 17) return "Threshold 4 x 7min";
    if (w <= 22) return "Marathon-pace tempo 3 x 12min";
    if (w <= 25) return "VO2max 4 x 4min + MP cooldown";
    if (w === 26) return "Tune-up half marathon";
    if (w <= 27) return "Race sharpener 5 x 3min";
    if (w <= 30) return "Easy fartlek 4 x 2min";
    return "Sharpness 3 x 3min";
  }
  function archive32RaceForWeek(w) {
    if (w === 8) return "Trail 25k";
    if (w === 15) return "Hyrox";
    if (w === 26) return "Tune-up Half";
    if (w === 32) return "Fuji Marathon";
    return "";
  }
  function archive32BuildWeekSummary(w) {
    const phase = archive32PhaseForWeek(w);
    return {
      week: w, startDate: archive32DateForWeekDay(w, 0), endDate: archive32DateForWeekDay(w, 6),
      phase: phase.name, phaseShort: phase.short, color: phase.color,
      targetKm: archive32TargetKmFor(w), tid: phase.tid.join(" / "), quality: archive32QualityForWeek(w),
      longRunMin: archive32LongRunMinFor(w), race: archive32RaceForWeek(w),
      isRecovery: archive32IsRecoveryWeek(w), isHill: archive32IsHillWeek(w)
    };
  }
  const ARCHIVE_32_WEEKS = Array.from({ length: 32 }, (_, i) => archive32BuildWeekSummary(i + 1));

  function isLegacyArchiveDateKey(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "2026-05-04" && date <= "2026-12-13";
  }
  function isPreResetCurrentSessionDate(date) {
    return isLegacyArchiveDateKey(date) && date < "2026-07-06";
  }
  function archive32LongRuns(log) {
    log = log || {};
    return ARCHIVE_32_WEEKS.filter(w => !w.isHill).map(w => {
      const day = w.week === 32 ? 6 : 5;
      const date = archive32DateForWeekDay(w.week, day);
      const entry = log[date] || {};
      const type = w.week === 26 || w.week === 32 ? "tune_race" : (w.week >= 9 && w.week <= 29 ? "mp_long" : "long_run");
      return {
        week: w.week, date, type, phase: w.phase, phaseShort: w.phaseShort, color: w.color,
        plannedDuration: w.longRunMin,
        title: w.week === 32 ? "Fuji Marathon" : w.week === 26 ? "Tune-up half marathon" : `Long run ${w.longRunMin} min`,
        actualDuration: entry.actualDuration ? parseInt(entry.actualDuration, 10) : null,
        actualDistance: entry.actualDistance || "",
        pace: entry.pace || "", avgHR: entry.avgHR || "", source: entry.source || "",
        stravaId: entry.stravaId || "", notes: entry.notes || "",
        done: entry.status === "done" || entry.status === "modified"
      };
    });
  }

  /* ---------- shapes ---------- */
  function isPlainRecord(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function storageDefaultForKey(key) {
    if (key === STORAGE.strength) return [];
    if (Object.values(STORAGE).includes(key)) return {};
    return null;
  }
  function normalizeStorageValue(key, value) {
    if (key === STORAGE.strength) return Array.isArray(value) ? value : [];
    if (Object.values(STORAGE).includes(key)) return isPlainRecord(value) ? value : {};
    return value;
  }
  function hasSessionStravaMetadata(entry) {
    if (!isPlainRecord(entry)) return false;
    return SESSION_STRAVA_FIELDS.some(f => entry[f] !== undefined && entry[f] !== null && entry[f] !== "");
  }
  function clearStravaSessionFields(entry) {
    const next = { ...entry };
    SESSION_STRAVA_FIELDS.forEach(f => { delete next[f]; });
    return next;
  }

  /* ---------- store ---------- */
  function createStore(backend) {
    let ok = true;
    try {
      backend.setItem("__fuji_probe", "1");
      ok = backend.getItem("__fuji_probe") === "1";
      backend.removeItem("__fuji_probe");
    } catch (_) { ok = false; }

    function get(k, def) {
      try { const v = backend.getItem(k); return v ? JSON.parse(v) : def; }
      catch (_) { return def; }
    }
    function set(k, v) {
      try { backend.setItem(k, JSON.stringify(v)); return true; }
      catch (_) { return false; }
    }
    function clear(k) { try { backend.removeItem(k); } catch (_) { /* ignore */ } }

    function exportAll() {
      const o = {};
      Object.values(STORAGE).forEach(k => { o[k] = get(k, null); });
      return o;
    }
    function importAll(obj) {
      if (!isPlainRecord(obj)) throw new Error("Backup must be a JSON object");
      Object.values(STORAGE).forEach(k => {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null) set(k, normalizeStorageValue(k, obj[k]));
      });
    }

    function audit() {
      const issues = [];
      Object.values(STORAGE).forEach(key => {
        const value = get(key, storageDefaultForKey(key));
        const valid = key === STORAGE.strength ? Array.isArray(value) : isPlainRecord(value);
        if (!valid) issues.push({ code: "storage_shape", key, message: `${key} has the wrong saved shape`, safeFix: false });
      });
      const sessions = get(STORAGE.sessions, {});
      if (isPlainRecord(sessions)) {
        Object.entries(sessions).forEach(([date, entry]) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.push({ code: "invalid_session_date", key: STORAGE.sessions, date, message: `Session key ${date} is not YYYY-MM-DD`, safeFix: false });
          if (!isPlainRecord(entry)) { issues.push({ code: "invalid_session_entry", key: STORAGE.sessions, date, message: `Session ${date} is not an object`, safeFix: false }); return; }
          if (entry.source !== "strava" && hasSessionStravaMetadata(entry)) issues.push({ code: "manual_strava_metadata", key: STORAGE.sessions, date, message: `Manual session ${date} still has Strava metadata`, safeFix: true });
          if (isPreResetCurrentSessionDate(date)) issues.push({ code: "legacy_session_in_current_store", key: STORAGE.sessions, date, message: `Session ${date} belongs to the 32-week archive`, safeFix: true });
          if (entry.source === "strava" && !entry.stravaId) issues.push({ code: "strava_missing_id", key: STORAGE.sessions, date, message: `Strava session ${date} has no activity id`, safeFix: false });
          ["actualDuration", "actualDistance", "avgHR", "rpe", "cadence"].forEach(field => {
            if (entry[field] !== null && entry[field] !== undefined && entry[field] !== "" && Number(entry[field]) < 0) {
              issues.push({ code: "negative_session_value", key: STORAGE.sessions, date, field, message: `Session ${date} has a negative ${field}`, safeFix: false });
            }
          });
        });
      }
      const strength = get(STORAGE.strength, []);
      if (Array.isArray(strength)) {
        strength.forEach((entry, index) => {
          if (!isPlainRecord(entry)) issues.push({ code: "invalid_strength_entry", key: STORAGE.strength, index, message: `Strength entry ${index + 1} is not an object`, safeFix: false });
        });
      }
      return { summary: { issueCount: issues.length, safeFixableCount: issues.filter(i => i.safeFix).length }, issues };
    }

    function repair() {
      let fixedCount = 0;
      const sessions = get(STORAGE.sessions, {});
      const archiveSessions = get(STORAGE.archiveSessions, {});
      if (isPlainRecord(sessions)) {
        Object.entries(sessions).forEach(([date, entry]) => {
          if (!isPlainRecord(entry)) return;
          let next = entry;
          if (entry.source !== "strava" && hasSessionStravaMetadata(entry)) {
            next = clearStravaSessionFields({ ...entry, source: entry.source || "manual" });
            sessions[date] = next;
            fixedCount++;
          }
          if (isPreResetCurrentSessionDate(date)) {
            archiveSessions[date] = { ...next, ...(isPlainRecord(archiveSessions) ? archiveSessions[date] || {} : {}), archivePlan: "legacy-32-week" };
            delete sessions[date];
            fixedCount++;
          }
        });
        set(STORAGE.sessions, sessions);
        set(STORAGE.archiveSessions, isPlainRecord(archiveSessions) ? archiveSessions : {});
      }
      return { fixedCount, audit: audit() };
    }

    /* sessions */
    function getSession(date) { const all = get(STORAGE.sessions, {}); return (isPlainRecord(all) && all[date]) || null; }
    function saveSession(date, data, options = {}) {
      const all = get(STORAGE.sessions, {});
      const base = isPlainRecord(all) ? all : {};
      base[date] = options.replace ? data : { ...(base[date] || {}), ...data };
      set(STORAGE.sessions, base);
    }
    function deleteSession(date) {
      const all = get(STORAGE.sessions, {});
      if (!isPlainRecord(all)) return;
      delete all[date];
      set(STORAGE.sessions, all);
    }

    /* foot check-in */
    function getFoot(date) { const all = get(STORAGE.foot, {}); return (isPlainRecord(all) && all[date]) || null; }
    function setFoot(date, slot, level) {
      const all = get(STORAGE.foot, {});
      const base = isPlainRecord(all) ? all : {};
      base[date] = { ...(base[date] || {}), [slot]: level, ts: Date.now() };
      set(STORAGE.foot, base);
    }
    function footSwapsToBike(date) {
      const f = getFoot(date);
      return !!f && f.am === FOOT.swapLevel;
    }

    return { ok, get, set, clear, exportAll, importAll, audit, repair, getSession, saveSession, deleteSession, getFoot, setFoot, footSwapsToBike };
  }

  const api = {
    STORAGE, SESSION_STRAVA_FIELDS, FOOT, createStore,
    ARCHIVE_32_PHASES, ARCHIVE_32_WEEKS, archive32LongRuns, archive32DateForWeekDay,
    isLegacyArchiveDateKey, isPreResetCurrentSessionDate,
    isPlainRecord, storageDefaultForKey, normalizeStorageValue, hasSessionStravaMetadata, clearStravaSessionFields
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FujiStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
