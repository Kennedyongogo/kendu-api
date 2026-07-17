const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "GoogleMeetCredential",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      access_token: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      refresh_token: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      token_expiry: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      scope: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    { tableName: "google_meet_credentials", timestamps: true, underscored: true }
  );
};
