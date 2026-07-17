const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "AdminMeeting",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      start_time: { type: DataTypes.DATE, allowNull: false },
      end_time: { type: DataTypes.DATE, allowNull: false },
      timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "Africa/Nairobi" },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "scheduled",
        validate: { isIn: [["scheduled", "live", "ended", "cancelled"]] },
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      live_meeting_id: { type: DataTypes.STRING(120), allowNull: true },
      live_platform: { type: DataTypes.STRING(20), allowNull: true, defaultValue: "livekit" },
      session_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "scheduled",
        validate: { isIn: [["scheduled", "live", "ended", "cancelled"]] },
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "admin_meetings",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["start_time"] }, { fields: ["created_by"] }],
    }
  );
};
