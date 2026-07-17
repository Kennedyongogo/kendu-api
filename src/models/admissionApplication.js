const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AdmissionApplication = sequelize.define(
    "AdmissionApplication",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      full_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { isEmail: true },
      },
      national_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      kcse_grade: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      programme_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      kcse_certificate: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Uploaded KCSE certificate filename",
      },
      result_slip: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Uploaded result slip filename",
      },
      birth_certificate: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Uploaded birth certificate filename",
      },
      id_document: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Uploaded national ID / ID document copy filename",
      },
      status: {
        type: DataTypes.ENUM("pending", "under_review", "accepted", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      admin_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      /** [{ status, note, changed_at, changed_by_id, changed_by_name }] */
      status_notes: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
    },
    {
      tableName: "admission_applications",
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ["email"] },
        { fields: ["national_id"] },
        { fields: ["programme_id"] },
        { fields: ["status"] },
      ],
    }
  );

  return AdmissionApplication;
};
