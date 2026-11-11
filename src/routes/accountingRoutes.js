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
  READ_FEE_ROLES,
  WRITE_FEE_ROLES,
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
  authorizeRoles(READ_FEE_ROLES),
  getCollectionAnalytics
);
router.get(
  "/dashboard",
  authenticateUser,
  authorizeRoles(READ_FEE_ROLES),
  getAccountingDashboard
);
router.get(
  "/payments",
  authenticateUser,
  authorizeRoles(READ_FEE_ROLES),
  listPayments
);
router.post(
  "/payments",
  authenticateUser,
  authorizeRoles(WRITE_FEE_ROLES),
  recordPayment
);
router.get(
  "/students",
  authenticateUser,
  authorizeRoles(READ_FEE_ROLES),
  listAccountingStudents
);
router.get(
  "/students/:studentId",
  authenticateUser,
  authorizeRoles(READ_FEE_ROLES),
  getStudentLedger
);

router.use(errorHandler);

module.exports = router;
