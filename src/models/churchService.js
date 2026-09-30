const { DataTypes } = require("sequelize");

/**
 * A single church service (e.g. Sabbath worship, vespers). Each service carries its own
 * seat layout because seating is arranged per service, and bookings belong to the service.
 *
 * layout = {
 *   width, height, seat_size,
 *   shapes: [{ id, type, x, y, w, h, label }],
 *   seats:  [{ id, label, x, y, section, group, bookable }]
 * }
 */
module.exports = (sequelize) => {
  const ChurchService = sequelize.define(
    "ChurchService",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      service_type: {
        type: DataTypes.STRING(60),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      starts_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      ends_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      booking_closes_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: "draft",
        validate: { isIn: [["draft", "pending", "approved", "rejected", "cancelled"]] },
      },
      layout: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { width: 1200, height: 900, seat_size: 28, shapes: [], seats: [] },
      },
      seat_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      bookable_seat_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reviewed_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      review_note: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      tableName: "church_services",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["status", "starts_at"], name: "church_services_status_starts_idx" },
        { fields: ["starts_at"], name: "church_services_starts_idx" },
      ],
    }
  );

  return ChurchService;
};
