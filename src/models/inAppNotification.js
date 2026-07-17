const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "InAppNotification",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      title: { type: DataTypes.STRING(200), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      type: {
        type: DataTypes.ENUM("info", "warning", "success", "error"),
        defaultValue: "info",
      },
      action_url: { type: DataTypes.STRING(500), allowNull: true },
      is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
      read_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "in_app_notifications", timestamps: true, underscored: true }
  );
};
