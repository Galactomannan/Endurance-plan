/* ============================================================================
   Strava → session log mapping. Pure functions over normalized activities
   (see lib/strava.js normalizeActivity). Classic script (FujiStravaSync),
   CommonJS in tests.
   ============================================================================ */
(function (root) {
  "use strict";

  const RUN_SPORTS = ["Run", "TrailRun", "VirtualRun"];
  const RIDE_SPORTS = ["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"];
  const TRAINING_SPORTS = RUN_SPORTS.concat(RIDE_SPORTS, ["Workout"]);

  function sport(a) { return String((a && a.sportType) || ""); }
  function isRun(a) { return RUN_SPORTS.includes(sport(a)); }
  function isRide(a) { return RIDE_SPORTS.includes(sport(a)); }
  function isStravaTrainingActivity(a) { return TRAINING_SPORTS.includes(sport(a)); }

  function stamp(a) { return String(a.startDateLocal || a.startDate || a.localDate || ""); }

  function stravaActivitiesForPicker(activities) {
    return (activities || []).filter(isStravaTrainingActivity).slice().sort((a, b) => stamp(b).localeCompare(stamp(a)));
  }

  /* Activities on one date, ordered for a planned session: matching sport first, then longest. */
  function activitiesForDay(activities, date, planned) {
    const wantRide = !!planned && planned.type === "bike";
    const score = a => (wantRide ? isRide(a) : !isRide(a)) ? 1 : 0;
    return (activities || [])
      .filter(a => isStravaTrainingActivity(a) && a.localDate === date)
      .sort((a, b) => (score(b) - score(a)) || ((b.durationMin || 0) - (a.durationMin || 0)));
  }

  function typeFromStravaActivity(activity, planned) {
    if (isRide(activity)) return "bike";
    if (planned && planned.type && planned.type !== "rest") return planned.type;
    const s = sport(activity);
    if (s === "TrailRun") return "long_run";
    if (s === "Workout") return "speed";
    return "easy_z1";
  }

  function stravaActivityNotes(activity) {
    const parts = [`Strava: ${activity.name}`];
    if (activity.avgWatts) parts.push(`power ${activity.avgWatts}W`);
    if (activity.avgCadence) parts.push(`cadence ${activity.avgCadence}`);
    if (activity.elevationGain) parts.push(`gain +${activity.elevationGain}m`);
    if (activity.maxHR) parts.push(`max HR ${activity.maxHR}`);
    if (activity.url) parts.push(activity.url);
    return parts.join(" · ");
  }

  function sessionPatchFromStravaActivity(activity, planned, existing) {
    planned = planned || {};
    existing = existing || {};
    return {
      ...existing,
      source: "strava",
      stravaId: String(activity.id),
      stravaName: activity.name,
      stravaSport: activity.sportType,
      stravaUrl: activity.url,
      stravaStartDate: activity.startDateLocal || activity.startDate || "",
      type: typeFromStravaActivity(activity, planned),
      title: planned.title || activity.name,
      actualDuration: activity.durationMin || planned.duration || "",
      elapsedDuration: activity.elapsedMin || "",
      actualDistance: activity.distanceKm ? Number(activity.distanceKm).toFixed(1) : "",
      pace: activity.pace || "",
      avgHR: activity.avgHR || "",
      maxHR: activity.maxHR || "",
      avgWatts: activity.avgWatts || "",
      weightedWatts: activity.weightedWatts || "",
      elevationGain: activity.elevationGain || "",
      cadence: activity.avgCadence || existing.cadence || "",
      hrTarget: planned.hrTarget || existing.hrTarget || "",
      notes: stravaActivityNotes(activity)
    };
  }

  function fmtShortISO(iso) {
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const [y, m, d] = String(iso).split("-").map(Number);
    return y && m && d ? `${d} ${M[m - 1]}` : String(iso);
  }

  /* Pure: returns a new log and a summary. plan = FujiPlanEngine.buildPlan(...) */
  function applyStravaActivitiesToSessions(activities, log, plan) {
    const next = { ...(log || {}) };
    const summary = { imported: 0, updated: 0, duplicates: 0, manualSkipped: 0, outsidePlan: 0, ignored: 0, total: (activities || []).length, examples: [] };
    const planned = new Map();
    (plan.weeks || []).forEach(w => w.days.forEach(s => planned.set(s.date, s)));
    const dates = [...new Set((activities || []).filter(isStravaTrainingActivity).map(a => a.localDate).filter(Boolean))].sort();
    let chosen = 0;
    dates.forEach(date => {
      const p = planned.get(date);
      if (!p) { summary.outsidePlan++; return; }
      const activity = activitiesForDay(activities, date, p)[0];
      if (!activity) return;
      chosen++;
      const existing = next[date] || {};
      if (String(existing.stravaId || "") === String(activity.id)) { summary.duplicates++; return; }
      if (existing.status && existing.source !== "strava") { summary.manualSkipped++; return; }
      const isUpdate = existing.source === "strava";
      next[date] = sessionPatchFromStravaActivity(activity, p, { ...existing, status: "done" });
      if (isUpdate) summary.updated++; else summary.imported++;
      if (summary.examples.length < 4) summary.examples.push(`${fmtShortISO(date)} · ${Number(activity.distanceKm || 0).toFixed(1)} km · ${activity.durationMin || 0} min`);
    });
    const inPlanTraining = (activities || []).filter(a => isStravaTrainingActivity(a) && planned.has(a.localDate)).length;
    summary.ignored = Math.max(0, inPlanTraining - chosen);
    return { log: next, summary };
  }

  /* Compact copy of every training activity so records and the load guard see real weeks. */
  function compactStravaActivities(activities, previous) {
    const byId = new Map((previous || []).map(a => [String(a.id), a]));
    (activities || []).filter(isStravaTrainingActivity).forEach(a => {
      const prev = byId.get(String(a.id)) || {};
      byId.set(String(a.id), {
        id: String(a.id), name: a.name, sportType: a.sportType, localDate: a.localDate,
        distanceKm: Number(a.distanceKm) || 0, durationMin: Number(a.durationMin) || 0, elapsedMin: Number(a.elapsedMin) || 0,
        avgHR: a.avgHR || null, avgCadence: a.avgCadence || null, pace: a.pace || "", url: a.url || prev.url || "",
        intel: prev.intel || a.intel || null
      });
    });
    return [...byId.values()].sort((a, b) => String(a.localDate).localeCompare(String(b.localDate))).slice(-400);
  }

  const api = { RUN_SPORTS, RIDE_SPORTS, isRun, isRide, isStravaTrainingActivity, stravaActivitiesForPicker, activitiesForDay, typeFromStravaActivity, stravaActivityNotes, sessionPatchFromStravaActivity, applyStravaActivitiesToSessions, compactStravaActivities };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FujiStravaSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
