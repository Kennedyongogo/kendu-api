const { Student } = require("../models");
const { getRemainingGraceDays } = require("../utils/gracePeriod");

const HARD_BLOCKED = ["deactivated", "suspended", "expelled", "withdrawn"];

async function checkStudentAccountAccess(req, res, next) {
  try {
    if (!req.user || req.user.role !== "student") {
      return next();
    }

    const student = await Student.findOne({
      where: { user_id: req.userId },
      attributes: ["id", "account_status", "reactivation_required"],
    });

    if (!student) {
      return next();
    }

    if (HARD_BLOCKED.includes(student.account_status)) {
      return res.status(403).json({
        success: false,
        message:
          "Your account cannot access classes or exams right now. Please contact the school administration.",
        code: "ACCOUNT_BLOCKED",
        account_status: student.account_status,
        reactivation_required: student.reactivation_required,
      });
    }

    if (student.account_status === "pending_payment") {
      const days_left = await getRemainingGraceDays(student.id);
      return res.status(403).json({
        success: false,
        message:
          "Your account has a pending fee payment. Please clear overdue installments to continue.",
        code: "PENDING_PAYMENT",
        reactivation_required: student.reactivation_required,
        days_left_in_grace: days_left,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkStudentAccountAccess };
