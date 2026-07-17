const { DataTypes } = require("sequelize");

/**
 * Subject offering for a curriculum. Optional link to global `subjects` catalog.
 * Optional `curriculum_class_id`: when set, offering is scoped to that class; when null, applies across the curriculum (or as default template per school rules).
 * Optional `curriculum_class_level_id`: when set, offering is scoped to that term (phase) inside the class; must match `curriculum_class_id`. Topics live on `CurriculumSubjectTopic`; subtopics on `CurriculumSubjectSubtopic`.
 */
module.exports = (sequelize) => {
  const CurriculumSubject = sequelize.define(
    "CurriculumSubject",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
        onDelete: "CASCADE",
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_classes", key: "id" },
        onDelete: "SET NULL",
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
        onDelete: "CASCADE",
      },
      subject_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "subjects", key: "id" },
        onDelete: "SET NULL",
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_core: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "curriculum_subjects",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["curriculum_id"], name: "curriculum_subjects_curriculum_idx" },
        { fields: ["curriculum_class_level_id"], name: "curriculum_subjects_level_idx" },
      ],
    }
  );

  return CurriculumSubject;
};
