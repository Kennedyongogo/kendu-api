const { sequelize } = require("../config/database");
const User = require("./user")(sequelize);
const Teacher = require("./teacher")(sequelize);
const Student = require("./student")(sequelize);
const StudentTermRegistration = require("./studentTermRegistration")(sequelize);
const Parent = require("./parent")(sequelize);
const SchoolAdmin = require("./schoolAdmin")(sequelize);
const Department = require("./department")(sequelize);
const Exam = require("./exam")(sequelize);
const Assignment = require("./assignment")(sequelize);
const AssignmentQuestion = require("./assignmentQuestion")(sequelize);
const AssignmentSubmission = require("./assignmentSubmission")(sequelize);
const AssignmentAnswer = require("./assignmentAnswer")(sequelize);
const ExamQuestion = require("./examQuestion")(sequelize);
const ExamAttempt = require("./examAttempt")(sequelize);
const ExamSubmission = require("./examSubmission")(sequelize);
const ExamAnswer = require("./examAnswer")(sequelize);
const ProctoringSession = require("./proctoringSession")(sequelize);
const ProctoringEvent = require("./proctoringEvent")(sequelize);
const ProctoringRecording = require("./proctoringRecording")(sequelize);
const SubjectGradingScale = require("./subjectGradingScale")(sequelize);
const OverallGradingScale = require("./overallGradingScale")(sequelize);
const StudentExamResult = require("./studentExamResult")(sequelize);
const ReportCard = require("./reportCard")(sequelize);
const ReportCardLine = require("./reportCardLine")(sequelize);
const ExamSessionLog = require("./examSessionLog")(sequelize);
const TeacherDepartment = require("./teacherDepartment")(sequelize);
const TeacherCurriculumJoin = require("./teacherCurriculumJoin")(sequelize);
const TeacherCurriculumSubject = require("./teacherCurriculumSubject")(
  sequelize,
);
const TeacherTeachingCurriculumClass =
  require("./teacherTeachingCurriculumClass")(sequelize);
const FeeStructure = require("./feeStructure")(sequelize);
const FeeInvoice = require("./feeInvoice")(sequelize);
const FeePayment = require("./feePayment")(sequelize);
const StudentLevelFeeCredit = require("./studentLevelFeeCredit")(sequelize);
const MpesaStkRequest = require("./mpesaStkRequest")(sequelize);
const AcademicTerm = require("./academicTerm")(sequelize);
const Installment = require("./installment")(sequelize);
const Curriculum = require("./curriculum")(sequelize);
const CurriculumClass = require("./curriculumClass")(sequelize);
const CurriculumClassLevel = require("./curriculumClassLevel")(sequelize);
const CurriculumSubject = require("./curriculumSubject")(sequelize);
const CurriculumSubjectTopic = require("./curriculumSubjectTopic")(sequelize);
const CurriculumSubjectSubtopic = require("./curriculumSubjectSubtopic")(
  sequelize,
);
const CurriculumClassTimetable = require("./curriculumClassTimetable")(
  sequelize,
);
const CurriculumClassTimetableLesson =
  require("./curriculumClassTimetableLesson")(sequelize);
const News = require("./news")(sequelize);
const SchoolService = require("./schoolService")(sequelize);
const PortalReview = require("./portalReview")(sequelize);
const SchoolEvent = require("./schoolEvent")(sequelize);
const EventLobbyEntry = require("./eventLobbyEntry")(sequelize);
const EventLiveChat = require("./eventLiveChat")(sequelize);
const EventLiveReaction = require("./eventLiveReaction")(sequelize);
const EventLiveHandRaise = require("./eventLiveHandRaise")(sequelize);
const AdminMeeting = require("./adminMeeting")(sequelize);
const AdminMeetingLobbyEntry = require("./adminMeetingLobbyEntry")(sequelize);
const AdminMeetingLiveChat = require("./adminMeetingLiveChat")(sequelize);
const AdminMeetingLiveReaction = require("./adminMeetingLiveReaction")(sequelize);
const AdminMeetingLiveHandRaise = require("./adminMeetingLiveHandRaise")(sequelize);
const AdmissionApplication = require("./admissionApplication")(sequelize);
const LiveClass = require("./liveClass")(sequelize);
const LiveClassRecording = require("./liveClassRecording")(sequelize);
const LiveClassAttendance = require("./liveClassAttendance")(sequelize);
const LiveClassChat = require("./liveClassChat")(sequelize);
const LiveClassHandRaise = require("./liveClassHandRaise")(sequelize);
const LiveClassReaction = require("./liveClassReaction")(sequelize);
const LiveClassLobbyEntry = require("./liveClassLobbyEntry")(sequelize);
const LiveClassWhiteboard = require("./liveClassWhiteboard")(sequelize);
const LessonAttendanceRegister = require("./lessonAttendanceRegister")(sequelize);
const LessonAttendanceRegisterEntry = require("./lessonAttendanceRegisterEntry")(sequelize);
const ExamScheduleLobbyEntry = require("./examScheduleLobbyEntry")(sequelize);
const InAppNotification = require("./inAppNotification")(sequelize);
const SchoolProfile = require("./schoolProfile")(sequelize);
const ExamTemplate = require("./examTemplate")(sequelize);
const GoogleMeetCredential = require("./googleMeetCredential")(sequelize);
const AuditTrail = require("./auditTrail")(sequelize);

const models = {
  User,
  Teacher,
  Student,
  StudentTermRegistration,
  Parent,
  SchoolAdmin,
  Department,
  Exam,
  Assignment,
  AssignmentQuestion,
  AssignmentSubmission,
  AssignmentAnswer,
  ExamQuestion,
  ExamAttempt,
  ExamSubmission,
  ExamAnswer,
  ProctoringSession,
  ProctoringEvent,
  ProctoringRecording,
  SubjectGradingScale,
  OverallGradingScale,
  StudentExamResult,
  ReportCard,
  ReportCardLine,
  ExamSessionLog,
  TeacherDepartment,
  TeacherCurriculumJoin,
  TeacherCurriculumSubject,
  TeacherTeachingCurriculumClass,
  FeeStructure,
  FeeInvoice,
  FeePayment,
  StudentLevelFeeCredit,
  MpesaStkRequest,
  AcademicTerm,
  Installment,
  Curriculum,
  CurriculumClass,
  CurriculumClassLevel,
  CurriculumSubject,
  CurriculumSubjectTopic,
  CurriculumSubjectSubtopic,
  CurriculumClassTimetable,
  CurriculumClassTimetableLesson,
  News,
  SchoolService,
  PortalReview,
  SchoolEvent,
  EventLobbyEntry,
  EventLiveChat,
  EventLiveReaction,
  EventLiveHandRaise,
  AdminMeeting,
  AdminMeetingLobbyEntry,
  AdminMeetingLiveChat,
  AdminMeetingLiveReaction,
  AdminMeetingLiveHandRaise,
  AdmissionApplication,
  LiveClass,
  LiveClassRecording,
  LiveClassAttendance,
  LiveClassChat,
  LiveClassHandRaise,
  LiveClassReaction,
  LiveClassLobbyEntry,
  LiveClassWhiteboard,
  LessonAttendanceRegister,
  LessonAttendanceRegisterEntry,
  ExamScheduleLobbyEntry,
  InAppNotification,
  SchoolProfile,
  ExamTemplate,
  GoogleMeetCredential,
  AuditTrail,
};

const { ensureUnifiedExamSchema } = require("../utils/ensureUnifiedExamSchema");
const { ensureLessonScheduleSchema } = require("../utils/ensureLessonScheduleSchema");
const { ensureLessonAttendanceRegisterSchema } = require("../utils/ensureLessonAttendanceRegisterSchema");
const { ensureLiveClassTimestampsSchema } = require("../utils/ensureLiveClassTimestampsSchema");
const { ensureExamAnswerMarkerCommentSchema } = require("../utils/ensureExamAnswerMarkerCommentSchema");
const { ensureReportCardSchema } = require("../utils/ensureReportCardSchema");
const { ensureInAppNotificationSchema } = require("../utils/ensureInAppNotificationSchema");
const { ensureFeeBillingSchema } = require("../utils/ensureFeeBillingSchema");
const { ensureAuditTrailSchema } = require("../utils/ensureAuditTrailSchema");
const { ensureAdmissionApplicationSchema } = require("../utils/ensureAdmissionApplicationSchema");
const { ensureAssignmentSchema } = require("../utils/ensureAssignmentSchema");
const { ensureStudentTermRegistrationSchema } = require("../utils/ensureStudentTermRegistrationSchema");
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating school system tables...");
    await ensureUnifiedExamSchema();
    await ensureLessonScheduleSchema();
    await ensureLessonAttendanceRegisterSchema();
    await ensureLiveClassTimestampsSchema();
    await ensureExamAnswerMarkerCommentSchema();
    await ensureReportCardSchema();
    await ensureInAppNotificationSchema();
    await ensureFeeBillingSchema();
    await ensureAuditTrailSchema();
    await ensureAdmissionApplicationSchema();
    await ensureAssignmentSchema();
    await ensureStudentTermRegistrationSchema();
    await User.sync({ force: false, alter: false });
    await GoogleMeetCredential.sync({ force: false, alter: false });
    await Teacher.sync({ force: false, alter: false });
    await Student.sync({ force: false, alter: false });
    await StudentTermRegistration.sync({ force: false, alter: false });
    await Parent.sync({ force: false, alter: false });
    await SchoolAdmin.sync({ force: false, alter: false });
    await Department.sync({ force: false, alter: false });
    await StudentExamResult.sync({ force: false, alter: false });
    await ReportCard.sync({ force: false, alter: false });
    await ReportCardLine.sync({ force: false, alter: false });
    await FeeStructure.sync({ force: false, alter: false });
    await FeeInvoice.sync({ force: false, alter: false });
    await FeePayment.sync({ force: false, alter: false });
    await StudentLevelFeeCredit.sync({ force: false, alter: false });
    await MpesaStkRequest.sync({ force: false, alter: false });
    await AcademicTerm.sync({ force: false, alter: false });
    await SchoolProfile.sync({ force: false, alter: false });
    await ExamTemplate.sync({ force: false, alter: false });
    await Exam.sync({ force: false, alter: false });
    await ExamQuestion.sync({ force: false, alter: false });
    await ExamSubmission.sync({ force: false, alter: false });
    await ExamAnswer.sync({ force: false, alter: false });
    await Assignment.sync({ force: false, alter: false });
    await AssignmentQuestion.sync({ force: false, alter: false });
    await AssignmentSubmission.sync({ force: false, alter: false });
    await AssignmentAnswer.sync({ force: false, alter: false });
    await Installment.sync({ force: false, alter: false });
    await Curriculum.sync({ force: false, alter: false });
    await CurriculumClass.sync({ force: false, alter: false });
    await CurriculumClassLevel.sync({ force: false, alter: false });
    await CurriculumSubject.sync({ force: false, alter: false });
    await CurriculumSubjectTopic.sync({ force: false, alter: false });
    await CurriculumSubjectSubtopic.sync({ force: false, alter: false });
    await SubjectGradingScale.sync({ force: false, alter: false });
    await OverallGradingScale.sync({ force: false, alter: false });
    await TeacherDepartment.sync({ force: false, alter: false });
    await TeacherCurriculumJoin.sync({ force: false, alter: false });
    await TeacherCurriculumSubject.sync({ force: false, alter: false });
    await TeacherTeachingCurriculumClass.sync({ force: false, alter: false });
    await CurriculumClassTimetable.sync({ force: false, alter: false });
    await CurriculumClassTimetableLesson.sync({ force: false, alter: false });
    await News.sync({ force: false, alter: false });
    await SchoolService.sync({ force: false, alter: false });
    await PortalReview.sync({ force: false, alter: false });
    await SchoolEvent.sync({ force: false, alter: false });
    await EventLobbyEntry.sync({ force: false, alter: false });
    await EventLiveChat.sync({ force: false, alter: false });
    await EventLiveReaction.sync({ force: false, alter: false });
    await EventLiveHandRaise.sync({ force: false, alter: false });
    await AdminMeeting.sync({ force: false, alter: false });
    await AdminMeetingLobbyEntry.sync({ force: false, alter: false });
    await AdminMeetingLiveChat.sync({ force: false, alter: false });
    await AdminMeetingLiveReaction.sync({ force: false, alter: false });
    await AdminMeetingLiveHandRaise.sync({ force: false, alter: false });
    await AdmissionApplication.sync({ force: false, alter: false });
    await InAppNotification.sync({ force: false, alter: false });
    await LiveClass.sync({ force: false, alter: false });
    await LiveClassRecording.sync({ force: false, alter: false });
    await LiveClassAttendance.sync({ force: false, alter: false });
    await LiveClassChat.sync({ force: false, alter: false });
    await LiveClassHandRaise.sync({ force: false, alter: false });
    await LiveClassReaction.sync({ force: false, alter: false });
    await LiveClassLobbyEntry.sync({ force: false, alter: false });
    await LiveClassWhiteboard.sync({ force: false, alter: false });
    // Tables + indexes come from ensureLessonAttendanceRegisterSchema (SQL); sync would duplicate indexes.
    await ExamScheduleLobbyEntry.sync({ force: false, alter: false });
    await AuditTrail.sync({ force: false, alter: false });
    console.log("✅ All models synced successfully");
  } catch (error) {
    console.error("❌ Error syncing models:", error);
    throw error;
  }
};

const setupAssociations = () => {
  try {
    User.hasOne(Student, {
      foreignKey: "user_id",
      onDelete: "CASCADE",
      as: "student_profile",
    });
    Student.belongsTo(User, { foreignKey: "user_id", as: "user" });

    User.hasOne(Teacher, {
      foreignKey: "user_id",
      onDelete: "CASCADE",
      as: "teacher_profile",
    });
    Teacher.belongsTo(User, { foreignKey: "user_id", as: "user" });

    User.hasMany(Parent, {
      foreignKey: "user_id",
      onDelete: "CASCADE",
      as: "parent_profiles",
    });
    Parent.belongsTo(User, { foreignKey: "user_id", as: "user" });

    User.hasOne(SchoolAdmin, {
      foreignKey: "user_id",
      onDelete: "CASCADE",
      as: "school_admin_profile",
    });
    SchoolAdmin.belongsTo(User, { foreignKey: "user_id", as: "user" });

    User.hasOne(GoogleMeetCredential, {
      foreignKey: "user_id",
      onDelete: "CASCADE",
      as: "google_meet_credential",
    });
    GoogleMeetCredential.belongsTo(User, { foreignKey: "user_id", as: "user" });

    Teacher.hasMany(Student, {
      foreignKey: "class_teacher_id",
      as: "class_students",
    });
    Student.belongsTo(Teacher, {
      foreignKey: "class_teacher_id",
      as: "class_teacher",
    });

    Curriculum.hasMany(Student, {
      foreignKey: "curriculum_id",
      as: "students",
    });
    Student.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });

    CurriculumClass.hasMany(Student, {
      foreignKey: "curriculum_class_id",
      as: "students",
    });
    Student.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });
    CurriculumClassLevel.hasMany(Student, {
      foreignKey: "curriculum_class_level_id",
      as: "students",
    });
    Student.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });

    Student.hasMany(StudentTermRegistration, {
      foreignKey: "student_id",
      as: "term_registrations",
    });
    StudentTermRegistration.belongsTo(Student, {
      foreignKey: "student_id",
      as: "student",
    });
    StudentTermRegistration.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });
    StudentTermRegistration.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });
    StudentTermRegistration.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });
    StudentTermRegistration.belongsTo(User, {
      foreignKey: "moved_by_user_id",
      as: "moved_by_user",
    });
    StudentTermRegistration.belongsTo(StudentTermRegistration, {
      foreignKey: "previous_registration_id",
      as: "previous_registration",
    });

    Department.belongsTo(Teacher, {
      foreignKey: "head_of_department",
      as: "HOD",
    });
    Teacher.hasMany(Department, {
      foreignKey: "head_of_department",
      as: "headed_departments",
    });








    User.hasMany(Exam, { foreignKey: "created_by", as: "created_exams" });
    Exam.belongsTo(User, { foreignKey: "created_by", as: "creator" });
    ExamTemplate.hasMany(Exam, { foreignKey: "template_id", as: "exams" });
    Exam.belongsTo(ExamTemplate, { foreignKey: "template_id", as: "template" });
    Curriculum.hasMany(Exam, { foreignKey: "curriculum_id", as: "exams" });
    Exam.belongsTo(Curriculum, { foreignKey: "curriculum_id", as: "curriculum" });
    CurriculumClass.hasMany(Exam, { foreignKey: "curriculum_class_id", as: "exams" });
    Exam.belongsTo(CurriculumClass, { foreignKey: "curriculum_class_id", as: "curriculum_class" });
    CurriculumClassLevel.hasMany(Exam, { foreignKey: "curriculum_class_level_id", as: "exams" });
    Exam.belongsTo(CurriculumClassLevel, { foreignKey: "curriculum_class_level_id", as: "curriculum_class_level" });

    Teacher.hasMany(Exam, { foreignKey: "teacher_id", as: "invigilated_exams" });
    Exam.belongsTo(Teacher, { foreignKey: "teacher_id", as: "teacher" });

    Exam.hasMany(ExamQuestion, { foreignKey: "exam_id", as: "questions" });
    ExamQuestion.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

    Exam.hasMany(ExamAttempt, { foreignKey: "exam_id", as: "attempts" });
    ExamAttempt.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });

    Student.hasMany(ExamAttempt, {
      foreignKey: "student_id",
      as: "exam_attempts",
    });
    ExamAttempt.belongsTo(Student, { foreignKey: "student_id", as: "student" });

    Exam.hasMany(ExamScheduleLobbyEntry, {
      foreignKey: "exam_id",
      as: "lobby_entries",
    });
    ExamScheduleLobbyEntry.belongsTo(Exam, {
      foreignKey: "exam_id",
      as: "exam",
    });
    ExamScheduleLobbyEntry.belongsTo(User, { foreignKey: "user_id", as: "user" });
    ExamScheduleLobbyEntry.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    ExamScheduleLobbyEntry.belongsTo(User, { foreignKey: "admitted_by", as: "admitted_by_user" });
    ExamScheduleLobbyEntry.belongsTo(User, { foreignKey: "denied_by", as: "denied_by_user" });



    Exam.hasMany(ExamSubmission, {
      foreignKey: "exam_id",
      as: "submissions",
    });
    ExamSubmission.belongsTo(Exam, {
      foreignKey: "exam_id",
      as: "exam",
    });
    Student.hasMany(ExamSubmission, {
      foreignKey: "student_id",
      as: "exam_submissions",
    });
    ExamSubmission.belongsTo(Student, {
      foreignKey: "student_id",
      as: "student",
    });

    ExamSubmission.hasMany(ExamAnswer, {
      foreignKey: "submission_id",
      as: "answers",
    });
    ExamAnswer.belongsTo(ExamSubmission, {
      foreignKey: "submission_id",
      as: "submission",
    });
    ExamQuestion.hasMany(ExamAnswer, {
      foreignKey: "question_id",
      as: "exam_answers",
    });
    ExamAnswer.belongsTo(ExamQuestion, {
      foreignKey: "question_id",
      as: "question",
    });



    ExamAttempt.hasOne(ProctoringSession, {
      foreignKey: "exam_attempt_id",
      as: "proctoring_session",
    });
    ProctoringSession.belongsTo(ExamAttempt, {
      foreignKey: "exam_attempt_id",
      as: "exam_attempt",
    });




    ExamAttempt.hasMany(ExamSessionLog, {
      foreignKey: "exam_attempt_id",
      as: "session_logs",
    });
    ExamSessionLog.belongsTo(ExamAttempt, {
      foreignKey: "exam_attempt_id",
      as: "exam_attempt",
    });

    ExamQuestion.hasMany(ExamSessionLog, {
      foreignKey: "question_id",
      as: "session_logs",
    });
    ExamSessionLog.belongsTo(ExamQuestion, {
      foreignKey: "question_id",
      as: "question",
    });

    ProctoringSession.hasMany(ProctoringEvent, {
      foreignKey: "proctoring_session_id",
      as: "events",
    });
    ProctoringEvent.belongsTo(ProctoringSession, {
      foreignKey: "proctoring_session_id",
      as: "proctoring_session",
    });

    ProctoringSession.hasMany(ProctoringRecording, {
      foreignKey: "proctoring_session_id",
      as: "recordings",
    });
    ProctoringRecording.belongsTo(ProctoringSession, {
      foreignKey: "proctoring_session_id",
      as: "proctoring_session",
    });

    User.hasMany(ProctoringEvent, {
      foreignKey: "resolved_by",
      as: "resolved_proctoring_events",
    });
    ProctoringEvent.belongsTo(User, {
      foreignKey: "resolved_by",
      as: "resolver",
    });



    Student.hasMany(StudentExamResult, {
      foreignKey: "student_id",
      as: "exam_results",
    });
    StudentExamResult.belongsTo(Student, {
      foreignKey: "student_id",
      as: "student",
    });


    CurriculumSubject.hasMany(StudentExamResult, {
      foreignKey: "curriculum_subject_id",
      as: "student_exam_results",
    });
    StudentExamResult.belongsTo(CurriculumSubject, {
      foreignKey: "curriculum_subject_id",
      as: "curriculum_subject",
    });
    Exam.hasMany(StudentExamResult, {
      foreignKey: "exam_id",
      as: "student_exam_results",
    });
    StudentExamResult.belongsTo(Exam, {
      foreignKey: "exam_id",
      as: "exam",
    });

    Student.hasMany(ReportCard, { foreignKey: "student_id", as: "report_cards" });
    ReportCard.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    ReportCard.belongsTo(Curriculum, { foreignKey: "curriculum_id", as: "curriculum" });
    ReportCard.belongsTo(CurriculumClass, { foreignKey: "curriculum_class_id", as: "curriculum_class" });
    ReportCard.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });
    ReportCard.belongsTo(User, { foreignKey: "created_by", as: "creator" });
    ReportCard.hasMany(ReportCardLine, { foreignKey: "report_card_id", as: "lines" });
    ReportCardLine.belongsTo(ReportCard, { foreignKey: "report_card_id", as: "report_card" });
    ReportCardLine.belongsTo(Exam, { foreignKey: "exam_id", as: "exam" });
    ReportCardLine.belongsTo(StudentExamResult, {
      foreignKey: "student_exam_result_id",
      as: "student_exam_result",
    });



































    Curriculum.hasMany(FeeStructure, {
      foreignKey: "curriculum_id",
      as: "fee_structures",
    });
    FeeStructure.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });
    CurriculumClass.hasMany(FeeStructure, {
      foreignKey: "curriculum_class_id",
      as: "fee_structures",
    });
    FeeStructure.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });
    CurriculumClassLevel.hasMany(FeeStructure, {
      foreignKey: "curriculum_class_level_id",
      as: "fee_structures",
    });
    FeeStructure.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });

    Student.hasMany(FeeInvoice, { foreignKey: "student_id", as: "fee_invoices" });
    FeeInvoice.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    Parent.hasMany(FeeInvoice, { foreignKey: "parent_id", as: "fee_invoices" });
    FeeInvoice.belongsTo(Parent, { foreignKey: "parent_id", as: "parent" });
    Curriculum.hasMany(FeeInvoice, { foreignKey: "curriculum_id", as: "fee_invoices" });
    FeeInvoice.belongsTo(Curriculum, { foreignKey: "curriculum_id", as: "curriculum" });
    CurriculumClass.hasMany(FeeInvoice, { foreignKey: "curriculum_class_id", as: "fee_invoices" });
    FeeInvoice.belongsTo(CurriculumClass, { foreignKey: "curriculum_class_id", as: "curriculum_class" });
    CurriculumClassLevel.hasMany(FeeInvoice, {
      foreignKey: "curriculum_class_level_id",
      as: "fee_invoices",
    });
    FeeInvoice.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });
    FeeStructure.hasMany(FeeInvoice, { foreignKey: "fee_structure_id", as: "fee_invoices" });
    FeeInvoice.belongsTo(FeeStructure, { foreignKey: "fee_structure_id", as: "fee_structure" });

    FeeInvoice.hasMany(FeePayment, { foreignKey: "fee_invoice_id", as: "payments" });
    FeePayment.belongsTo(FeeInvoice, { foreignKey: "fee_invoice_id", as: "fee_invoice" });
    Student.hasMany(FeePayment, { foreignKey: "student_id", as: "fee_payments" });
    FeePayment.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    Parent.hasMany(FeePayment, { foreignKey: "parent_id", as: "fee_payments" });
    FeePayment.belongsTo(Parent, { foreignKey: "parent_id", as: "parent" });
    User.hasMany(FeePayment, { foreignKey: "recorded_by_user_id", as: "recorded_fee_payments" });
    FeePayment.belongsTo(User, { foreignKey: "recorded_by_user_id", as: "recorded_by_user" });
    CurriculumClassLevel.hasMany(FeePayment, {
      foreignKey: "curriculum_class_level_id",
      as: "fee_payments",
    });
    FeePayment.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });

    Student.hasMany(StudentLevelFeeCredit, { foreignKey: "student_id", as: "level_fee_credits" });
    StudentLevelFeeCredit.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    CurriculumClassLevel.hasMany(StudentLevelFeeCredit, {
      foreignKey: "curriculum_class_level_id",
      as: "student_fee_credits",
    });
    StudentLevelFeeCredit.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });

    FeeInvoice.hasMany(MpesaStkRequest, { foreignKey: "fee_invoice_id", as: "mpesa_stk_requests" });
    MpesaStkRequest.belongsTo(FeeInvoice, { foreignKey: "fee_invoice_id", as: "fee_invoice" });
    Parent.hasMany(MpesaStkRequest, { foreignKey: "parent_id", as: "mpesa_stk_requests" });
    MpesaStkRequest.belongsTo(Parent, { foreignKey: "parent_id", as: "parent" });
    User.hasMany(MpesaStkRequest, { foreignKey: "initiated_by_user_id", as: "mpesa_stk_requests" });
    MpesaStkRequest.belongsTo(User, { foreignKey: "initiated_by_user_id", as: "initiated_by_user" });
    FeePayment.hasOne(MpesaStkRequest, { foreignKey: "fee_payment_id", as: "mpesa_stk_request" });
    MpesaStkRequest.belongsTo(FeePayment, { foreignKey: "fee_payment_id", as: "fee_payment" });


    AcademicTerm.hasMany(Installment, {
      foreignKey: "term_id",
      as: "installments",
    });
    Installment.belongsTo(AcademicTerm, { foreignKey: "term_id", as: "term" });






    Student.hasMany(Installment, {
      foreignKey: "student_id",
      as: "installments",
    });
    Installment.belongsTo(Student, { foreignKey: "student_id", as: "student" });




















    Curriculum.hasMany(CurriculumClass, {
      foreignKey: "curriculum_id",
      as: "curriculum_classes",
    });
    CurriculumClass.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });

    Curriculum.hasMany(CurriculumSubject, {
      foreignKey: "curriculum_id",
      as: "curriculum_subjects",
    });
    CurriculumSubject.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });
    CurriculumClass.hasMany(CurriculumClassLevel, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class_levels",
    });
    CurriculumClassLevel.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });

    CurriculumClass.hasMany(CurriculumSubject, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_subjects",
    });
    CurriculumSubject.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });

    CurriculumClassLevel.hasMany(CurriculumSubject, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_subjects",
    });
    CurriculumSubject.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });


    Teacher.belongsToMany(Department, {
      through: TeacherDepartment,
      foreignKey: "teacher_id",
      otherKey: "department_id",
      as: "departments",
    });
    Department.belongsToMany(Teacher, {
      through: TeacherDepartment,
      foreignKey: "department_id",
      otherKey: "teacher_id",
      as: "staff_teachers",
    });

    Teacher.belongsToMany(Curriculum, {
      through: TeacherCurriculumJoin,
      foreignKey: "teacher_id",
      otherKey: "curriculum_id",
      as: "teaching_curricula",
    });
    Curriculum.belongsToMany(Teacher, {
      through: TeacherCurriculumJoin,
      foreignKey: "curriculum_id",
      otherKey: "teacher_id",
      as: "teachers",
    });

    Teacher.belongsToMany(CurriculumSubject, {
      through: TeacherCurriculumSubject,
      foreignKey: "teacher_id",
      otherKey: "curriculum_subject_id",
      as: "teaching_curriculum_subjects",
    });
    CurriculumSubject.belongsToMany(Teacher, {
      through: TeacherCurriculumSubject,
      foreignKey: "curriculum_subject_id",
      otherKey: "teacher_id",
      as: "teachers",
    });

    Teacher.belongsTo(CurriculumClass, {
      foreignKey: "class_teacher_curriculum_class_id",
      as: "homeroom_curriculum_class",
    });
    CurriculumClass.hasMany(Teacher, {
      foreignKey: "class_teacher_curriculum_class_id",
      as: "homeroom_teachers",
    });

    Teacher.belongsToMany(CurriculumClass, {
      through: TeacherTeachingCurriculumClass,
      foreignKey: "teacher_id",
      otherKey: "curriculum_class_id",
      as: "teaching_curriculum_classes",
    });
    CurriculumClass.belongsToMany(Teacher, {
      through: TeacherTeachingCurriculumClass,
      foreignKey: "curriculum_class_id",
      otherKey: "teacher_id",
      as: "teachers_teaching_classes",
    });

    CurriculumClass.hasMany(CurriculumClassTimetable, {
      foreignKey: "curriculum_class_id",
      as: "timetables",
    });
    CurriculumClassTimetable.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });
    CurriculumClassLevel.hasMany(CurriculumClassTimetable, {
      foreignKey: "curriculum_class_level_id",
      as: "timetables",
    });
    CurriculumClassTimetable.belongsTo(CurriculumClassLevel, {
      foreignKey: "curriculum_class_level_id",
      as: "curriculum_class_level",
    });
    CurriculumClassTimetable.hasMany(CurriculumClassTimetableLesson, {
      foreignKey: "timetable_id",
      as: "lessons",
      onDelete: "CASCADE",
    });
    CurriculumClassTimetableLesson.belongsTo(CurriculumClassTimetable, {
      foreignKey: "timetable_id",
      as: "timetable",
    });
    CurriculumClassTimetableLesson.belongsTo(CurriculumSubject, {
      foreignKey: "curriculum_subject_id",
      as: "curriculum_subject",
    });
    CurriculumClassTimetableLesson.belongsTo(Teacher, {
      foreignKey: "teacher_id",
      as: "teacher",
    });
    Teacher.hasMany(CurriculumClassTimetableLesson, {
      foreignKey: "teacher_id",
      as: "timetable_lessons",
    });
    CurriculumSubject.hasMany(CurriculumClassTimetableLesson, {
      foreignKey: "curriculum_subject_id",
      as: "timetable_lessons",
    });

    CurriculumClassTimetableLesson.hasMany(LiveClass, {
      foreignKey: "curriculum_class_timetable_lesson_id",
      as: "live_sessions",
    });
    LiveClass.belongsTo(CurriculumClassTimetableLesson, {
      foreignKey: "curriculum_class_timetable_lesson_id",
      as: "timetable_lesson",
    });

    CurriculumClassTimetableLesson.hasOne(LessonAttendanceRegister, {
      foreignKey: "curriculum_class_timetable_lesson_id",
      as: "attendance_register",
    });
    LessonAttendanceRegister.belongsTo(CurriculumClassTimetableLesson, {
      foreignKey: "curriculum_class_timetable_lesson_id",
      as: "lesson",
    });
    CurriculumClass.hasMany(LessonAttendanceRegister, {
      foreignKey: "curriculum_class_id",
      as: "lesson_attendance_registers",
    });
    LessonAttendanceRegister.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });
    LiveClass.hasMany(LessonAttendanceRegister, {
      foreignKey: "live_class_id",
      as: "attendance_registers",
    });
    LessonAttendanceRegister.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });
    User.hasMany(LessonAttendanceRegister, {
      foreignKey: "hosted_by_user_id",
      as: "hosted_lesson_attendance_registers",
    });
    LessonAttendanceRegister.belongsTo(User, {
      foreignKey: "hosted_by_user_id",
      as: "host",
    });
    LessonAttendanceRegister.belongsTo(User, {
      foreignKey: "finalized_by_user_id",
      as: "finalized_by",
    });
    LessonAttendanceRegister.hasMany(LessonAttendanceRegisterEntry, {
      foreignKey: "register_id",
      as: "entries",
    });
    LessonAttendanceRegisterEntry.belongsTo(LessonAttendanceRegister, {
      foreignKey: "register_id",
      as: "register",
    });
    Student.hasMany(LessonAttendanceRegisterEntry, {
      foreignKey: "student_id",
      as: "lesson_attendance_register_entries",
    });
    LessonAttendanceRegisterEntry.belongsTo(Student, {
      foreignKey: "student_id",
      as: "student",
    });
    LessonAttendanceRegisterEntry.belongsTo(User, {
      foreignKey: "marked_by_user_id",
      as: "marked_by",
    });

    CurriculumSubject.hasMany(CurriculumSubjectTopic, {
      foreignKey: "curriculum_subject_id",
      as: "topics",
    });
    CurriculumSubjectTopic.belongsTo(CurriculumSubject, {
      foreignKey: "curriculum_subject_id",
      as: "curriculum_subject",
    });
    CurriculumSubjectTopic.hasMany(CurriculumSubjectSubtopic, {
      foreignKey: "curriculum_subject_topic_id",
      as: "subtopics",
    });
    CurriculumSubjectSubtopic.belongsTo(CurriculumSubjectTopic, {
      foreignKey: "curriculum_subject_topic_id",
      as: "topic",
    });


    Curriculum.hasMany(SubjectGradingScale, {
      foreignKey: "curriculum_id",
      as: "subject_grading_scales",
    });
    SubjectGradingScale.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });
    CurriculumClass.hasMany(SubjectGradingScale, {
      foreignKey: "curriculum_class_id",
      as: "subject_grading_scales",
    });
    SubjectGradingScale.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });
    CurriculumSubject.hasMany(SubjectGradingScale, {
      foreignKey: "curriculum_subject_id",
      as: "grading_scales",
    });
    SubjectGradingScale.belongsTo(CurriculumSubject, {
      foreignKey: "curriculum_subject_id",
      as: "curriculum_subject",
    });

    Curriculum.hasMany(OverallGradingScale, {
      foreignKey: "curriculum_id",
      as: "overall_grading_scales",
    });
    OverallGradingScale.belongsTo(Curriculum, {
      foreignKey: "curriculum_id",
      as: "curriculum",
    });
    CurriculumClass.hasMany(OverallGradingScale, {
      foreignKey: "curriculum_class_id",
      as: "overall_grading_scales",
    });
    OverallGradingScale.belongsTo(CurriculumClass, {
      foreignKey: "curriculum_class_id",
      as: "curriculum_class",
    });





    User.hasMany(News, { foreignKey: "published_by", as: "published_news" });
    News.belongsTo(User, { foreignKey: "published_by", as: "publisher" });

    User.hasOne(PortalReview, { foreignKey: "user_id", as: "portal_review" });
    PortalReview.belongsTo(User, { foreignKey: "user_id", as: "user" });
    PortalReview.belongsTo(User, { foreignKey: "reviewed_by", as: "reviewer" });
    Student.hasOne(PortalReview, { foreignKey: "student_id", as: "portal_review" });
    PortalReview.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    Parent.hasOne(PortalReview, { foreignKey: "parent_id", as: "portal_review" });
    PortalReview.belongsTo(Parent, { foreignKey: "parent_id", as: "parent" });

    User.hasMany(SchoolEvent, {
      foreignKey: "created_by",
      as: "created_events",
    });
    SchoolEvent.belongsTo(User, { foreignKey: "created_by", as: "creator" });

    SchoolEvent.hasMany(EventLobbyEntry, { foreignKey: "event_id", as: "lobby_entries" });
    EventLobbyEntry.belongsTo(SchoolEvent, { foreignKey: "event_id", as: "event" });
    EventLobbyEntry.belongsTo(User, { foreignKey: "user_id", as: "user" });
    EventLobbyEntry.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    EventLobbyEntry.belongsTo(Parent, { foreignKey: "parent_id", as: "parent" });
    EventLobbyEntry.belongsTo(User, { foreignKey: "admitted_by", as: "admitted_by_user" });
    EventLobbyEntry.belongsTo(User, { foreignKey: "denied_by", as: "denied_by_user" });

    SchoolEvent.hasMany(EventLiveChat, { foreignKey: "event_id", as: "live_chats" });
    EventLiveChat.belongsTo(SchoolEvent, { foreignKey: "event_id", as: "event" });
    EventLiveChat.belongsTo(User, { foreignKey: "user_id", as: "author" });
    EventLiveChat.belongsTo(EventLiveChat, { foreignKey: "parent_id", as: "parent" });
    EventLiveChat.hasMany(EventLiveChat, { foreignKey: "parent_id", as: "replies" });

    SchoolEvent.hasMany(EventLiveReaction, { foreignKey: "event_id", as: "live_reactions" });
    EventLiveReaction.belongsTo(SchoolEvent, { foreignKey: "event_id", as: "event" });
    EventLiveReaction.belongsTo(User, { foreignKey: "user_id", as: "user" });

    SchoolEvent.hasMany(EventLiveHandRaise, { foreignKey: "event_id", as: "hand_raises" });
    EventLiveHandRaise.belongsTo(SchoolEvent, { foreignKey: "event_id", as: "event" });
    EventLiveHandRaise.belongsTo(User, { foreignKey: "user_id", as: "user" });
    EventLiveHandRaise.belongsTo(User, { foreignKey: "dismissed_by", as: "dismissed_by_user" });

    User.hasMany(AdminMeeting, { foreignKey: "created_by", as: "created_admin_meetings" });
    AdminMeeting.belongsTo(User, { foreignKey: "created_by", as: "creator" });
    AdminMeeting.belongsTo(User, { foreignKey: "updated_by", as: "updater" });

    AdminMeeting.hasMany(AdminMeetingLobbyEntry, { foreignKey: "meeting_id", as: "lobby_entries" });
    AdminMeetingLobbyEntry.belongsTo(AdminMeeting, { foreignKey: "meeting_id", as: "meeting" });
    AdminMeetingLobbyEntry.belongsTo(User, { foreignKey: "user_id", as: "user" });
    AdminMeetingLobbyEntry.belongsTo(User, { foreignKey: "admitted_by", as: "admitted_by_user" });
    AdminMeetingLobbyEntry.belongsTo(User, { foreignKey: "denied_by", as: "denied_by_user" });

    AdminMeeting.hasMany(AdminMeetingLiveChat, { foreignKey: "meeting_id", as: "live_chats" });
    AdminMeetingLiveChat.belongsTo(AdminMeeting, { foreignKey: "meeting_id", as: "meeting" });
    AdminMeetingLiveChat.belongsTo(User, { foreignKey: "user_id", as: "author" });
    AdminMeetingLiveChat.belongsTo(AdminMeetingLiveChat, { foreignKey: "parent_id", as: "parent" });
    AdminMeetingLiveChat.hasMany(AdminMeetingLiveChat, { foreignKey: "parent_id", as: "replies" });

    AdminMeeting.hasMany(AdminMeetingLiveReaction, { foreignKey: "meeting_id", as: "live_reactions" });
    AdminMeetingLiveReaction.belongsTo(AdminMeeting, { foreignKey: "meeting_id", as: "meeting" });
    AdminMeetingLiveReaction.belongsTo(User, { foreignKey: "user_id", as: "user" });

    AdminMeeting.hasMany(AdminMeetingLiveHandRaise, { foreignKey: "meeting_id", as: "hand_raises" });
    AdminMeetingLiveHandRaise.belongsTo(AdminMeeting, { foreignKey: "meeting_id", as: "meeting" });
    AdminMeetingLiveHandRaise.belongsTo(User, { foreignKey: "user_id", as: "user" });
    AdminMeetingLiveHandRaise.belongsTo(User, { foreignKey: "dismissed_by", as: "dismissed_by_user" });


    SchoolProfile.belongsTo(AcademicTerm, {
      foreignKey: "current_term_id",
      as: "current_term",
    });
    SchoolProfile.belongsTo(User, { foreignKey: "updated_by", as: "updater" });
    SchoolProfile.hasMany(ExamTemplate, {
      foreignKey: "school_profile_id",
      as: "exam_templates",
    });
    ExamTemplate.belongsTo(SchoolProfile, {
      foreignKey: "school_profile_id",
      as: "school_profile",
    });
    User.hasMany(ExamTemplate, { foreignKey: "created_by", as: "created_exam_templates" });
    ExamTemplate.belongsTo(User, { foreignKey: "created_by", as: "creator" });
    User.hasMany(ExamTemplate, { foreignKey: "updated_by", as: "updated_exam_templates" });
    ExamTemplate.belongsTo(User, { foreignKey: "updated_by", as: "updater" });




    User.hasMany(InAppNotification, {
      foreignKey: "user_id",
      as: "in_app_notifications",
    });
    InAppNotification.belongsTo(User, { foreignKey: "user_id", as: "user" });




























    Teacher.hasMany(LiveClass, {
      foreignKey: "teacher_id",
      as: "live_classes_hosted",
    });
    LiveClass.belongsTo(Teacher, { foreignKey: "teacher_id", as: "host" });

    LiveClass.hasMany(LiveClassRecording, {
      foreignKey: "live_class_id",
      as: "recordings",
    });
    LiveClassRecording.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });

    LiveClass.hasMany(LiveClassAttendance, {
      foreignKey: "live_class_id",
      as: "live_attendances",
    });
    LiveClassAttendance.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });
    Student.hasMany(LiveClassAttendance, {
      foreignKey: "student_id",
      as: "live_class_attendances",
    });
    LiveClassAttendance.belongsTo(Student, {
      foreignKey: "student_id",
      as: "student",
    });

    LiveClass.hasMany(LiveClassChat, {
      foreignKey: "live_class_id",
      as: "chat_messages",
    });
    LiveClassChat.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });
    User.hasMany(LiveClassChat, {
      foreignKey: "user_id",
      as: "live_class_chat_messages",
    });
    LiveClassChat.belongsTo(User, { foreignKey: "user_id", as: "author" });
    LiveClassChat.belongsTo(LiveClassChat, { foreignKey: "parent_id", as: "parent" });
    LiveClassChat.hasMany(LiveClassChat, { foreignKey: "parent_id", as: "replies" });

    LiveClass.hasMany(LiveClassHandRaise, {
      foreignKey: "live_class_id",
      as: "hand_raises",
    });
    LiveClassHandRaise.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });
    LiveClassHandRaise.belongsTo(User, { foreignKey: "user_id", as: "user" });
    User.hasMany(LiveClassHandRaise, {
      foreignKey: "user_id",
      as: "live_class_hand_raises",
    });

    LiveClass.hasMany(LiveClassReaction, {
      foreignKey: "live_class_id",
      as: "reactions",
    });
    LiveClassReaction.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });
    LiveClassReaction.belongsTo(User, { foreignKey: "user_id", as: "user" });
    User.hasMany(LiveClassReaction, {
      foreignKey: "user_id",
      as: "live_class_reactions",
    });

    LiveClass.hasMany(LiveClassLobbyEntry, {
      foreignKey: "live_class_id",
      as: "lobby_entries",
    });
    LiveClassLobbyEntry.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });
    LiveClassLobbyEntry.belongsTo(User, { foreignKey: "user_id", as: "user" });
    LiveClassLobbyEntry.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    LiveClassLobbyEntry.belongsTo(User, { foreignKey: "admitted_by", as: "admitted_by_user" });
    LiveClassLobbyEntry.belongsTo(User, { foreignKey: "denied_by", as: "denied_by_user" });
    User.hasMany(LiveClassLobbyEntry, { foreignKey: "user_id", as: "live_class_lobby_entries" });
    Student.hasMany(LiveClassLobbyEntry, { foreignKey: "student_id", as: "live_class_lobby_entries" });

    LiveClass.hasOne(LiveClassWhiteboard, {
      foreignKey: "live_class_id",
      as: "whiteboard",
    });
    LiveClassWhiteboard.belongsTo(LiveClass, {
      foreignKey: "live_class_id",
      as: "live_class",
    });

    Curriculum.hasMany(Assignment, { foreignKey: "curriculum_id", as: "assignments" });
    Assignment.belongsTo(Curriculum, { foreignKey: "curriculum_id", as: "curriculum" });
    CurriculumClass.hasMany(Assignment, { foreignKey: "curriculum_class_id", as: "assignments" });
    Assignment.belongsTo(CurriculumClass, { foreignKey: "curriculum_class_id", as: "curriculum_class" });
    CurriculumClassLevel.hasMany(Assignment, { foreignKey: "curriculum_class_level_id", as: "assignments" });
    Assignment.belongsTo(CurriculumClassLevel, { foreignKey: "curriculum_class_level_id", as: "curriculum_class_level" });
    CurriculumSubject.hasMany(Assignment, { foreignKey: "curriculum_subject_id", as: "assignments" });
    Assignment.belongsTo(CurriculumSubject, { foreignKey: "curriculum_subject_id", as: "curriculum_subject" });
    AcademicTerm.hasMany(Assignment, { foreignKey: "academic_term_id", as: "assignments" });
    Assignment.belongsTo(AcademicTerm, { foreignKey: "academic_term_id", as: "academic_term" });
    Teacher.hasMany(Assignment, { foreignKey: "teacher_id", as: "assignments" });
    Assignment.belongsTo(Teacher, { foreignKey: "teacher_id", as: "teacher" });
    User.hasMany(Assignment, { foreignKey: "created_by_user_id", as: "created_assignments" });
    Assignment.belongsTo(User, { foreignKey: "created_by_user_id", as: "creator" });

    Assignment.hasMany(AssignmentQuestion, { foreignKey: "assignment_id", as: "questions" });
    AssignmentQuestion.belongsTo(Assignment, { foreignKey: "assignment_id", as: "assignment" });

    Assignment.hasMany(AssignmentSubmission, { foreignKey: "assignment_id", as: "submissions" });
    AssignmentSubmission.belongsTo(Assignment, { foreignKey: "assignment_id", as: "assignment" });
    Student.hasMany(AssignmentSubmission, { foreignKey: "student_id", as: "assignment_submissions" });
    AssignmentSubmission.belongsTo(Student, { foreignKey: "student_id", as: "student" });
    User.hasMany(AssignmentSubmission, { foreignKey: "graded_by_user_id", as: "graded_assignment_submissions" });
    AssignmentSubmission.belongsTo(User, { foreignKey: "graded_by_user_id", as: "graded_by" });

    AssignmentSubmission.hasMany(AssignmentAnswer, { foreignKey: "submission_id", as: "answers" });
    AssignmentAnswer.belongsTo(AssignmentSubmission, { foreignKey: "submission_id", as: "submission" });
    AssignmentQuestion.hasMany(AssignmentAnswer, { foreignKey: "question_id", as: "answers" });
    AssignmentAnswer.belongsTo(AssignmentQuestion, { foreignKey: "question_id", as: "question" });

    User.hasMany(AuditTrail, { foreignKey: "user_id", as: "audit_trails", onDelete: "SET NULL" });
    AuditTrail.belongsTo(User, { foreignKey: "user_id", as: "user" });


    console.log("✅ All associations set up successfully");
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
    throw error;
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
