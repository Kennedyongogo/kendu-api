const { DataTypes } = require("sequelize");

/**
 * One row per student per meal per day, whether served by QR scan or manual mark.
 * Servings belong to the student (not the card) so history carries over to new cards.
 */
module.exports = (sequelize) => {
  const MealServing = sequelize.define(
    "MealServing",
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
      service_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      meal_code: {
        type: DataTypes.STRING(1),
        allowNull: false,
        validate: { isIn: [["B", "L", "S"]] },
      },
      served_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      method: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "qr",
        validate: { isIn: [["qr", "manual"]] },
      },
      served_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      note: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: "meal_servings",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["student_id", "service_date", "meal_code"],
          name: "meal_servings_student_date_meal_unique",
        },
        { fields: ["service_date", "meal_code"], name: "meal_servings_date_meal_idx" },
      ],
    }
  );

  return MealServing;
};
