const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassLobbyEntry",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      live_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "live_classes", key: "id" },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "students", key: "id" },
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
    },
    {
      tableName: "live_class_lobby_entries",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["live_class_id", "user_id"] }],
    }
  );
};
