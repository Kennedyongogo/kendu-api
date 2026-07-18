const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FeePaymentAllocation = sequelize.define(
    "FeePaymentAllocation",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      payment_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      charge_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
    },
    {
      tableName: "fee_payment_allocations",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["payment_id", "charge_id"],
          name: "fee_payment_allocation_unique",
        },
      ],
    }
  );

  return FeePaymentAllocation;
};
