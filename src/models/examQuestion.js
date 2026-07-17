const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ExamQuestion = sequelize.define(
    "ExamQuestion",
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
      question_text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      question_type: {
        type: DataTypes.ENUM(
          "multiple_choice",
          "multi_select",
          "true_false",
          "essay",
          "short_text",
          "long_text",
          "number",
          "diagram_label",
          "file_upload"
        ),
        allowNull: false,
      },
      options: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      correct_answer: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      marks: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      order_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      explanation: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      canvas_x: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 40,
      },
      canvas_y: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 120,
      },
      canvas_w: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 520,
      },
      canvas_h: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 26,
      },
      canvas_page: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "exam_questions",
      timestamps: true,
      underscored: true,
    }
  );

  return ExamQuestion;
};
