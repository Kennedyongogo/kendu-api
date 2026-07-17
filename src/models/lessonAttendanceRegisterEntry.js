const { DataTypes } = require("sequelize");

const MARK_STATUSES = ["present", "absent", "late"];

module.exports = (sequelize) => {
  return sequelize.define(
    "LessonAttendanceRegisterEntry",
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      register_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "lesson_attendance_registers", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: true,
        validate: {
          isAllowedStatus(value) {
            if (value == null || value === "") return;
            if (!MARK_STATUSES.includes(String(value))) {
              throw new Error("Invalid attendance status");
            }
          },
        },
      },
      remarks: { type: DataTypes.STRING(500), allowNull: true },
      portal_joined: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      marked_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      marked_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: "lesson_attendance_register_entries",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "lare_register_student_uq", unique: true, fields: ["register_id", "student_id"] },
      ],
    }
  );
};

module.exports.MARK_STATUSES = MARK_STATUSES;