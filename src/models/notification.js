const { DataTypes } = require("sequelize");

/** In-app notification shown in the student portal bell and the mobile app inbox. */
module.exports = (sequelize) => {
  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      read_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "notifications",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["user_id", "created_at"], name: "notifications_user_created_idx" },
        { fields: ["user_id", "read_at"], name: "notifications_user_read_idx" },
      ],
    }
  );

  return Notification;
};
