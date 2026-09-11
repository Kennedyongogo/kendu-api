const { DataTypes } = require("sequelize");

/**
 * Library catalogue item: book name, stock count, programme attachment.
 */
module.exports = (sequelize) => {
  const LibraryBook = sequelize.define(
    "LibraryBook",
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
      author: {
        type: DataTypes.STRING(180),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "Total copies held by the library",
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "library_books",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["programme_id"] },
        { fields: ["is_active"] },
        { fields: ["title"] },
      ],
    }
  );

  return LibraryBook;
};
