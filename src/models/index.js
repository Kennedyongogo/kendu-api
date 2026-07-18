const { sequelize } = require("../config/database");

// Import all models
const User = require("./user")(sequelize);
const AuditTrail = require("./auditTrail")(sequelize);
const Programme = require("./programme")(sequelize);
const ProgrammeHourDistribution = require("./programmeHourDistribution")(sequelize);
const ProgrammeModule = require("./programmeModule")(sequelize);
const ProgrammeFee = require("./programmeFee")(sequelize);
const ProgrammeSubjectRequirement = require("./programmeSubjectRequirement")(sequelize);
const AdmissionApplication = require("./admissionApplication")(sequelize);
const Music = require("./music")(sequelize);
const StudentFeeCharge = require("./studentFeeCharge")(sequelize);
const FeePayment = require("./feePayment")(sequelize);
const FeePaymentAllocation = require("./feePaymentAllocation")(sequelize);

const models = {
  User,
  AuditTrail,
  Programme,
  ProgrammeHourDistribution,
  ProgrammeModule,
  ProgrammeFee,
  ProgrammeSubjectRequirement,
  AdmissionApplication,
  Music,
  StudentFeeCharge,
  FeePayment,
  FeePaymentAllocation,
};

// Initialize models in correct order (parent tables first)
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");

    console.log("📋 Syncing parent tables...");
    await User.sync({ force: false, alter: true });
    // alter: true so new programme columns are applied to existing tables
    await Programme.sync({ force: false, alter: true });

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
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
