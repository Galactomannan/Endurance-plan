const {
  COOKIE_REFRESH,
  parseCookies,
  getMeta,
  writeJson,
  handleError
} = require("../../lib/strava");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }
    const cookies = parseCookies(req);
    const connected = !!cookies[COOKIE_REFRESH];
    writeJson(res, 200, {
      ok: true,
      connected,
      meta: connected ? getMeta(req) : null
    });
  } catch (err) {
    handleError(res, err);
  }
};
