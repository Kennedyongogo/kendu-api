const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AssignmentQuestion = sequelize.define(
    "AssignmentQuestion",
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
      question_text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      question_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "short_text",
      },
      options: {
        type: DataTypes.JSONB,
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
      required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "assignment_questions",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["assignment_id"] }],
    }
  );

  return AssignmentQuestion;
};
