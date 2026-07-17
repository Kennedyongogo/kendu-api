const { withMeetClientForUser } = require("./googleMeetCredentialService");
const googleMeetService = require("./googleMeetService");

/**
 * Create a Google Meet room for live exam invigilation (live_monitor).
 */
async function provisionExamGoogleMeet(staffUserId, examRow) {
  if (!googleMeetService.isConfigured()) {
    const err = new Error("Google Meet API is not configured on the server.");
    err.code = "GOOGLE_MEET_NOT_CONFIGURED";
    throw err;
  }
  if (!staffUserId) {
    const err = new Error("A staff user must start the exam to create the Google Meet room.");
    err.code = "GOOGLE_MEET_NO_STAFF";
    throw err;
  }

  const title = examRow?.title ? String(examRow.title).trim().slice(0, 120) : "Exam";

  return withMeetClientForUser(staffUserId, async (meet) => {
    const created = await meet.createMeetingSpace(title, "exam");
    return {
      meeting_provider: "google_meet",
      meeting_id: created.meetingCode || created.spaceId,
      meeting_join_url: created.joinUrl,
      meeting_host_url: created.hostUrl || created.joinUrl,
      space_id: created.spaceId,
      generated: true,
    };
  });
}

module.exports = { provisionExamGoogleMeet };
