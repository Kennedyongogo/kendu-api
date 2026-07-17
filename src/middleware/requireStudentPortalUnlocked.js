const { assertStudentPortalUnlocked } = require("../utils/studentTermRegistrationService");

/** Block student portal content until the student has started their current term. */
module.exports = async function requireStudentPortalUnlocked(req, res, next) {
  if (req.user?.role !== "student") {
    return next();
  }
  try {
    await assertStudentPortalUnlocked(req.user.id);
    return next();
  } catch (error) {
    return res.status(error.status || 403).json({
      success: false,
      message: error.message || "Start your term from your profile to access this area.",
      code: error.code || "TERM_NOT_STARTED",
      data: error.data || null,
    });
  }
};
