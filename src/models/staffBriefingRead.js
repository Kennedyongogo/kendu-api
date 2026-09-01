const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const StaffBriefingRead = sequelize.define(
    "StaffBriefingRead",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      briefing_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      read_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "staff_briefing_reads",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["briefing_id", "user_id"],
          name: "staff_briefing_reads_briefing_user_unique",
        },
      ],
    }
  );

  return StaffBriefingRead;
};
