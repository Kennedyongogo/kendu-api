const { DataTypes } = require("sequelize");

/**
 * Snapshot of a unit result row on a transcript.
 * Code/title/hours are denormalized so issued transcripts stay stable.
 */
module.exports = (sequelize) => {
  const StudentTranscriptLine = sequelize.define(
    "StudentTranscriptLine",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      transcript_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      unit_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      registration_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      unit_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      course_title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      hours: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
        defaultValue: 0,
      },
      grade: {
        type: DataTypes.STRING(5),
        allowNull: false,
        comment: "A | B | C | D | E | # (audited)",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "student_transcript_lines",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["transcript_id"] },
        { fields: ["unit_id"] },
        { fields: ["registration_id"] },
      ],
    }
  );

  return StudentTranscriptLine;
};
