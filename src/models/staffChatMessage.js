const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffChatMessage = sequelize.define(
    "StaffChatMessage",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      chat_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "staff_chat_messages",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["chat_id", "created_at"] }],
    }
  );

  return StaffChatMessage;
};
