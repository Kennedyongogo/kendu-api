const { DataTypes } = require("sequelize");

/**
 * A single exam paper / sitting inside an ExamPeriod.
 * Overlaps are blocked within the same programme cohort.
 */
module.exports = (sequelize) => {
  const ExamSlot = sequelize.define(
    "ExamSlot",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      exam_period_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Paper / unit exam title",
      },
      unit_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      venue: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      ends_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "exam_slots",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["exam_period_id"] },
        { fields: ["starts_at"] },
        { fields: ["ends_at"] },
        { fields: ["unit_id"] },
      ],
    }
  );

  return ExamSlot;
};
