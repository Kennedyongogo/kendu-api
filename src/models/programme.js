const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Programme = sequelize.define(
    "Programme",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      duration: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      category: {
        type: DataTypes.ENUM("certificate", "diploma", "higher_diploma"),
        allowNull: true,
      },
      award: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      minimum_kcse_grade: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "Minimum KCSE mean grade required (e.g. C+, C, C-)",
      },
      mode: {
        type: DataTypes.ENUM("full_time", "part_time"),
        allowNull: true,
      },
      weeks_per_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      duration_years: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      semester_1_weeks: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      semester_1_period: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      semester_2_weeks: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      semester_2_period: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      break_mid_sem1: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      break_end_sem1: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      break_end_sem2: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      image: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "programmes",
      timestamps: true,
      underscored: true,
    }
  );

  return Programme;
};
