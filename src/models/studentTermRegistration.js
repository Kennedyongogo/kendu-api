const { DataTypes } = require("sequelize");

/** Records when a student officially starts a class term (unlocks the student portal). */
module.exports = (sequelize) => {
  const StudentTermRegistration = sequelize.define(
    "StudentTermRegistration",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
        onDelete: "CASCADE",
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
        onDelete: "CASCADE",
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
        onDelete: "CASCADE",
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_class_levels", key: "id" },
        onDelete: "CASCADE",
      },
      /** Calendar day the student clicked “Start term”. */
      started_on: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      /** Snapshot of the level schedule when the term was started. */
      term_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      term_end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "completed", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      completed_on: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      reason: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "term_start",
      },
      moved_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      previous_registration_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "student_term_registrations", key: "id" },
        onDelete: "SET NULL",
      },
    },
    {
      tableName: "student_term_registrations",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["student_id"] },
        { fields: ["curriculum_class_level_id"] },
        { fields: ["student_id", "status"] },
      ],
    }
  );

  return StudentTermRegistration;
};
