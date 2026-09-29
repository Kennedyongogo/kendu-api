const { DataTypes } = require("sequelize");

/** Audit of every meal card PDF download (counted against the download limit). */
module.exports = (sequelize) => {
  const MealCardDownload = sequelize.define(
    "MealCardDownload",
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
      card_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      downloaded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      ip_address: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: "meal_card_downloads",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["student_id", "downloaded_at"], name: "meal_card_downloads_student_idx" }],
    }
  );

  return MealCardDownload;
};
