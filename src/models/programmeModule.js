const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProgrammeModule = sequelize.define(
    "ProgrammeModule",
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
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      credits: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      semester: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      year_of_study: {
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
      tableName: "programme_modules",
      timestamps: true,
      underscored: true,
    }
  );

  return ProgrammeModule;
};
