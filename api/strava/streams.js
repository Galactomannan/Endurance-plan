const { refreshAccessToken, writeJson, handleError } = require("../../lib/strava");
const { STREAM_KEYS, normalizeStreams, downsampleStreams } = require("../../lib/streams");

const STRAVA_ACTIVITY_URL = "https://www.strava.com/api/v3/activities";

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }
    const url = new URL(req.url, `https://${req.headers.host}`);
    const id = String(url.searchParams.get("id") || "");
    if (!/^\d{1,20}$/.test(id)) return writeJson(res, 400, { ok: false, error: "Missing or invalid activity id" });
    const rawPoints = Number.parseInt(url.searchParams.get("points") || "400", 10);
    const points = Math.max(40, Math.min(Number.isFinite(rawPoints) ? rawPoints : 400, 2000));

    const accessToken = await refreshAccessToken(req, res);
    const params = new URLSearchParams({ keys: STREAM_KEYS.join(","), key_by_type: "true" });
    const response = await fetch(`${STRAVA_ACTIVITY_URL}/${id}/streams?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const err = new Error((data && data.message) || "Could not fetch Strava streams");
      err.statusCode = response.status;
      throw err;
    }
    const streams = downsampleStreams(normalizeStreams(data), points);
    writeJson(res, 200, { ok: true, id, points: (streams.time || []).length, streams });
  } catch (err) {
    handleError(res, err);
  }
};
