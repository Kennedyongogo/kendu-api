const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AuditTrail = sequelize.define(
    "AuditTrail",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      action: {
        type: DataTypes.ENUM("create", "read", "update", "delete", "login", "logout", "other"),
        allowNull: false,
      },
      resource_type: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      resource_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("success", "failed"),
        allowNull: false,
        defaultValue: "success",
      },
      old_values: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      new_values: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      ip_address: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      tableName: "audit_trails",
      timestamps: true,
      underscored: true,
      updatedAt: false,
    }
  );

  return AuditTrail;
};
