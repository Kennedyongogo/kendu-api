const { ExamQuestion, Exam } = require("../models");

const includes = [{ model: Exam, as: "exam" }];

exports.listExamQuestions = async (req, res) => {
  try {
    const where = {};
    if (req.query.exam_id) where.exam_id = req.query.exam_id;

    const rows = await ExamQuestion.findAll({
      where,
      include: includes,
      order: [["exam_id", "ASC"], ["order_number", "ASC"]],
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExamQuestion = async (req, res) => {
  try {
    const row = await ExamQuestion.findByPk(req.params.id, { include: includes });
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam question not found" });
    }
    return res.json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createExamQuestion = async (req, res) => {
  try {
    const row = await ExamQuestion.create(req.body);
    const created = await ExamQuestion.findByPk(row.id, { include: includes });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateExamQuestion = async (req, res) => {
  try {
    const row = await ExamQuestion.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam question not found" });
    }
    const allowed = [
      "exam_id",
      "question_text",
      "question_type",
      "options",
      "correct_answer",
      "marks",
      "order_number",
      "explanation",
      "required",
    ];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    await row.update(patch);
    const updated = await ExamQuestion.findByPk(row.id, { include: includes });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteExamQuestion = async (req, res) => {
  try {
    const row = await ExamQuestion.findByPk(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Exam question not found" });
    }
    await row.destroy();
    return res.json({ success: true, message: "Exam question deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
