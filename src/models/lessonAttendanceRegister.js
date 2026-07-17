const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "LessonAttendanceRegister",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      curriculum_class_timetable_lesson_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_class_timetable_lessons", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
      },
      live_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "live_classes", key: "id" },
      },
      hosted_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "draft",
        validate: { isIn: [["draft", "finalized"]] },
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      finalized_at: { type: DataTypes.DATE, allowNull: true },
      finalized_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "lesson_attendance_registers",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "lar_lesson_id_uq", unique: true, fields: ["curriculum_class_timetable_lesson_id"] },
        { name: "idx_lesson_attendance_registers_class", fields: ["curriculum_class_id"] },
        { name: "lar_status_idx", fields: ["status"] },
      ],
    }
  );
};
