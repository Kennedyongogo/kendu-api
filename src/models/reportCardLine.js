const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ReportCardLine = sequelize.define(
    "ReportCardLine",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      report_card_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "report_cards", key: "id" },
      },
      exam_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "exams", key: "id" },
      },
      student_exam_result_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "student_exam_results", key: "id" },
      },
      exam_title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      marks_obtained: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      total_marks: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      grade: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "report_card_lines",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["report_card_id"] }],
    }
  );

  return ReportCardLine;
};
