const { sequelize, User, Programme, AdmissionApplication } = require("../models");

const ADMISSION_STATUSES = ["pending", "under_review", "accepted", "rejected"];

exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      adminCount,
      staffCount,
      studentCount,
      programmeCount,
      admissionTotal,
      statusRows,
      programmeRows,
      studentsByProgrammeRows,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { role: "admin" } }),
      User.count({ where: { role: "staff" } }),
      User.count({ where: { role: "student" } }),
      Programme.count(),
      AdmissionApplication.count(),
      AdmissionApplication.findAll({
        attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
        group: ["status"],
        raw: true,
      }),
      AdmissionApplication.findAll({
        attributes: [
          "programme_id",
          [sequelize.fn("COUNT", sequelize.col("AdmissionApplication.id")), "count"],
        ],
        include: [
          {
            model: Programme,
            as: "programme",
            attributes: ["id", "name"],
            required: true,
          },
        ],
        group: ["AdmissionApplication.programme_id", "programme.id", "programme.name"],
        order: [[sequelize.literal("count"), "DESC"]],
      }),
      User.findAll({
        attributes: [
          "programme_id",
          [sequelize.fn("COUNT", sequelize.col("User.id")), "count"],
        ],
        where: { role: "student" },
        include: [
          {
            model: Programme,
            as: "programme",
            attributes: ["id", "name"],
            required: true,
          },
        ],
        group: ["User.programme_id", "programme.id", "programme.name"],
        order: [[sequelize.literal("count"), "DESC"]],
      }),
    ]);

    const byStatus = Object.fromEntries(ADMISSION_STATUSES.map((s) => [s, 0]));
    for (const row of statusRows) {
      const key = row.status;
      if (Object.prototype.hasOwnProperty.call(byStatus, key)) {
        byStatus[key] = Number(row.count) || 0;
      }
    }

    const byProgramme = programmeRows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        programme_id: plain.programme_id || plain.programme?.id || null,
        name: plain.programme?.name || "Unknown programme",
        count: Number(plain.count) || 0,
      };
    });

    const studentsByProgramme = studentsByProgrammeRows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        programme_id: plain.programme_id || plain.programme?.id || null,
        name: plain.programme?.name || "Unknown programme",
        count: Number(plain.count) || 0,
      };
    });

    return res.json({
      success: true,
      data: {
        total_users: totalUsers,
        roles: {
          admin: adminCount,
          staff: staffCount,
          student: studentCount,
        },
        programmes: programmeCount,
        admissions: {
          total: admissionTotal,
          by_status: byStatus,
          by_programme: byProgramme,
        },
        students: {
          total: studentCount,
          by_programme: studentsByProgramme,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
