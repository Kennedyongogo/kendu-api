const { DataTypes } = require("sequelize");

/** One-day change to a meal's serving window (e.g. lunch served late on a given date). */
module.exports = (sequelize) => {
  const MealPeriodOverride = sequelize.define(
    "MealPeriodOverride",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
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
      start_time: {
        type: DataTypes.STRING(5),
        allowNull: false,
      },
      end_time: {
        type: DataTypes.STRING(5),
        allowNull: false,
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "meal_period_overrides",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["service_date", "meal_code"],
          name: "meal_period_overrides_date_meal_unique",
        },
      ],
    }
  );

  return MealPeriodOverride;
};
