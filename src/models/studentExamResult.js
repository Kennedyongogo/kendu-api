const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StudentExamResult = sequelize.define(
    "StudentExamResult",
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
      },

      exam_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "exams", key: "id" },
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_subjects", key: "id" },
      },

      marks_obtained: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      marks: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
      },
      total_marks: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      grade_letter: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      grade: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      grade_remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      graded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      graded_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      points: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: true,
      },
    },
    {
      tableName: "student_exam_results",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["student_id", "exam_id", "curriculum_subject_id"],
          name: "student_exam_results_student_exam_subject_unique",
        },
      ],
    }
  );

  return StudentExamResult;
};
