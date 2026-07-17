const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProctoringSession = sequelize.define(
    "ProctoringSession",
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
      session_start: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      session_end: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "paused", "ended", "interrupted"),
        defaultValue: "active",
      },
      webcam_stream_started: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      recording_started: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      recording_ended: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      total_violations: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      severity_level: {
        type: DataTypes.ENUM("low", "medium", "high", "critical"),
        defaultValue: "low",
      },
      final_verdict: {
        type: DataTypes.ENUM("clean", "warning", "flagged", "disqualified"),
        allowNull: true,
      },
    },
    {
      tableName: "proctoring_sessions",
      timestamps: true,
      underscored: true,
    }
  );

  return ProctoringSession;
};
