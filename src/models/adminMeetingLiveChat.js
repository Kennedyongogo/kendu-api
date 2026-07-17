const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "AdminMeetingLiveChat",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      meeting_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "admin_meetings", key: "id" },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "admin_meeting_live_chats", key: "id" },
      },
      message: { type: DataTypes.TEXT, allowNull: false },
      sent_at: { type: DataTypes.DATE, allowNull: false },
      is_question: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_answered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: "admin_meeting_live_chats",
      timestamps: true,
      underscored: true,
    }
  );
};
