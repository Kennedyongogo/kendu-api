const express = require("express");
const router = express.Router();
const {
  listReceipts,
  listMyReceipts,
  streamReceiptPdf,
  streamMyReceiptPdf,
} = require("../controllers/feePaymentReceiptController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { STAFF_ROLES } = require("../constants/userRoles");

router.get("/me", authenticateUser, authorizeRoles(["parent"]), listMyReceipts);
router.get("/me/:id/pdf", authenticateUser, authorizeRoles(["parent"]), streamMyReceiptPdf);
router.get("/", authenticateUser, authorizeRoles(STAFF_ROLES), listReceipts);
router.get("/:id/pdf", authenticateUser, authorizeRoles(STAFF_ROLES), streamReceiptPdf);

module.exports = router;
