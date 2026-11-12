const { DataTypes } = require("sequelize");

/**
 * Singleton settings for when the public "Apply for admission" window is open.
 * Apply is enabled when is_enabled is true AND now is between starts_at and ends_at.
 */
module.exports = (sequelize) => {
  const AdmissionSetting = sequelize.define(
    "AdmissionSetting",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      key: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "default",
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Master switch; dates only apply when true",
      },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      ends_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      closed_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Shown on the public site when applications are closed",
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "admission_settings",
      timestamps: true,
      underscored: true,
      // Unique via index — column-level unique+default makes Sequelize emit
      // invalid Postgres: ALTER COLUMN ... SET DEFAULT 'x' UNIQUE
      indexes: [{ unique: true, fields: ["key"], name: "admission_settings_key_unique" }],
    }
  );

  return AdmissionSetting;
};
