const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffChannelMessage = sequelize.define(
    "StaffChannelMessage",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      channel_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "staff_channel_messages",
      timestamps: true,
      underscored: true,
    }
  );

  return StaffChannelMessage;
};
