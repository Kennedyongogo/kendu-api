const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "AdminMeetingLobbyEntry",
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
        defaultValue: "waiting",
        validate: { isIn: [["waiting", "admitted", "denied", "left"]] },
      },
      requested_at: { type: DataTypes.DATE, allowNull: false },
      admitted_at: { type: DataTypes.DATE, allowNull: true },
      admitted_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      denied_at: { type: DataTypes.DATE, allowNull: true },
      denied_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      left_at: { type: DataTypes.DATE, allowNull: true },
      duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: "admin_meeting_lobby_entries",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["meeting_id", "user_id"] }],
    }
  );
};
