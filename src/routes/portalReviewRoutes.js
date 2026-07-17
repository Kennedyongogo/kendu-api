const express = require("express");
const router = express.Router();
const {
  listApprovedPublic,
  getMyReviewStatus,
  submitMyReview,
  listPortalReviewsAdmin,
  getPortalReview,
  approvePortalReview,
  rejectPortalReview,
  deletePortalReview,
} = require("../controllers/portalReviewController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");
const { STAFF_ROLES, ADMIN_PORTAL_API_ROLES, PUBLIC_PORTAL_ALLOWED_ROLES } = require("../constants/userRoles");

const TEACH_OR_STAFF = [...STAFF_ROLES, "teacher"];

router.get("/public/approved", listApprovedPublic);

router.get("/me", authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES), getMyReviewStatus);
router.post("/me", authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES), submitMyReview);

router.get("/", authenticateUser, authorizeRoles(TEACH_OR_STAFF), listPortalReviewsAdmin);
router.get("/:id", authenticateUser, authorizeRoles(TEACH_OR_STAFF), getPortalReview);
router.patch("/:id/approve", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), approvePortalReview);
router.patch("/:id/reject", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), rejectPortalReview);
router.delete("/:id", authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES), deletePortalReview);

router.use(errorHandler);

module.exports = router;
