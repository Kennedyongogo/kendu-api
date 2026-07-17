const { DataTypes } = require("sequelize");

const ASSIGNMENT_TYPES = ["questions", "pdf_form"];
const ASSIGNMENT_STATUSES = ["draft", "published", "archived"];

module.exports = (sequelize) => {
  const Assignment = sequelize.define(
    "Assignment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      assignment_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "questions",
        validate: {
          isIn: [ASSIGNMENT_TYPES],
        },
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "draft",
        validate: {
          isIn: [ASSIGNMENT_STATUSES],
        },
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curricula", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_classes", key: "id" },
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_subjects", key: "id" },
      },
      academic_term_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "academic_terms", key: "id" },
      },
      teacher_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "teachers", key: "id" },
      },
      created_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      assigned_student_ids: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      due_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      published_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      pdf_template_path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "assignments",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["curriculum_class_id"] },
        { fields: ["teacher_id"] },
        { fields: ["status"] },
      ],
    }
  );

  return Assignment;
};
