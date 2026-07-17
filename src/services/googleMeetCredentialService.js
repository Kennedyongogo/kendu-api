const { GoogleMeetCredential } = require("../models");
const googleMeetService = require("./googleMeetService");

async function getCredentialRow(userId) {
  if (!userId) return null;
  return GoogleMeetCredential.findOne({ where: { user_id: userId } });
}

async function saveCredential(userId, tokens) {
  if (!userId || !tokens?.refresh_token) {
    throw new Error("Google OAuth did not return a refresh token. Revoke app access and try again with consent.");
  }
  const expiry =
    tokens.expiry_date != null
      ? new Date(tokens.expiry_date)
      : tokens.expiry
        ? new Date(Date.now() + Number(tokens.expiry) * 1000)
        : null;

  const payload = {
    access_token: tokens.access_token || null,
    refresh_token: tokens.refresh_token,
    token_expiry: expiry,
    scope: tokens.scope || null,
  };

  const existing = await getCredentialRow(userId);
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return GoogleMeetCredential.create({ user_id: userId, ...payload });
}

async function hasLinkedGoogleMeet(userId) {
  const row = await getCredentialRow(userId);
  return Boolean(row?.refresh_token);
}

/**
 * Load credentials, refresh if needed, and attach to googleMeetService.
 */
async function withMeetClientForUser(userId, fn) {
  const row = await getCredentialRow(userId);
  if (!row?.refresh_token) {
    const err = new Error("Google Meet is not linked for this account. Connect Google in Settings first.");
    err.code = "GOOGLE_MEET_NOT_LINKED";
    throw err;
  }

  let accessToken = row.access_token;
  let expiry = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  const needsRefresh = !accessToken || (expiry && expiry < Date.now() + 60_000);

  if (needsRefresh) {
    const credentials = await googleMeetService.refreshAccessToken(row.refresh_token);
    accessToken = credentials.access_token;
    await row.update({
      access_token: credentials.access_token,
      token_expiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    });
    expiry = credentials.expiry_date || Date.now() + 3600_000;
  }

  googleMeetService.setCredentials(accessToken, row.refresh_token, expiry);
  return fn(googleMeetService);
}

module.exports = {
  getCredentialRow,
  saveCredential,
  hasLinkedGoogleMeet,
  withMeetClientForUser,
};
