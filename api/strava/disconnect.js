const {
  STRAVA_REVOKE_URL,
  COOKIE_REFRESH,
  getConfig,
  parseCookies,
  clearStravaCookies,
  writeJson,
  handleError
} = require("../../lib/strava");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }
    try {
      const refreshToken = parseCookies(req)[COOKIE_REFRESH];
      const { clientId, clientSecret } = getConfig();
      await fetch(STRAVA_REVOKE_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ token: refreshToken })
      });
    } catch (_) {
      // Clearing local cookies is still the important logout behavior.
    }
    clearStravaCookies(req, res);
    writeJson(res, 200, { ok: true, connected: false });
  } catch (err) {
    handleError(res, err);
  }
};
