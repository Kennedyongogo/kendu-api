const { Op } = require("sequelize");
const { Exam, ExamSubmission, ExamAttempt, ExamAnswer, StudentExamResult, CurriculumSubject, SubjectGradingScale, Student } = require("../models");
const { isPdfFormExam } = require("../utils/examPdfForm");

/** Map grading scale band to DB columns (grade is VARCHAR(20) — store letter only, not a long sentence). */
function gradeFieldsFromBand(band) {
  if (!band) {
    return { grade: null, grade_letter: null, grade_remarks: null, points: null };
  }
  const letter = band.grade != null ? String(band.grade).trim() : "";
  const remarkParts = [];
  if (band.remarks) remarkParts.push(String(band.remarks).trim());
  if (band.points != null && band.points !== "") remarkParts.push(`${band.points} points`);
  return {
    grade: letter ? letter.slice(0, 20) : null,
    grade_letter: letter ? letter.slice(0, 5) : null,
    grade_remarks: remarkParts.length ? remarkParts.join(" · ") : null,
    points: band.points != null ? band.points : null,
  };
}

async function resolveSubjectBand({ curriculum_id, curriculum_class_id, curriculum_subject_id, marks }) {
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

function missingGradingBandMessage({ subjectName, marks }) {
  const label = subjectName ? `"${subjectName}"` : "this subject";
  return `No active grading scale covers ${marks} marks for ${label}. Add a subject grading band that includes this score (Curriculum → Grading system), then grade again.`;
}

exports.bulkUpsertExamResults = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const results = Array.isArray(req.body?.results) ? req.body.results : [];
    if (!results.length) return res.status(400).json({ success: false, message: "results array is required." });

    const rows = [];
    for (const item of results) {
      const student_id = item.student_id;
      const curriculum_subject_id = item.curriculum_subject_id;
      const marks = Number(item.marks);
      if (!student_id || !curriculum_subject_id || !Number.isFinite(marks)) continue;

      const student = await Student.findByPk(student_id, { attributes: ["id"] });
      if (!student) continue;
      const cs = await CurriculumSubject.findByPk(curriculum_subject_id, {
        attributes: ["id", "name", "subject_id", "curriculum_id", "curriculum_class_id"],
      });
      if (!cs) continue;

      const curriculum_id = exam.curriculum_id || cs.curriculum_id;
      const curriculum_class_id = exam.curriculum_class_id || cs.curriculum_class_id;
      if (!curriculum_id || !curriculum_class_id) continue;

      const band = await resolveSubjectBand({
        curriculum_id,
        curriculum_class_id,
        curriculum_subject_id,
        marks,
      });
      if (!band) {
        return res.status(400).json({
          success: false,
          message: missingGradingBandMessage({ subjectName: cs.name, marks }),
        });
      }

      const payload = {
        student_id,
        exam_id: exam.id,
        curriculum_subject_id,
        marks_obtained: marks,
        marks,
        ...gradeFieldsFromBand(band),
        graded_at: new Date(),
        graded_by: req.user?.id || null,
      };
      const existing = await StudentExamResult.findOne({
        where: { student_id, exam_id: exam.id, curriculum_subject_id },
      });
      let row;
      if (existing) {
        await existing.update(payload);
        row = existing;
      } else {
        row = await StudentExamResult.create(payload);
      }
      rows.push(row);
    }

    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.gradeExamSubmission = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const submission = await ExamSubmission.findByPk(req.params.submissionId);
    if (!submission || submission.exam_id !== exam.id) {
      return res.status(404).json({ success: false, message: "Submission not found for this exam" });
    }
    const attempt = await ExamAttempt.findOne({
      where: { exam_id: exam.id, student_id: submission.student_id },
      order: [["updated_at", "DESC"]],
    });

    let totalScore =
      attempt?.total_score != null && attempt.total_score !== ""
        ? Number(attempt.total_score)
        : null;
    if (totalScore != null && !Number.isFinite(totalScore)) totalScore = null;
    if (totalScore == null && isPdfFormExam(exam) && submission.pdf_auto_score != null) {
      totalScore = Number(submission.pdf_auto_score);
    }
    if (isPdfFormExam(exam) && (totalScore == null || !Number.isFinite(Number(totalScore)))) {
      return res.status(400).json({
        success: false,
        message: "Save the total score before grading this PDF exam.",
      });
    }
    if (totalScore == null) {
      const answers = await ExamAnswer.findAll({
        where: { submission_id: submission.id },
        attributes: ["marks_obtained"],
      });
      totalScore = answers.reduce((sum, a) => sum + Number(a.marks_obtained || 0), 0);
    }
    const curriculum_subject_id = exam.curriculum_subject_id;
    if (!curriculum_subject_id) {
      return res.status(400).json({ success: false, message: "Exam must be linked to a curriculum subject." });
    }
    const cs = await CurriculumSubject.findByPk(curriculum_subject_id, {
      attributes: ["id", "name", "subject_id", "curriculum_id", "curriculum_class_id"],
    });
    if (!cs) return res.status(400).json({ success: false, message: "Curriculum subject not found." });

    const curriculum_id = exam.curriculum_id || cs.curriculum_id;
    const curriculum_class_id = exam.curriculum_class_id || cs.curriculum_class_id;
    if (!curriculum_id || !curriculum_class_id) {
      return res.status(400).json({ success: false, message: "Curriculum and class are required." });
    }

    const marks = Number(totalScore);
    const band = await resolveSubjectBand({
      curriculum_id,
      curriculum_class_id,
      curriculum_subject_id,
      marks,
    });
    if (!band) {
      return res.status(400).json({
        success: false,
        message: missingGradingBandMessage({ subjectName: cs.name, marks }),
      });
    }

    const payload = {
      student_id: submission.student_id,
      exam_id: exam.id,
      curriculum_subject_id,
      marks_obtained: marks,
      marks,
      ...gradeFieldsFromBand(band),
      graded_at: new Date(),
      graded_by: req.user?.id || null,
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

exports.updateExamResultMarks = async (req, res) => {
  try {
    const exam = await Exam.findByPk(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
    const row = await StudentExamResult.findByPk(req.params.resultId);
    if (!row || String(row.exam_id || "") !== String(exam.id)) {
      return res.status(404).json({ success: false, message: "Exam result not found for this exam." });
    }
    const marks = Number(req.body?.marks);
    if (!Number.isFinite(marks)) return res.status(400).json({ success: false, message: "marks must be a valid number." });
    const cs = await CurriculumSubject.findByPk(row.curriculum_subject_id || req.body?.curriculum_subject_id, {
      attributes: ["id", "name", "curriculum_id", "curriculum_class_id"],
    });
    if (!cs) return res.status(400).json({ success: false, message: "curriculum_subject_id is required." });

    const curriculum_id = exam.curriculum_id || cs.curriculum_id;
    const curriculum_class_id = exam.curriculum_class_id || cs.curriculum_class_id;
    const band = await resolveSubjectBand({
      curriculum_id,
      curriculum_class_id,
      curriculum_subject_id: cs.id,
      marks,
    });
    if (!band) {
      return res.status(400).json({
        success: false,
        message: missingGradingBandMessage({ subjectName: cs.name, marks }),
      });
    }
    await row.update({
      curriculum_subject_id: cs.id,
      marks_obtained: marks,
      marks,
      ...gradeFieldsFromBand(band),
      graded_at: new Date(),
      graded_by: req.user?.id || null,
    });
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
