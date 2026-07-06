const {
  STRAVA_ACTIVITIES_URL,
  refreshAccessToken,
  normalizeActivity,
  writeJson,
  handleError
} = require("../../lib/strava");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }
    const url = new URL(req.url, `https://${req.headers.host}`);
    const rawDays = Number.parseInt(url.searchParams.get("days") || "45", 10);
    const days = Math.max(1, Math.min(Number.isFinite(rawDays) ? rawDays : 45, 180));
    const after = Math.floor((Date.now() - days * 86400000) / 1000);
    const accessToken = await refreshAccessToken(req, res);
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const params = new URLSearchParams({ after: String(after), per_page: "100", page: String(page) });
      const response = await fetch(`${STRAVA_ACTIVITIES_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json().catch(() => []);
      if (!response.ok) {
        const err = new Error(data.message || "Could not fetch Strava activities");
        err.statusCode = response.status;
        throw err;
      }
      all.push(...data);
      if (!Array.isArray(data) || data.length < 100) break;
    }
    writeJson(res, 200, {
      ok: true,
      days,
      activities: all.map(normalizeActivity)
    });
  } catch (err) {
    handleError(res, err);
  }
};
