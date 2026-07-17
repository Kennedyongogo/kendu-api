const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProctoringEvent = sequelize.define(
    "ProctoringEvent",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      proctoring_session_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "proctoring_sessions", key: "id" },
      },
      event_type: {
        type: DataTypes.ENUM(
          "tab_switch",
          "window_blur",
          "copy_paste",
          "right_click",
          "face_not_detected",
          "multiple_faces",
          "face_turned",
          "object_detected",
          "audio_detected",
          "webcam_disconnected",
          "webcam_reconnected",
          "exam_paused",
          "exam_resumed"
        ),
        allowNull: false,
      },
      event_timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      severity: {
        type: DataTypes.ENUM("low", "medium", "high", "critical"),
        defaultValue: "medium",
      },
      details: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      screenshot_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      is_resolved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      resolved_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      admin_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "proctoring_events",
      timestamps: true,
      underscored: true,
    }
  );

  return ProctoringEvent;
};
