const express = require("express");
const router = express.Router();
const {
  getReportCardTemplate,
  listGradedExamsForStudent,
  previewReportCard,
  createReportCard,
  listReportCards,
  getReportCard,
  streamReportCardPdf,
  deleteReportCard,
} = require("../controllers/reportCardController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { STAFF_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/template", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getReportCardTemplate);
router.get("/graded-exams", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listGradedExamsForStudent);
router.post("/preview", authenticateUser, authorizeRoles(TEACH_OR_STAFF), previewReportCard);
router.post("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), createReportCard);
router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listReportCards);
router.get("/:id/pdf", authenticateUser, authorizeRoles(TEACH_OR_STAFF), streamReportCardPdf);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getReportCard);
router.delete("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), deleteReportCard);

module.exports = router;
