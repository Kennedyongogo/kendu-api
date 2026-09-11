const { DataTypes } = require("sequelize");

/**
 * Services the library offers (printing, reference help, study rooms, etc.).
 */
module.exports = (sequelize) => {
  const LibraryService = sequelize.define(
    "LibraryService",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: "other",
        comment: "research | access | print | space | lending | other",
      },
      availability_note: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "e.g. Weekdays 8am–5pm, by appointment",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "library_services",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["is_active"] }, { fields: ["category"] }],
    }
  );

  return LibraryService;
};
