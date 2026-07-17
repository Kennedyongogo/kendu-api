const {
  SchoolProfile,
  AcademicTerm,
} = require("../models");

const PUBLIC_ATTRIBUTES = [
  "name",
  "short_name",
  "tagline",
  "description",
  "founded_year",
  "email",
  "phone",
  "alternate_phone",
  "address",
  "city",
  "state",
  "country",
  "postal_code",
  "logo_url",
  "favicon_url",
  "banner_url",
  "website",
  "facebook_url",
  "twitter_url",
  "instagram_url",
  "linkedin_url",
  "youtube_url",
  "timezone",
  "currency",
  "currency_symbol",
  "language",
  "grading_system",
];

const ADMIN_WRITABLE_FIELDS = [
  "name",
  "short_name",
  "tagline",
  "description",
  "founded_year",
  "email",
  "phone",
  "alternate_phone",
  "address",
  "city",
  "state",
  "country",
  "postal_code",
  "website",
  "facebook_url",
  "twitter_url",
  "instagram_url",
  "linkedin_url",
  "youtube_url",
  "favicon_url",
  "banner_url",
  "current_term_id",
  "grading_system",
  "terms_per_year",
  "timezone",
  "date_format",
  "language",
  "currency",
  "currency_symbol",
  "default_proctoring_rules",
  "email_host",
  "email_port",
  "email_username",
  "email_password",
  "email_from_address",
  "email_from_name",
  "payment_grace_days",
  "reconnection_fee",
  "default_installment_plan",
  "features_enabled",
  "registration_number",
  "tax_id",
  "privacy_policy_url",
  "terms_url",
  "is_active",
  "maintenance_mode",
  "maintenance_message",
];

/** Omit from API responses: branding hex colors not exposed via school profile API. */
const ADMIN_RESPONSE_EXCLUDE = [
  "email_password",
  "primary_color",
  "secondary_color",
  "accent_color",
  "logo_dark_url",
];

exports.getPublicSchoolInfo = async (req, res) => {
  try {
    const school = await SchoolProfile.findOne({
      attributes: PUBLIC_ATTRIBUTES,
    });
    return res.json({ success: true, data: school });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFullSchoolSettings = async (req, res) => {
  try {
    const school = await SchoolProfile.findOne({
      attributes: { exclude: ADMIN_RESPONSE_EXCLUDE },
      include: [{ model: AcademicTerm, as: "current_term", required: false }],
    });
    return res.json({ success: true, data: school });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSchoolProfile = async (req, res) => {
  try {
    const updateData = {};
    for (const field of ADMIN_WRITABLE_FIELDS) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    if (updateData.founded_year !== undefined) {
      const v = updateData.founded_year;
      if (v === "" || v === null) updateData.founded_year = null;
      else if (typeof v === "string") {
        const n = parseInt(v, 10);
        updateData.founded_year = Number.isNaN(n) ? null : n;
      }
    }

    const mainLogo = req.file;
    if (mainLogo?.filename) {
      updateData.logo_url = `/uploads/school-logos/${mainLogo.filename}`;
    }

    updateData.updated_by = req.userId;

    let school = await SchoolProfile.findOne();
    if (!school) {
      const requiredBootstrap = {
        email: req.body.email || "info@school.local",
        phone: req.body.phone || "+000000000",
        address: req.body.address || "Address pending",
        city: req.body.city || "City pending",
      };
      school = await SchoolProfile.create({
        ...requiredBootstrap,
        ...updateData,
      });
      const full = await SchoolProfile.findByPk(school.id, {
        attributes: { exclude: ADMIN_RESPONSE_EXCLUDE },
        include: [{ model: AcademicTerm, as: "current_term", required: false }],
      });
      return res.status(201).json({ success: true, data: full });
    }

    await school.update(updateData);
    const refreshed = await SchoolProfile.findByPk(school.id, {
      attributes: { exclude: ADMIN_RESPONSE_EXCLUDE },
      include: [{ model: AcademicTerm, as: "current_term", required: false }],
    });
    return res.json({ success: true, data: refreshed });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
