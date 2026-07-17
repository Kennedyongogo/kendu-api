const { getLiveKitUrl, isConfigured, probeLiveKitServerApi } = require("../services/livekitService");

/**
 * Client-reported LiveKit signal/WebRTC errors (browser cannot connect to LIVEKIT_URL).
 * The API does not see WebSocket failures unless the frontend posts them here.
 */
exports.reportLiveKitConnectionError = async (req, res) => {
  try {
    const body = req.body || {};
    const message = String(body.message || "").trim() || "Unknown LiveKit connection error";
    const name = body.name ? String(body.name) : null;
    const context = body.context ? String(body.context) : null;
    const contextId = body.context_id ? String(body.context_id) : null;
    const phase = body.phase ? String(body.phase) : null;
    const roomState = body.room_state != null ? String(body.room_state) : null;
    const connectAttempt = body.connect_attempt != null ? Number(body.connect_attempt) : null;
    const clientServerUrl = body.server_url ? String(body.server_url) : null;
    const pageUrl = body.page_url ? String(body.page_url) : null;
    const userAgent = body.user_agent ? String(body.user_agent) : null;

    const user = req.user || {};
    const payload = {
      message,
      errorName: name,
      context,
      contextId,
      phase,
      roomState,
      connectAttempt,
      clientServerUrl,
      configuredLiveKitUrl: isConfigured() ? getLiveKitUrl() : null,
      livekitConfigured: isConfigured(),
      userId: user.id || null,
      userRole: user.role || null,
      pageUrl,
      userAgent,
      at: new Date().toISOString(),
    };

    const serverProbe = await probeLiveKitServerApi();
    payload.serverApiProbe = serverProbe;

    return res.json({ success: true, data: { serverApiProbe: serverProbe } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not log error." });
  }
};
