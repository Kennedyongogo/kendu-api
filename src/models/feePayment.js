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
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
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
      method: {
        type: DataTypes.ENUM("mpesa", "bank", "cash", "card", "other"),
        allowNull: false,
      },
      reference: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "confirmed", "failed", "reversed"),
        allowNull: false,
        defaultValue: "pending",
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      provider_request_id: {
        type: DataTypes.STRING(150),
        allowNull: true,
        unique: true,
      },
      provider_receipt: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
      },
      narrative: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      recorded_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      provider_payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "fee_payments",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["student_id", "status"] },
        { fields: ["paid_at"] },
        { fields: ["status", "paid_at"] },
      ],
    }
  );

  return FeePayment;
};
