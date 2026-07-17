const {
  listStudentPlacementHistory,
} = require("../utils/studentPlacementRegisterService");

exports.getStudentPlacementRegister = async (req, res) => {
  try {
    const studentId = String(req.params.id || "").trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: "Student id is required." });
    }

    const limit = req.query.limit;
    const entries = await listStudentPlacementHistory(studentId, { limit });
    return res.json({
      success: true,
      data: {
        student_id: studentId,
        entries,
        total: entries.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load term register." });
  }
};

exports.getMyPlacementRegister = async (req, res) => {
  try {
    const { Student } = require("../models");
    const student = await Student.findOne({
      where: { user_id: req.user.id },
      attributes: ["id"],
    });
    if (!student) {
      return res.status(404).json({ success: false, message: "Student profile not found." });
    }

    const limit = req.query.limit;
    const entries = await listStudentPlacementHistory(student.id, { limit });
    return res.json({
      success: true,
      data: {
        student_id: student.id,
        entries,
        total: entries.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Could not load your school journey." });
  }
};
