const { DataTypes } = require("sequelize");

/**
 * History of student programme / year / semester placements.
 * Live pointer stays on users; this table is the transfer register.
 */
module.exports = (sequelize) => {
  const StudentAcademicHistory = sequelize.define(
    "StudentAcademicHistory",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "programmes", key: "id" },
        onDelete: "RESTRICT",
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      /** Calendar day this placement became active */
      started_on: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      completed_on: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "completed"),
        allowNull: false,
        defaultValue: "active",
      },
      reason: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "admission",
      },
      moved_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      previous_history_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "student_academic_histories", key: "id" },
        onDelete: "SET NULL",
      },
      notes: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      tableName: "student_academic_histories",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["student_id"] },
        { fields: ["programme_id", "year_of_study", "semester"] },
        { fields: ["student_id", "status"] },
        { fields: ["created_at"] },
      ],
    }
  );

  return StudentAcademicHistory;
};
