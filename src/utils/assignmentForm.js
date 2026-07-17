const ASSIGNMENT_PDF_FORM_TYPE = "pdf_form";

function isPdfFormAssignment(assignment) {
  return String(assignment?.assignment_type || "").trim() === ASSIGNMENT_PDF_FORM_TYPE;
}

function isQuestionsAssignment(assignment) {
  return !isPdfFormAssignment(assignment);
}

module.exports = {
  ASSIGNMENT_PDF_FORM_TYPE,
  isPdfFormAssignment,
  isQuestionsAssignment,
};
