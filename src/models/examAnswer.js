const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ExamAnswer = sequelize.define(
    "ExamAnswer",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      submission_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exam_submissions", key: "id" },
      },
      question_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exam_questions", key: "id" },
      },
      answer_text: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      answer_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      marks_obtained: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
      },
      marker_comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "exam_answers",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["submission_id"] },
        { fields: ["question_id"] },
        { unique: true, fields: ["submission_id", "question_id"] },
      ],
    }
  );

  return ExamAnswer;
};
