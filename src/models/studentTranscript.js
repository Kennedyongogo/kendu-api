const { DataTypes } = require("sequelize");

/**
 * One academic transcript document for a student placement
 * (programme + year + semester + academic year). A student may have many over time.
 */
module.exports = (sequelize) => {
  const StudentTranscript = sequelize.define(
    "StudentTranscript",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      student_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      year_of_study: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      semester: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "1 or 2",
      },
      academic_year: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'e.g. "2025/2026"',
      },
      school_label: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "School / faculty label printed on transcript",
      },
      date_of_admission: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      date_of_graduation: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      recommendation: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("draft", "issued"),
        allowNull: false,
        defaultValue: "draft",
      },
      issued_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      issued_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "student_transcripts",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["student_id"] },
        { fields: ["programme_id"] },
        { fields: ["status"] },
        {
          unique: true,
          fields: ["student_id", "programme_id", "year_of_study", "semester", "academic_year"],
          name: "student_transcripts_placement_unique",
        },
      ],
    }
  );

  return StudentTranscript;
};
