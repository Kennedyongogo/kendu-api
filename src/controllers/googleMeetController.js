const jwt = require("jsonwebtoken");
const config = require("../config/config");
const googleMeetService = require("../services/googleMeetService");
const { saveCredential, hasLinkedGoogleMeet } = require("../services/googleMeetCredentialService");
const { STAFF_ROLES } = require("../constants/userRoles");

function adminAppUrl(path = "") {
  const base = (process.env.SCHOOL_ADMIN_PUBLIC_URL || "http://localhost:3000").trim().replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Popup OAuth lands here; main app tab stays open. */
function oauthDoneUrl(status, message) {
  const q = new URLSearchParams({ status });
  if (message) q.set("message", String(message));
  return adminAppUrl(`/google-meet/oauth-done?${q.toString()}`);
}

function apiCallbackUrl() {
  const port = process.env.PORT || 4000;
  const base = (process.env.SCHOOL_API_PUBLIC_URL || `http://localhost:${port}`).trim().replace(/\/$/, "");
  return `${base}/api/google-meet/oauth/callback`;
}

/** GET /api/google-meet/oauth/start — returns auth URL (staff only). */
exports.startOAuth = async (req, res) => {
  try {
    if (!STAFF_ROLES.includes(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Only staff can link Google Meet." });
    }
    if (!googleMeetService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Google Meet is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
      });
    }
    const state = jwt.sign(
      { userId: req.user.id, purpose: "google_meet" },
      config.jwtSecret,
      { expiresIn: "15m" }
    );
    const url = googleMeetService.getAuthUrl(state);
    return res.json({
      success: true,
      data: {
        auth_url: url,
        redirect_uri: googleMeetService.redirectUri(),
        api_callback_hint: apiCallbackUrl(),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /api/google-meet/oauth/callback — Google redirects here after consent. */
exports.oauthCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError) {
    return res.redirect(oauthDoneUrl("error", String(oauthError)));
  }
  if (!code || !state) {
    return res.redirect(oauthDoneUrl("error", "missing_code"));
  }
  try {
    const decoded = jwt.verify(String(state), config.jwtSecret);
    if (decoded.purpose !== "google_meet" || !decoded.userId) {
      throw new Error("Invalid OAuth state");
    }
    const tokens = await googleMeetService.getTokensFromCode(code);
    await saveCredential(decoded.userId, tokens);
    return res.redirect(oauthDoneUrl("connected"));
  } catch (err) {
    console.error("[Google Meet OAuth]", err.message);
    return res.redirect(oauthDoneUrl("error", err.message));
  }
};

/**
 * GET /api/google-meet/auth/google?token=JWT
 * Browser redirect to Google (use from Settings / exam room — no fetch needed).
 */
exports.redirectToGoogle = async (req, res) => {
  try {
    const rawToken =
      (typeof req.query.token === "string" && req.query.token.trim()) ||
      (req.header("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!rawToken) {
      return res.status(401).send("Missing token. Log in to the admin app, then try Connect Google Meet again.");
    }
    const decoded = jwt.verify(rawToken, config.jwtSecret);
    if (decoded.type !== "user" || !decoded.id) {
      return res.status(403).send("Invalid token.");
    }
    if (!googleMeetService.isConfigured()) {
      return res.status(503).send("Google Meet is not configured on the server.");
    }
    const state = jwt.sign(
      { userId: decoded.id, purpose: "google_meet" },
      config.jwtSecret,
      { expiresIn: "15m" }
    );
    return res.redirect(googleMeetService.getAuthUrl(state));
  } catch (error) {
    console.error("[Google Meet auth redirect]", error.message);
    return res.redirect(oauthDoneUrl("error", error.message));
  }
};

/** POST /api/google-meet/disconnect */
exports.disconnect = async (req, res) => {
  try {
    const { GoogleMeetCredential } = require("../models");
    await GoogleMeetCredential.destroy({ where: { user_id: req.user?.id } });
    return res.json({ success: true, message: "Google Meet disconnected." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/** GET /api/google-meet/status */
exports.getStatus = async (req, res) => {
  try {
    const linked = await hasLinkedGoogleMeet(req.user?.id);
    return res.json({
      success: true,
      data: {
        configured: googleMeetService.isConfigured(),
        linked,
        redirect_uri: googleMeetService.redirectUri(),
        platform: "google_meet",
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
