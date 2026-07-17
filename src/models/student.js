const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Student = sequelize.define(
    "Student",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      class_teacher_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "teachers", key: "id" },
      },
      admission_number: {
        type: DataTypes.STRING(20),
        unique: true,
        allowNull: false,
      },
      date_of_birth: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      gender: {
        type: DataTypes.ENUM("male", "female", "other"),
        allowNull: false,
      },
      /** Pathway / curriculum this student follows (FK). Kept in sync with `curriculum_class_id`. */
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curricula", key: "id" },
        onDelete: "SET NULL",
      },
      /** Current class band within that curriculum (FK to `curriculum_classes`). */
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_classes", key: "id" },
        onDelete: "SET NULL",
      },
      /** Term / level within class (fee billing, placement, and exams). */
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
        onDelete: "SET NULL",
      },
      enrollment_date: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW,
      },
      graduation_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      blood_group: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      medical_conditions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      emergency_contact_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      emergency_contact_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      is_alumni: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      account_status: {
        type: DataTypes.ENUM(
          "active",
          "pending_payment",
          "suspended",
          "deactivated",
          "expelled",
          "graduated",
          "withdrawn"
        ),
        defaultValue: "active",
      },
      account_status_updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      last_deactivation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      reactivation_required: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      profile_picture: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      tableName: "students",
      timestamps: true,
      underscored: true,
    }
  );

  return Student;
};
