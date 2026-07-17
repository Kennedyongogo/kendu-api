function formatLegacyPdfAnswerValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "").trim();
}

function coerceJsonObject(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function scoreSubmissionPdfRichness(submission) {
  const raw = coerceJsonObject(submission?.pdf_answers_json);
  if (!raw) return submission?.pdf_completed_file_path ? 1 : 0;
  const parsed = parseManualPdfAnswers(raw);
  let score = 0;
  score += parsed.entries.length * 3;
  score += parsed.working_papers.length * 3;
  if (parsed.entries.some((entry) => entry.marks_obtained != null || entry.marker_comment)) score += 5;
  if (parsed.working_papers.some((paper) => paper.marked_return?.url || paper.marker_comment)) score += 5;
  if (submission?.pdf_completed_file_path) score += 1;
  return score;
}

async function findSubmittedExamSubmissionForPortal(ExamSubmission, { examId, studentId, attributes }) {
  const rows = await ExamSubmission.findAll({
    where: { exam_id: examId, student_id: studentId, status: "submitted" },
    attributes,
    order: [
      ["updated_at", "DESC"],
      ["created_at", "DESC"],
    ],
  });
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  let best = rows[0];
  let bestScore = scoreSubmissionPdfRichness(best);
  for (let index = 1; index < rows.length; index += 1) {
    const candidate = rows[index];
    const score = scoreSubmissionPdfRichness(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function normalizeMarkedReturn(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = String(raw.url || "").trim();
  if (!url) return null;
  return {
    url,
    name: String(raw.name || "").trim(),
    mime: String(raw.mime || "").trim(),
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
    marked_at: raw.marked_at || null,
    marked_by_user_id: raw.marked_by_user_id != null ? String(raw.marked_by_user_id) : null,
  };
}

function normalizeWorkingPaper(file, index) {
  const paper = {
    id: String(file?.id || `paper-${index + 1}`),
    url: String(file?.url || "").trim(),
    name: String(file?.name || "").trim(),
    mime: String(file?.mime || "").trim(),
    size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
    uploaded_at: file?.uploaded_at || null,
  };
  const markedReturn = normalizeMarkedReturn(file?.marked_return);
  if (markedReturn) paper.marked_return = markedReturn;
  if (file?.marker_comment != null && String(file.marker_comment).trim() !== "") {
    paper.marker_comment = String(file.marker_comment).trim().slice(0, 2000);
  } else if (file?.marker_comment === null) {
    paper.marker_comment = null;
  }
  return paper;
}

function parseManualPdfAnswers(raw) {
  const normalized = coerceJsonObject(raw);
  if (!normalized || typeof normalized !== "object") {
    return { mode: "manual", entries: [], working_papers: [] };
  }
  raw = normalized;
  const working_papers = Array.isArray(raw.working_papers)
    ? raw.working_papers.map((file, index) => normalizeWorkingPaper(file, index))
    : [];
  if (Array.isArray(raw.entries)) {
    return {
      mode: raw.mode || "manual",
      entries: raw.entries.map((entry, index) => ({
        id: String(entry?.id || `entry-${index + 1}`),
        question: String(entry?.question ?? ""),
        answer: String(entry?.answer ?? ""),
        marks_obtained:
          entry?.marks_obtained != null && entry.marks_obtained !== ""
            ? Number(entry.marks_obtained)
            : null,
        marker_comment: entry?.marker_comment != null ? String(entry.marker_comment) : null,
      })),
      working_papers,
    };
  }
  const legacyEntries = Object.entries(raw)
    .filter(([key]) => !["mode", "entries", "working_papers"].includes(key))
    .map(([key, value], index) => ({
      id: `legacy-${index + 1}`,
      question: key.replace(/^q/i, "Q"),
      answer: formatLegacyPdfAnswerValue(value),
      marks_obtained: null,
      marker_comment: null,
    }));
  return {
    mode: "manual",
    entries: legacyEntries,
    working_papers,
  };
}

function submissionHasManualPdfEntries(submission) {
  const { entries } = parseManualPdfAnswers(submission?.pdf_answers_json);
  return entries.length > 0;
}

function sumPdfManualEntryMarks(entries) {
  return (entries || []).reduce((sum, entry) => sum + (Number(entry.marks_obtained) || 0), 0);
}

function entryHasPdfManualMarking(entries) {
  return (entries || []).some(
    (entry) =>
      entry.marks_obtained != null ||
      (entry.marker_comment != null && String(entry.marker_comment).trim() !== "")
  );
}

module.exports = {
  parseManualPdfAnswers,
  coerceJsonObject,
  normalizeWorkingPaper,
  normalizeMarkedReturn,
  scoreSubmissionPdfRichness,
  findSubmittedExamSubmissionForPortal,
  submissionHasManualPdfEntries,
  sumPdfManualEntryMarks,
  entryHasPdfManualMarking,
};
