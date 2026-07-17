const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FeePayment = sequelize.define(
    "FeePayment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      fee_invoice_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "fee_invoices", key: "id" },
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "students", key: "id" },
      },
      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "parents", key: "id" },
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      applied_to_invoice: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      excess_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      payment_method: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "manual",
      },
      reference: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      paid_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      recorded_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        field: "recorded_by",
        references: { model: "users", key: "id" },
      },
      receipt_number: {
        type: DataTypes.STRING(40),
        allowNull: true,
        unique: true,
      },
    },
    {
      tableName: "fee_payments",
      timestamps: true,
      underscored: true,
    }
  );

  return FeePayment;
};
