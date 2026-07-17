const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FeeStructure = sequelize.define(
    "FeeStructure",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curricula", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_classes", key: "id" },
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      term_fee_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      payment_breakdown: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [
          { phase: "first_half", amount: 0, items: [] },
          { phase: "second_half", amount: 0, items: [] },
        ],
        validate: {
          isTwoPhases(value) {
            if (!Array.isArray(value) || value.length !== 2) {
              throw new Error("payment_breakdown must have exactly 2 phases");
            }
            const phases = value.map((x) => String(x?.phase || "").trim());
            if (!phases.includes("first_half") || !phases.includes("second_half")) {
              throw new Error("payment_breakdown phases must be first_half and second_half");
            }
          },
          totalsMatchTermFee(value) {
            if (!Array.isArray(value)) return;
            const sum = value.reduce((acc, item) => acc + (parseFloat(item?.amount) || 0), 0);
            const total = parseFloat(this.term_fee_amount || 0);
            if (Math.abs(sum - total) > 0.01) {
              throw new Error("payment_breakdown total must equal term_fee_amount");
            }
          },
          itemsSumToPhase(value) {
            if (!Array.isArray(value)) return;
            for (const phase of value) {
              const items = Array.isArray(phase?.items) ? phase.items : [];
              const itemsTotal = items.reduce((acc, it) => acc + (parseFloat(it?.amount) || 0), 0);
              const phaseAmount = parseFloat(phase?.amount || 0);
              if (Math.abs(itemsTotal - phaseAmount) > 0.01) {
                throw new Error("Each phase items total must equal that phase amount");
              }
            }
          },
        },
      },
    },
    {
      tableName: "fee_structures",
      timestamps: true,
      underscored: true,
    }
  );

  return FeeStructure;
};
