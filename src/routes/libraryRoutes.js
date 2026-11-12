const express = require("express");
const multer = require("multer");
const {
  getStats,
  weeklySummary,
  getMyLibrary,
  listBooks,
  createBook,
  updateBook,
  deleteBook,
  downloadBooksImportTemplate,
  previewBooksImport,
  importBooksMapped,
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
  downloadElearningImportTemplate,
  previewElearningImport,
  importElearningMapped,
  listServices,
  createService,
  updateService,
  deleteService,
  searchBorrowers,
} = require("../controllers/libraryController");
const {
  authenticateUser,
  authorizeRoles,
  READ_LIBRARY_ROLES,
  WRITE_LIBRARY_ROLES,
  PUBLIC_PORTAL_ALLOWED_ROLES,
} = require("../middleware/auth");
const { errorHandler } = require("../middleware/errorHandler");

const router = express.Router();
const canRead = [authenticateUser, authorizeRoles(READ_LIBRARY_ROLES)];
const canWrite = [authenticateUser, authorizeRoles(WRITE_LIBRARY_ROLES)];
const studentsOnly = [authenticateUser, authorizeRoles(PUBLIC_PORTAL_ALLOWED_ROLES)];

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname || "")) return cb(null, true);
    cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
  },
});

router.get("/me", ...studentsOnly, getMyLibrary);

router.get("/stats", ...canRead, getStats);
router.get("/summary/weekly", ...canRead, weeklySummary);
router.get("/borrowers", ...canWrite, searchBorrowers);

router.get("/books/import-template", ...canWrite, downloadBooksImportTemplate);
router.post("/books/import-preview", ...canWrite, excelUpload.single("file"), previewBooksImport);
router.post("/books/import-mapped", ...canWrite, excelUpload.single("file"), importBooksMapped);

router.get("/books", ...canRead, listBooks);
router.post("/books", ...canWrite, createBook);
router.put("/books/:id", ...canWrite, updateBook);
router.delete("/books/:id", ...canWrite, deleteBook);

router.get("/rules", ...canRead, listRules);
router.post("/rules", ...canWrite, createRule);
router.put("/rules/:id", ...canWrite, updateRule);
router.delete("/rules/:id", ...canWrite, deleteRule);

router.get("/loans", ...canRead, listLoans);
router.post("/loans", ...canWrite, createLoan);
router.post("/loans/:id/return", ...canWrite, returnLoan);

router.get("/elearning/import-template", ...canWrite, downloadElearningImportTemplate);
router.post("/elearning/import-preview", ...canWrite, excelUpload.single("file"), previewElearningImport);
router.post("/elearning/import-mapped", ...canWrite, excelUpload.single("file"), importElearningMapped);

router.get("/elearning", ...canRead, listElearning);
router.post("/elearning", ...canWrite, createElearning);
router.put("/elearning/:id", ...canWrite, updateElearning);
router.delete("/elearning/:id", ...canWrite, deleteElearning);

router.get("/services", ...canRead, listServices);
router.post("/services", ...canWrite, createService);
router.put("/services/:id", ...canWrite, updateService);
router.delete("/services/:id", ...canWrite, deleteService);

router.use(errorHandler);

module.exports = router;
