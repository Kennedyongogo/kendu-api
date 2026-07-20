const express = require("express");
const { getMyMealCard, downloadMyMealCardPdf } = require("../controllers/mealController");
const {
  authenticateUser,
  authorizeRoles,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

router.get("/card", ...studentsOnly, getMyMealCard);
router.get("/card/pdf", ...studentsOnly, downloadMyMealCardPdf);

router.use(errorHandler);

module.exports = router;
