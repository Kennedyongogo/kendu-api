const express = require("express");
const {
  getStudentContext,
  listForStudent,
  listRegisteredUnits,
  classSummary,
  getOne,
  create,
  update,
  remove,
  getPdf,
  previewPdf,
  listMine,
  getMine,
  getMinePdf,
} = require("../controllers/transcriptController");
const {
  authenticateUser,
  authorizeRoles,
  READ_EXAM_ROLES,
  WRITE_EXAM_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canRead = [authenticateUser, authorizeRoles(READ_EXAM_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_EXAM_ROLES)];
const canStudent = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

router.get("/me", ...canStudent, listMine);
router.get("/me/:id/pdf", ...canStudent, getMinePdf);
router.get("/me/:id", ...canStudent, getMine);

router.get("/class-summary", ...canRead, classSummary);
router.get("/students/:studentId/context", ...canRead, getStudentContext);
router.get("/students/:studentId/registered-units", ...canRead, listRegisteredUnits);
router.get("/students/:studentId", ...canRead, listForStudent);
router.post("/preview", ...canWrite, previewPdf);
router.get("/:id/pdf", ...canRead, getPdf);
router.get("/:id", ...canRead, getOne);
router.post("/", ...canWrite, create);
router.put("/:id", ...canWrite, update);
router.delete("/:id", ...canWrite, remove);

router.use(errorHandler);

module.exports = router;
