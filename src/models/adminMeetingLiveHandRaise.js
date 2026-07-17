const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "AdminMeetingLiveHandRaise",
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
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "raised",
        validate: { isIn: [["raised", "lowered", "dismissed"]] },
      },
      raised_at: { type: DataTypes.DATE, allowNull: false },
      lowered_at: { type: DataTypes.DATE, allowNull: true },
      dismissed_at: { type: DataTypes.DATE, allowNull: true },
      dismissed_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "admin_meeting_live_hand_raises",
      timestamps: true,
      underscored: true,
    }
  );
};
