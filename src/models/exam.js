const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Exam = sequelize.define(
    "Exam",
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
      template_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "exam_templates", key: "id" },
      },
      curriculum_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curricula", key: "id" },
      },
      curriculum_class_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_classes", key: "id" },
      },
      curriculum_subject_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_subjects", key: "id" },
      },
      curriculum_class_level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "curriculum_class_levels", key: "id" },
      },
      teacher_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "teachers", key: "id" },
      },
      start_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      end_time: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      timezone: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "Africa/Nairobi",
      },
      session_status: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      proctoring_mode: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "record_only",
        validate: {
          isIn: [["record_only", "live_monitor", "strict_auto"]],
        },
      },
      proctoring_rules_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      meeting_provider: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
      meeting_id: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      meeting_join_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      meeting_host_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      exam_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: "questions",
      },
      pdf_template_path: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pdf_field_schema_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      pdf_answer_key_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      total_marks: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      passing_marks: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      duration_minutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      requires_webcam: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      prevent_tab_switch: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      exam_layout_json: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      status: {
        type: DataTypes.ENUM("draft", "published", "archived"),
        defaultValue: "draft",
      },
      assigned_student_ids: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "exams",
      timestamps: true,
      underscored: true,
    },
  );

  return Exam;
};
