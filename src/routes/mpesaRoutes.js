const express = require("express");
const router = express.Router();
const {
  stkCallback,
  getMpesaConfigStatus,
  initiateParentFeeStkPush,
  getStkPushStatus,
} = require("../controllers/mpesaController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");

router.post("/callback", stkCallback);
router.get("/status", getMpesaConfigStatus);
router.post(
  "/fee-invoice/:invoiceId/stk-push",
  authenticateUser,
  authorizeRoles(["parent"]),
  initiateParentFeeStkPush
);
router.get(
  "/stk-push/:checkoutRequestId",
  authenticateUser,
  authorizeRoles(["parent"]),
  getStkPushStatus
);

module.exports = router;
