const { DataTypes } = require("sequelize");

/** Many-to-many: curriculum class groups this teacher teaches (unrelated to homeroom FK on teachers). */
module.exports = (sequelize) => {
  const TeacherTeachingCurriculumClass = sequelize.define(
    "TeacherTeachingCurriculumClass",
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
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
        onDelete: "CASCADE",
      },
    },
    {
      tableName: "teacher_teaching_curriculum_classes",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["teacher_id", "curriculum_class_id"], name: "ttcc_teacher_curriculum_uniq" }],
    }
  );

  return TeacherTeachingCurriculumClass;
};
