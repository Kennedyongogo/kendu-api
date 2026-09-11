const express = require("express");
const {
  getStats,
  listBooks,
  createBook,
  updateBook,
  deleteBook,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  listLoans,
  createLoan,
  returnLoan,
  listElearning,
  createElearning,
  updateElearning,
  deleteElearning,
  listServices,
  createService,
  updateService,
  deleteService,
  searchBorrowers,
} = require("../controllers/libraryController");
const {
  authenticateUser,
  authorizeRoles,
  ADMIN_PORTAL_API_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const adminOnly = [authenticateUser, authorizeRoles(ADMIN_PORTAL_API_ROLES)];

router.get("/stats", ...adminOnly, getStats);
router.get("/borrowers", ...adminOnly, searchBorrowers);

router.get("/books", ...adminOnly, listBooks);
router.post("/books", ...adminOnly, createBook);
router.put("/books/:id", ...adminOnly, updateBook);
router.delete("/books/:id", ...adminOnly, deleteBook);

router.get("/rules", ...adminOnly, listRules);
router.post("/rules", ...adminOnly, createRule);
router.put("/rules/:id", ...adminOnly, updateRule);
router.delete("/rules/:id", ...adminOnly, deleteRule);

router.get("/loans", ...adminOnly, listLoans);
router.post("/loans", ...adminOnly, createLoan);
router.post("/loans/:id/return", ...adminOnly, returnLoan);

router.get("/elearning", ...adminOnly, listElearning);
router.post("/elearning", ...adminOnly, createElearning);
router.put("/elearning/:id", ...adminOnly, updateElearning);
router.delete("/elearning/:id", ...adminOnly, deleteElearning);

router.get("/services", ...adminOnly, listServices);
router.post("/services", ...adminOnly, createService);
router.put("/services/:id", ...adminOnly, updateService);
router.delete("/services/:id", ...adminOnly, deleteService);

router.use(errorHandler);

module.exports = router;
