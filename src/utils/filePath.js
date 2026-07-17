/**
 * Convert absolute file path to web-accessible relative path
 * @param {string} absolutePath - The absolute file path from multer
 * @returns {string|null} - The relative path or null if no file
 */
const convertToRelativePath = (absolutePath) => {
  if (!absolutePath) return null;

  // Convert backslashes to forward slashes (Windows compatibility)
  const normalizedPath = absolutePath.replace(/\\/g, "/");

  // Extract only the part after /uploads/ to make it web-accessible (without leading slash)
  const relativePath = normalizedPath.replace(/.*\/uploads\//, "uploads/");

  return relativePath;
};

module.exports = {
  convertToRelativePath,
};
