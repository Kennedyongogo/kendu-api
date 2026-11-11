const express = require("express");
const {
  listDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require("../controllers/departmentController");
const {
  authenticateUser,
  authorizeRoles,
  DEPARTMENT_READ_ROLES,
  WRITE_DEPARTMENT_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canRead = [authenticateUser, authorizeRoles(DEPARTMENT_READ_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_DEPARTMENT_ROLES)];

router.get("/", ...canRead, listDepartments);
router.get("/:id", ...canRead, getDepartmentById);
router.post("/", ...canWrite, createDepartment);
router.put("/:id", ...canWrite, updateDepartment);
router.delete("/:id", ...canWrite, deleteDepartment);

router.use(errorHandler);

module.exports = router;
