const { DataTypes } = require("sequelize");

/** Subtopic belongs to one curriculum subject topic (name, description, order). */
module.exports = (sequelize) => {
  const CurriculumSubjectSubtopic = sequelize.define(
    "CurriculumSubjectSubtopic",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      curriculum_subject_topic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "curriculum_subject_topics", key: "id" },
        onDelete: "CASCADE",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "curriculum_subject_subtopics",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          fields: ["curriculum_subject_topic_id"],
          name: "curriculum_subject_subtopics_topic_idx",
        },
      ],
    }
  );

  return CurriculumSubjectSubtopic;
};
