const { User } = require("../models");
const {
  loadMeetingForLive,
  isMeetingCreator,
  assertCanAccessAdminMeeting,
} = require("../services/adminMeetingLiveAccess");
const { notifyStaffAboutMeeting } = require("../services/adminMeetingNotifyService");
const { canNotifyAdminMeetingStaff } = require("../utils/adminMeetingJoinWindow");

exports.notifyAdminMeetingStaff = async (req, res) => {
  try {
    const meeting = await loadMeetingForLive(req.params.id);
    if (!meeting) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    await assertCanAccessAdminMeeting(req, meeting);
    if (!isMeetingCreator(req, meeting)) {
      return res.status(403).json({
        success: false,
        message: "Only the meeting creator can notify staff.",
      });
    }

    if (!canNotifyAdminMeetingStaff(meeting)) {
      return res.status(403).json({
        success: false,
        message:
          "Staff cannot be notified after the scheduled meeting time has passed or before the meeting opens.",
      });
    }

    const note = req.body?.note != null ? String(req.body.note).trim().slice(0, 2000) : "";

    const creator = await User.findByPk(meeting.created_by, {
      attributes: ["id", "full_name", "username"],
    });
    const creatorName =
      (creator?.full_name && String(creator.full_name).trim()) ||
      (creator?.username && String(creator.username).trim()) ||
      "Meeting host";

    const result = await notifyStaffAboutMeeting(meeting, {
      note,
      excludeUserIds: [req.user.id],
      creatorName,
    });

    return res.json({
      success: true,
      data: result,
      message: `Sent ${result.in_app_notifications_created} notification(s) to staff.`,
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
