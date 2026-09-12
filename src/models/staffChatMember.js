const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffChatMember = sequelize.define(
    "StaffChatMember",
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
      last_read_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "staff_chat_members",
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ["chat_id", "user_id"] },
        { fields: ["user_id"] },
      ],
    }
  );

  return StaffChatMember;
};
