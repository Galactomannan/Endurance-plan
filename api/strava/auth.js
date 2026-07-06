const crypto = require("crypto");
const {
  STRAVA_AUTHORIZE_URL,
  COOKIE_STATE,
  getConfig,
  getRedirectUri,
  serializeCookie,
  setCookies,
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
    const { clientId } = getConfig();
    const state = crypto.randomBytes(18).toString("base64url");
    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: "read,activity:read_all",
      state
    });
    setCookies(res, [
      serializeCookie(req, COOKIE_STATE, state, { maxAge: 60 * 10 })
    ]);
    res.statusCode = 302;
    res.setHeader("Location", `${STRAVA_AUTHORIZE_URL}?${params.toString()}`);
    res.end();
  } catch (err) {
    handleError(res, err);
  }
};
