/** KCSE mean grades ranked highest → lowest */
const GRADE_ORDER = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E"];

const GRADE_RANK = Object.fromEntries(GRADE_ORDER.map((g, i) => [g, GRADE_ORDER.length - i]));

/**
 * Normalize free-text KCSE grade input to a canonical letter grade.
 * @returns {string|null}
 */
function parseKcseGrade(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim().toUpperCase();
  if (!s) return null;
  s = s.replace(/\s+/g, "");
  s = s.replace(/MEAN(?:GRADE)?/g, "");
  s = s.replace(/GRADE/g, "");
  s = s.replace(/[^A-E+-]/g, "");
  if (GRADE_RANK[s] != null) return s;
  const match = s.match(/[A-E][+-]?/);
  if (match && GRADE_RANK[match[0]] != null) return match[0];
  return null;
}

function gradeRank(raw) {
  const parsed = parseKcseGrade(raw);
  return parsed ? GRADE_RANK[parsed] : null;
}

/**
 * True when applicantGrade is at least as good as minimumGrade.
 * If minimum is missing/empty, any grade is allowed.
 */
function meetsMinimumKcseGrade(applicantGrade, minimumGrade) {
  const min = String(minimumGrade || "").trim();
  if (!min) return { ok: true, applicant: parseKcseGrade(applicantGrade), minimum: null };

  const applicant = parseKcseGrade(applicantGrade);
  const minimum = parseKcseGrade(minimumGrade);

  if (!applicant) {
    return {
      ok: false,
      applicant: null,
      minimum,
      message: `Could not read KCSE grade "${applicantGrade}". Use a mean grade like C+, B-, or A.`,
    };
  }
  if (!minimum) {
    return { ok: true, applicant, minimum: null };
  }

  const ok = GRADE_RANK[applicant] >= GRADE_RANK[minimum];
  return {
    ok,
    applicant,
    minimum,
    message: ok
      ? null
      : `Your KCSE mean grade (${applicant}) does not meet the minimum required for this programme (${minimum}).`,
  };
}

module.exports = {
  GRADE_ORDER,
  parseKcseGrade,
  gradeRank,
  meetsMinimumKcseGrade,
};
