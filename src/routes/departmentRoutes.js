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
  ADMIN_PORTAL_API_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const adminOnly = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

router.get("/", ...adminOnly, listDepartments);
router.get("/:id", ...adminOnly, getDepartmentById);
router.post("/", ...adminOnly, createDepartment);
router.put("/:id", ...adminOnly, updateDepartment);
router.delete("/:id", ...adminOnly, deleteDepartment);

router.use(errorHandler);

module.exports = router;
