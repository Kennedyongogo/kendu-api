const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "ExamScheduleLobbyEntry",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      exam_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exams", key: "id" },
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
      tableName: "exam_schedule_lobby_entries",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["exam_id", "user_id"] }],
    }
  );
};
