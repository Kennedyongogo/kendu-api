const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "EventLiveChat",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      event_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "events", key: "id" },
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
        references: { model: "event_live_chats", key: "id" },
      },
    },
    { tableName: "event_live_chats", timestamps: true, underscored: true }
  );
};
