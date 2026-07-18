const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StudentFeeCharge = sequelize.define(
    "StudentFeeCharge",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      programme_fee_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(180),
        allowNull: false,
        defaultValue: "Semester fees",
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "KES",
      },
      status: {
        type: DataTypes.ENUM("active", "waived", "cancelled"),
        allowNull: false,
        defaultValue: "active",
      },
      charged_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "student_fee_charges",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["status"] },
        {
          unique: true,
          fields: ["student_id", "year_of_study", "semester"],
          name: "student_fee_charge_period_unique",
        },
      ],
    }
  );

  return StudentFeeCharge;
};
