const { google } = require("googleapis");

const MEET_SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];

class GoogleMeetService {
  constructor() {
    this.oauth2Client = null;
    this.meet = null;
  }

  isConfigured() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        (process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_MEET_REDIRECT_URI)
    );
  }

  redirectUri() {
    return String(process.env.GOOGLE_MEET_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || "").trim();
  }

  initOAuthClient() {
    if (!this.isConfigured()) {
      throw new Error("Google Meet API is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).");
    }
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      this.redirectUri()
    );
    return this.oauth2Client;
  }

  getAuthUrl(state) {
    if (!this.oauth2Client) this.initOAuthClient();
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: MEET_SCOPES,
      prompt: "consent",
      state: state || undefined,
    });
  }

  async getTokensFromCode(code) {
    if (!this.oauth2Client) this.initOAuthClient();
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  setCredentials(accessToken, refreshToken, expiryDate) {
    if (!this.oauth2Client) this.initOAuthClient();
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiryDate || undefined,
    });
    this.meet = google.meet({ version: "v2", auth: this.oauth2Client });
  }

  async refreshAccessToken(refreshToken) {
    if (!this.oauth2Client) this.initOAuthClient();
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return credentials;
  }

  /**
   * Create a Google Meet space for an exam or class session.
   */
  async createMeetingSpace(meetingName, meetingType = "exam") {
    if (!this.meet) {
      throw new Error("Google Meet client not initialized. Link your Google account first.");
    }

    const response = await this.meet.spaces.create({
      requestBody: {},
    });

    const space = response.data || {};
    const meetingCode = space.meetingCode || "";
    const spaceId = space.name || "";
    const joinUrl = meetingCode ? `https://meet.google.com/${meetingCode}` : "";

    if (!joinUrl) {
      throw new Error("Google Meet did not return a meeting code.");
    }

    return {
      success: true,
      spaceId,
      meetingCode,
      joinUrl,
      hostUrl: joinUrl,
      meetingName: meetingName || "Session",
      meetingType,
      createdAt: new Date().toISOString(),
    };
  }

  async getMeetingDetails(spaceId) {
    if (!this.meet) throw new Error("Google Meet client not initialized.");
    const response = await this.meet.spaces.get({ name: spaceId });
    const space = response.data || {};
    const meetingCode = space.meetingCode || "";
    return {
      success: true,
      spaceId: space.name,
      meetingCode,
      joinUrl: meetingCode ? `https://meet.google.com/${meetingCode}` : "",
      config: space.config,
    };
  }

  async endMeeting(spaceId) {
    if (!this.meet) throw new Error("Google Meet client not initialized.");
    await this.meet.spaces.delete({ name: spaceId });
    return { success: true, message: "Meeting space ended." };
  }
}

module.exports = new GoogleMeetService();
