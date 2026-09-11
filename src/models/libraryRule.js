const { DataTypes } = require("sequelize");

/**
 * Library constitution-style rules.
 * Free-form policy: title + body (e.g. "If a book is overdue, a fine is charged.").
 *
 * Legacy loan-limit columns are kept nullable for existing DBs; issuing books
 * uses fixed system defaults instead.
 */
module.exports = (sequelize) => {
  const LibraryRule = sequelize.define(
    "LibraryRule",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: "Short rule heading, e.g. Article title",
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Full constitution-style rule text",
      },
      article_no: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // Legacy columns (nullable) — no longer used by the UI
      applies_to_role: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      max_books: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      loan_days: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      fine_per_day: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "library_rules",
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ["is_active"] }, { fields: ["article_no"] }],
    }
  );

  return LibraryRule;
};
