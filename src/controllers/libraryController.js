const { Op, fn, col, literal, where: sqlWhere } = require("sequelize");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const {
  sequelize,
  LibraryBook,
  LibraryRule,
  LibraryLoan,
  LibraryElearning,
  LibraryService,
  Programme,
  User,
} = require("../models");

const { ALL_USER_ROLES } = require("../middleware/auth");

const BOOK_IMPORT_FIELDS = [
  { key: "title", label: "Title", required: true },
  { key: "author", label: "Author", required: false },
  { key: "quantity", label: "Quantity", required: false },
  { key: "programme", label: "Programme", required: false },
  { key: "notes", label: "Notes", required: false },
];
const ELEARNING_IMPORT_FIELDS = [
  { key: "title", label: "Title", required: true },
  { key: "url", label: "URL", required: true },
  { key: "resource_type", label: "Resource type", required: false },
  { key: "programme", label: "Programme", required: false },
  { key: "description", label: "Description", required: false },
];
const MAX_BOOK_IMPORT_ROWS = 500;
const MAX_ELEARNING_IMPORT_ROWS = 500;

const BORROWER_ROLES = new Set(ALL_USER_ROLES.filter((role) => role !== "catering"));
const LOAN_STATUSES = new Set(["active", "returned", "overdue"]);
const RESOURCE_TYPES = new Set(["link", "pdf", "video", "other"]);
const SERVICE_CATEGORIES = new Set(["research", "access", "print", "space", "lending", "other"]);
const DEFAULT_MAX_BOOKS = 3;
const DEFAULT_LOAN_DAYS = 14;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
}

function toNonNegInt(value, label, { max = 365 } = {}) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw httpError(400, `${label} must be an integer between 0 and ${max}.`);
  }
  return n;
}

function addDuration(date, { days = 0, hours = 0, minutes = 0 } = {}) {
  const d = new Date(date);
  d.setTime(d.getTime() + (((days * 24 + hours) * 60 + minutes) * 60 * 1000));
  return d;
}

function resolveLoanDueAt(issuedAt, body) {
  if (body.due_at) {
    const due = new Date(body.due_at);
    if (Number.isNaN(due.getTime())) throw httpError(400, "due_at is invalid.");
    if (due.getTime() <= issuedAt.getTime()) {
      throw httpError(400, "Due time must be after the issue time.");
    }
    return due;
  }

  const days = toNonNegInt(body.loan_days ?? body.days, "loan_days", { max: 365 });
  const hours = toNonNegInt(body.loan_hours ?? body.hours, "loan_hours", { max: 23 });
  const minutes = toNonNegInt(body.loan_minutes ?? body.minutes, "loan_minutes", { max: 59 });

  const hasDuration = days > 0 || hours > 0 || minutes > 0;
  const due = addDuration(issuedAt, hasDuration ? { days, hours, minutes } : { days: DEFAULT_LOAN_DAYS });
  if (due.getTime() <= issuedAt.getTime()) {
    throw httpError(400, "Loan duration must be greater than zero.");
  }
  return due;
}

function toBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function toInt(value, label, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    throw httpError(400, `${label} must be an integer >= ${min}.`);
  }
  return n;
}

function uuidOk(value, label) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw httpError(400, `${label} is invalid.`);
  }
  return id;
}

function effectiveLoanStatus(loan) {
  const plain = loan.get ? loan.get({ plain: true }) : loan;
  if (plain.status === "returned" || plain.returned_at) return "returned";
  if (plain.due_at && new Date(plain.due_at).getTime() < Date.now()) return "overdue";
  return plain.status || "active";
}

async function countActiveLoansForBook(bookId, { transaction } = {}) {
  return LibraryLoan.count({
    where: {
      book_id: bookId,
      returned_at: null,
      status: { [Op.in]: ["active", "overdue"] },
    },
    transaction,
  });
}

function serializeBook(row, availableMap = null) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  const onLoan =
    availableMap && availableMap.has(plain.id)
      ? availableMap.get(plain.id)
      : Array.isArray(plain.loans)
        ? plain.loans.filter((l) => !l.returned_at && l.status !== "returned").length
        : Number(plain.on_loan_count || 0);
  plain.on_loan = onLoan;
  plain.available = Math.max(0, Number(plain.quantity || 0) - onLoan);
  plain.programme_name = plain.programme?.name || null;
  delete plain.loans;
  return plain;
}

function serializeLoan(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.status = effectiveLoanStatus(plain);
  plain.book_title = plain.book?.title || null;
  plain.borrower_name = plain.borrower?.full_name || null;
  plain.borrower_role = plain.borrower?.role || null;
  plain.borrower_admission = plain.borrower?.admission_number || null;
  plain.issuer_name = plain.issuer?.full_name || null;
  return plain;
}

function serializeRule(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  return {
    id: plain.id,
    name: plain.name,
    title: plain.name,
    body: plain.body || plain.notes || "",
    article_no: plain.article_no ?? null,
    is_active: plain.is_active !== false,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
  };
}

function serializeElearning(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  plain.programme_name = plain.programme?.name || null;
  return plain;
}

function serializeService(row) {
  const plain = row.get ? row.get({ plain: true }) : { ...row };
  return {
    id: plain.id,
    name: plain.name,
    description: plain.description || "",
    category: plain.category || "other",
    availability_note: plain.availability_note || "",
    is_active: plain.is_active !== false,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
  };
}

async function markOverdueLoans() {
  await LibraryLoan.update(
    { status: "overdue" },
    {
      where: {
        returned_at: null,
        status: "active",
        due_at: { [Op.lt]: new Date() },
      },
    }
  );
}

/** GET /api/library/me — student portal: loans, catalogue, e-learning, rules, services */
exports.getMyLibrary = async (req, res) => {
  try {
    await markOverdueLoans();
    const borrowerId = req.userId;

    const [loans, books, elearning, rules, services] = await Promise.all([
      LibraryLoan.findAll({
        where: {
          borrower_id: borrowerId,
          returned_at: null,
          status: { [Op.in]: ["active", "overdue"] },
        },
        include: [
          {
            model: LibraryBook,
            as: "book",
            attributes: ["id", "title", "author"],
            required: false,
          },
        ],
        order: [
          ["due_at", "ASC"],
          ["issued_at", "DESC"],
        ],
      }),
      LibraryBook.findAll({
        where: { is_active: true },
        include: [{ model: Programme, as: "programme", attributes: ["id", "name"], required: false }],
        order: [["title", "ASC"]],
        limit: 200,
      }),
      LibraryElearning.findAll({
        where: { is_active: true },
        include: [{ model: Programme, as: "programme", attributes: ["id", "name"], required: false }],
        order: [["title", "ASC"]],
        limit: 200,
      }),
      LibraryRule.findAll({
        where: { is_active: true },
        order: [
          ["article_no", "ASC"],
          ["created_at", "ASC"],
        ],
      }),
      LibraryService.findAll({
        where: { is_active: true },
        order: [
          ["category", "ASC"],
          ["name", "ASC"],
        ],
      }),
    ]);

    const bookIds = books.map((b) => b.id);
    const loanCounts = bookIds.length
      ? await LibraryLoan.findAll({
          attributes: ["book_id", [fn("COUNT", col("id")), "on_loan"]],
          where: {
            book_id: { [Op.in]: bookIds },
            returned_at: null,
            status: { [Op.in]: ["active", "overdue"] },
          },
          group: ["book_id"],
          raw: true,
        })
      : [];
    const availableMap = new Map(loanCounts.map((r) => [r.book_id, Number(r.on_loan) || 0]));

    const now = Date.now();
    const loanData = loans.map((row) => {
      const plain = serializeLoan(row);
      const dueMs = plain.due_at ? new Date(plain.due_at).getTime() : null;
      plain.book_author = plain.book?.author || null;
      plain.ms_until_due = dueMs != null ? dueMs - now : null;
      plain.is_overdue = plain.status === "overdue";
      delete plain.book;
      return plain;
    });

    return res.json({
      success: true,
      data: {
        loans: loanData,
        books: books.map((row) => serializeBook(row, availableMap)),
        elearning: elearning.map(serializeElearning),
        summary: {
          on_loan: loanData.filter((l) => l.status === "active").length,
          overdue: loanData.filter((l) => l.status === "overdue").length,
          total: loanData.length,
          books: books.length,
          elearning: elearning.length,
        },
        rules: rules.map(serializeRule),
        services: services.map(serializeService),
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/stats */
exports.getStats = async (req, res) => {
  try {
    await markOverdueLoans();

    const [booksTotal, copiesTotal, activeLoans, overdueLoans, returnedLoans, elearningTotal, rulesActive, servicesActive] =
      await Promise.all([
        LibraryBook.count({ where: { is_active: true } }),
        LibraryBook.sum("quantity"),
        LibraryLoan.count({ where: { returned_at: null, status: { [Op.in]: ["active", "overdue"] } } }),
        LibraryLoan.count({ where: { returned_at: null, status: "overdue" } }),
        LibraryLoan.count({ where: { status: "returned" } }),
        LibraryElearning.count({ where: { is_active: true } }),
        LibraryRule.count({ where: { is_active: true } }),
        LibraryService.count({ where: { is_active: true } }),
      ]);

    const byProgramme = await LibraryBook.findAll({
      attributes: [
        "programme_id",
        [fn("COUNT", col("LibraryBook.id")), "book_titles"],
        [fn("COALESCE", fn("SUM", col("LibraryBook.quantity")), 0), "copies"],
      ],
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
      where: { is_active: true },
      group: ["LibraryBook.programme_id", "programme.id", "programme.name"],
      order: [[literal("copies"), "DESC"]],
      raw: false,
    });

    const byBorrowerRole = await LibraryLoan.findAll({
      attributes: [
        [col("borrower.role"), "role"],
        [fn("COUNT", col("LibraryLoan.id")), "count"],
      ],
      include: [
        {
          model: User,
          as: "borrower",
          attributes: [],
          required: true,
        },
      ],
      where: { returned_at: null, status: { [Op.in]: ["active", "overdue"] } },
      group: ["borrower.role"],
      raw: true,
    });

    const recentLoans = await LibraryLoan.findAll({
      include: [
        { model: LibraryBook, as: "book", attributes: ["id", "title"] },
        {
          model: User,
          as: "borrower",
          attributes: ["id", "full_name", "role", "admission_number"],
        },
      ],
      order: [["issued_at", "DESC"]],
      limit: 8,
    });

    return res.json({
      success: true,
      data: {
        summary: {
          book_titles: booksTotal,
          copies: Number(copiesTotal) || 0,
          on_loan: activeLoans,
          overdue: overdueLoans,
          returned: returnedLoans,
          elearning: elearningTotal,
          rules: rulesActive,
          services: servicesActive,
          available: Math.max(0, (Number(copiesTotal) || 0) - activeLoans),
        },
        by_programme: byProgramme.map((row) => {
          const plain = row.get({ plain: true });
          return {
            programme_id: plain.programme_id,
            programme_name: plain.programme?.name || "Unknown",
            book_titles: Number(plain.book_titles) || 0,
            copies: Number(plain.copies) || 0,
          };
        }),
        by_borrower_role: byBorrowerRole.map((row) => ({
          role: row.role,
          count: Number(row.count) || 0,
        })),
        recent_loans: recentLoans.map(serializeLoan),
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/books */
exports.listBooks = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.is_active !== undefined && req.query.is_active !== "") {
      where.is_active = toBool(req.query.is_active, true);
    }
    if (req.query.programme_id) {
      where.programme_id = uuidOk(req.query.programme_id, "programme_id");
    }
    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { author: { [Op.iLike]: `%${q}%` } },
        { notes: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await LibraryBook.findAndCountAll({
      where,
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
      order: [["title", "ASC"]],
      limit,
      offset,
    });

    const ids = rows.map((r) => r.id);
    const loanCounts = ids.length
      ? await LibraryLoan.findAll({
          attributes: ["book_id", [fn("COUNT", col("id")), "on_loan"]],
          where: {
            book_id: { [Op.in]: ids },
            returned_at: null,
            status: { [Op.in]: ["active", "overdue"] },
          },
          group: ["book_id"],
          raw: true,
        })
      : [];
    const availableMap = new Map(loanCounts.map((r) => [r.book_id, Number(r.on_loan) || 0]));

    return res.json({
      success: true,
      data: rows.map((row) => serializeBook(row, availableMap)),
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/books */
exports.createBook = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    if (!title) throw httpError(400, "Book title is required.");
    const programme_id = uuidOk(req.body.programme_id, "programme_id");
    const programme = await Programme.findByPk(programme_id);
    if (!programme) throw httpError(404, "Programme not found.");
    const quantity = toInt(req.body.quantity ?? 1, "quantity", { min: 1 });

    const book = await LibraryBook.create({
      title,
      author: toNullableString(req.body.author),
      quantity,
      programme_id,
      notes: toNullableString(req.body.notes),
      is_active: toBool(req.body.is_active, true),
    });

    const full = await LibraryBook.findByPk(book.id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
    });
    return res.status(201).json({ success: true, data: serializeBook(full, new Map([[book.id, 0]])) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** PUT /api/library/books/:id */
exports.updateBook = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const book = await LibraryBook.findByPk(id);
    if (!book) throw httpError(404, "Book not found.");

    const patch = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title || "").trim();
      if (!title) throw httpError(400, "Book title is required.");
      patch.title = title;
    }
    if (req.body.author !== undefined) patch.author = toNullableString(req.body.author);
    if (req.body.notes !== undefined) patch.notes = toNullableString(req.body.notes);
    if (req.body.is_active !== undefined) patch.is_active = toBool(req.body.is_active, true);
    if (req.body.programme_id !== undefined) {
      patch.programme_id = uuidOk(req.body.programme_id, "programme_id");
      const programme = await Programme.findByPk(patch.programme_id);
      if (!programme) throw httpError(404, "Programme not found.");
    }
    if (req.body.quantity !== undefined) {
      const quantity = toInt(req.body.quantity, "quantity", { min: 1 });
      const onLoan = await countActiveLoansForBook(id);
      if (quantity < onLoan) {
        throw httpError(400, `Quantity cannot be less than copies currently on loan (${onLoan}).`);
      }
      patch.quantity = quantity;
    }

    await book.update(patch);
    const full = await LibraryBook.findByPk(id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"] }],
    });
    const onLoan = await countActiveLoansForBook(id);
    return res.json({
      success: true,
      data: serializeBook(full, new Map([[id, onLoan]])),
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** DELETE /api/library/books/:id */
exports.deleteBook = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const book = await LibraryBook.findByPk(id);
    if (!book) throw httpError(404, "Book not found.");
    const onLoan = await countActiveLoansForBook(id);
    if (onLoan > 0) {
      throw httpError(400, "Cannot delete a book that still has copies on loan. Discharge them first.");
    }
    await book.destroy();
    return res.json({ success: true, message: "Book deleted." });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/rules */
exports.listRules = async (req, res) => {
  try {
    const rows = await LibraryRule.findAll({
      order: [
        ["article_no", "ASC NULLS LAST"],
        ["created_at", "ASC"],
      ],
    });
    return res.json({ success: true, data: rows.map(serializeRule) });
  } catch (error) {
    // Postgres NULLS LAST can fail on some setups — fallback
    try {
      const rows = await LibraryRule.findAll({
        order: [
          ["article_no", "ASC"],
          ["created_at", "ASC"],
        ],
      });
      return res.json({ success: true, data: rows.map(serializeRule) });
    } catch (fallbackError) {
      return res
        .status(fallbackError.status || 500)
        .json({ success: false, message: fallbackError.message });
    }
  }
};

/** POST /api/library/rules */
exports.createRule = async (req, res) => {
  try {
    const name = String(req.body.name || req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    if (!name) throw httpError(400, "Rule title is required.");
    if (!body) throw httpError(400, "Rule text is required.");

    let article_no = null;
    if (req.body.article_no !== undefined && req.body.article_no !== null && req.body.article_no !== "") {
      article_no = toInt(req.body.article_no, "article_no", { min: 1 });
    } else {
      const maxArticle = await LibraryRule.max("article_no");
      article_no = (Number(maxArticle) || 0) + 1;
    }

    const rule = await LibraryRule.create({
      name,
      body,
      article_no,
      is_active: toBool(req.body.is_active, true),
      notes: body,
    });
    return res.status(201).json({ success: true, data: serializeRule(rule) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** PUT /api/library/rules/:id */
exports.updateRule = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const rule = await LibraryRule.findByPk(id);
    if (!rule) throw httpError(404, "Rule not found.");

    const patch = {};
    if (req.body.name !== undefined || req.body.title !== undefined) {
      const name = String(req.body.name || req.body.title || "").trim();
      if (!name) throw httpError(400, "Rule title is required.");
      patch.name = name;
    }
    if (req.body.body !== undefined) {
      const body = String(req.body.body || "").trim();
      if (!body) throw httpError(400, "Rule text is required.");
      patch.body = body;
      patch.notes = body;
    }
    if (req.body.article_no !== undefined) {
      patch.article_no =
        req.body.article_no === null || req.body.article_no === ""
          ? null
          : toInt(req.body.article_no, "article_no", { min: 1 });
    }
    if (req.body.is_active !== undefined) patch.is_active = toBool(req.body.is_active, true);

    await rule.update(patch);
    return res.json({ success: true, data: serializeRule(rule) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** DELETE /api/library/rules/:id */
exports.deleteRule = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const rule = await LibraryRule.findByPk(id);
    if (!rule) throw httpError(404, "Rule not found.");
    await rule.destroy();
    return res.json({ success: true, message: "Rule deleted." });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/loans */
exports.listLoans = async (req, res) => {
  try {
    await markOverdueLoans();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.status) {
      const status = String(req.query.status).toLowerCase();
      if (!LOAN_STATUSES.has(status)) throw httpError(400, "Invalid loan status.");
      if (status === "returned") {
        where.status = "returned";
      } else if (status === "overdue") {
        where.returned_at = null;
        where.status = "overdue";
      } else {
        where.returned_at = null;
        where.status = { [Op.in]: ["active", "overdue"] };
        if (status === "active") where.status = "active";
      }
    }
    if (req.query.borrower_id) where.borrower_id = uuidOk(req.query.borrower_id, "borrower_id");
    if (req.query.book_id) where.book_id = uuidOk(req.query.book_id, "book_id");

    const q = String(req.query.search || req.query.q || "").trim();
    const include = [
      { model: LibraryBook, as: "book", attributes: ["id", "title", "author"] },
      {
        model: User,
        as: "borrower",
        attributes: ["id", "full_name", "role", "admission_number", "email"],
      },
      { model: User, as: "issuer", attributes: ["id", "full_name"], required: false },
    ];

    if (q) {
      include[0].where = {
        [Op.or]: [{ title: { [Op.iLike]: `%${q}%` } }, { author: { [Op.iLike]: `%${q}%` } }],
      };
      include[0].required = true;
    }

    const { count, rows } = await LibraryLoan.findAndCountAll({
      where,
      include,
      order: [["issued_at", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.json({
      success: true,
      data: rows.map(serializeLoan),
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/loans — charge / issue a book */
exports.createLoan = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const book_id = uuidOk(req.body.book_id, "book_id");
    const borrower_id = uuidOk(req.body.borrower_id, "borrower_id");

    const book = await LibraryBook.findByPk(book_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!book || !book.is_active) throw httpError(404, "Book not found or inactive.");

    const borrower = await User.findByPk(borrower_id, {
      attributes: ["id", "full_name", "role", "is_active", "admission_number"],
      transaction: t,
    });
    if (!borrower || !borrower.is_active) throw httpError(404, "Borrower not found or inactive.");
    if (!BORROWER_ROLES.has(borrower.role)) {
      throw httpError(400, "Books can be issued to students and school offices.");
    }

    const onLoan = await countActiveLoansForBook(book_id, { transaction: t });
    if (onLoan >= book.quantity) {
      throw httpError(400, "No copies available for this book.");
    }

    const maxBooks = DEFAULT_MAX_BOOKS;

    const borrowerActive = await LibraryLoan.count({
      where: {
        borrower_id,
        returned_at: null,
        status: { [Op.in]: ["active", "overdue"] },
      },
      transaction: t,
    });
    if (borrowerActive >= maxBooks) {
      throw httpError(
        400,
        `This ${borrower.role} already has ${borrowerActive} book(s) out (max ${maxBooks}).`
      );
    }

    const issued_at = req.body.issued_at ? new Date(req.body.issued_at) : new Date();
    if (Number.isNaN(issued_at.getTime())) throw httpError(400, "issued_at is invalid.");
    const due_at = resolveLoanDueAt(issued_at, req.body);

    const loan = await LibraryLoan.create(
      {
        book_id,
        borrower_id,
        issued_by: req.userId || null,
        issued_at,
        due_at,
        returned_at: null,
        status: due_at.getTime() < Date.now() ? "overdue" : "active",
        notes: toNullableString(req.body.notes),
      },
      { transaction: t }
    );

    await t.commit();

    const full = await LibraryLoan.findByPk(loan.id, {
      include: [
        { model: LibraryBook, as: "book", attributes: ["id", "title", "author"] },
        {
          model: User,
          as: "borrower",
          attributes: ["id", "full_name", "role", "admission_number", "email"],
        },
        { model: User, as: "issuer", attributes: ["id", "full_name"], required: false },
      ],
    });

    return res.status(201).json({ success: true, data: serializeLoan(full) });
  } catch (error) {
    await t.rollback();
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/loans/:id/return — discharge / bring back */
exports.returnLoan = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const loan = await LibraryLoan.findByPk(id);
    if (!loan) throw httpError(404, "Loan not found.");
    if (loan.returned_at || loan.status === "returned") {
      throw httpError(400, "This book has already been returned.");
    }

    const returned_at = req.body.returned_at ? new Date(req.body.returned_at) : new Date();
    if (Number.isNaN(returned_at.getTime())) throw httpError(400, "returned_at is invalid.");

    await loan.update({
      returned_at,
      status: "returned",
      notes: req.body.notes !== undefined ? toNullableString(req.body.notes) : loan.notes,
    });

    const full = await LibraryLoan.findByPk(id, {
      include: [
        { model: LibraryBook, as: "book", attributes: ["id", "title", "author"] },
        {
          model: User,
          as: "borrower",
          attributes: ["id", "full_name", "role", "admission_number", "email"],
        },
        { model: User, as: "issuer", attributes: ["id", "full_name"], required: false },
      ],
    });

    return res.json({ success: true, data: serializeLoan(full) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/elearning */
exports.listElearning = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.is_active !== undefined && req.query.is_active !== "") {
      where.is_active = toBool(req.query.is_active, true);
    }
    if (req.query.programme_id) {
      where.programme_id = uuidOk(req.query.programme_id, "programme_id");
    }
    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { url: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { count, rows } = await LibraryElearning.findAndCountAll({
      where,
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"], required: false }],
      order: [["title", "ASC"]],
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: rows.map(serializeElearning),
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/elearning */
exports.createElearning = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const url = String(req.body.url || "").trim();
    if (!title) throw httpError(400, "Title is required.");
    if (!url) throw httpError(400, "URL is required.");

    let resource_type = String(req.body.resource_type || "link").trim().toLowerCase();
    if (!RESOURCE_TYPES.has(resource_type)) resource_type = "link";

    let programme_id = null;
    if (req.body.programme_id) {
      programme_id = uuidOk(req.body.programme_id, "programme_id");
      const programme = await Programme.findByPk(programme_id);
      if (!programme) throw httpError(404, "Programme not found.");
    }

    const row = await LibraryElearning.create({
      title,
      description: toNullableString(req.body.description),
      url,
      resource_type,
      programme_id,
      is_active: toBool(req.body.is_active, true),
    });

    const full = await LibraryElearning.findByPk(row.id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"], required: false }],
    });
    return res.status(201).json({ success: true, data: serializeElearning(full) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** PUT /api/library/elearning/:id */
exports.updateElearning = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const row = await LibraryElearning.findByPk(id);
    if (!row) throw httpError(404, "E-learning resource not found.");

    const patch = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title || "").trim();
      if (!title) throw httpError(400, "Title is required.");
      patch.title = title;
    }
    if (req.body.url !== undefined) {
      const url = String(req.body.url || "").trim();
      if (!url) throw httpError(400, "URL is required.");
      patch.url = url;
    }
    if (req.body.description !== undefined) patch.description = toNullableString(req.body.description);
    if (req.body.resource_type !== undefined) {
      let resource_type = String(req.body.resource_type || "link").trim().toLowerCase();
      if (!RESOURCE_TYPES.has(resource_type)) resource_type = "link";
      patch.resource_type = resource_type;
    }
    if (req.body.programme_id !== undefined) {
      if (!req.body.programme_id) {
        patch.programme_id = null;
      } else {
        patch.programme_id = uuidOk(req.body.programme_id, "programme_id");
        const programme = await Programme.findByPk(patch.programme_id);
        if (!programme) throw httpError(404, "Programme not found.");
      }
    }
    if (req.body.is_active !== undefined) patch.is_active = toBool(req.body.is_active, true);

    await row.update(patch);
    const full = await LibraryElearning.findByPk(id, {
      include: [{ model: Programme, as: "programme", attributes: ["id", "name"], required: false }],
    });
    return res.json({ success: true, data: serializeElearning(full) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** DELETE /api/library/elearning/:id */
exports.deleteElearning = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const row = await LibraryElearning.findByPk(id);
    if (!row) throw httpError(404, "E-learning resource not found.");
    await row.destroy();
    return res.json({ success: true, message: "E-learning resource deleted." });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/services */
exports.listServices = async (req, res) => {
  try {
    const where = {};
    if (req.query.is_active !== undefined && req.query.is_active !== "") {
      where.is_active = toBool(req.query.is_active, true);
    }
    if (req.query.category) {
      const category = String(req.query.category).trim().toLowerCase();
      if (SERVICE_CATEGORIES.has(category)) where.category = category;
    }
    const q = String(req.query.search || req.query.q || "").trim();
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { availability_note: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const rows = await LibraryService.findAll({
      where,
      order: [
        ["category", "ASC"],
        ["name", "ASC"],
      ],
    });
    return res.json({ success: true, data: rows.map(serializeService) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/services */
exports.createService = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) throw httpError(400, "Service name is required.");

    let category = String(req.body.category || "other").trim().toLowerCase();
    if (!SERVICE_CATEGORIES.has(category)) category = "other";

    const row = await LibraryService.create({
      name,
      description: toNullableString(req.body.description),
      category,
      availability_note: toNullableString(req.body.availability_note),
      is_active: toBool(req.body.is_active, true),
    });
    return res.status(201).json({ success: true, data: serializeService(row) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** PUT /api/library/services/:id */
exports.updateService = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const row = await LibraryService.findByPk(id);
    if (!row) throw httpError(404, "Service not found.");

    const patch = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) throw httpError(400, "Service name is required.");
      patch.name = name;
    }
    if (req.body.description !== undefined) patch.description = toNullableString(req.body.description);
    if (req.body.availability_note !== undefined) {
      patch.availability_note = toNullableString(req.body.availability_note);
    }
    if (req.body.category !== undefined) {
      let category = String(req.body.category || "other").trim().toLowerCase();
      if (!SERVICE_CATEGORIES.has(category)) category = "other";
      patch.category = category;
    }
    if (req.body.is_active !== undefined) patch.is_active = toBool(req.body.is_active, true);

    await row.update(patch);
    return res.json({ success: true, data: serializeService(row) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** DELETE /api/library/services/:id */
exports.deleteService = async (req, res) => {
  try {
    const id = uuidOk(req.params.id, "id");
    const row = await LibraryService.findByPk(id);
    if (!row) throw httpError(404, "Service not found.");
    await row.destroy();
    return res.json({ success: true, message: "Service deleted." });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** GET /api/library/borrowers?search=&role= — students and school offices */
exports.searchBorrowers = async (req, res) => {
  try {
    const q = String(req.query.search || req.query.q || "").trim();
    const role = String(req.query.role || "").trim().toLowerCase();
    const where = {
      is_active: true,
      role: BORROWER_ROLES.has(role) ? role : { [Op.in]: [...BORROWER_ROLES] },
    };
    if (q) {
      where[Op.or] = [
        { full_name: { [Op.iLike]: `%${q}%` } },
        { email: { [Op.iLike]: `%${q}%` } },
        { admission_number: { [Op.iLike]: `%${q}%` } },
      ];
    }
    const rows = await User.findAll({
      where,
      attributes: ["id", "full_name", "role", "admission_number", "email", "profile_image"],
      order: [["full_name", "ASC"]],
      limit: Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100)),
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

function trimBookCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function readBookExcelMatrix(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw httpError(400, "Workbook has no sheets");
  const ws = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  if (!matrix.length) throw httpError(400, "Sheet is empty");
  return { sheetName, matrix };
}

function normalizeBookHeader(cell) {
  if (cell == null || String(cell).trim() === "") return null;
  const key = String(cell).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    title: "title",
    book: "title",
    book_title: "title",
    book_name: "title",
    name: "title",
    author: "author",
    writer: "author",
    quantity: "quantity",
    qty: "quantity",
    copies: "quantity",
    stock: "quantity",
    programme: "programme",
    programme_name: "programme",
    program: "programme",
    course: "programme",
    notes: "notes",
    note: "notes",
    remarks: "notes",
  };
  return aliases[key] || key;
}

async function resolveBookProgrammeId(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    const byId = await Programme.findByPk(raw);
    return byId ? byId.id : null;
  }
  const byName = await Programme.findOne({
    where: sqlWhere(fn("LOWER", col("name")), raw.toLowerCase()),
  });
  return byName ? byName.id : null;
}

/** GET /api/library/books/import-template */
exports.downloadBooksImportTemplate = async (req, res) => {
  try {
    const programmes = await Programme.findAll({
      where: { is_active: true },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Books", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "Title", key: "title", width: 36 },
      { header: "Author", key: "author", width: 26 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Programme", key: "programme", width: 34 },
      { header: "Notes", key: "notes", width: 32 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F0FA" },
    };

    ws.addRow({
      title: "Fundamentals of Nursing",
      author: "Potter & Perry",
      quantity: 5,
      programme: programmes[0]?.name || "",
      notes: "Core textbook",
    });
    ws.addRow({
      title: "Anatomy & Physiology",
      author: "Marieb",
      quantity: 3,
      programme: programmes[0]?.name || "",
      notes: "",
    });

    if (programmes.length) {
      const lists = workbook.addWorksheet("Lists");
      lists.getColumn(1).header = "Programmes";
      lists.getColumn(1).width = 40;
      programmes.forEach((p, i) => {
        lists.getCell(i + 2, 1).value = p.name;
      });
      for (let row = 2; row <= 502; row++) {
        ws.getCell(`D${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Lists!$A$2:$A$${programmes.length + 1}`],
          showErrorMessage: true,
          errorTitle: "Programme",
          error: "Pick a programme from the list, or leave blank and set a default in the importer.",
        };
      }
    }

    const guide = workbook.addWorksheet("Instructions");
    guide.getColumn(1).width = 92;
    [
      "How to import library books",
      "1. Fill the Books sheet. Title is required on every row.",
      "2. Quantity defaults to 1 when blank.",
      "3. Programme can be set per row (dropdown) or as a default during import.",
      "4. Upload this file in Library → Books → Import Excel.",
      "5. Match columns if your headers differ, then confirm import.",
    ].forEach((line, i) => {
      guide.getCell(i + 1, 1).value = line;
      if (i === 0) guide.getCell(i + 1, 1).font = { bold: true, size: 13 };
    });

    workbook.views = [{ activeTab: 0 }];
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="books-import-template.xlsx"'
    );
    return res.send(Buffer.from(buf));
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/books/import-preview */
exports.previewBooksImport = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let matrix;
    try {
      ({ matrix } = readBookExcelMatrix(req.file.buffer));
    } catch (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || "Could not read Excel file",
      });
    }

    const rawHeaders = matrix[0].map((h, index) => ({
      index,
      header: trimBookCell(h) || `Column ${index + 1}`,
      suggested: normalizeBookHeader(h),
    }));

    const dataRowCount = matrix.slice(1).filter((row) =>
      row.some((cell) => trimBookCell(cell) !== "")
    ).length;

    const sample = [];
    for (let i = 1; i < matrix.length && sample.length < 5; i++) {
      const row = matrix[i];
      if (!row.some((cell) => trimBookCell(cell) !== "")) continue;
      const obj = {};
      rawHeaders.forEach((col) => {
        obj[col.header] = trimBookCell(row[col.index]);
      });
      sample.push(obj);
    }

    return res.json({
      success: true,
      data: {
        columns: rawHeaders,
        sample,
        row_count: dataRowCount,
        system_fields: BOOK_IMPORT_FIELDS,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/library/books/import-mapped
 * mapping: { title: "Title", author: "Author", ... }
 * defaults: { programme_id, quantity }
 */
exports.importBooksMapped = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let mapping = {};
    let defaults = {};
    try {
      mapping =
        typeof req.body.mapping === "string"
          ? JSON.parse(req.body.mapping || "{}")
          : req.body.mapping || {};
      defaults =
        typeof req.body.defaults === "string"
          ? JSON.parse(req.body.defaults || "{}")
          : req.body.defaults || {};
    } catch {
      return res.status(400).json({ success: false, message: "Invalid mapping or defaults JSON." });
    }

    if (!mapping.title) {
      return res.status(400).json({
        success: false,
        message: "Map the Title column before importing.",
      });
    }

    let matrix;
    try {
      ({ matrix } = readBookExcelMatrix(req.file.buffer));
    } catch (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || "Could not read Excel file",
      });
    }

    const headerRow = matrix[0].map((h, index) => ({
      index,
      header: trimBookCell(h) || `Column ${index + 1}`,
    }));
    const headerIndex = new Map(headerRow.map((h) => [h.header, h.index]));
    const defaultProgrammeId = await resolveBookProgrammeId(defaults.programme_id);
    const defaultQuantityRaw = defaults.quantity;

    const dataRows = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const excelRow = i + 1;
      const get = (systemKey) => {
        const header = mapping[systemKey];
        if (!header) return "";
        const idx = headerIndex.get(header);
        if (idx === undefined) return "";
        return trimBookCell(row[idx]);
      };

      const title = get("title");
      const author = get("author");
      const quantity = get("quantity");
      const programmeValue = get("programme");
      const notes = get("notes");

      if (!title && !author && !quantity && !programmeValue && !notes) continue;

      dataRows.push({ excelRow, title, author, quantity, programmeValue, notes });
    }

    if (!dataRows.length) {
      return res.status(400).json({
        success: false,
        message: "No data rows found below the header row",
      });
    }
    if (dataRows.length > MAX_BOOK_IMPORT_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Too many rows (${dataRows.length}). Maximum per upload is ${MAX_BOOK_IMPORT_ROWS}.`,
      });
    }

    const errors = [];
    const created = [];

    for (const row of dataRows) {
      const { excelRow, title, author, quantity, programmeValue, notes } = row;
      if (!title) {
        errors.push({ row: excelRow, message: "Title is required" });
        continue;
      }

      const programme_id =
        (await resolveBookProgrammeId(programmeValue)) || defaultProgrammeId;
      if (!programme_id) {
        errors.push({
          row: excelRow,
          message: "Programme is required (set a default or map a Programme column)",
        });
        continue;
      }

      let qty = 1;
      const qtySource =
        quantity !== ""
          ? quantity
          : defaultQuantityRaw !== undefined && defaultQuantityRaw !== null && defaultQuantityRaw !== ""
            ? defaultQuantityRaw
            : "1";
      const parsedQty = Number(qtySource);
      if (!Number.isInteger(parsedQty) || parsedQty < 1) {
        errors.push({ row: excelRow, message: "Quantity must be an integer >= 1" });
        continue;
      }
      qty = parsedQty;

      try {
        const book = await LibraryBook.create({
          title,
          author: author || null,
          quantity: qty,
          programme_id,
          notes: notes || null,
          is_active: true,
        });
        created.push({
          row: excelRow,
          id: book.id,
          title: book.title,
          quantity: book.quantity,
        });
      } catch (err) {
        errors.push({ row: excelRow, message: err.message || "Could not create book" });
      }
    }

    return res.json({
      success: true,
      data: {
        createdCount: created.length,
        errorCount: errors.length,
        created,
        errors,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

function normalizeElearningHeader(cell) {
  if (cell == null || String(cell).trim() === "") return null;
  const key = String(cell).trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    title: "title",
    name: "title",
    resource: "title",
    resource_title: "title",
    url: "url",
    link: "url",
    website: "url",
    resource_url: "url",
    resource_type: "resource_type",
    type: "resource_type",
    format: "resource_type",
    programme: "programme",
    programme_name: "programme",
    program: "programme",
    course: "programme",
    description: "description",
    details: "description",
    notes: "description",
  };
  return aliases[key] || key;
}

function normalizeElearningResourceType(value, fallback = "link") {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (RESOURCE_TYPES.has(raw)) return raw;
  if (["youtube", "mp4", "clip"].includes(raw)) return "video";
  if (["document", "doc", "file"].includes(raw)) return "pdf";
  return fallback;
}

/** GET /api/library/elearning/import-template */
exports.downloadElearningImportTemplate = async (req, res) => {
  try {
    const programmes = await Programme.findAll({
      where: { is_active: true },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("E-learning", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "Title", key: "title", width: 36 },
      { header: "URL", key: "url", width: 48 },
      { header: "Resource type", key: "resource_type", width: 16 },
      { header: "Programme", key: "programme", width: 34 },
      { header: "Description", key: "description", width: 36 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F0FA" },
    };

    const sampleProgramme = programmes[0]?.name || "";
    ws.addRow({
      title: "WHO Reproductive Health Library",
      url: "https://www.who.int/teams/sexual-and-reproductive-health-and-research",
      resource_type: "link",
      programme: sampleProgramme,
      description: "Evidence summaries for clinical practice",
    });
    ws.addRow({
      title: "OpenWHO Clinical Management Course",
      url: "https://openwho.org/",
      resource_type: "video",
      programme: sampleProgramme,
      description: "Self-paced clinical modules",
    });

    const lists = workbook.addWorksheet("Lists");
    lists.getCell(1, 1).value = "Resource types";
    lists.getCell(1, 1).font = { bold: true };
    ["link", "pdf", "video", "other"].forEach((t, i) => {
      lists.getCell(i + 2, 1).value = t;
    });
    lists.getColumn(1).width = 18;

    lists.getCell(1, 2).value = "Programmes";
    lists.getCell(1, 2).font = { bold: true };
    lists.getColumn(2).width = 40;
    programmes.forEach((p, i) => {
      lists.getCell(i + 2, 2).value = p.name;
    });

    for (let row = 2; row <= 502; row++) {
      ws.getCell(`C${row}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ["Lists!$A$2:$A$5"],
        showErrorMessage: true,
        errorTitle: "Resource type",
        error: "Use link, pdf, video, or other.",
      };
      if (programmes.length) {
        ws.getCell(`D${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Lists!$B$2:$B$${programmes.length + 1}`],
          showErrorMessage: true,
          errorTitle: "Programme",
          error: "Pick a programme from the list, or leave blank and set a default in the importer.",
        };
      }
    }

    const guide = workbook.addWorksheet("Instructions");
    guide.getColumn(1).width = 96;
    [
      "How to import e-learning resources",
      "1. Fill the E-learning sheet. Title and URL are required on every row.",
      "2. Resource type may be link, pdf, video, or other (defaults to link).",
      "3. Programme can be set per row or as a default during import.",
      "4. Upload this file in Library → E-learning → Import Excel.",
      "5. Match columns if your headers differ, then confirm import.",
    ].forEach((line, i) => {
      guide.getCell(i + 1, 1).value = line;
      if (i === 0) guide.getCell(i + 1, 1).font = { bold: true, size: 13 };
    });

    workbook.views = [{ activeTab: 0 }];
    const buf = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="elearning-import-template.xlsx"'
    );
    return res.send(Buffer.from(buf));
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/** POST /api/library/elearning/import-preview */
exports.previewElearningImport = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let matrix;
    try {
      ({ matrix } = readBookExcelMatrix(req.file.buffer));
    } catch (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || "Could not read Excel file",
      });
    }

    const rawHeaders = matrix[0].map((h, index) => ({
      index,
      header: trimBookCell(h) || `Column ${index + 1}`,
      suggested: normalizeElearningHeader(h),
    }));

    const dataRowCount = matrix.slice(1).filter((row) =>
      row.some((cell) => trimBookCell(cell) !== "")
    ).length;

    const sample = [];
    for (let i = 1; i < matrix.length && sample.length < 5; i++) {
      const row = matrix[i];
      if (!row.some((cell) => trimBookCell(cell) !== "")) continue;
      const obj = {};
      rawHeaders.forEach((col) => {
        obj[col.header] = trimBookCell(row[col.index]);
      });
      sample.push(obj);
    }

    return res.json({
      success: true,
      data: {
        columns: rawHeaders,
        sample,
        row_count: dataRowCount,
        system_fields: ELEARNING_IMPORT_FIELDS,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/library/elearning/import-mapped
 * mapping: { title, url, resource_type, programme, description }
 * defaults: { programme_id, resource_type }
 */
exports.importElearningMapped = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send multipart field name "file".',
      });
    }

    let mapping = {};
    let defaults = {};
    try {
      mapping =
        typeof req.body.mapping === "string"
          ? JSON.parse(req.body.mapping || "{}")
          : req.body.mapping || {};
      defaults =
        typeof req.body.defaults === "string"
          ? JSON.parse(req.body.defaults || "{}")
          : req.body.defaults || {};
    } catch {
      return res.status(400).json({ success: false, message: "Invalid mapping or defaults JSON." });
    }

    if (!mapping.title || !mapping.url) {
      return res.status(400).json({
        success: false,
        message: "Map the Title and URL columns before importing.",
      });
    }

    let matrix;
    try {
      ({ matrix } = readBookExcelMatrix(req.file.buffer));
    } catch (err) {
      return res.status(err.status || 400).json({
        success: false,
        message: err.message || "Could not read Excel file",
      });
    }

    const headerRow = matrix[0].map((h, index) => ({
      index,
      header: trimBookCell(h) || `Column ${index + 1}`,
    }));
    const headerIndex = new Map(headerRow.map((h) => [h.header, h.index]));
    const defaultProgrammeId = await resolveBookProgrammeId(defaults.programme_id);
    const defaultResourceType = normalizeElearningResourceType(defaults.resource_type, "link");

    const dataRows = [];
    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      const excelRow = i + 1;
      const get = (systemKey) => {
        const header = mapping[systemKey];
        if (!header) return "";
        const idx = headerIndex.get(header);
        if (idx === undefined) return "";
        return trimBookCell(row[idx]);
      };

      const title = get("title");
      const url = get("url");
      const resource_type = get("resource_type");
      const programmeValue = get("programme");
      const description = get("description");

      if (!title && !url && !resource_type && !programmeValue && !description) continue;

      dataRows.push({ excelRow, title, url, resource_type, programmeValue, description });
    }

    if (!dataRows.length) {
      return res.status(400).json({
        success: false,
        message: "No data rows found below the header row",
      });
    }
    if (dataRows.length > MAX_ELEARNING_IMPORT_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Too many rows (${dataRows.length}). Maximum per upload is ${MAX_ELEARNING_IMPORT_ROWS}.`,
      });
    }

    const errors = [];
    const created = [];

    for (const row of dataRows) {
      const { excelRow, title, url, resource_type, programmeValue, description } = row;
      if (!title || !url) {
        errors.push({ row: excelRow, message: "Title and URL are required" });
        continue;
      }

      const programme_id =
        (await resolveBookProgrammeId(programmeValue)) || defaultProgrammeId || null;
      const type = normalizeElearningResourceType(resource_type, defaultResourceType);

      try {
        const item = await LibraryElearning.create({
          title,
          url,
          description: description || null,
          resource_type: type,
          programme_id,
          is_active: true,
        });
        created.push({
          row: excelRow,
          id: item.id,
          title: item.title,
          resource_type: item.resource_type,
        });
      } catch (err) {
        errors.push({ row: excelRow, message: err.message || "Could not create resource" });
      }
    }

    return res.json({
      success: true,
      data: {
        createdCount: created.length,
        errorCount: errors.length,
        created,
        errors,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
