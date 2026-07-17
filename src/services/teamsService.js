/**
 * Microsoft Teams online meetings via Graph API (application permissions).
 *
 * Required .env:
 *   TEAMS_TENANT_ID
 *   TEAMS_CLIENT_ID
 *   TEAMS_CLIENT_SECRET
 *   TEAMS_USER_ID          — organizer user object ID
 *
 * Azure app permission: OnlineMeetings.ReadWrite.All (admin consent).
 */

const axios = require("axios");
const crypto = require("crypto");

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function isConfigured() {
  return Boolean(
    process.env.TEAMS_TENANT_ID &&
      process.env.TEAMS_CLIENT_ID &&
      process.env.TEAMS_CLIENT_SECRET &&
      process.env.TEAMS_USER_ID
  );
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function shortenMeetingId(rawId) {
  const id = String(rawId || "").trim();
  if (!id) return `teams-${crypto.randomBytes(8).toString("hex")}`;
  return id.length <= 120 ? id : crypto.createHash("sha256").update(id).digest("hex").slice(0, 120);
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) {
    return cachedToken;
  }

  const tenantId = String(process.env.TEAMS_TENANT_ID).trim();
  const clientId = String(process.env.TEAMS_CLIENT_ID).trim();
  const clientSecret = String(process.env.TEAMS_CLIENT_SECRET).trim();

  const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await axios.post(authUrl, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30_000,
  });

  const accessToken = res.data?.access_token;
  if (!accessToken) {
    throw new Error("Microsoft Graph did not return an access token.");
  }

  const expiresIn = Number(res.data?.expires_in) || 3600;
  cachedToken = accessToken;
  cachedTokenExpiresAt = now + expiresIn * 1000;
  return accessToken;
}

/**
 * @param {Object} params
 * @param {string} params.subject
 * @param {Date|string} params.startDateTime
 * @param {Date|string} params.endDateTime
 */
async function createMeetingForLesson({ subject, startDateTime, endDateTime }) {
  if (!isConfigured()) {
    throw new Error(
      "Microsoft Teams is not configured. Set TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, and TEAMS_USER_ID."
    );
  }

  const userId = String(process.env.TEAMS_USER_ID).trim();
  const accessToken = await getAccessToken();
  const start = toIsoDate(startDateTime);
  const end = toIsoDate(endDateTime);
  const endMs = new Date(end).getTime();
  const startMs = new Date(start).getTime();
  const safeEnd = Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs
    ? end
    : new Date(startMs + 3600000).toISOString();

  const meetingUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/onlineMeetings`;
  const payload = {
    startDateTime: start,
    endDateTime: safeEnd,
    subject: String(subject || "Online class").slice(0, 250),
    participants: {
      organizer: {
        identity: {
          user: { id: userId },
        },
      },
    },
  };

  let res;
  try {
    res = await axios.post(meetingUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    });
  } catch (err) {
    const status = err.response?.status;
    const detail =
      err.response?.data?.error?.message ||
      err.response?.data?.error_description ||
      err.message;
    let msg = `Teams meeting creation failed${status ? ` (${status})` : ""}: ${detail}`;
    if (status === 403 && /application access policy/i.test(String(detail))) {
      msg +=
        " — In Microsoft Teams admin, grant this app an application access policy (Grant-CsApplicationAccessPolicy) for the TEAMS_USER_ID organizer account.";
    }
    const e = new Error(msg);
    e.statusCode = status === 401 || status === 403 ? 503 : 502;
    e.teamsAccessPolicyBlocked = status === 403 && /application access policy/i.test(String(detail));
    throw e;
  }

  const meeting = res.data || {};
  const joinUrl = String(meeting.joinWebUrl || "").trim();
  if (!joinUrl) {
    throw new Error("Microsoft Teams did not return a join link.");
  }

  return {
    meeting_id: shortenMeetingId(meeting.id),
    join_url: joinUrl,
    host_url: joinUrl,
    platform: "teams",
    teams_meeting_id: meeting.id || null,
    startDateTime: meeting.startDateTime || start,
    endDateTime: meeting.endDateTime || safeEnd,
  };
}

module.exports = {
  isConfigured,
  createMeetingForLesson,
  getAccessToken,
};
