const { DataTypes } = require("sequelize");

/**
 * One class register: a lecturer taking attendance for a programme cohort
 * (year of study + semester) at a given date and time.
 */
module.exports = (sequelize) => {
  const AttendanceSession = sequelize.define(
    "AttendanceSession",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      taken_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      // Snapshot so saved registers and PDFs keep the name if the programme is renamed.
      programme_name: {
        type: DataTypes.STRING(150),
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
      session_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      start_time: {
        type: DataTypes.STRING(5),
        allowNull: false,
      },
      end_time: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      unit_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      present_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      absent_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "attendance_sessions",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["taken_by", "session_date"], name: "attendance_sessions_taken_by_date_idx" },
        {
          fields: ["programme_id", "year_of_study", "semester", "session_date"],
          name: "attendance_sessions_cohort_date_idx",
        },
      ],
    }
  );

  return AttendanceSession;
};
