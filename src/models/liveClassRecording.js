const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassRecording",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      live_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "live_classes", key: "id" },
      },
      recording_url: { type: DataTypes.STRING(500), allowNull: true },
      duration_seconds: { type: DataTypes.INTEGER, defaultValue: 0 },
      storage_path: { type: DataTypes.STRING(500), allowNull: true },
      processed: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "live_class_recordings", timestamps: true, underscored: true }
  );
};
