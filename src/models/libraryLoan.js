const { DataTypes } = require("sequelize");

/**
 * Charge / discharge of a library book to any user (student, staff, admin).
 * status: active | returned | overdue
 */
module.exports = (sequelize) => {
  const LibraryLoan = sequelize.define(
    "LibraryLoan",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      book_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      borrower_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "User who received the book (student, staff, or admin)",
      },
      issued_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      issued_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      due_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      returned_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "active",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "library_loans",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["book_id"] },
        { fields: ["borrower_id"] },
        { fields: ["status"] },
        { fields: ["due_at"] },
      ],
    }
  );

  return LibraryLoan;
};
