const { Op } = require("sequelize");
const {
  ProctoringSession,
  ExamAttempt,
  Exam,
  Student,
  User,
} = require("../models");

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

const sessionIncludes = [
  {
    model: ExamAttempt,
    as: "exam_attempt",
    include: [
      { model: Exam, as: "exam", attributes: ["id", "title", "requires_webcam"] },
      {
        model: Student,
        as: "student",
        include: [{ model: User, as: "user", ...userSafe }],
      },
    ],
  },
];

exports.listProctoringSessions = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;

    if (req.user.role === "student") {
      const ids = await attemptIdsForStudent(req);
      if (ids.length === 0) {
        return res.json({ success: true, data: [] });
      }
      if (req.query.exam_attempt_id) {
        if (!ids.includes(req.query.exam_attempt_id)) {
          return res.json({ success: true, data: [] });
        }
        where.exam_attempt_id = req.query.exam_attempt_id;
      } else {
        where.exam_attempt_id = { [Op.in]: ids };
      }
    } else if (req.query.exam_attempt_id) {
      where.exam_attempt_id = req.query.exam_attempt_id;
    }

    const rows = await ProctoringSession.findAll({
      where,
      include: sessionIncludes,
      order: [["session_start", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProctoringSession = async (req, res) => {
  try {
    const row = await ProctoringSession.findByPk(req.params.id, { include: sessionIncludes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring session not found" });
    }
    if (req.user.role === "student") {
      const ids = await attemptIdsForStudent(req);
      if (!ids.includes(row.exam_attempt_id)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createProctoringSession = async (req, res) => {
  try {
    if (req.user.role === "student") {
      const ids = await attemptIdsForStudent(req);
      if (!req.body.exam_attempt_id || !ids.includes(req.body.exam_attempt_id)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }
    const row = await ProctoringSession.create(req.body);
    const created = await ProctoringSession.findByPk(row.id, { include: sessionIncludes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateProctoringSession = async (req, res) => {
  try {
    const row = await ProctoringSession.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring session not found" });
    }
    if (req.user.role === "student") {
      const ids = await attemptIdsForStudent(req);
      if (!ids.includes(row.exam_attempt_id)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      delete req.body.final_verdict;
    }
    const allowed = [
      "exam_attempt_id",
      "session_start",
      "session_end",
      "status",
      "webcam_stream_started",
      "recording_started",
      "recording_ended",
      "total_violations",
      "severity_level",
      "final_verdict",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await row.update(patch);
    const updated = await ProctoringSession.findByPk(row.id, { include: sessionIncludes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteProctoringSession = async (req, res) => {
  try {
    const row = await ProctoringSession.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Proctoring session not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Proctoring session deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
