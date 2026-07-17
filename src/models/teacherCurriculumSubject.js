const { DataTypes } = require("sequelize");

/** Many-to-many: curriculum subject offerings a teacher teaches. */
module.exports = (sequelize) => {
  const TeacherCurriculumSubject = sequelize.define(
    "TeacherCurriculumSubject",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      teacher_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "teachers", key: "id" },
        onDelete: "CASCADE",
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_subjects", key: "id" },
        onDelete: "CASCADE",
      },
    },
    {
      tableName: "teacher_curriculum_subjects",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["teacher_id", "curriculum_subject_id"] }],
    }
  );

  return TeacherCurriculumSubject;
};
