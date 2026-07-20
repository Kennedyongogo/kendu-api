const { User, Programme } = require("../models");
const { buildLedger } = require("./accountingController");
const { evaluateFeatureAccess } = require("../services/accessPolicyService");
const { buildMealCardPdf } = require("../services/mealCardPdfService");

function profileImageUrl(filename) {
  if (!filename) return null;
  if (/^https?:\/\//i.test(filename) || String(filename).startsWith("/uploads/")) {
    return filename;
  }
  return `/uploads/profiles/${filename}`;
}

function academicYearLabel(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based; academic year often starts ~Aug/Sep
  if (month >= 7) return `${year}/${year + 1}`;
  return `${year - 1}/${year}`;
}

function issuedOnLabel(date = new Date()) {
  return date.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function loadStudentCard(userId) {
  const user = await User.findByPk(userId, {
    attributes: [
      "id",
      "full_name",
      "admission_number",
      "email",
      "profile_image",
      "year_of_study",
      "semester",
      "programme_id",
      "role",
    ],
    include: [
      {
        model: Programme,
        as: "programme",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  });

  if (!user || user.role !== "student") {
    const err = new Error("Student profile not found");
    err.status = 404;
    throw err;
  }

  const plain = user.get({ plain: true });
  return {
    student_id: plain.id,
    full_name: plain.full_name,
    admission_number: plain.admission_number || null,
    email: plain.email,
    profile_image: plain.profile_image || null,
    profile_image_url: profileImageUrl(plain.profile_image),
    year_of_study: plain.year_of_study || null,
    semester: plain.semester || null,
    programme_id: plain.programme_id || null,
    programme_name: plain.programme?.name || null,
    academic_year: academicYearLabel(),
    issued_on: issuedOnLabel(),
    valid_label: "Current term",
    card_type: "meal",
  };
}

async function evaluateMealAccess(userId) {
  const ledger = await buildLedger(userId);
  const access = await evaluateFeatureAccess("meals", ledger.summary);
  return { access, summary: ledger.summary };
}

/** GET /api/meals/card — preview payload + fee eligibility */
exports.getMyMealCard = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const [{ access, summary }, card] = await Promise.all([
      evaluateMealAccess(req.user.id),
      loadStudentCard(req.user.id),
    ]);

    return res.json({
      success: true,
      data: {
        access,
        summary,
        card: access.eligible ? card : null,
        locked_card: card,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/meals/card/pdf — CR80 meal card PDF (fee gate enforced) */
exports.downloadMyMealCardPdf = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }

    const { access } = await evaluateMealAccess(req.user.id);
    if (!access.eligible) {
      return res.status(403).json({
        success: false,
        message: access.message || "Fee requirement not met for meal card",
        data: { access },
      });
    }

    const card = await loadStudentCard(req.user.id);
    const pdf = await buildMealCardPdf(card);
    const safeAdm = String(card.admission_number || card.student_id)
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 40);
    const filename = `KASMS-MealCard-${safeAdm}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
