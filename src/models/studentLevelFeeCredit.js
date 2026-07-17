const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StudentLevelFeeCredit = sequelize.define(
    "StudentLevelFeeCredit",
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
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      credit_balance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "student_level_fee_credits",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["student_id", "curriculum_class_level_id"],
          name: "student_level_fee_credits_student_level_uniq",
        },
      ],
    }
  );

  return StudentLevelFeeCredit;
};
