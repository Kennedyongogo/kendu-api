const express = require("express");
const router = express.Router();
const { publicListTeachers } = require("../controllers/teacherController");
const { publicListSchoolAdmins } = require("../controllers/schoolAdminController");
const { publicGetCurriculum } = require("../controllers/curriculumController");
const { errorHandler } = require("../middleware/errorHandler");

router.get("/teachers", publicListTeachers);
router.get("/school-admins", publicListSchoolAdmins);
router.get("/curricula/:id", publicGetCurriculum);

router.use(errorHandler);

module.exports = router;