const express = require("express");
const meal = require("../controllers/mealController");
const {
  authenticateUser,
  authorizeRoles,
  PUBLIC_PORTAL_ALLOWED_ROLES,
  CATERING_APP_ROLES,
  ADMIN_PORTAL_API_ROLES,
  SCHOOL_ADMIN_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];
const cateringApp = [authenticateUser, authorizeRoles(CATERING_APP_ROLES)];
const markers = [
  authenticateUser,
  authorizeRoles([...new Set([...CATERING_APP_ROLES, ...ADMIN_PORTAL_API_ROLES])]),
];
const adminOnly = [authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES)];

// Student portal
router.get("/card", ...studentsOnly, meal.getMyMealCard);
router.get("/card/pdf", ...studentsOnly, meal.downloadMyMealCardPdf);

// Catering mobile app
router.post("/scan", ...cateringApp, meal.scanMealCard);
router.get("/scan/today", ...cateringApp, meal.scanToday);

// Manual marking (catering app + admin portal)
router.get("/students/search", ...markers, meal.searchStudents);
router.post("/servings/manual", ...markers, meal.markManual);

// Admin portal
router.get("/admin/dashboard", ...adminOnly, meal.adminDashboard);
router.get("/admin/servings", ...adminOnly, meal.adminListServings);
router.delete("/admin/servings/:id", ...adminOnly, meal.adminDeleteServing);
router.get("/admin/periods", ...adminOnly, meal.adminGetPeriods);
router.put("/admin/periods", ...adminOnly, meal.adminUpdatePeriods);
router.get("/admin/overrides", ...adminOnly, meal.adminListOverrides);
router.post("/admin/overrides", ...adminOnly, meal.adminSaveOverride);
router.delete("/admin/overrides/:id", ...adminOnly, meal.adminDeleteOverride);
router.get("/admin/download-policy", ...adminOnly, meal.adminGetDownloadPolicy);
router.put("/admin/download-policy", ...adminOnly, meal.adminUpdateDownloadPolicy);
router.get("/admin/downloads", ...adminOnly, meal.adminListDownloadUsage);
router.post("/admin/downloads/grants", ...adminOnly, meal.adminGrantDownloads);
router.get("/admin/downloads/:studentId", ...adminOnly, meal.adminStudentDownloadHistory);

router.use(errorHandler);

module.exports = router;
