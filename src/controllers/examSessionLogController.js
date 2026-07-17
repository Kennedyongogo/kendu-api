const { Op } = require("sequelize");
const { ExamSessionLog, ExamAttempt, Student } = require("../models");
const { STAFF_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF_ROLES = [...STAFF_ROLES, "teacher"];

async function studentProfileFromReq(req) {
  return Student.findOne({ where: { user_id: req.user.id } });
}

exports.listExamSessionLogs = async (req, res) => {
  try {
    const where = {};

    if (TEACH_OR_STAFF_ROLES.includes(req.user.role) && !req.query.exam_attempt_id) {
      return res.status(400).json({
        success: false,
        message: "exam_attempt_id query parameter is required",
      });
    }

    if (req.user.role === "student") {
      const profile = await studentProfileFromReq(req);
      if (!profile) return res.json({ success: true, data: [] });
      const attempts = await ExamAttempt.findAll({
        where: { student_id: profile.id },
        attributes: ["id"],
      });
      const ids = attempts.map((a) => a.id);
      if (ids.length === 0) return res.json({ success: true, data: [] });
      if (req.query.exam_attempt_id) {
        if (!ids.includes(req.query.exam_attempt_id)) {
          return res.status(403).json({ success: false, message: "Forbidden" });
        }
        where.exam_attempt_id = req.query.exam_attempt_id;
      } else {
        where.exam_attempt_id = { [Op.in]: ids };
      }
    } else if (req.query.exam_attempt_id) {
      where.exam_attempt_id = req.query.exam_attempt_id;
    }

    const rows = await ExamSessionLog.findAll({
      where,
      order: [["event_timestamp", "ASC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExamSessionLog = async (req, res) => {
  try {
    const attemptId = req.body.exam_attempt_id;
    if (!attemptId) {
      return res.status(400).json({ success: false, message: "exam_attempt_id is required" });
    }

    const attempt = await ExamAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: "Exam attempt not found" });

    if (req.user.role === "student") {
      const profile = await studentProfileFromReq(req);
      if (!profile || attempt.student_id !== profile.id) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    const allowed = [
      "exam_attempt_id",
      "event_type",
      "event_timestamp",
      "event_data",
      "cumulative_time_seconds",
      "remaining_time_seconds",
      "question_id",
    ];
    const payload = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) payload[k] = req.body[k];
    }

    const row = await ExamSessionLog.create(payload);
    const patch = { last_activity_at: new Date() };
    if (payload.event_type === "session_submit") {
      patch.client_presence_active = false;
    } else if (payload.event_type === "session_presence" || payload.event_type === "session_start") {
      patch.client_presence_active = true;
    }
    if (payload.event_type === "violation_detected" && payload.event_data?.type === "tab_switch") {
      patch.tab_switch_count = Number(attempt.tab_switch_count || 0) + 1;
      patch.warning_count = Number(attempt.warning_count || 0) + 1;
    }
    if (payload.event_type === "warning_issued") {
      patch.warning_count = Number(attempt.warning_count || 0) + 1;
    }
    await attempt.update(patch);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteExamSessionLog = async (req, res) => {
  try {
    const row = await ExamSessionLog.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
