const { Op } = require("sequelize");
const { sequelize, User } = require("../models");

/**
 * GET /api/attendance/semesters
 * Year + semester combinations that currently have active students, with counts.
 */
exports.listSemesters = async (req, res) => {
  try {
    const rows = await User.findAll({
      attributes: [
        "year_of_study",
        "semester",
        [sequelize.fn("COUNT", sequelize.col("id")), "student_count"],
      ],
      where: {
        role: "student",
        is_active: true,
        year_of_study: { [Op.ne]: null },
        semester: { [Op.ne]: null },
      },
      group: ["year_of_study", "semester"],
      order: [
        ["year_of_study", "ASC"],
        ["semester", "ASC"],
      ],
      raw: true,
    });

    const semesters = rows
      .map((row) => ({
        year_of_study: Number(row.year_of_study),
        semester: Number(row.semester),
        student_count: Number(row.student_count) || 0,
      }))
      .filter((row) => row.student_count > 0);

    return res.json({
      success: true,
      data: {
        total_students: semesters.reduce((sum, row) => sum + row.student_count, 0),
        semesters,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
