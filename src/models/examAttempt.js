const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ExamAttempt = sequelize.define(
    "ExamAttempt",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      exam_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exams", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
      },
      start_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      end_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      time_spent_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "in_progress",
          "paused",
          "completed",
          "flagged",
          "cancelled"
        ),
        defaultValue: "pending",
      },
      total_score: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      percentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      is_passed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      device_info: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      webcam_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      tab_switch_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      warning_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      is_cancelled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      cancellation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      last_activity_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      /** Client heartbeat / focus signal; not the same as row `status`. */
      client_presence_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "exam_attempts",
      timestamps: true,
      underscored: true,
    }
  );

  return ExamAttempt;
};
