const { DataTypes } = require("sequelize");

/**
 * Coursework set by a lecturer (or admin) for a department / programme / unit.
 * Students see published assignments for their programme and semester.
 */
module.exports = (sequelize) => {
  const Assignment = sequelize.define(
    "Assignment",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "Academic department that owns the assignment",
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      unit_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      academic_year: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'e.g. "2025/2026"',
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "1 or 2",
      },
      due_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      published_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      document_filename: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Stored filename under uploads/assignments",
      },
      document_original_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      document_mime_type: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      document_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "assignments",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["department_id"] },
        { fields: ["programme_id"] },
        { fields: ["unit_id"] },
        { fields: ["academic_year"] },
        { fields: ["is_published"] },
        { fields: ["due_at"] },
        { fields: ["created_by"] },
      ],
    }
  );

  return Assignment;
};
