const express = require("express");
const c = require("../controllers/churchController");
const { authenticateUser, authorizeRoles, STAFF_ROLES } = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();

const manage = [authenticateUser, authorizeRoles(STAFF_ROLES)];
const book = [authenticateUser, authorizeRoles([...STAFF_ROLES, "student"])];

router.get("/available", ...book, c.listAvailableServices);
router.get("/my-bookings", ...book, c.myBookings);
router.get("/services/:id/seat-map", ...book, c.getSeatMap);
router.post("/services/:id/bookings", ...book, c.bookSeat);
router.delete("/bookings/:id", ...book, c.cancelBooking);

router.get("/services", ...manage, c.listServices);
router.post("/services", ...manage, c.createService);
router.get("/services/:id", ...manage, c.getService);
router.put("/services/:id", ...manage, c.updateService);
router.delete("/services/:id", ...manage, c.deleteService);
router.post("/services/:id/submit", ...manage, c.submitService);
router.post("/services/:id/approve", ...manage, c.approveService);
router.post("/services/:id/reject", ...manage, c.rejectService);
router.post("/services/:id/cancel", ...manage, c.cancelService);
router.post("/services/:id/duplicate", ...manage, c.duplicateService);
router.get("/services/:id/bookings", ...manage, c.listServiceBookings);
router.patch("/bookings/:id/attendance", ...manage, c.setAttendance);

router.use(errorHandler);

module.exports = router;
