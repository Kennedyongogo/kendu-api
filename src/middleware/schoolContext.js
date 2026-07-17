const { SchoolProfile } = require("../models");

/**
 * Attaches the singleton school profile to req.school (excluding SMTP password).
 * Safe when no row exists yet — req.school will be null.
 */
const injectSchoolContext = async (req, res, next) => {
  try {
    if (!req.school) {
      req.school = await SchoolProfile.findOne({
        attributes: {
          exclude: ["email_password", "primary_color", "secondary_color", "accent_color"],
        },
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { injectSchoolContext };
