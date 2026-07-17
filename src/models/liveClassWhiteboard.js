const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassWhiteboard",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      live_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: "live_classes", key: "id" },
        onDelete: "CASCADE",
      },
      strokes: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
    },
    { tableName: "live_class_whiteboards", timestamps: true, underscored: true }
  );
};
