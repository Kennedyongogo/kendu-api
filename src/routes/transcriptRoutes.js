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
} = require("../controllers/transcriptController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canManage = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

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
