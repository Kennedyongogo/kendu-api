const { sequelize } = require("../config/database");

// Import all models
const User = require("./user")(sequelize);
const AuditTrail = require("./auditTrail")(sequelize);
const Department = require("./department")(sequelize);
const Programme = require("./programme")(sequelize);
const ProgrammeDepartment = require("./programmeDepartment")(sequelize);
const ProgrammeHourDistribution = require("./programmeHourDistribution")(sequelize);
const ProgrammeModule = require("./programmeModule")(sequelize);
const ProgrammeFee = require("./programmeFee")(sequelize);
const ProgrammeSubjectRequirement = require("./programmeSubjectRequirement")(sequelize);
const AdmissionApplication = require("./admissionApplication")(sequelize);
const Music = require("./music")(sequelize);
const StudentFeeCharge = require("./studentFeeCharge")(sequelize);
const FeePayment = require("./feePayment")(sequelize);
const FeePaymentAllocation = require("./feePaymentAllocation")(sequelize);
const TimetableEntry = require("./timetableEntry")(sequelize);
const Unit = require("./unit")(sequelize);
const StudentUnitRegistration = require("./studentUnitRegistration")(sequelize);
const AccessPolicy = require("./accessPolicy")(sequelize);
const Announcement = require("./announcement")(sequelize);
const ExamPeriod = require("./examPeriod")(sequelize);
const ExamSlot = require("./examSlot")(sequelize);
const StudentAcademicHistory = require("./studentAcademicHistory")(sequelize);
const StudentTranscript = require("./studentTranscript")(sequelize);
const StudentTranscriptLine = require("./studentTranscriptLine")(sequelize);
const StaffBriefing = require("./staffBriefing")(sequelize);
const StaffBriefingAttachment = require("./staffBriefingAttachment")(sequelize);
const StaffBriefingRead = require("./staffBriefingRead")(sequelize);
const StaffChannel = require("./staffChannel")(sequelize);
const StaffChannelMessage = require("./staffChannelMessage")(sequelize);
const LibraryBook = require("./libraryBook")(sequelize);
const LibraryRule = require("./libraryRule")(sequelize);
const LibraryLoan = require("./libraryLoan")(sequelize);
const LibraryElearning = require("./libraryElearning")(sequelize);
const LibraryService = require("./libraryService")(sequelize);

const models = {
  User,
  AuditTrail,
  Department,
  Programme,
  ProgrammeDepartment,
  ProgrammeHourDistribution,
  ProgrammeModule,
  ProgrammeFee,
  ProgrammeSubjectRequirement,
  AdmissionApplication,
  Music,
  StudentFeeCharge,
  FeePayment,
  FeePaymentAllocation,
  TimetableEntry,
  Unit,
  StudentUnitRegistration,
  AccessPolicy,
  Announcement,
  ExamPeriod,
  ExamSlot,
  StudentAcademicHistory,
  StudentTranscript,
  StudentTranscriptLine,
  StaffBriefing,
  StaffBriefingAttachment,
  StaffBriefingRead,
  StaffChannel,
  StaffChannelMessage,
  LibraryBook,
  LibraryRule,
  LibraryLoan,
  LibraryElearning,
  LibraryService,
};

// Initialize models in correct order (parent tables first)
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");

    console.log("📋 Syncing parent tables...");
    await Department.sync({ force: false, alter: true });
    await User.sync({ force: false, alter: true });
    // alter: true so new programme columns are applied to existing tables
    await Programme.sync({ force: false, alter: true });
    await ProgrammeDepartment.sync({ force: false, alter: true });

    // Migrate legacy programmes.department_id → programme_departments (if column still exists)
    try {
      await sequelize.query(`
        INSERT INTO programme_departments (id, programme_id, department_id, created_at, updated_at)
        SELECT gen_random_uuid(), p.id, p.department_id, NOW(), NOW()
        FROM programmes p
        WHERE p.department_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM programme_departments pd
            WHERE pd.programme_id = p.id AND pd.department_id = p.department_id
          )
      `);
    } catch (migrateError) {
      // Column may already be gone — safe to ignore
      if (!/department_id|does not exist|column/i.test(migrateError.message || "")) {
        console.warn("⚠️ Programme–department migration skipped:", migrateError.message);
      }
    }

    console.log("📋 Syncing child tables...");
    await AuditTrail.sync({ force: false, alter: false });
    await ProgrammeHourDistribution.sync({ force: false, alter: true });
    await ProgrammeModule.sync({ force: false, alter: true });
    await ProgrammeFee.sync({ force: false, alter: true });
    await ProgrammeSubjectRequirement.sync({ force: false, alter: true });
    await AdmissionApplication.sync({ force: false, alter: true });
    await Music.sync({ force: false, alter: true });
    await StudentFeeCharge.sync({ force: false, alter: true });
    await FeePayment.sync({ force: false, alter: true });
    await FeePaymentAllocation.sync({ force: false, alter: true });
    await TimetableEntry.sync({ force: false, alter: true });
    await Unit.sync({ force: false, alter: true });
    await StudentUnitRegistration.sync({ force: false, alter: true });
    await AccessPolicy.sync({ force: false, alter: true });
    await Announcement.sync({ force: false, alter: true });
    await ExamPeriod.sync({ force: false, alter: true });
    await ExamSlot.sync({ force: false, alter: true });
    await StudentAcademicHistory.sync({ force: false, alter: true });
    await StudentTranscript.sync({ force: false, alter: true });
    await StudentTranscriptLine.sync({ force: false, alter: true });
    await StaffBriefing.sync({ force: false, alter: true });
    await StaffBriefingAttachment.sync({ force: false, alter: true });
    await StaffBriefingRead.sync({ force: false, alter: true });
    await StaffChannel.sync({ force: false, alter: true });
    await StaffChannelMessage.sync({ force: false, alter: true });
    await LibraryBook.sync({ force: false, alter: true });
    await LibraryRule.sync({ force: false, alter: true });
    await LibraryLoan.sync({ force: false, alter: true });
    await LibraryElearning.sync({ force: false, alter: true });
    await LibraryService.sync({ force: false, alter: true });

    console.log("✅ All models synced successfully");
  } catch (error) {
    console.error("❌ Error syncing models:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      parent: error.parent?.message,
      original: error.original?.message,
      sql: error.sql,
    });
    throw error;
  }
};

const setupAssociations = () => {
  try {
    models.Programme.belongsToMany(models.Department, {
      through: models.ProgrammeDepartment,
      foreignKey: "programme_id",
      otherKey: "department_id",
      as: "departments",
    });
    models.Department.belongsToMany(models.Programme, {
      through: models.ProgrammeDepartment,
      foreignKey: "department_id",
      otherKey: "programme_id",
      as: "programmes",
    });
    models.ProgrammeDepartment.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.ProgrammeDepartment.belongsTo(models.Department, {
      foreignKey: "department_id",
      as: "department",
    });

    models.Department.hasMany(models.User, {
      foreignKey: "department_id",
      as: "staff",
      onDelete: "SET NULL",
    });
    models.User.belongsTo(models.Department, {
      foreignKey: "department_id",
      as: "department",
    });

    models.User.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.User, {
      foreignKey: "programme_id",
      as: "students",
      onDelete: "SET NULL",
    });

    models.AuditTrail.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
    models.User.hasMany(models.AuditTrail, {
      foreignKey: "user_id",
      as: "audit_trails",
    });

    models.Programme.hasMany(models.ProgrammeHourDistribution, {
      foreignKey: "programme_id",
      as: "hour_distributions",
      onDelete: "CASCADE",
    });
    models.ProgrammeHourDistribution.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });

    models.Programme.hasMany(models.ProgrammeModule, {
      foreignKey: "programme_id",
      as: "modules",
      onDelete: "CASCADE",
    });
    models.ProgrammeModule.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });

    models.Programme.hasMany(models.ProgrammeFee, {
      foreignKey: "programme_id",
      as: "fee_structure",
      onDelete: "CASCADE",
    });
    models.ProgrammeFee.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });

    models.User.hasMany(models.StudentFeeCharge, {
      foreignKey: "student_id",
      as: "fee_charges",
      onDelete: "RESTRICT",
    });
    models.StudentFeeCharge.belongsTo(models.User, {
      foreignKey: "student_id",
      as: "student",
    });
    models.Programme.hasMany(models.StudentFeeCharge, {
      foreignKey: "programme_id",
      as: "student_fee_charges",
      onDelete: "RESTRICT",
    });
    models.StudentFeeCharge.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.StudentFeeCharge.belongsTo(models.ProgrammeFee, {
      foreignKey: "programme_fee_id",
      as: "fee_structure",
    });

    models.User.hasMany(models.FeePayment, {
      foreignKey: "student_id",
      as: "fee_payments",
      onDelete: "RESTRICT",
    });
    models.FeePayment.belongsTo(models.User, {
      foreignKey: "student_id",
      as: "student",
    });
    models.FeePayment.belongsTo(models.User, {
      foreignKey: "recorded_by",
      as: "recorder",
    });

    models.FeePayment.hasMany(models.FeePaymentAllocation, {
      foreignKey: "payment_id",
      as: "allocations",
      onDelete: "CASCADE",
    });
    models.FeePaymentAllocation.belongsTo(models.FeePayment, {
      foreignKey: "payment_id",
      as: "payment",
    });
    models.StudentFeeCharge.hasMany(models.FeePaymentAllocation, {
      foreignKey: "charge_id",
      as: "allocations",
      onDelete: "RESTRICT",
    });
    models.FeePaymentAllocation.belongsTo(models.StudentFeeCharge, {
      foreignKey: "charge_id",
      as: "charge",
    });

    models.Programme.hasMany(models.ProgrammeSubjectRequirement, {
      foreignKey: "programme_id",
      as: "subject_requirements",
      onDelete: "CASCADE",
    });
    models.ProgrammeSubjectRequirement.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });

    models.Programme.hasMany(models.AdmissionApplication, {
      foreignKey: "programme_id",
      as: "admission_applications",
      onDelete: "RESTRICT",
    });
    models.AdmissionApplication.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });

    models.Programme.hasMany(models.TimetableEntry, {
      foreignKey: "programme_id",
      as: "timetable_entries",
      onDelete: "CASCADE",
    });
    models.TimetableEntry.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.TimetableEntry.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });

    models.Unit.belongsTo(models.Department, {
      foreignKey: "department_id",
      as: "department",
    });
    models.Department.hasMany(models.Unit, {
      foreignKey: "department_id",
      as: "units",
      onDelete: "RESTRICT",
    });
    models.Unit.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.Unit, {
      foreignKey: "programme_id",
      as: "units",
      onDelete: "RESTRICT",
    });
    models.Unit.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    models.Unit.belongsTo(models.User, {
      foreignKey: "approved_by",
      as: "approver",
    });
    models.User.hasMany(models.Unit, {
      foreignKey: "created_by",
      as: "created_units",
    });

    models.StudentUnitRegistration.belongsTo(models.User, {
      foreignKey: "student_id",
      as: "student",
    });
    models.User.hasMany(models.StudentUnitRegistration, {
      foreignKey: "student_id",
      as: "unit_registrations",
      onDelete: "CASCADE",
    });
    models.StudentUnitRegistration.belongsTo(models.Unit, {
      foreignKey: "unit_id",
      as: "unit",
    });
    models.Unit.hasMany(models.StudentUnitRegistration, {
      foreignKey: "unit_id",
      as: "registrations",
      onDelete: "RESTRICT",
    });

    models.AccessPolicy.belongsTo(models.User, {
      foreignKey: "updated_by",
      as: "updater",
    });

    models.Announcement.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "author",
    });
    models.User.hasMany(models.Announcement, {
      foreignKey: "created_by",
      as: "announcements",
    });

    models.ExamPeriod.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.ExamPeriod, {
      foreignKey: "programme_id",
      as: "exam_periods",
      onDelete: "RESTRICT",
    });
    models.ExamPeriod.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    models.ExamPeriod.belongsTo(models.User, {
      foreignKey: "submitted_by",
      as: "submitter",
    });
    models.ExamPeriod.belongsTo(models.User, {
      foreignKey: "approved_by",
      as: "approver",
    });
    models.ExamPeriod.hasMany(models.ExamSlot, {
      foreignKey: "exam_period_id",
      as: "slots",
      onDelete: "CASCADE",
    });
    models.ExamSlot.belongsTo(models.ExamPeriod, {
      foreignKey: "exam_period_id",
      as: "period",
    });
    models.ExamSlot.belongsTo(models.Unit, {
      foreignKey: "unit_id",
      as: "unit",
    });
    models.ExamSlot.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });

    models.StudentAcademicHistory.belongsTo(models.User, {
      foreignKey: "student_id",
      as: "student",
    });
    models.User.hasMany(models.StudentAcademicHistory, {
      foreignKey: "student_id",
      as: "academic_histories",
      onDelete: "CASCADE",
    });
    models.StudentAcademicHistory.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.StudentAcademicHistory, {
      foreignKey: "programme_id",
      as: "academic_histories",
      onDelete: "RESTRICT",
    });
    models.StudentAcademicHistory.belongsTo(models.User, {
      foreignKey: "moved_by_user_id",
      as: "moved_by_user",
    });
    models.StudentAcademicHistory.belongsTo(models.StudentAcademicHistory, {
      foreignKey: "previous_history_id",
      as: "previous_history",
    });

    models.StudentTranscript.belongsTo(models.User, {
      foreignKey: "student_id",
      as: "student",
    });
    models.User.hasMany(models.StudentTranscript, {
      foreignKey: "student_id",
      as: "transcripts",
      onDelete: "CASCADE",
    });
    models.StudentTranscript.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.StudentTranscript, {
      foreignKey: "programme_id",
      as: "transcripts",
      onDelete: "RESTRICT",
    });
    models.StudentTranscript.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
    models.StudentTranscript.belongsTo(models.User, {
      foreignKey: "issued_by",
      as: "issuer",
    });
    models.StudentTranscript.hasMany(models.StudentTranscriptLine, {
      foreignKey: "transcript_id",
      as: "lines",
      onDelete: "CASCADE",
    });
    models.StudentTranscriptLine.belongsTo(models.StudentTranscript, {
      foreignKey: "transcript_id",
      as: "transcript",
    });
    models.StudentTranscriptLine.belongsTo(models.Unit, {
      foreignKey: "unit_id",
      as: "unit",
    });
    models.StudentTranscriptLine.belongsTo(models.StudentUnitRegistration, {
      foreignKey: "registration_id",
      as: "registration",
    });

    models.StaffBriefing.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "author",
    });
    models.User.hasMany(models.StaffBriefing, {
      foreignKey: "created_by",
      as: "staff_briefings",
    });
    models.StaffBriefing.belongsTo(models.Department, {
      foreignKey: "department_id",
      as: "department",
    });
    models.Department.hasMany(models.StaffBriefing, {
      foreignKey: "department_id",
      as: "staff_briefings",
    });
    models.StaffBriefing.hasMany(models.StaffBriefingAttachment, {
      foreignKey: "briefing_id",
      as: "attachments",
      onDelete: "CASCADE",
    });
    models.StaffBriefingAttachment.belongsTo(models.StaffBriefing, {
      foreignKey: "briefing_id",
      as: "briefing",
    });
    models.StaffBriefing.hasMany(models.StaffBriefingRead, {
      foreignKey: "briefing_id",
      as: "reads",
      onDelete: "CASCADE",
    });
    models.StaffBriefingRead.belongsTo(models.StaffBriefing, {
      foreignKey: "briefing_id",
      as: "briefing",
    });
    models.StaffBriefingRead.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });

    models.StaffChannel.belongsTo(models.Department, {
      foreignKey: "department_id",
      as: "department",
    });
    models.Department.hasMany(models.StaffChannel, {
      foreignKey: "department_id",
      as: "staff_channels",
    });
    models.StaffChannel.hasMany(models.StaffChannelMessage, {
      foreignKey: "channel_id",
      as: "messages",
      onDelete: "CASCADE",
    });
    models.StaffChannelMessage.belongsTo(models.StaffChannel, {
      foreignKey: "channel_id",
      as: "channel",
    });
    models.StaffChannelMessage.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "author",
    });
    models.User.hasMany(models.StaffChannelMessage, {
      foreignKey: "user_id",
      as: "staff_channel_messages",
    });

    models.LibraryBook.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.LibraryBook, {
      foreignKey: "programme_id",
      as: "library_books",
      onDelete: "RESTRICT",
    });
    models.LibraryBook.hasMany(models.LibraryLoan, {
      foreignKey: "book_id",
      as: "loans",
      onDelete: "RESTRICT",
    });
    models.LibraryLoan.belongsTo(models.LibraryBook, {
      foreignKey: "book_id",
      as: "book",
    });
    models.LibraryLoan.belongsTo(models.User, {
      foreignKey: "borrower_id",
      as: "borrower",
    });
    models.User.hasMany(models.LibraryLoan, {
      foreignKey: "borrower_id",
      as: "library_loans",
    });
    models.LibraryLoan.belongsTo(models.User, {
      foreignKey: "issued_by",
      as: "issuer",
    });
    models.LibraryElearning.belongsTo(models.Programme, {
      foreignKey: "programme_id",
      as: "programme",
    });
    models.Programme.hasMany(models.LibraryElearning, {
      foreignKey: "programme_id",
      as: "library_elearning",
      onDelete: "SET NULL",
    });
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
