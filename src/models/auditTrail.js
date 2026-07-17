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
      },
      action: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      resource_type: {
        type: DataTypes.STRING(60),
        allowNull: false,
        defaultValue: "other",
      },
      resource_id: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("success", "failed", "pending"),
        allowNull: false,
        defaultValue: "success",
      },
      ip_address: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
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
    },
    {
      tableName: "audit_trails",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["user_id"] },
        { fields: ["action"] },
        { fields: ["resource_type"] },
        { fields: ["created_at"] },
      ],
    }
  );

  return AuditTrail;
};
