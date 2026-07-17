const express = require("express");
const router = express.Router();
const {
  listPublic,
  listSchoolServices,
  getSchoolService,
  createSchoolService,
  updateSchoolService,
  deleteSchoolService,
  reorderSchoolServices,
} = require("../controllers/schoolServiceController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/public", listPublic);

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listSchoolServices);
router.post("/", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), createSchoolService);
router.put(
  "/reorder",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  reorderSchoolServices
);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getSchoolService);
router.put("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), updateSchoolService);
router.delete(
  "/:id",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  deleteSchoolService
);

router.use(errorHandler);

module.exports = router;
