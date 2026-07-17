const { Op } = require("sequelize");
const { AdminMeeting, User } = require("../models");
const { isAdminPortalUser } = require("../services/adminMeetingLiveAccess");
const { provisionLiveFields } = require("../services/adminMeetingLiveProvision");
const { notifyStaffAboutMeeting } = require("../services/adminMeetingNotifyService");

const userSafe = { attributes: { exclude: ["password_hash"] } };

function formatMeeting(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    ...j,
    creator: j.creator
      ? {
          id: j.creator.id,
          full_name: j.creator.full_name,
          username: j.creator.username,
          role: j.creator.role,
        }
      : null,
    is_creator: undefined,
  };
}

/** Meetings overlapping a calendar day (for timetable day view). */
exports.listAdminMeetingsByDate = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const date = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: "date query (YYYY-MM-DD) is required" });
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const rows = await AdminMeeting.findAll({
      where: {
        is_active: true,
        start_time: { [Op.lt]: dayEnd },
        end_time: { [Op.gt]: dayStart },
        status: { [Op.notIn]: ["cancelled"] },
      },
      include: [{ model: User, as: "creator", ...userSafe }],
      order: [["start_time", "ASC"]],
    });

    const data = rows.map((r) => {
      const m = formatMeeting(r);
      m.is_creator = String(m.created_by) === String(req.user.id);
      return m;
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.listAdminMeetings = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 42));
    const to = new Date(from);
    to.setDate(to.getDate() + days);

    const rows = await AdminMeeting.findAll({
      where: {
        is_active: true,
        start_time: { [Op.lt]: to },
        end_time: { [Op.gt]: from },
        status: { [Op.notIn]: ["cancelled"] },
      },
      include: [{ model: User, as: "creator", ...userSafe }],
      order: [["start_time", "ASC"]],
      limit: Math.min(100, parseInt(req.query.limit, 10) || 60),
    });

    const data = rows.map((r) => {
      const m = formatMeeting(r);
      m.is_creator = String(m.created_by) === String(req.user.id);
      return m;
    });

    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminMeeting = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const row = await AdminMeeting.findByPk(req.params.id, {
      include: [{ model: User, as: "creator", ...userSafe }],
    });
    if (!row) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    const m = formatMeeting(row);
    m.is_creator = String(m.created_by) === String(req.user.id);
    return res.json({ success: true, data: m });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createAdminMeeting = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const title = req.body?.title != null ? String(req.body.title).trim() : "";
    const startTime = req.body?.start_time;
    const endTime = req.body?.end_time;

    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, message: "start_time and end_time are required" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ success: false, message: "Invalid start or end time" });
    }

    const row = await AdminMeeting.create({
      title,
      description: req.body?.description ? String(req.body.description).trim() : null,
      start_time: start,
      end_time: end,
      timezone: req.body?.timezone ? String(req.body.timezone) : "Africa/Nairobi",
      status: "scheduled",
      session_status: "scheduled",
      is_active: true,
      created_by: req.user.id,
      updated_by: req.user.id,
    });

    await row.update(provisionLiveFields(row.id, req.body?.platform));

    const full = await AdminMeeting.findByPk(row.id, {
      include: [{ model: User, as: "creator", ...userSafe }],
    });

    let notifyStats = null;
    if (req.body?.notify_staff === true) {
      const creatorName =
        (req.user?.full_name && String(req.user.full_name).trim()) ||
        (req.user?.username && String(req.user.username).trim()) ||
        "Meeting host";
      const note = req.body?.notify_note != null ? String(req.body.notify_note).trim() : "";
      notifyStats = await notifyStaffAboutMeeting(full, {
        note,
        excludeUserIds: [req.user.id],
        creatorName,
      });
    }

    const m = formatMeeting(full);
    m.is_creator = true;
    return res.status(201).json({
      success: true,
      data: m,
      notify: notifyStats,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateAdminMeeting = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const row = await AdminMeeting.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    if (String(row.created_by) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Only the meeting creator can edit this meeting." });
    }

    const patch = { updated_by: req.user.id };
    if (req.body?.title != null) patch.title = String(req.body.title).trim();
    if (req.body?.description != null) patch.description = String(req.body.description).trim() || null;
    if (req.body?.start_time != null) patch.start_time = new Date(req.body.start_time);
    if (req.body?.end_time != null) patch.end_time = new Date(req.body.end_time);
    if (req.body?.timezone != null) patch.timezone = String(req.body.timezone);

    const nextStart = patch.start_time ?? row.start_time;
    const nextEnd = patch.end_time ?? row.end_time;
    if (nextStart && nextEnd && new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time.",
      });
    }

    await row.update(patch);
    const full = await AdminMeeting.findByPk(row.id, {
      include: [{ model: User, as: "creator", ...userSafe }],
    });

    const m = formatMeeting(full);
    m.is_creator = true;
    return res.json({ success: true, data: m });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteAdminMeeting = async (req, res) => {
  try {
    if (!isAdminPortalUser(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const row = await AdminMeeting.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Meeting not found" });
    }

    if (String(row.created_by) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "Only the meeting creator can delete this meeting." });
    }

    await row.update({ is_active: false, status: "cancelled", session_status: "cancelled" });
    return res.json({ success: true, message: "Meeting cancelled." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
