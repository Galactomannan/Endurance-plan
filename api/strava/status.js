const {
  COOKIE_REFRESH,
  parseCookies,
  getMeta,
  getMissingConfigNames,
  writeJson,
  handleError
} = require("../../lib/strava");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return writeJson(res, 405, { ok: false, error: "Method Not Allowed" });
    }
    const missingEnv = getMissingConfigNames();
    const cookies = parseCookies(req);
    const connected = !missingEnv.length && !!cookies[COOKIE_REFRESH];
    writeJson(res, 200, {
      ok: true,
      setupRequired: !!missingEnv.length,
      missingEnv,
      connected,
      meta: connected ? getMeta(req) : null
    });
  } catch (err) {
    handleError(res, err);
  }
};
