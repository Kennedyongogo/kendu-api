const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ExamSubmission = sequelize.define(
    "ExamSubmission",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      exam_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exams", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
      },
      status: {
        type: DataTypes.ENUM("draft", "submitted"),
        allowNull: false,
        defaultValue: "draft",
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      time_spent_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      pdf_answers_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      pdf_completed_file_path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pdf_auto_score: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      pdf_auto_grading_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "exam_submissions",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["exam_id"] }, { fields: ["student_id"] }],
    }
  );

  return ExamSubmission;
};
