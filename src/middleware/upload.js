const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine upload directory based on file type
    let uploadPath;

    if (file.fieldname === "profile_image") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "profiles");
    } else if (
      file.fieldname === "document" ||
      file.fieldname === "documents" ||
      file.fieldname === "file"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "documents");
    } else if (
      file.fieldname === "service_image" ||
      file.fieldname === "service_images"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "services");
    } else if (
      file.fieldname === "project_image" ||
      file.fieldname === "project_images"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "projects");
    } else if (
      file.fieldname === "image" ||
      file.fieldname === "images" ||
      file.fieldname === "menu_image"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "menu");
    } else if (
      file.fieldname === "blog_image" ||
      file.fieldname === "blog_featured_image"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "posts");
    } else if (file.fieldname === "author_image") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "authors");
    } else if (file.fieldname === "interest_gallery_media") {
      uploadPath = path.join(
        __dirname,
        "..",
        "..",
        "uploads",
        "interest-gallery"
      );
    } else if (file.fieldname === "profile_photo") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "marketplace-profiles");
    } else if (
      file.fieldname === "training_event_image" ||
      file.fieldname === "training_event_images"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "training-events");
    } else if (
      file.fieldname === "grant_image" ||
      file.fieldname === "grant_images"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "grants");
    } else if (
      file.fieldname === "partner_logo" ||
      file.fieldname === "partner_logos"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "partners");
    } else if (file.fieldname === "teacher_profile_picture") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "teacher-profiles");
    } else if (file.fieldname === "student_profile_picture") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "student-profiles");
    } else if (file.fieldname === "school_logo") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "school-logos");
    } else if (
      file.fieldname === "student_picture" ||
      file.fieldname === "student_reportcard" ||
      file.fieldname === "student_birthcertificate"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "admission-documents");
    } else if (
      file.fieldname === "listing_image" ||
      file.fieldname === "listing_images"
    ) {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "marketplace-listings");
    } else if (file.fieldname === "exam_answer_file") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "exam-answers");
    } else if (file.fieldname === "exam_pdf_working_paper") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "exam-pdf-working-papers");
    } else if (file.fieldname === "exam_pdf_marked_return") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "exam-pdf-marked-returns");
    } else if (file.fieldname === "exam_pdf_template" || file.fieldname === "exam_pdf_completed") {
      uploadPath = path.join(
        __dirname,
        "..",
        "..",
        "uploads",
        file.fieldname === "exam_pdf_completed" ? "exam-pdf-completed" : "exam-pdf-templates"
      );
    } else if (file.fieldname === "assignment_pdf_template") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "assignment-pdf-templates");
    } else if (file.fieldname === "assignment_answer_file") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "assignment-answers");
    } else if (file.fieldname === "assignment_pdf_working_paper") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "assignment-pdf-working-papers");
    } else if (file.fieldname === "assignment_pdf_marked_return") {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "assignment-pdf-marked-returns");
    } else {
      uploadPath = path.join(__dirname, "..", "..", "uploads", "misc");
    }


    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    // Sanitize filename
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `${sanitizedBasename}-${uniqueSuffix}${extension}`;
    cb(null, filename);
  },
});

// File filter to allow specific file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    // Images
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
    // Videos
    "video/mp4": ".mp4",
    "video/avi": ".avi",
    "video/mov": ".mov",
    "video/wmv": ".wmv",
    "video/webm": ".webm",
    "video/mkv": ".mkv",
    // Documents
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",
    "text/plain": ".txt",
    "text/csv": ".csv",
  };

  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"];
  const originalName = (file.originalname || "").toLowerCase();
  const hasAllowedImageExtension = imageExtensions.some((ext) =>
    originalName.endsWith(ext)
  );
  const isMenuImageField =
    file.fieldname === "image" || file.fieldname === "menu_image";
  const isProfileImageField = file.fieldname === "profile_image";
  const isSchoolLogoField = file.fieldname === "school_logo";
  const isTeacherStudentProfilePic =
    file.fieldname === "teacher_profile_picture" || file.fieldname === "student_profile_picture";
  const isExamPdfWorkingPaper = file.fieldname === "exam_pdf_working_paper";
  const isExamPdfMarkedReturn = file.fieldname === "exam_pdf_marked_return";
  const isExamPdfTemplate = file.fieldname === "exam_pdf_template" || file.fieldname === "exam_pdf_completed";
  const isExamAnswerFile = file.fieldname === "exam_answer_file";
  const isAssignmentPdfTemplate = file.fieldname === "assignment_pdf_template";
  const isAssignmentPdfWorkingPaper = file.fieldname === "assignment_pdf_working_paper";
  const isAssignmentPdfMarkedReturn = file.fieldname === "assignment_pdf_marked_return";
  const isAssignmentAnswerFile = file.fieldname === "assignment_answer_file";

  // Some phones/providers send image uploads as application/octet-stream.
  // Accept by extension for known image fields.
  if (
    (isMenuImageField ||
      isProfileImageField ||
      isSchoolLogoField ||
      isTeacherStudentProfilePic ||
      isExamPdfWorkingPaper ||
      isExamPdfMarkedReturn ||
      isExamPdfTemplate ||
      isExamAnswerFile ||
      isAssignmentPdfTemplate ||
      isAssignmentPdfWorkingPaper ||
      isAssignmentPdfMarkedReturn ||
      isAssignmentAnswerFile) &&
    file.mimetype === "application/octet-stream" &&
    hasAllowedImageExtension
  ) {
    cb(null, true);
    return;
  }

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    console.warn(
      `[upload] Rejected file. field=${file.fieldname} mimetype=${file.mimetype} originalname=${file.originalname}`
    );
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Allowed types: ${Object.values(
          allowedTypes
        ).join(", ")}`
      ),
      false
    );
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (increased for videos)
  },
});

// Middleware for single profile picture upload
const uploadProfileImage = upload.single("profile_image");

// Middleware for single document upload
const uploadDocument = upload.single("document");

// Student exam answer attachment (image / PDF / document)
const uploadExamAnswerFile = upload.single("exam_answer_file");
const uploadExamPdfWorkingPaper = upload.single("exam_pdf_working_paper");
const uploadExamPdfMarkedReturn = upload.single("exam_pdf_marked_return");
const uploadExamPdfTemplate = upload.single("exam_pdf_template");
const uploadAssignmentAnswerFile = upload.single("assignment_answer_file");
const uploadAssignmentPdfTemplate = upload.single("assignment_pdf_template");
const uploadAssignmentPdfWorkingPaper = upload.single("assignment_pdf_working_paper");
const uploadAssignmentPdfMarkedReturn = upload.single("assignment_pdf_marked_return");

// Middleware for file upload (generic)
const uploadFile = upload.single("file");

// Middleware for multiple documents upload
const uploadDocuments = upload.array("documents", 10); // Max 10 files

// Middleware for blog featured image
const uploadBlogImage = upload.single("blog_image");

// Middleware for blog assets (featured + author image)
const uploadBlogAssets = upload.fields([
  { name: "blog_image", maxCount: 1 },
  { name: "author_image", maxCount: 1 },
]);

// Middleware for mixed uploads (multiple fields)
const uploadMixed = upload.fields([
  { name: "profile_image", maxCount: 1 },
  { name: "document", maxCount: 1 },
  { name: "documents", maxCount: 10 },
]);

// Middleware for interest gallery media (single file - either image or video)
const uploadInterestGalleryMedia = upload.single("interest_gallery_media");

// Middleware for service image
const uploadServiceImage = upload.single("service_image");

// Middleware for project image
const uploadProjectImage = upload.single("project_image");

// Middleware for marketplace user profile photo (public portal)
const uploadMarketplaceProfilePhoto = upload.single("profile_photo");

// Middleware for training event image
const uploadTrainingEventImage = upload.single("training_event_image");

// Middleware for job opportunity image
const uploadJobOpportunityImage = upload.single("job_opportunity_image");

// Middleware for grant image
const uploadGrantImage = upload.single("grant_image");

// Middleware for partner logo
const uploadPartnerLogo = upload.single("partner_logo");

// School profile logo (optional single file)
const uploadSchoolLogos = upload.single("school_logo");

const uploadTeacherProfilePicture = upload.single("teacher_profile_picture");
const uploadStudentProfilePicture = upload.single("student_profile_picture");
const uploadSchoolAdminProfilePicture = upload.single("profile_picture");

const uploadAdmissionDocuments = upload.fields([
  { name: "student_picture", maxCount: 1 },
  { name: "student_reportcard", maxCount: 1 },
  { name: "student_birthcertificate", maxCount: 1 },
]);

const uploadListingImage = upload.single("listing_image");

// Middleware for menu item image
const uploadMenuImage = upload.single("image");

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 10MB.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 10 files.",
      });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field.",
      });
    }
  }

  if (error && error.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid file type. Allowed image formats: JPG, JPEG, PNG, GIF, WEBP, HEIC, HEIF.",
    });
  }

  next(error);
};

// Helper function to delete file
const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
};

// Helper function to get file type from mimetype
const getFileType = (mimetype) => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype === "application/pdf") return "pdf";
  if (
    mimetype === "application/msword" ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }
  if (
    mimetype === "application/vnd.ms-excel" ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "excel";
  }
  if (
    mimetype === "application/vnd.ms-powerpoint" ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "powerpoint";
  }
  if (mimetype === "text/plain" || mimetype === "text/csv") return "text";
  return "other";
};

module.exports = {
  uploadProfileImage,
  uploadDocument,
  uploadExamAnswerFile,
  uploadExamPdfWorkingPaper,
  uploadExamPdfMarkedReturn,
  uploadExamPdfTemplate,
  uploadAssignmentAnswerFile,
  uploadAssignmentPdfTemplate,
  uploadAssignmentPdfWorkingPaper,
  uploadAssignmentPdfMarkedReturn,
  uploadFile,
  uploadDocuments,
  uploadBlogImage,
  uploadBlogAssets,
  uploadMixed,
  uploadInterestGalleryMedia,
  uploadServiceImage,
  uploadProjectImage,
  uploadMarketplaceProfilePhoto,
  uploadTrainingEventImage,
  uploadJobOpportunityImage,
  uploadGrantImage,
  uploadPartnerLogo,
  uploadSchoolLogos,
  uploadTeacherProfilePicture,
  uploadStudentProfilePicture,
  uploadSchoolAdminProfilePicture,
  uploadAdmissionDocuments,
  uploadListingImage,
  uploadMenuImage,
  handleUploadError,
  deleteFile,
  getFileType,
  upload,
};
