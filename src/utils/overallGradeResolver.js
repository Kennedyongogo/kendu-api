const { Op } = require("sequelize");
const { OverallGradingScale } = require("../models");

/**
 * Map aggregate total marks to an overall grade band (range-based, not percentage).
 * @param {{ curriculum_id: string, curriculum_class_id: string, totalMarks: number }}
 */
async function resolveOverallGradeBand({ curriculum_id, curriculum_class_id, totalMarks }) {
  const total = Number(totalMarks);
  if (!curriculum_id || !curriculum_class_id || !Number.isFinite(total)) {
    return { band: null, error: "Missing curriculum, class, or total marks." };
  }

  const bands = await OverallGradingScale.findAll({
    where: {
      curriculum_id,
      curriculum_class_id,
      is_active: true,
    },
    order: [
      ["sort_order", "ASC"],
      ["min_score", "ASC"],
    ],
  });

  if (!bands.length) {
    return {
      band: null,
      error: "No overall grading ranges configured for this curriculum and class.",
    };
  }

  const band = bands.find((b) => {
    const min = Number(b.min_score);
    const max = Number(b.max_score);
    return Number.isFinite(min) && Number.isFinite(max) && total >= min && total <= max;
  });

  if (!band) {
    return {
      band: null,
      error: `Total ${total} does not fall in any overall grade range. Add a band that covers this total.`,
      bands: bands.map((b) => ({
        range_from: Number(b.min_score),
        range_to: Number(b.max_score),
        overall_grade: b.overall_grade,
      })),
    };
  }

  return {
    band,
    error: null,
    overall_grade: band.overall_grade,
    remarks: band.remarks || null,
    is_pass: band.is_pass,
    range_from: Number(band.min_score),
    range_to: Number(band.max_score),
  };
}

module.exports = { resolveOverallGradeBand };
