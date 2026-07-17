const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProctoringRecording = sequelize.define(
    "ProctoringRecording",
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
      recording_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      recording_type: {
        type: DataTypes.ENUM("webcam", "screen", "both"),
        defaultValue: "webcam",
      },
      file_size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      duration_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      storage_path: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      thumbnail_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      ai_analysis_status: {
        type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
        defaultValue: "pending",
      },
      ai_flags: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      chunk_number: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      is_final: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      tableName: "proctoring_recordings",
      timestamps: true,
      underscored: true,
    }
  );

  return ProctoringRecording;
};
