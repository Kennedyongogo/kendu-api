const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassReaction",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      live_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "live_classes", key: "id" },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      emoji: { type: DataTypes.STRING(16), allowNull: false },
    },
    {
      tableName: "live_class_reactions",
      timestamps: true,
      updatedAt: false,
      underscored: true,
    }
  );
};
