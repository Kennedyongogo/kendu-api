const express = require("express");
const router = express.Router();
const {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require("../controllers/departmentController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES} = require("../constants/userRoles");
const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listDepartments);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createDepartment);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getDepartment);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateDepartment);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deleteDepartment);

router.use(errorHandler);

module.exports = router;
