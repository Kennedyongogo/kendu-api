const { DataTypes } = require("sequelize");

/**
 * Simple e-learning resource (link/file) optionally tied to a programme.
 */
module.exports = (sequelize) => {
  const LibraryElearning = sequelize.define(
    "LibraryElearning",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      url: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      resource_type: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "link",
        comment: "link | pdf | video | other",
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "library_elearning",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["programme_id"] },
        { fields: ["is_active"] },
        { fields: ["resource_type"] },
      ],
    }
  );

  return LibraryElearning;
};
