const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Installment = sequelize.define(
    "Installment",
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
      academic_year_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "academic_years", key: "id" },
      },
      term_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "academic_terms", key: "id" },
      },
      installment_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      total_installments: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      due_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      paid_amount: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      balance: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      status: {
        type: DataTypes.ENUM("pending", "partial", "paid", "overdue", "cancelled"),
        defaultValue: "pending",
      },
      late_fee: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      late_fee_paid: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      grace_days: {
        type: DataTypes.INTEGER,
        defaultValue: 7,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "installments",
      timestamps: true,
      underscored: true,
      indexes: [{ unique: true, fields: ["student_id", "term_id", "installment_number"] }],
    }
  );

  return Installment;
};
