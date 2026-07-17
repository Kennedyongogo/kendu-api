const { User, Programme } = require("../models");

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, adminCount, staffCount, studentCount, programmeCount] =
      await Promise.all([
        User.count(),
        User.count({ where: { role: "admin" } }),
        User.count({ where: { role: "staff" } }),
        User.count({ where: { role: "student" } }),
        Programme.count(),
      ]);

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
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
