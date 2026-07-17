const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const SchoolProfile = sequelize.define(
    "SchoolProfile",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        defaultValue: "Elimu Plus",
      },
      short_name: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Abbreviation e.g., CIS",
      },
      tagline: {
        type: DataTypes.STRING(500),
        allowNull: true,
        defaultValue: "Excellence in Education",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      founded_year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      alternate_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      state: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      country: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: "Kenya",
      },
      postal_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      website: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      facebook_url: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      twitter_url: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      instagram_url: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      linkedin_url: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      youtube_url: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      logo_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      logo_dark_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "For dark mode/transparent backgrounds",
      },
      favicon_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      banner_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      primary_color: {
        type: DataTypes.STRING(7),
        defaultValue: "#1A365D",
        comment: "Hex color code",
      },
      secondary_color: {
        type: DataTypes.STRING(7),
        defaultValue: "#FFD700",
        comment: "Hex color code",
      },
      accent_color: {
        type: DataTypes.STRING(7),
        defaultValue: "#E53E3E",
        comment: "Hex color code",
      },
      current_term_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "academic_terms", key: "id" },
      },
      grading_system: {
        type: DataTypes.ENUM("american", "british", "ib", "cambridge"),
        defaultValue: "american",
      },
      terms_per_year: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        comment: "Number of terms/semesters per academic year",
      },
      timezone: {
        type: DataTypes.STRING(50),
        defaultValue: "Africa/Nairobi",
      },
      date_format: {
        type: DataTypes.STRING(20),
        defaultValue: "DD/MM/YYYY",
      },
      language: {
        type: DataTypes.STRING(10),
        defaultValue: "en",
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: "KES",
      },
      currency_symbol: {
        type: DataTypes.STRING(5),
        defaultValue: "KSh",
      },
      default_proctoring_rules: {
        type: DataTypes.JSONB,
        defaultValue: {
          prevent_tab_switch: true,
          require_webcam: true,
          max_tab_switches: 3,
          face_detection_required: true,
        },
      },
      email_host: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      email_port: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      email_username: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      email_password: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      email_from_address: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      email_from_name: {
        type: DataTypes.STRING(200),
        allowNull: true,
      },
      payment_grace_days: {
        type: DataTypes.INTEGER,
        defaultValue: 14,
      },
      reconnection_fee: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
      },
      default_installment_plan: {
        type: DataTypes.ENUM("monthly", "bi_weekly", "one_time"),
        defaultValue: "monthly",
      },
      features_enabled: {
        type: DataTypes.JSONB,
        defaultValue: {
          online_exams: true,
          live_classes: true,
          proctoring: true,
          certificates: true,
          parent_portal: true,
          mobile_app: false,
        },
      },
      registration_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      tax_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      privacy_policy_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      terms_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      maintenance_mode: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      maintenance_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "school_profiles",
      timestamps: true,
      underscored: true,
    }
  );

  return SchoolProfile;
};
