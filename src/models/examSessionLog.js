const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ExamSessionLog = sequelize.define(
    "ExamSessionLog",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      exam_attempt_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exam_attempts", key: "id" },
      },
      event_type: {
        type: DataTypes.ENUM(
          "session_start",
          "session_pause",
          "session_resume",
          "session_presence",
          "question_view",
          "answer_saved",
          "auto_save",
          "warning_issued",
          "violation_detected",
          "session_end",
          "session_submit",
          "auto_submit",
          "manual_submit"
        ),
        allowNull: false,
      },
      event_timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      event_data: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      cumulative_time_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      remaining_time_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      question_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "exam_questions", key: "id" },
      },
    },
    {
      tableName: "exam_session_logs",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["exam_attempt_id", "event_timestamp"] }],
    }
  );

  return ExamSessionLog;
};
