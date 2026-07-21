const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Announcement = sequelize.define(
    "Announcement",
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
        type: DataTypes.STRING(240),
        allowNull: false,
        unique: true,
      },
      excerpt: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.ENUM("news", "event", "exam", "admission", "general"),
        allowNull: false,
        defaultValue: "news",
      },
      cover_image: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // Who the post is shown to:
      //  - public   → public site only (before login)
      //  - students → student portal only (after login)
      //  - all      → both places
      audience: {
        type: DataTypes.ENUM("public", "students", "all"),
        allowNull: false,
        defaultValue: "public",
      },
      event_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      event_end: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_pinned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      published_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "announcements",
      timestamps: true,
      underscored: true,
    }
  );

  return Announcement;
};
