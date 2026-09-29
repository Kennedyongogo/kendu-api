const { DataTypes } = require("sequelize");

/**
 * Default daily serving window for each meal (B = breakfast, L = lunch, S = supper).
 * Times are school-local "HH:MM" strings so they compare lexicographically.
 */
module.exports = (sequelize) => {
  const MealPeriod = sequelize.define(
    "MealPeriod",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      meal_code: {
        type: DataTypes.STRING(1),
        allowNull: false,
        validate: { isIn: [["B", "L", "S"]] },
      },
      name: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      start_time: {
        type: DataTypes.STRING(5),
        allowNull: false,
      },
      end_time: {
        type: DataTypes.STRING(5),
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "meal_periods",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["meal_code"], name: "meal_periods_meal_code_unique" }],
    }
  );

  return MealPeriod;
};
