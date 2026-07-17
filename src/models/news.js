const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const News = sequelize.define(
    "News",
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
      slug: {
        type: DataTypes.STRING(200),
        unique: true,
        allowNull: false,
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM(
          "academic",
          "announcement",
          "achievement",
          "event",
          "holiday",
          "general"
        ),
        defaultValue: "general",
      },
      poster_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      poster_prompt: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      poster_color_palette: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      published_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      published_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      view_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      tags: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      target_audience: {
        type: DataTypes.ENUM("all", "students", "parents", "teachers", "alumni"),
        defaultValue: "all",
      },
    },
    {
      tableName: "news",
      timestamps: true,
      underscored: true,
    }
  );

  return News;
};
