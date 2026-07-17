const { DataTypes } = require("sequelize");

/**
 * Carousel items for the public home "Programmes & services" section.
 */
module.exports = (sequelize) => {
  const SchoolService = sequelize.define(
    "SchoolService",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      icon_key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "MenuBook",
        comment: "MUI icon name, e.g. MenuBook, SportsSoccer, Science",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "school_services",
      timestamps: true,
      underscored: true,
    }
  );

  return SchoolService;
};
