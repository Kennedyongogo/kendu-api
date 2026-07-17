const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "AdminMeetingLiveReaction",
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
      emoji: { type: DataTypes.STRING(16), allowNull: false },
    },
    {
      tableName: "admin_meeting_live_reactions",
      timestamps: true,
      underscored: true,
    }
  );
};
