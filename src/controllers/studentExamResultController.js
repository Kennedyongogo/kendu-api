const { StudentExamResult, Exam, ExamSubmission, ExamAttempt, CurriculumSubject } = require("../models");
const { Op } = require("sequelize");

async function resolveSubjectBand({ curriculum_id, curriculum_class_id, curriculum_subject_id, marks }) {
  const SubjectGradingScale = require("../models").SubjectGradingScale;
  return SubjectGradingScale.findOne({
    where: {
      curriculum_id,
      curriculum_class_id,
      curriculum_subject_id,
      is_active: true,
      min_mark: { [Op.lte]: marks },
      max_mark: { [Op.gte]: marks },
    },
    order: [["sort_order", "ASC"], ["max_mark", "DESC"]],
  });
}

exports.listStudentExamResults = async (req, res) => {
  try {
    const where = {};
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.subject_id) where.subject_id = req.query.subject_id;
    const rows = await StudentExamResult.findAll({
      where,
      order: [["created_at", "DESC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentExamResult = async (req, res) => {
  try {
    const row = await StudentExamResult.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Record not found" });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createStudentExamResult = async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload.exam_attempt_id;
    const row = await StudentExamResult.create(payload);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateStudentExamResult = async (req, res) => {
  try {
    const row = await StudentExamResult.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Record not found" });
    const allowed = [
      "marks_obtained",
      "total_marks",
      "grade_letter",
      "points",
      "grade",
      "grade_remarks",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await row.update(patch);
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteStudentExamResult = async (req, res) => {
  try {
    const row = await StudentExamResult.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Record not found" });
    await row.destroy();
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.syncFromExamAttempt = async (req, res) => {
  try {
    const attemptId = req.params.attemptId;
    const attempt = await ExamAttempt.findByPk(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: "Exam attempt not found" });
    if (attempt.status !== "completed") return res.status(400).json({ success: false, message: "Exam attempt must be completed" });

    const submission = await ExamSubmission.findByPk(attempt.submission_id);
    if (!submission) return res.status(404).json({ success: false, message: "Submission not found" });

    const exam = await Exam.findByPk(attempt.exam_id);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });

    let totalScore = attempt.total_score;
    if (totalScore == null) {
      const answers = await require("../models").ExamAnswer.findAll({
        where: { submission_id: submission.id },
        attributes: ['marks_obtained'],
      });
      totalScore = answers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    }

    const curriculum_subject_id = exam.curriculum_subject_id;
    if (!curriculum_subject_id) {
      return res.status(400).json({ success: false, message: "Exam must be linked to a curriculum subject." });
    }

    const cs = await CurriculumSubject.findByPk(curriculum_subject_id, {
      attributes: ["id", "subject_id", "curriculum_id", "curriculum_class_id"],
    });
    if (!cs) return res.status(400).json({ success: false, message: "Curriculum subject not found." });

    const curriculum_id = exam.curriculum_id || cs.curriculum_id;
    const curriculum_class_id = exam.curriculum_class_id || cs.curriculum_class_id;
    if (!curriculum_id || !curriculum_class_id) {
      return res.status(400).json({ success: false, message: "Curriculum and class are required." });
    }

    const band = await resolveSubjectBand({
      curriculum_id,
      curriculum_class_id,
      curriculum_subject_id,
      marks: Number(totalScore),
    });

    const payload = {
      student_id: submission.student_id,
      exam_id: exam.id,
      curriculum_subject_id,
      subject_id: cs.subject_id,
      marks_obtained: Number(totalScore),
      marks: Number(totalScore),
      grade: band?.grade || null,
      grade_letter: band?.grade || null,
      grade_remarks: band?.remarks || null,
      graded_at: new Date(),
      graded_by: req.user?.id || null,
      points: band?.points || null,
    };

    const existing = await StudentExamResult.findOne({
      where: { student_id: submission.student_id, exam_id: exam.id, curriculum_subject_id },
    });

    let result;
    if (existing) {
      await existing.update(payload);
      result = existing;
    } else {
      result = await StudentExamResult.create(payload);
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
