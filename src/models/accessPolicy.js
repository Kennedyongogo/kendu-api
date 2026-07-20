const { DataTypes } = require("sequelize");

/**
 * School access gates tied to fee payment progress.
 * e.g. units enrollment requires paying X% of fees.
 * Future: meals, exams.
 */
module.exports = (sequelize) => {
  const AccessPolicy = sequelize.define(
    "AccessPolicy",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      feature: {
        type: DataTypes.STRING(40),
        allowNull: false,
        comment: "units | meals | exams",
      },
      min_fee_percent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Minimum % of total fees paid to unlock this feature (0–100)",
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "access_policies",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["feature"],
          name: "access_policies_feature_unique",
        },
      ],
    }
  );

  return AccessPolicy;
};
