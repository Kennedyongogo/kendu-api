const { Op, fn, col, literal } = require("sequelize");
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

const BORROWER_ROLES = new Set(["student", "staff", "admin"]);
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
        by_borrower_role: ["student", "staff", "admin"].map((role) => ({
          role,
          count: Number(byBorrowerRole.find((r) => r.role === role)?.count || 0),
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
      throw httpError(400, "Books can only be issued to students, staff, or admins.");
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

/** GET /api/library/borrowers?search=&role= — pick student/staff/admin */
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
