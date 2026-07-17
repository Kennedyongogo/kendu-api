const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LiveClassAttendance",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      live_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "live_classes", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
      },
      join_time: { type: DataTypes.DATE, allowNull: true },
      leave_time: { type: DataTypes.DATE, allowNull: true },
      duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
      engagement_score: { type: DataTypes.INTEGER, allowNull: true },
      left_early: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
      tableName: "live_class_attendances",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["live_class_id", "student_id"] }],
    }
  );
};
