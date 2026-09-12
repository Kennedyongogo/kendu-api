const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffChat = sequelize.define(
    "StaffChat",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      /** direct = 1:1, group = many members */
      type: {
        type: DataTypes.ENUM("direct", "group"),
        allowNull: false,
      },
      /** Display name for groups; unused for direct (derived from peer) */
      name: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      /** Sorted "userA:userB" for unique DMs */
      direct_key: {
        type: DataTypes.STRING(80),
        allowNull: true,
        unique: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: "staff_chats",
      timestamps: true,
      underscored: true,
    }
  );

  return StaffChat;
};
