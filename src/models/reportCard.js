const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ReportCard = sequelize.define(
    "ReportCard",
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
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      title: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      total_marks_obtained: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0,
      },
      total_marks_possible: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      overall_grade: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      overall_remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pdf_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "report_cards",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["student_id"] }, { fields: ["curriculum_class_id"] }],
    }
  );

  return ReportCard;
};
