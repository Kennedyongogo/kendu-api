const express = require("express");
const router = express.Router();
const {
  listExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  duplicateExam,
  generateDiagramImage,
  generateQuestionsFromDocument,
  extractQuestionsWithAi,
  createExamSubmission,
  getMyExamSubmission,
  saveSubmissionAnswers,
  uploadSubmissionAnswerFile,
  submitExamSubmission,
  listExamSubmissionsForMarking,
  markExamSubmission,
  markExamAnswer,
  markPdfManualAnswer,
  cleanupExamStaleDraftSubmissions,
} = require("../controllers/examController");
const {
  uploadExamPdfTemplate,
  updateExamPdfAnswerKey,
  getExamPdfTemplate,
  saveSubmissionPdfAnswers,
  uploadSubmissionPdfWorkingPaper,
  deleteSubmissionPdfWorkingPaper,
  uploadSubmissionPdfWorkingPaperMarkedReturn,
  deleteSubmissionPdfWorkingPaperMarkedReturn,
  updateSubmissionPdfWorkingPaperMarking,
} = require("../controllers/examPdfFormController");
const {
  listOnlineExamsUpcoming,
  initiateOnlineExam,
  notifyOnlineExamClass,
  getOnlineExamTracking,
  createOnlineExamRecording,
  getExamProctorMonitor,
  getExamAttendance,
} = require("../controllers/examLiveController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const {
  uploadDocument,
  uploadExamAnswerFile,
  uploadExamPdfWorkingPaper,
  uploadExamPdfMarkedReturn,
  uploadExamPdfTemplate: uploadExamPdfTemplateMw,
  handleUploadError,
} = require("../middleware/upload");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES, SCHOOL_ADMIN_ROLES } = require("../constants/userRoles");
const requireStudentPortalUnlocked = require("../middleware/requireStudentPortalUnlocked");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];
const studentExam = [authenticateUser, authorizeRoles(["student"]), requireStudentPortalUnlocked];

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listExams);
router.get("/online-upcoming", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listOnlineExamsUpcoming);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createExam);
router.post("/ai/diagram", authenticateUser, authorizeRoles(TEACH_OR_STAFF), generateDiagramImage);
router.post(
  "/ocr/extract-questions-from-document",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  uploadDocument,
  handleUploadError,
  generateQuestionsFromDocument
);
router.post(
  "/ai/generate-questions-from-document",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  uploadDocument,
  handleUploadError,
  generateQuestionsFromDocument
);
router.post("/ai/extract-questions", authenticateUser, authorizeRoles(TEACH_OR_STAFF), extractQuestionsWithAi);
router.post(
  "/:id/pdf-template",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  uploadExamPdfTemplateMw,
  handleUploadError,
  uploadExamPdfTemplate
);
router.put("/:id/pdf-answer-key", authenticateUser, authorizeRoles(TEACH_OR_STAFF), updateExamPdfAnswerKey);
router.get("/:id/pdf-template", authenticateUser, getExamPdfTemplate);
router.put("/submissions/:submissionId/pdf-answers", ...studentExam, saveSubmissionPdfAnswers);
router.post(
  "/submissions/:submissionId/pdf-working-papers",
  ...studentExam,
  uploadExamPdfWorkingPaper,
  handleUploadError,
  uploadSubmissionPdfWorkingPaper
);
router.delete(
  "/submissions/:submissionId/pdf-working-papers/:fileId",
  ...studentExam,
  deleteSubmissionPdfWorkingPaper
);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getExam);
router.put("/:id", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), updateExam);
router.delete("/:id", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), deleteExam);
router.post("/:id/duplicate", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), duplicateExam);
router.post("/:id/initiate-online", authenticateUser, authorizeRoles(TEACH_OR_STAFF), initiateOnlineExam);
router.post("/:id/live-session/initiate", authenticateUser, authorizeRoles(TEACH_OR_STAFF), initiateOnlineExam);
router.post("/:id/notify-class", authenticateUser, authorizeRoles(TEACH_OR_STAFF), notifyOnlineExamClass);
router.get("/:id/live-tracking", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getOnlineExamTracking);
router.post("/:id/live-recording", authenticateUser, authorizeRoles(TEACH_OR_STAFF), createOnlineExamRecording);
router.get("/:id/proctor-monitor", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getExamProctorMonitor);
router.get("/:id/attendance", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getExamAttendance);
router.post("/:id/submissions", ...studentExam, createExamSubmission);
router.get("/:id/submissions/me", ...studentExam, getMyExamSubmission);
router.get("/:id/submissions", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listExamSubmissionsForMarking);
router.put("/:id/submissions/:submissionId/mark", authenticateUser, authorizeRoles(TEACH_OR_STAFF), markExamSubmission);
router.put("/:id/submissions/:submissionId/answers/:answerId/mark", authenticateUser, authorizeRoles(TEACH_OR_STAFF), markExamAnswer);
router.put(
  "/:id/submissions/:submissionId/pdf-answers/:entryId/mark",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  markPdfManualAnswer
);
router.post(
  "/:id/submissions/:submissionId/pdf-working-papers/:fileId/marked-return",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  uploadExamPdfMarkedReturn,
  handleUploadError,
  uploadSubmissionPdfWorkingPaperMarkedReturn
);
router.delete(
  "/:id/submissions/:submissionId/pdf-working-papers/:fileId/marked-return",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  deleteSubmissionPdfWorkingPaperMarkedReturn
);
router.put(
  "/:id/submissions/:submissionId/pdf-working-papers/:fileId/marking",
  authenticateUser,
  authorizeRoles(TEACH_OR_STAFF),
  updateSubmissionPdfWorkingPaperMarking
);
router.post("/:id/submissions/cleanup-stale-drafts", authenticateUser, authorizeRoles(SCHOOL_ADMIN_ROLES), cleanupExamStaleDraftSubmissions);
router.put("/submissions/:submissionId/answers", ...studentExam, saveSubmissionAnswers);
router.post(
  "/submissions/:submissionId/answers/:questionId/upload",
  ...studentExam,
  uploadExamAnswerFile,
  handleUploadError,
  uploadSubmissionAnswerFile
);
router.put("/submissions/:submissionId/submit", ...studentExam, submitExamSubmission);

router.use(errorHandler);

module.exports = router;
