const express = require("express");
const {
  getStudentContext,
  listForStudent,
  listRegisteredUnits,
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
  ADMIN_PORTAL_API_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canManage = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];
const canStudent = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

router.get("/me", ...canStudent, listMine);
router.get("/me/:id/pdf", ...canStudent, getMinePdf);
router.get("/me/:id", ...canStudent, getMine);

router.get("/students/:studentId/context", ...canManage, getStudentContext);
router.get("/students/:studentId/registered-units", ...canManage, listRegisteredUnits);
router.get("/students/:studentId", ...canManage, listForStudent);
router.post("/preview", ...canManage, previewPdf);
router.get("/:id/pdf", ...canManage, getPdf);
router.get("/:id", ...canManage, getOne);
router.post("/", ...canManage, create);
router.put("/:id", ...canManage, update);
router.delete("/:id", ...canManage, remove);

router.use(errorHandler);

module.exports = router;
