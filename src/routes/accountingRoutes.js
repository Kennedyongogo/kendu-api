const express = require("express");
const {
  getMyLedger,
  downloadMyPaymentReceipt,
  initiateMyPayment,
  mpesaCallback,
  getStudentLedger,
  recordPayment,
  listPayments,
  getAccountingDashboard,
  listAccountingStudents,
  getCollectionAnalytics,
} = require("../controllers/accountingController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

// The provider callback is authenticated by its CheckoutRequestID and remains public.
router.post("/mpesa/callback", mpesaCallback);

router.get(
  "/me",
  authenticateUser,
  authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES),
  getMyLedger
);
router.get(
  "/me/payments/:paymentId/receipt",
  authenticateUser,
  authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES),
  downloadMyPaymentReceipt
);
router.post(
  "/me/pay",
  authenticateUser,
  authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES),
  initiateMyPayment
);

router.get(
  "/dashboard/collections",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  getCollectionAnalytics
);
router.get(
  "/dashboard",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  getAccountingDashboard
);
router.get(
  "/payments",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listPayments
);
router.post(
  "/payments",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  recordPayment
);
router.get(
  "/students",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  listAccountingStudents
);
router.get(
  "/students/:studentId",
  authenticateUser,
  authorizeRoles(ADMIN_PORTAL_API_ROLES),
  getStudentLedger
);

router.use(errorHandler);

module.exports = router;
