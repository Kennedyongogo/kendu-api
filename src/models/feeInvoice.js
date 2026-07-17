const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FeeInvoice = sequelize.define(
    "FeeInvoice",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      invoice_number: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true,
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
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curricula", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_classes", key: "id" },
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      fee_structure_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "fee_structures", key: "id" },
      },
      term_fee_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      amount_due: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      amount_paid: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      balance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      payment_breakdown: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        field: "fee_snapshot_json",
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "draft",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "fee_invoices",
      timestamps: true,
      underscored: true,
    }
  );

  return FeeInvoice;
};
