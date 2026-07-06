const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_REVOKE_URL = "https://www.strava.com/oauth/revoke";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

const COOKIE_REFRESH = "fuji_strava_refresh";
const COOKIE_META = "fuji_strava_meta";
const COOKIE_STATE = "fuji_strava_state";

function getConfig() {
  const missing = getMissingConfigNames();
  if (missing.length) {
    const err = new Error(`Missing Strava environment variable(s): ${missing.join(", ")}`);
    err.statusCode = 500;
    throw err;
  }
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  return { clientId, clientSecret };
}

function getMissingConfigNames() {
  return [
    !process.env.STRAVA_CLIENT_ID ? "STRAVA_CLIENT_ID" : null,
    !process.env.STRAVA_CLIENT_SECRET ? "STRAVA_CLIENT_SECRET" : null
  ].filter(Boolean);
}

function getBaseUrl(req) {
  if (process.env.STRAVA_REDIRECT_ORIGIN) return process.env.STRAVA_REDIRECT_ORIGIN.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function getRedirectUri(req) {
  return `${getBaseUrl(req)}/api/strava/callback`;
}

function isSecure(req) {
  const host = String(req.headers.host || "");
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return false;
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function serializeCookie(req, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (isSecure(req)) parts.push("Secure");
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function setCookies(res, cookies) {
  res.setHeader("Set-Cookie", cookies.filter(Boolean));
}

function clearStravaCookies(req, res) {
  setCookies(res, [
    serializeCookie(req, COOKIE_REFRESH, "", { maxAge: 0 }),
    serializeCookie(req, COOKIE_META, "", { maxAge: 0 }),
    serializeCookie(req, COOKIE_STATE, "", { maxAge: 0 })
  ]);
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (_) {
    return null;
  }
}

function writeJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function handleError(res, err) {
  const status = err.statusCode || 500;
  writeJson(res, status, { ok: false, error: err.message || "Strava request failed" });
}

async function tokenRequest(params) {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || data.error || "Strava token request failed");
    err.statusCode = response.status;
    throw err;
  }
  return data;
}

function athleteMeta(tokenData, scope) {
  const athlete = tokenData.athlete || {};
  return {
    athlete: {
      id: athlete.id || null,
      username: athlete.username || "",
      firstname: athlete.firstname || "",
      lastname: athlete.lastname || "",
      profile: athlete.profile_medium || athlete.profile || ""
    },
    scope: scope || "",
    connectedAt: new Date().toISOString()
  };
}

function tokenCookies(req, tokenData, meta) {
  const cookies = [
    serializeCookie(req, COOKIE_REFRESH, tokenData.refresh_token, {
      maxAge: 60 * 60 * 24 * 180
    })
  ];
  if (meta) {
    cookies.push(serializeCookie(req, COOKIE_META, encodeJson(meta), {
      maxAge: 60 * 60 * 24 * 180
    }));
  }
  return cookies;
}

function setTokenCookies(req, res, tokenData, meta) {
  const cookies = tokenCookies(req, tokenData, meta);
  setCookies(res, cookies);
}

async function refreshAccessToken(req, res) {
  const cookies = parseCookies(req);
  const refreshToken = cookies[COOKIE_REFRESH];
  if (!refreshToken) {
    const err = new Error("Strava is not connected");
    err.statusCode = 401;
    throw err;
  }
  const { clientId, clientSecret } = getConfig();
  const tokenData = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const meta = decodeJson(cookies[COOKIE_META]);
  setTokenCookies(req, res, tokenData, meta);
  return tokenData.access_token;
}

function normalizeActivity(activity) {
  const distanceKm = Number(activity.distance || 0) / 1000;
  const movingTime = activity.moving_time || activity.elapsed_time || 0;
  const paceSec = distanceKm > 0 ? Math.round(movingTime / distanceKm) : null;
  const pace = paceSec ? `${Math.floor(paceSec / 60)}:${String(paceSec % 60).padStart(2, "0")}` : "";
  return {
    id: String(activity.id),
    name: activity.name || "Strava activity",
    sportType: activity.sport_type || activity.type || "",
    startDate: activity.start_date || "",
    startDateLocal: activity.start_date_local || activity.start_date || "",
    localDate: String(activity.start_date_local || activity.start_date || "").slice(0, 10),
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMin: Math.round(movingTime / 60),
    elapsedMin: Math.round((activity.elapsed_time || movingTime) / 60),
    pace,
    elevationGain: Math.round(activity.total_elevation_gain || 0),
    avgHR: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    maxHR: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    avgWatts: activity.average_watts ? Math.round(activity.average_watts) : null,
    weightedWatts: activity.weighted_average_watts ? Math.round(activity.weighted_average_watts) : null,
    avgCadence: activity.average_cadence ? Number(activity.average_cadence.toFixed(1)) : null,
    sufferScore: activity.suffer_score || null,
    trainer: !!activity.trainer,
    commute: !!activity.commute,
    url: activity.id ? `https://www.strava.com/activities/${activity.id}` : ""
  };
}

function getMeta(req) {
  return decodeJson(parseCookies(req)[COOKIE_META]);
}

module.exports = {
  STRAVA_AUTHORIZE_URL,
  STRAVA_ACTIVITIES_URL,
  STRAVA_REVOKE_URL,
  COOKIE_REFRESH,
  COOKIE_META,
  COOKIE_STATE,
  getConfig,
  getMissingConfigNames,
  getBaseUrl,
  getRedirectUri,
  parseCookies,
  serializeCookie,
  setCookies,
  clearStravaCookies,
  encodeJson,
  decodeJson,
  writeJson,
  handleError,
  tokenRequest,
  athleteMeta,
  tokenCookies,
  setTokenCookies,
  refreshAccessToken,
  normalizeActivity,
  getMeta
};
