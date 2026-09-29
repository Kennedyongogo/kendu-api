const { DataTypes } = require("sequelize");

/**
 * Each downloaded meal card gets its own unique QR code.
 * Only the newest card per student is "active"; older ones become "replaced".
 */
module.exports = (sequelize) => {
  const MealCard = sequelize.define(
    "MealCard",
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
      code: {
        type: DataTypes.STRING(48),
        allowNull: false,
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "active",
        validate: { isIn: [["active", "replaced", "revoked"]] },
      },
      issued_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      replaced_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "meal_cards",
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ["code"], name: "meal_cards_code_unique" },
        { fields: ["student_id", "status"], name: "meal_cards_student_status_idx" },
      ],
    }
  );

  return MealCard;
};
