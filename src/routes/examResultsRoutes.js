const express = require("express");
const router = express.Router();
const { bulkUpsertExamResults, updateExamResultMarks, gradeExamSubmission } = require("../controllers/examResultsController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { STAFF_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.post("/exams/:examId/results/bulk-upsert", authenticateUser, authorizeRoles(TEACH_OR_STAFF), bulkUpsertExamResults);
router.put("/exams/:examId/results/:resultId/marks", authenticateUser, authorizeRoles(TEACH_OR_STAFF), updateExamResultMarks);
router.post("/exams/:examId/submissions/:submissionId/grade", authenticateUser, authorizeRoles(TEACH_OR_STAFF), gradeExamSubmission);

router.use(errorHandler);

module.exports = router;
