const { DataTypes } = require("sequelize");

/**
 * Single-row policy: how many times a student may download a meal card
 * within an admin-chosen date range. Outside the range downloads are not limited.
 */
module.exports = (sequelize) => {
  const MealDownloadPolicy = sequelize.define(
    "MealDownloadPolicy",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      max_downloads: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
      },
      start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "meal_download_policies",
      timestamps: true,
      underscored: true,
    }
  );

  return MealDownloadPolicy;
};
