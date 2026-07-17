/**
 * pdf-parse v2 exposes PDFParse class (not a default function).
 * This helper keeps one compatible entry point for the rest of the API.
 */
async function parsePdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("PDF buffer is required.");
  }
  const mod = require("pdf-parse");
  const PDFParse = mod.PDFParse;
  if (!PDFParse) {
    if (typeof mod === "function") {
      const legacy = await mod(buffer);
      return { text: String(legacy?.text || "").trim(), numpages: legacy?.numpages, info: legacy?.info };
    }
    throw new Error("pdf-parse is not installed correctly.");
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: String(result?.text || "").trim(),
      numpages: result?.pages?.length,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

module.exports = { parsePdfBuffer };
