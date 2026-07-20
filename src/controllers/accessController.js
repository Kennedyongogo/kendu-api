const {
  listAccessPolicies,
  getAccessPolicy,
  updateAccessPolicy,
  evaluateFeatureAccess,
  FEATURE_DEFAULTS,
} = require("../services/accessPolicyService");
const { buildLedger } = require("./accountingController");
const { logFromRequest } = require("../middleware/auditLogger");

exports.listPolicies = async (req, res) => {
  try {
    const data = await listAccessPolicies();
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.getPolicy = async (req, res) => {
  try {
    const feature = String(req.params.feature || "").trim().toLowerCase();
    if (!FEATURE_DEFAULTS[feature]) {
      return res.status(400).json({ success: false, message: "Unknown access feature" });
    }
    const data = await getAccessPolicy(feature);
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

exports.updatePolicy = async (req, res) => {
  try {
    const feature = String(req.params.feature || "").trim().toLowerCase();
    if (!FEATURE_DEFAULTS[feature]) {
      return res.status(400).json({ success: false, message: "Unknown access feature" });
    }

    const data = await updateAccessPolicy(feature, {
      min_fee_percent: req.body.min_fee_percent,
      is_enabled: req.body.is_enabled,
      description: req.body.description,
      updated_by: req.user.id,
    });

    await logFromRequest(req, {
      action: "update",
      resource_type: "access_policy",
      resource_id: data.id,
      description: `Updated access policy for ${feature} (min fee ${data.min_fee_percent}%)`,
    });

    return res.json({ success: true, data, message: "Access policy saved" });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** Student: fee progress + eligibility for a feature (default units). */
exports.getMyAccessStatus = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Students only" });
    }
    const feature = String(req.query.feature || "units").trim().toLowerCase();
    if (!FEATURE_DEFAULTS[feature]) {
      return res.status(400).json({ success: false, message: "Unknown access feature" });
    }

    const ledger = await buildLedger(req.user.id);
    const access = await evaluateFeatureAccess(feature, ledger.summary);

    return res.json({
      success: true,
      data: {
        access,
        summary: ledger.summary,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
