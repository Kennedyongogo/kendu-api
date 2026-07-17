const { Op } = require("sequelize");
const { ProctoringEvent, ProctoringSession, ExamAttempt, Student, User } = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };

async function attemptIdsForStudent(req) {
  const profile = await Student.findOne({ where: { user_id: req.user.id } });
  if (!profile) return [];
  const attempts = await ExamAttempt.findAll({
    where: { student_id: profile.id },
    attributes: ["id"],
  });
  return attempts.map((a) => a.id);
}

async function sessionIdsForStudent(req) {
  const attemptIds = await attemptIdsForStudent(req);
  if (attemptIds.length === 0) return [];
  const sessions = await ProctoringSession.findAll({
    where: { exam_attempt_id: { [Op.in]: attemptIds } },
    attributes: ["id"],
  });
  return sessions.map((s) => s.id);
}

const includes = [
  {
    model: ProctoringSession,
    as: "proctoring_session",
    include: [{ model: ExamAttempt, as: "exam_attempt", attributes: ["id", "exam_id", "student_id", "status"] }],
  },
  { model: User, as: "resolver", required: false, ...userSafe },
];

exports.listProctoringEvents = async (req, res) => {
  try {
    const where = {};
    if (req.query.event_type) where.event_type = req.query.event_type;
    if (req.query.is_resolved !== undefined) where.is_resolved = req.query.is_resolved === "true";

    if (req.user.role === "student") {
      const sids = await sessionIdsForStudent(req);
      if (sids.length === 0) {
        return res.json({ success: true, data: [] });
      }
      if (req.query.proctoring_session_id) {
        if (!sids.includes(req.query.proctoring_session_id)) {
          return res.json({ success: true, data: [] });
        }
        where.proctoring_session_id = req.query.proctoring_session_id;
      } else {
        where.proctoring_session_id = { [Op.in]: sids };
      }
    } else if (req.query.proctoring_session_id) {
      where.proctoring_session_id = req.query.proctoring_session_id;
    }

    const rows = await ProctoringEvent.findAll({
      where,
      include: includes,
      order: [["event_timestamp", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProctoringEvent = async (req, res) => {
  try {
    const row = await ProctoringEvent.findByPk(req.params.id, { include: includes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring event not found" });
    }
    if (req.user.role === "student") {
      const sids = await sessionIdsForStudent(req);
      if (!sids.includes(row.proctoring_session_id)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProctoringEvent = async (req, res) => {
  try {
    if (req.user.role === "student") {
      const session = await ProctoringSession.findByPk(req.body.proctoring_session_id);
      if (!session) {
        return res.status(404).json({ success: false, message: "Proctoring session not found" });
      }
      const ids = await attemptIdsForStudent(req);
      if (!ids.includes(session.exam_attempt_id)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      delete req.body.resolved_by;
      delete req.body.is_resolved;
      delete req.body.admin_notes;
    }
    const row = await ProctoringEvent.create(req.body);
    const created = await ProctoringEvent.findByPk(row.id, { include: includes });
    try {
      const { getIO } = require("../realtime/socketServer");
      const session = await ProctoringSession.findByPk(row.proctoring_session_id);
      if (session?.exam_attempt_id) {
        getIO()
          .to(`proctor:${session.exam_attempt_id}`)
          .emit("proctoring:event", {
            id: created.id,
            event_type: created.event_type,
            severity: created.severity,
            exam_attempt_id: session.exam_attempt_id,
            proctoring_session_id: session.id,
          });
      }
    } catch (_) {
      /* realtime optional until server attaches Socket.IO */
    }
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateProctoringEvent = async (req, res) => {
  try {
    const row = await ProctoringEvent.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring event not found" });
    }
    if (req.user.role === "student") {
      return res.status(403).json({ success: false, message: "Students cannot update proctoring events" });
    }
    const allowed = [
      "event_type",
      "event_timestamp",
      "severity",
      "details",
      "screenshot_url",
      "is_resolved",
      "resolved_by",
      "admin_notes",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await row.update(patch);
    const updated = await ProctoringEvent.findByPk(row.id, { include: includes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteProctoringEvent = async (req, res) => {
  try {
    const row = await ProctoringEvent.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring event not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Proctoring event deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
