const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProgrammeHourDistribution = sequelize.define(
    "ProgrammeHourDistribution",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      nature: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      specific_nature: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      year_1_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      year_2_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      year_3_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_hours: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "programme_hour_distributions",
      timestamps: true,
      underscored: true,
    }
  );

  return ProgrammeHourDistribution;
};
