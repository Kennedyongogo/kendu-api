const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AssignmentSubmission = sequelize.define(
    "AssignmentSubmission",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      assignment_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "assignments", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "draft",
        validate: {
          isIn: [["draft", "submitted"]],
        },
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
      pdf_answers_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      total_score: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      marker_feedback: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      graded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      graded_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      marks_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "assignment_submissions",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["assignment_id"] },
        { fields: ["student_id"] },
      ],
    }
  );

  return AssignmentSubmission;
};
