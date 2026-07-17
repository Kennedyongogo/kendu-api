const path = require("path");
const fs = require("fs");
const { SchoolProfile } = require("../models");

const DEFAULT_PRIMARY = "#0c2340";
const DEFAULT_SECONDARY = "#c9a227";

function resolveUploadFilePath(urlPath) {
  if (!urlPath || typeof urlPath !== "string") return null;
  const trimmed = urlPath.trim();
  if (!trimmed) return null;
  const rel = trimmed.replace(/^\/+/, "");
  const candidates = [
    path.join(__dirname, "..", "..", rel),
    path.join(process.cwd(), rel),
  ];
  for (const full of candidates) {
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * @returns {Promise<{
 *   name: string,
 *   shortName: string|null,
 *   tagline: string|null,
 *   email: string|null,
 *   phone: string|null,
 *   addressLine: string|null,
 *   website: string|null,
 *   logoPath: string|null,
 *   primaryColor: string,
 *   secondaryColor: string,
 * }>}
 */
async function loadSchoolReportBranding() {
  const row = await SchoolProfile.findOne({ order: [["updated_at", "DESC"]] });
  if (!row) {
    return {
      name: "School",
      shortName: null,
      tagline: null,
      email: null,
      phone: null,
      addressLine: null,
      website: null,
      logoPath: null,
      primaryColor: DEFAULT_PRIMARY,
      secondaryColor: DEFAULT_SECONDARY,
    };
  }

  const j = row.toJSON ? row.toJSON() : row;
  const logoPath = resolveUploadFilePath(j.logo_url) || resolveUploadFilePath(j.logo_dark_url);
  const cityParts = [j.address, j.city, j.state, j.country].filter(Boolean);

  return {
    name: j.name || "School",
    shortName: j.short_name || null,
    tagline: j.tagline || null,
    email: j.email || null,
    phone: j.phone || null,
    addressLine: cityParts.length ? cityParts.join(", ") : null,
    website: j.website || null,
    logoPath,
    primaryColor: j.primary_color || DEFAULT_PRIMARY,
    secondaryColor: j.secondary_color || DEFAULT_SECONDARY,
  };
}

module.exports = { loadSchoolReportBranding, resolveUploadFilePath, DEFAULT_PRIMARY, DEFAULT_SECONDARY };
