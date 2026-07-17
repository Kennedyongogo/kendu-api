const {
  ExamAttempt,
  Exam,
  Student,
  User,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  Teacher,
} = require("../models");

const userSafe = { attributes: { exclude: ["password_hash"] } };

async function studentProfileFromReq(req) {
  return Student.findOne({ where: { user_id: req.user.id } });
}

const attemptIncludes = [
  {
    model: Exam,
    as: "exam",
    attributes: [
      "id",
      "title",
      "duration_minutes",
      "total_marks",
      "passing_marks",
      "status",
      "session_status",
      "requires_webcam",
      "start_time",
      "end_time",
      "teacher_id",
      "curriculum_id",
      "curriculum_class_id",
    ],
    include: [
      { model: Curriculum, as: "curriculum", required: false, attributes: ["id", "name", "type"] },
      {
        model: CurriculumClass,
        as: "curriculum_class",
        required: false,
        attributes: ["id", "name", "code", "curriculum_id"],
      },
      {
        model: CurriculumClassLevel,
        as: "curriculum_class_level",
        required: false,
        attributes: ["id", "name", "level_order"],
      },
      {
        model: Teacher,
        as: "teacher",
        required: false,
        include: [{ model: User, as: "user", ...userSafe }],
      },
    ],
  },
  {
    model: Student,
    as: "student",
    include: [{ model: User, as: "user", ...userSafe }],
  },
];

exports.listExamAttempts = async (req, res) => {
  try {
    const where = {};
    const examId = req.query.exam_id || req.query.exam_schedule_id;
    if (examId) where.exam_id = examId;
    if (req.query.status) where.status = req.query.status;

    if (req.user.role === "student") {
      const profile = await studentProfileFromReq(req);
      if (!profile) {
        return res.json({ success: true, data: [] });
      }
      where.student_id = profile.id;
    } else if (req.query.student_id) {
      where.student_id = req.query.student_id;
    }

    const rows = await ExamAttempt.findAll({
      where,
      include: attemptIncludes,
      order: [["created_at", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamAttempt = async (req, res) => {
  try {
    const row = await ExamAttempt.findByPk(req.params.id, { include: attemptIncludes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam attempt not found" });
    }
    if (req.user.role === "student") {
      const profile = await studentProfileFromReq(req);
      if (!profile || row.student_id !== profile.id) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExamAttempt = async (req, res) => {
  try {
    if (req.user.role === "student") {
      const profile = await studentProfileFromReq(req);
      if (!profile || req.body.student_id !== profile.id) {
        return res.status(403).json({ success: false, message: "Students may only create attempts for themselves" });
      }
    }
    const body = { ...req.body };
    delete body.exam_schedule_id;
    const row = await ExamAttempt.create(body);
    const created = await ExamAttempt.findByPk(row.id, { include: attemptIncludes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateExamAttempt = async (req, res) => {
  try {
    const row = await ExamAttempt.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam attempt not found" });
    }
    if (req.user.role === "student") {
      const profile = await studentProfileFromReq(req);
      if (!profile || row.student_id !== profile.id) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      if (req.body.student_id && req.body.student_id !== profile.id) {
        return res.status(403).json({ success: false, message: "Cannot change student_id" });
      }
    }
    const allowed = [
      "exam_id",
      "student_id",
      "start_time",
      "end_time",
      "time_spent_seconds",
      "status",
      "total_score",
      "percentage",
      "is_passed",
      "ip_address",
      "device_info",
      "webcam_enabled",
      "tab_switch_count",
      "warning_count",
      "last_activity_at",
      "client_presence_active",
      "is_cancelled",
      "cancellation_reason",
      "submitted_at",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await row.update(patch);
    const updated = await ExamAttempt.findByPk(row.id, { include: attemptIncludes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteExamAttempt = async (req, res) => {
  try {
    const row = await ExamAttempt.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam attempt not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Exam attempt deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
