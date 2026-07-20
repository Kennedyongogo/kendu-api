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
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
