const { DataTypes } = require("sequelize");

/**
 * Date-specific lesson slot: lesson_date + clock times; optional weekday/period for legacy rows.
 * day_of_week: ISO weekday — 1 = Monday … 7 = Sunday (nullable when lesson_date drives scheduling).
 */
module.exports = (sequelize) => {
  const CurriculumClassTimetableLesson = sequelize.define(
    "CurriculumClassTimetableLesson",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      timetable_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_class_timetables", key: "id" },
        onDelete: "CASCADE",
      },
      lesson_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      day_of_week: {
        type: DataTypes.SMALLINT,
        allowNull: true,
        validate: { min: 1, max: 7 },
      },
      period_index: {
        type: DataTypes.SMALLINT,
        allowNull: true,
        validate: { min: 1 },
      },
      starts_at: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      ends_at: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_subjects", key: "id" },
        onDelete: "RESTRICT",
      },
      teacher_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "teachers", key: "id" },
        onDelete: "SET NULL",
      },
      room: {
        type: DataTypes.STRING(80),
        allowNull: true,
      },
      notes: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      /** Scheduled as in-person room lesson vs remote / live-online session. */
      delivery_mode: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "physical",
        validate: { isIn: [["physical", "online"]] },
      },
      /** For online lessons: optional = join without auto camera/mic; audio | video = auto-enable on join. */
      media_mode: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: "optional",
        validate: { isIn: [["optional", "audio", "video"]] },
      },
      teacher_attended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      /** Wall-clock timezone for lesson_date + starts_at / ends_at (same as exam schedules). */
      timezone: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Africa/Nairobi",
      },
    },
    {
      tableName: "curriculum_class_timetable_lessons",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["timetable_id", "lesson_date"] },
        { fields: ["teacher_id"] },
        { fields: ["curriculum_subject_id"] },
        { fields: ["lesson_date"] },
      ],
    }
  );

  return CurriculumClassTimetableLesson;
};
