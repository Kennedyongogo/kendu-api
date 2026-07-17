const express = require("express");
const router = express.Router();
const { listFeePayments, getFeePayment } = require("../controllers/feePaymentController");
const { authenticateUser, authorizeRoles } = require("../middleware/auth");
const { STAFF_ROLES } = require("../constants/userRoles");

router.get("/", authenticateUser, authorizeRoles(STAFF_ROLES), listFeePayments);
router.get("/:id", authenticateUser, authorizeRoles(STAFF_ROLES), getFeePayment);

module.exports = router;
