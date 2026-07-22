const { DataTypes } = require("sequelize");

/**
 * One exam timetable plan per programme cohort window:
 * programme + year_of_study + semester + academic_year
 *
 * Lifecycle: draft → pending → approved | rejected
 * Students will only see slots once the period is approved (student portal later).
 */
module.exports = (sequelize) => {
  const ExamPeriod = sequelize.define(
    "ExamPeriod",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      academic_year: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'e.g. "2025/2026"',
      },
      period_start: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      period_end: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("draft", "pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "draft",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      submitted_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      approved_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "exam_periods",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["programme_id", "year_of_study", "semester", "academic_year"],
          name: "exam_periods_cohort_unique",
        },
        { fields: ["status"] },
        { fields: ["academic_year"] },
      ],
    }
  );

  return ExamPeriod;
};
