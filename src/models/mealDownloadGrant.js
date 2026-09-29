const { DataTypes } = require("sequelize");

/**
 * Extra downloads an admin allows a student beyond the policy limit.
 * Tied to the policy date range active when granted, so grants don't leak into later ranges.
 */
module.exports = (sequelize) => {
  const MealDownloadGrant = sequelize.define(
    "MealDownloadGrant",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      extra_downloads: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      range_start: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      range_end: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      granted_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "meal_download_grants",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["student_id", "range_start", "range_end"], name: "meal_download_grants_student_range_idx" }],
    }
  );

  return MealDownloadGrant;
};
