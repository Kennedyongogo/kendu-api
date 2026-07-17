const { LiveClassLobbyEntry, User } = require("../models");
const { loadLiveClassForAccess, assertCanAccessLiveClass } = require("../services/liveClassAccess");
const { ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");
const { createParticipantToken, isConfigured } = require("../services/livekitService");
const { getLessonJoinWindow } = require("../utils/lessonJoinWindow");

exports.issueLiveKitToken = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "LiveKit is not configured on the server.",
      });
    }

    const { id } = req.params;
    const live = await loadLiveClassForAccess(id);
    if (!live) {
      return res.status(404).json({ success: false, message: "Live class not found" });
    }

    await assertCanAccessLiveClass(req, live);

    const platform = String(live.platform || "").toLowerCase();
    if (platform !== "livekit") {
      return res.status(400).json({
        success: false,
        message: "This session does not use LiveKit video.",
      });
    }

    const roomName = String(live.meeting_id || "").trim();
    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "This session has no video room configured.",
      });
    }

    const isStaff = ADMIN_PORTAL_API_ROLES.includes(req.user.role);
    const joinWindow = getLessonJoinWindow({
      lesson_date: live.timetable_lesson?.lesson_date,
      starts_at: live.timetable_lesson?.starts_at,
      ends_at: live.timetable_lesson?.ends_at,
      timezone: live.timetable_lesson?.timezone,
      session_status: live.session_status,
      is_staff: isStaff,
      live_end_time: live.end_time,
    });

    if (!joinWindow.can_join) {
      return res.status(403).json({
        success: false,
        message: joinWindow.reason || "This class is not open for joining.",
      });
    }

    let role = isStaff ? "teacher" : "student";

    if (req.user.role === "student") {
      const entry = await LiveClassLobbyEntry.findOne({
        where: { live_class_id: id, user_id: req.user.id },
        order: [["requested_at", "DESC"]],
        attributes: ["status"],
      });
      if (!entry || entry.status !== "admitted") {
        return res.status(403).json({
          success: false,
          message: "You must be admitted from the waiting room before joining video.",
        });
      }
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "full_name", "username"],
    });
    const displayName =
      (user?.full_name && String(user.full_name).trim()) ||
      (user?.username && String(user.username).trim()) ||
      "Participant";

    const { token, url } = await createParticipantToken({
      roomName,
      identity: String(req.user.id),
      name: displayName,
      role,
    });

    return res.json({
      success: true,
      data: {
        token,
        url,
        room_name: roomName,
        live_class_id: live.id,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};
