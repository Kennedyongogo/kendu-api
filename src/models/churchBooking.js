const { DataTypes } = require("sequelize");

/**
 * A seat booking for one church service. The two partial unique indexes are what make
 * double booking impossible under concurrent requests: only one *active* booking may exist
 * per seat per service, and per person per service.
 */
module.exports = (sequelize) => {
  const ChurchBooking = sequelize.define(
    "ChurchBooking",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      service_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      seat_key: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      seat_label: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      booked_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reference: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "active",
        validate: { isIn: [["active", "cancelled"]] },
      },
      cancelled_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancelled_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      attendance: {
        type: DataTypes.STRING(10),
        allowNull: true,
        validate: { isIn: [["present", "absent"]] },
      },
      checked_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      checked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "church_bookings",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["service_id", "seat_key"],
          where: { status: "active" },
          name: "church_bookings_active_seat_unique",
        },
        {
          unique: true,
          fields: ["service_id", "user_id"],
          where: { status: "active" },
          name: "church_bookings_active_user_unique",
        },
        { unique: true, fields: ["reference"], name: "church_bookings_reference_unique" },
        { fields: ["user_id", "status"], name: "church_bookings_user_status_idx" },
      ],
    }
  );

  return ChurchBooking;
};
