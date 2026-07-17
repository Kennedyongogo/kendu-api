const {
  getStudentTermStatusForUser,
  startStudentTermForUser,
} = require("../utils/studentTermRegistrationService");

exports.getMyTermStatus = async (req, res) => {
  try {
    const data = await getStudentTermStatusForUser(req.user.id);
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not load term status." });
  }
};

exports.startMyTerm = async (req, res) => {
  try {
    const result = await startStudentTermForUser(req.user.id);
    return res.json({
      success: true,
      message: result.created ? "Term started successfully." : "You are already enrolled in this term.",
      data: result.status,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, message: error.message || "Could not start term." });
  }
};
