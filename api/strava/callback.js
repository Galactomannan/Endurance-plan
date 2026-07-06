const {
  COOKIE_STATE,
  getConfig,
  getBaseUrl,
  getRedirectUri,
  parseCookies,
  serializeCookie,
  setCookies,
  tokenRequest,
  athleteMeta,
  tokenCookies,
  clearStravaCookies,
  handleError
} = require("../../lib/strava");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const denied = url.searchParams.get("error");
    const base = getBaseUrl(req);

    if (denied) {
      clearStravaCookies(req, res);
      res.statusCode = 302;
      res.setHeader("Location", `${base}/?strava=denied`);
      res.end();
      return;
    }
    const cookies = parseCookies(req);
    if (!code || !state || state !== cookies[COOKIE_STATE]) {
      const err = new Error("Invalid Strava OAuth state");
      err.statusCode = 400;
      throw err;
    }

    const { clientId, clientSecret } = getConfig();
    const tokenData = await tokenRequest({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(req)
    });
    const meta = athleteMeta(tokenData, url.searchParams.get("scope"));
    setCookies(res, [
      ...tokenCookies(req, tokenData, meta),
      serializeCookie(req, COOKIE_STATE, "", { maxAge: 0 })
    ]);
    res.statusCode = 302;
    res.setHeader("Location", `${base}/?strava=connected`);
    res.end();
  } catch (err) {
    handleError(res, err);
  }
};
