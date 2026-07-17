const path = require("path");
const fs = require("fs");

function profilePictureAbsolute(relative) {
  if (!relative || typeof relative !== "string" || !relative.startsWith("uploads/")) return null;
  return path.join(__dirname, "..", "..", relative);
}

function unlinkProfilePictureIfExists(relative) {
  const abs = profilePictureAbsolute(relative);
  if (!abs || !fs.existsSync(abs)) return;
  try {
    fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

module.exports = { profilePictureAbsolute, unlinkProfilePictureIfExists };
