const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassChat",
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
      message: { type: DataTypes.TEXT, allowNull: false },
      sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      is_question: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_answered: { type: DataTypes.BOOLEAN, defaultValue: false },
      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "live_class_chats", key: "id" },
      },
    },
    { tableName: "live_class_chats", timestamps: true, underscored: true }
  );
};
