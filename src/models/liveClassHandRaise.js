const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassHandRaise",
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
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "raised",
        validate: { isIn: [["raised", "lowered", "dismissed"]] },
      },
      raised_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      lowered_at: { type: DataTypes.DATE, allowNull: true },
      dismissed_at: { type: DataTypes.DATE, allowNull: true },
      dismissed_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    { tableName: "live_class_hand_raises", timestamps: true, underscored: true }
  );
};
