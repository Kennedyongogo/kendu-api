const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const MpesaStkRequest = sequelize.define(
    "MpesaStkRequest",
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
      parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "parents", key: "id" },
      },
      initiated_by_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      phone_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      merchant_request_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      checkout_request_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      mpesa_receipt_number: {
        type: DataTypes.STRING(32),
        allowNull: true,
        unique: true,
      },
      fee_payment_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "fee_payments", key: "id" },
      },
      status: {
        type: DataTypes.STRING(24),
        allowNull: false,
        defaultValue: "pending",
      },
      result_code: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      result_desc: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      raw_callback: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "mpesa_stk_requests",
      timestamps: true,
      underscored: true,
    }
  );

  return MpesaStkRequest;
};
