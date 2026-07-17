const { sequelize } = require("../config/database");

// Import all models
const User = require("./user")(sequelize);
const AuditTrail = require("./auditTrail")(sequelize);
const Programme = require("./programme")(sequelize);

const models = {
  User,
  AuditTrail,
  Programme,
};

// Initialize models in correct order (parent tables first)
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");

    // Use alter: false to prevent schema conflicts in production
    console.log("📋 Syncing parent tables...");
    await User.sync({ force: false, alter: false });
    await Programme.sync({ force: false, alter: false });

    console.log("📋 Syncing child tables...");
    await AuditTrail.sync({ force: false, alter: false });

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
    models.AuditTrail.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
    models.User.hasMany(models.AuditTrail, {
      foreignKey: "user_id",
      as: "audit_trails",
    });
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
