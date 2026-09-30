const crypto = require("crypto");
const { Op, QueryTypes } = require("sequelize");
const { sequelize, User, ChurchService, ChurchBooking } = require("../models");
const { notify } = require("../services/notificationService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHOOL_TZ = process.env.SCHOOL_TIMEZONE || "Africa/Nairobi";
const MANAGER_ROLES = ["admin", "staff"];
const SHAPE_TYPES = [
  "room",
  "cross",
  "stage",
  "pulpit",
  "altar",
  "choir",
  "door",
  "aisle",
  "pillar",
  "window",
  "area",
  "label",
];
/** How long after the start a service stays listed for booking/monitoring when it has no end time. */
const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000;

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function sendError(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error("Church API error:", error);
  return res.status(status).json({
    success: false,
    message: error.message || "Something went wrong",
    ...(error.code ? { code: error.code } : {}),
  });
}

const isManager = (user) => MANAGER_ROLES.includes(user?.role);

function assertUuid(id, what = "Service") {
  if (!UUID_RE.test(String(id))) throw httpError(404, `${what} not found.`);
}

function parseDate(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw httpError(400, `${field} is required.`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(400, `${field} is not a valid date and time.`);
  return d;
}

function cleanText(value, maxLen) {
  if (value === undefined) return undefined;
  const s = String(value ?? "").trim();
  return s ? s.slice(0, maxLen) : null;
}

function finite(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, `Layout ${field} must be a number.`);
  return Math.round(n * 10) / 10;
}

const CROSS_WALL_KEYS = ["hl", "hr", "fl", "fr", "lt", "lb", "rt", "rb"];

/**
 * Wall positions of a cross-shaped hall as fractions of its box: head (hl/hr) and foot (fl/fr) side walls,
 * and the front/back walls of the left (lt/lb) and right (rt/rb) arms. Missing keys fall back to the default cross.
 */
function normalizeCross(raw) {
  const out = {};
  for (const key of CROSS_WALL_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) throw httpError(400, `Cross wall "${key}" must be a number.`);
    out[key] = Math.round(Math.min(Math.max(n, 0), 1) * 1e6) / 1e6;
  }
  return out;
}

/** Validates and normalises a layout coming from the designer. */
function normalizeLayout(raw) {
  if (!raw || typeof raw !== "object") throw httpError(400, "Layout is missing.");
  const width = Math.min(Math.max(finite(raw.width ?? 1200, "width"), 300), 6000);
  const height = Math.min(Math.max(finite(raw.height ?? 900, "height"), 300), 6000);
  const seatSize = Math.min(Math.max(finite(raw.seat_size ?? 28, "seat_size"), 14), 80);

  const shapesIn = Array.isArray(raw.shapes) ? raw.shapes : [];
  const seatsIn = Array.isArray(raw.seats) ? raw.seats : [];
  if (shapesIn.length > 600) throw httpError(400, "A layout can have at most 600 shapes.");
  if (seatsIn.length > 4000) throw httpError(400, "A layout can have at most 4000 seats.");

  const shapes = shapesIn.map((s, i) => {
    const type = String(s?.type || "");
    if (!SHAPE_TYPES.includes(type)) throw httpError(400, `Shape ${i + 1} has an unknown type "${type}".`);
    const shape = {
      id: String(s.id || `shape-${i + 1}`).slice(0, 40),
      type,
      x: finite(s.x, "x"),
      y: finite(s.y, "y"),
      w: Math.max(finite(s.w, "w"), 4),
      h: Math.max(finite(s.h, "h"), 4),
      label: cleanText(s.label, 60) ?? null,
    };
    if (type === "cross" && s.cross && typeof s.cross === "object") shape.cross = normalizeCross(s.cross);
    return shape;
  });

  const ids = new Set();
  const labels = new Map();
  const seats = seatsIn.map((s, i) => {
    const id = String(s?.id ?? "").trim().slice(0, 40);
    const label = String(s?.label ?? "").trim().slice(0, 20);
    if (!id) throw httpError(400, `Seat ${i + 1} is missing an id.`);
    if (!label) throw httpError(400, `Seat ${i + 1} is missing a label.`);
    if (ids.has(id)) throw httpError(400, `Two seats share the id "${id}".`);
    const labelKey = label.toLowerCase();
    if (labels.has(labelKey)) throw httpError(400, `Seat label "${label}" is used more than once.`);
    ids.add(id);
    labels.set(labelKey, true);
    return {
      id,
      label,
      x: finite(s.x, "x"),
      y: finite(s.y, "y"),
      section: cleanText(s.section, 40) ?? null,
      group: cleanText(s.group, 40) ?? null,
      bookable: s.bookable !== false,
    };
  });

  return { width, height, seat_size: seatSize, shapes, seats };
}

function layoutCounts(layout) {
  const seats = layout?.seats || [];
  return { seat_count: seats.length, bookable_seat_count: seats.filter((s) => s.bookable !== false).length };
}

function serviceEnd(service) {
  if (service.ends_at) return new Date(service.ends_at);
  return new Date(new Date(service.starts_at).getTime() + DEFAULT_DURATION_MS);
}

function bookingClosesAt(service) {
  return new Date(service.booking_closes_at || service.starts_at);
}

function isBookingOpen(service, now = new Date()) {
  return service.status === "approved" && now < bookingClosesAt(service);
}

function formatWhen(date) {
  return new Date(date).toLocaleString("en-GB", {
    timeZone: SCHOOL_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function newReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let out = "CH-";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function bookingCounts(serviceIds) {
  if (!serviceIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT service_id,
            COUNT(*)::int AS booked,
            COUNT(*) FILTER (WHERE attendance = 'present')::int AS present,
            COUNT(*) FILTER (WHERE attendance = 'absent')::int AS absent
       FROM church_bookings
      WHERE status = 'active' AND service_id IN (:ids)
      GROUP BY service_id`,
    { replacements: { ids: serviceIds }, type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [r.service_id, r]));
}

function serializeService(service, counts, { includeLayout = false, now = new Date() } = {}) {
  const s = service.get ? service.get({ plain: true }) : service;
  const c = counts || { booked: 0, present: 0, absent: 0 };
  const booked = Number(c.booked) || 0;
  const out = {
    id: s.id,
    title: s.title,
    service_type: s.service_type,
    description: s.description,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    booking_closes_at: s.booking_closes_at || s.starts_at,
    status: s.status,
    seat_count: s.seat_count,
    bookable_seat_count: s.bookable_seat_count,
    booked_count: booked,
    available_count: Math.max((s.bookable_seat_count || 0) - booked, 0),
    present_count: Number(c.present) || 0,
    absent_count: Number(c.absent) || 0,
    booking_open: isBookingOpen(s, now),
    has_started: now >= new Date(s.starts_at),
    has_ended: now >= serviceEnd(s),
    created_by: s.creator ? { id: s.creator.id, full_name: s.creator.full_name } : null,
    reviewed_by: s.reviewer ? { id: s.reviewer.id, full_name: s.reviewer.full_name } : null,
    submitted_at: s.submitted_at,
    reviewed_at: s.reviewed_at,
    review_note: s.review_note,
    created_at: s.created_at ?? s.createdAt,
    updated_at: s.updated_at ?? s.updatedAt,
  };
  if (includeLayout) out.layout = s.layout;
  return out;
}

const personInclude = (as) => ({ model: User, as, attributes: ["id", "full_name"], required: false });

async function loadService(id, { transaction, lock } = {}) {
  assertUuid(id);
  const service = await ChurchService.findByPk(id, {
    include: lock ? [] : [personInclude("creator"), personInclude("reviewer")],
    transaction,
    lock,
  });
  if (!service) throw httpError(404, "Service not found.");
  return service;
}

function serializeBooking(b, { service, withUser = false } = {}) {
  const plain = b.get ? b.get({ plain: true }) : b;
  const out = {
    id: plain.id,
    service_id: plain.service_id,
    seat_key: plain.seat_key,
    seat_label: plain.seat_label,
    reference: plain.reference,
    status: plain.status,
    attendance: plain.attendance,
    checked_at: plain.checked_at,
    cancelled_at: plain.cancelled_at,
    created_at: plain.created_at ?? plain.createdAt,
  };
  if (withUser && plain.user) {
    out.user = {
      id: plain.user.id,
      full_name: plain.user.full_name,
      admission_number: plain.user.admission_number,
      role: plain.user.role,
      email: plain.user.email,
    };
  }
  if (plain.checker) out.checked_by = { id: plain.checker.id, full_name: plain.checker.full_name };
  if (service) out.service = service;
  return out;
}

function parseServiceFields(body, { partial = false } = {}) {
  const fields = {};
  if (!partial || body.title !== undefined) {
    const title = cleanText(body.title, 150);
    if (!title) throw httpError(400, "Give the service a title.");
    fields.title = title;
  }
  if (body.service_type !== undefined) fields.service_type = cleanText(body.service_type, 60);
  if (body.description !== undefined) fields.description = cleanText(body.description, 4000);
  if (!partial || body.starts_at !== undefined) {
    fields.starts_at = parseDate(body.starts_at, "Start time", { required: true });
  }
  if (body.ends_at !== undefined) fields.ends_at = parseDate(body.ends_at, "End time");
  if (body.booking_closes_at !== undefined) {
    fields.booking_closes_at = parseDate(body.booking_closes_at, "Booking closing time");
  }
  return fields;
}

function assertTimes(service) {
  const starts = new Date(service.starts_at);
  if (service.ends_at && new Date(service.ends_at) <= starts) {
    throw httpError(400, "The service must end after it starts.");
  }
  if (service.booking_closes_at && new Date(service.booking_closes_at) > serviceEnd(service)) {
    throw httpError(400, "Booking must close before the service ends.");
  }
}

// ---------------------------------------------------------------------------
// Management (admin portal + mobile monitoring)
// ---------------------------------------------------------------------------

exports.listServices = async (req, res) => {
  try {
    const where = {};
    const status = String(req.query.status || "").trim();
    if (status) {
      const statuses = status.split(",").filter(Boolean);
      where.status = { [Op.in]: statuses };
    }
    const now = new Date();
    if (req.query.when === "upcoming") {
      where[Op.or] = [
        { ends_at: { [Op.gte]: now } },
        { ends_at: null, starts_at: { [Op.gte]: new Date(now.getTime() - DEFAULT_DURATION_MS) } },
      ];
    } else if (req.query.when === "past") {
      where[Op.or] = [
        { ends_at: { [Op.lt]: now } },
        { ends_at: null, starts_at: { [Op.lt]: new Date(now.getTime() - DEFAULT_DURATION_MS) } },
      ];
    }
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const { count, rows } = await ChurchService.findAndCountAll({
      where,
      attributes: { exclude: ["layout"] },
      include: [personInclude("creator"), personInclude("reviewer")],
      order: [["starts_at", req.query.when === "past" ? "DESC" : "ASC"]],
      limit,
      offset,
      distinct: true,
    });
    const counts = await bookingCounts(rows.map((r) => r.id));

    return res.json({
      success: true,
      data: {
        total: count,
        limit,
        offset,
        services: rows.map((r) => serializeService(r, counts.get(r.id), { now })),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getService = async (req, res) => {
  try {
    const service = await loadService(req.params.id);
    const counts = await bookingCounts([service.id]);
    return res.json({
      success: true,
      data: serializeService(service, counts.get(service.id), { includeLayout: true }),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.createService = async (req, res) => {
  try {
    const fields = parseServiceFields(req.body);
    let layout = { width: 1200, height: 900, seat_size: 28, shapes: [], seats: [] };
    if (req.body.copy_from_service_id) {
      const source = await loadService(req.body.copy_from_service_id);
      layout = source.layout;
    } else if (req.body.layout) {
      layout = normalizeLayout(req.body.layout);
    }
    assertTimes(fields);

    const service = await ChurchService.create({
      ...fields,
      layout,
      ...layoutCounts(layout),
      status: "draft",
      created_by: req.user.id,
    });
    const fresh = await loadService(service.id);
    return res.status(201).json({
      success: true,
      message: "Service created as a draft.",
      data: serializeService(fresh, null, { includeLayout: true }),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.updateService = async (req, res) => {
  try {
    const fields = parseServiceFields(req.body, { partial: true });
    const layout = req.body.layout !== undefined ? normalizeLayout(req.body.layout) : null;

    await sequelize.transaction(async (transaction) => {
      const service = await loadService(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (service.status === "cancelled") throw httpError(409, "A cancelled service cannot be edited.");

      if (layout) {
        const active = await ChurchBooking.findAll({
          where: { service_id: service.id, status: "active" },
          attributes: ["seat_key", "seat_label"],
          transaction,
        });
        if (active.length) {
          const bookable = new Set(layout.seats.filter((s) => s.bookable).map((s) => s.id));
          const lost = active.filter((b) => !bookable.has(b.seat_key)).map((b) => b.seat_label);
          if (lost.length) {
            throw httpError(
              409,
              `These seats are already booked and cannot be removed or blocked: ${lost.slice(0, 12).join(", ")}${
                lost.length > 12 ? "…" : ""
              }`
            );
          }
        }
        fields.layout = layout;
        Object.assign(fields, layoutCounts(layout));
      }

      assertTimes({ ...service.get({ plain: true }), ...fields });
      if (service.status === "rejected") {
        fields.status = "draft";
        fields.review_note = null;
      }
      await service.update(fields, { transaction });
    });

    const fresh = await loadService(req.params.id);
    const counts = await bookingCounts([fresh.id]);
    return res.json({
      success: true,
      message: "Service saved.",
      data: serializeService(fresh, counts.get(fresh.id), { includeLayout: true }),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

async function transition(req, res, { from, to, message, requireSeats = false, extra = () => ({}) }) {
  try {
    await sequelize.transaction(async (transaction) => {
      const service = await loadService(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!from.includes(service.status)) {
        throw httpError(409, `This service is ${service.status}; it cannot be moved to ${to}.`);
      }
      if (requireSeats && !service.bookable_seat_count) {
        throw httpError(400, "Add at least one bookable seat to the layout first.");
      }
      if (to === "pending" || to === "approved") {
        if (serviceEnd(service) <= new Date()) throw httpError(400, "This service has already ended.");
      }
      await service.update({ status: to, ...extra(req, service) }, { transaction });
    });
    const fresh = await loadService(req.params.id);
    const counts = await bookingCounts([fresh.id]);
    return res.json({ success: true, message, data: serializeService(fresh, counts.get(fresh.id)) });
  } catch (error) {
    return sendError(res, error);
  }
}

exports.submitService = (req, res) =>
  transition(req, res, {
    from: ["draft", "rejected"],
    to: "pending",
    requireSeats: true,
    message: "Submitted for approval.",
    extra: () => ({ submitted_at: new Date(), review_note: null }),
  });

exports.approveService = (req, res) =>
  transition(req, res, {
    from: ["pending", "draft"],
    to: "approved",
    requireSeats: true,
    message: "Service approved. Students can now book seats.",
    extra: (r, service) => ({
      reviewed_by: r.user.id,
      reviewed_at: new Date(),
      review_note: cleanText(r.body?.note, 500) ?? null,
      submitted_at: service.submitted_at || new Date(),
    }),
  });

exports.rejectService = (req, res) => {
  const note = cleanText(req.body?.note, 500);
  if (!note) return res.status(400).json({ success: false, message: "Say why the service is being rejected." });
  return transition(req, res, {
    from: ["pending"],
    to: "rejected",
    message: "Service rejected.",
    extra: (r) => ({ reviewed_by: r.user.id, reviewed_at: new Date(), review_note: note }),
  });
};

exports.cancelService = async (req, res) => {
  try {
    const note = cleanText(req.body?.note, 500);
    let affected = [];
    let service;
    await sequelize.transaction(async (transaction) => {
      service = await loadService(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (service.status === "cancelled") throw httpError(409, "This service is already cancelled.");
      const active = await ChurchBooking.findAll({
        where: { service_id: service.id, status: "active" },
        transaction,
      });
      affected = active.map((b) => ({ user_id: b.user_id, seat_label: b.seat_label, id: b.id }));
      if (active.length) {
        await ChurchBooking.update(
          { status: "cancelled", cancelled_at: new Date(), cancelled_by: req.user.id },
          { where: { id: active.map((b) => b.id) }, transaction }
        );
      }
      await service.update(
        { status: "cancelled", review_note: note ?? service.review_note, reviewed_by: req.user.id, reviewed_at: new Date() },
        { transaction }
      );
    });

    for (const a of affected) {
      await notify(a.user_id, {
        type: "church_service_cancelled",
        title: `${service.title} was cancelled`,
        body: `Your seat ${a.seat_label} for ${formatWhen(service.starts_at)} has been released.${note ? ` Reason: ${note}` : ""}`,
        data: { service_id: service.id, booking_id: a.id, seat_label: a.seat_label },
      });
    }

    const fresh = await loadService(req.params.id);
    return res.json({
      success: true,
      message: affected.length
        ? `Service cancelled. ${affected.length} booking${affected.length === 1 ? "" : "s"} released and notified.`
        : "Service cancelled.",
      data: serializeService(fresh, null),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.duplicateService = async (req, res) => {
  try {
    const source = await loadService(req.params.id);
    const fields = parseServiceFields(
      {
        title: req.body.title ?? source.title,
        service_type: req.body.service_type ?? source.service_type,
        description: req.body.description ?? source.description,
        starts_at: req.body.starts_at,
        ends_at: req.body.ends_at,
        booking_closes_at: req.body.booking_closes_at,
      },
      { partial: false }
    );
    assertTimes(fields);
    const service = await ChurchService.create({
      ...fields,
      layout: source.layout,
      ...layoutCounts(source.layout),
      status: "draft",
      created_by: req.user.id,
    });
    const fresh = await loadService(service.id);
    return res.status(201).json({
      success: true,
      message: "Service duplicated as a draft.",
      data: serializeService(fresh, null, { includeLayout: true }),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.deleteService = async (req, res) => {
  try {
    await sequelize.transaction(async (transaction) => {
      const service = await loadService(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      const active = await ChurchBooking.count({ where: { service_id: service.id, status: "active" }, transaction });
      if (active) throw httpError(409, "This service has bookings. Cancel it instead so students are notified.");
      await ChurchBooking.destroy({ where: { service_id: service.id }, transaction });
      await service.destroy({ transaction });
    });
    return res.json({ success: true, message: "Service deleted.", data: { id: req.params.id } });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listServiceBookings = async (req, res) => {
  try {
    const service = await loadService(req.params.id);
    const includeCancelled = req.query.include_cancelled === "1";
    const bookings = await ChurchBooking.findAll({
      where: { service_id: service.id, ...(includeCancelled ? {} : { status: "active" }) },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "admission_number", "role", "email"],
          required: false,
        },
        personInclude("checker"),
      ],
      order: [["seat_label", "ASC"]],
    });
    const counts = await bookingCounts([service.id]);
    return res.json({
      success: true,
      data: {
        service: serializeService(service, counts.get(service.id)),
        bookings: bookings.map((b) => serializeBooking(b, { withUser: true })),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.setAttendance = async (req, res) => {
  try {
    assertUuid(req.params.id, "Booking");
    const value = req.body?.attendance ?? null;
    if (value !== null && !["present", "absent"].includes(value)) {
      throw httpError(400, "Attendance must be present, absent or null.");
    }
    const booking = await ChurchBooking.findByPk(req.params.id, {
      include: [{ model: ChurchService, as: "service", attributes: ["id", "title", "starts_at", "status"] }],
    });
    if (!booking) throw httpError(404, "Booking not found.");
    if (booking.status !== "active") throw httpError(409, "This booking was cancelled.");

    const previous = booking.attendance;
    await booking.update({
      attendance: value,
      checked_by: value ? req.user.id : null,
      checked_at: value ? new Date() : null,
    });

    if (value === "absent" && previous !== "absent") {
      await notify(booking.user_id, {
        type: "church_absent",
        title: `Marked absent: ${booking.service.title}`,
        body: `You booked seat ${booking.seat_label} for ${formatWhen(booking.service.starts_at)} but were marked absent during the check.`,
        data: { service_id: booking.service_id, booking_id: booking.id, seat_label: booking.seat_label },
      });
    }

    const fresh = await ChurchBooking.findByPk(booking.id, {
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "admission_number", "role", "email"] },
        personInclude("checker"),
      ],
    });
    return res.json({ success: true, message: "Attendance updated.", data: serializeBooking(fresh, { withUser: true }) });
  } catch (error) {
    return sendError(res, error);
  }
};

// ---------------------------------------------------------------------------
// Booking (students via student portal, staff via mobile app)
// ---------------------------------------------------------------------------

exports.listAvailableServices = async (req, res) => {
  try {
    const now = new Date();
    const rows = await ChurchService.findAll({
      where: {
        status: "approved",
        [Op.or]: [
          { ends_at: { [Op.gte]: now } },
          { ends_at: null, starts_at: { [Op.gte]: new Date(now.getTime() - DEFAULT_DURATION_MS) } },
        ],
      },
      attributes: { exclude: ["layout"] },
      order: [["starts_at", "ASC"]],
      limit: 60,
    });
    const ids = rows.map((r) => r.id);
    const counts = await bookingCounts(ids);
    const mine = ids.length
      ? await ChurchBooking.findAll({ where: { service_id: ids, user_id: req.user.id, status: "active" } })
      : [];
    const mineBy = new Map(mine.map((b) => [b.service_id, b]));

    return res.json({
      success: true,
      data: {
        services: rows.map((r) => ({
          ...serializeService(r, counts.get(r.id), { now }),
          my_booking: mineBy.has(r.id) ? serializeBooking(mineBy.get(r.id)) : null,
        })),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getSeatMap = async (req, res) => {
  try {
    const manager = isManager(req.user);
    const service = await loadService(req.params.id);
    if (!manager && service.status !== "approved") throw httpError(404, "Service not found.");

    const active = await ChurchBooking.findAll({
      where: { service_id: service.id, status: "active" },
      include: manager
        ? [{ model: User, as: "user", attributes: ["id", "full_name", "admission_number", "role"], required: false }]
        : [],
    });
    const byKey = new Map(active.map((b) => [b.seat_key, b]));
    const layout = service.layout || { seats: [], shapes: [] };

    const seats = (layout.seats || []).map((seat) => {
      const booking = byKey.get(seat.id);
      let status = seat.bookable === false ? "blocked" : "available";
      if (booking) status = booking.user_id === req.user.id ? "mine" : "booked";
      const out = { ...seat, status };
      if (booking && (manager || booking.user_id === req.user.id)) {
        out.booking = {
          id: booking.id,
          reference: booking.reference,
          attendance: booking.attendance,
          ...(manager && booking.user
            ? {
                user_id: booking.user.id,
                user_name: booking.user.full_name,
                admission_number: booking.user.admission_number,
                role: booking.user.role,
              }
            : {}),
        };
      }
      return out;
    });

    const mine = active.find((b) => b.user_id === req.user.id);
    const counts = await bookingCounts([service.id]);
    return res.json({
      success: true,
      data: {
        service: serializeService(service, counts.get(service.id)),
        layout: { ...layout, seats },
        my_booking: mine ? serializeBooking(mine) : null,
        server_time: new Date().toISOString(),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.bookSeat = async (req, res) => {
  const seatKey = String(req.body?.seat_key ?? "").trim();
  let service;
  let seat;
  let booking;
  try {
    if (!seatKey) throw httpError(400, "Choose a seat.");

    for (let attempt = 0; attempt < 3 && !booking; attempt += 1) {
      try {
        booking = await sequelize.transaction(async (transaction) => {
          // FOR SHARE blocks a concurrent layout edit or cancellation while this booking is written.
          service = await loadService(req.params.id, { transaction, lock: transaction.LOCK.SHARE });
          if (service.status !== "approved") throw httpError(409, "Booking is not open for this service.");
          if (!isBookingOpen(service)) throw httpError(409, "Booking for this service has closed.");

          seat = (service.layout?.seats || []).find((s) => s.id === seatKey);
          if (!seat) throw httpError(404, "That seat does not exist in this service.");
          if (seat.bookable === false) throw httpError(409, "That seat is blocked and cannot be booked.");

          const existing = await ChurchBooking.findOne({
            where: { service_id: service.id, user_id: req.user.id, status: "active" },
            transaction,
          });
          if (existing) {
            throw httpError(409, `You already booked seat ${existing.seat_label} for this service.`, {
              code: "ALREADY_BOOKED",
            });
          }

          return ChurchBooking.create(
            {
              service_id: service.id,
              seat_key: seat.id,
              seat_label: seat.label,
              user_id: req.user.id,
              booked_by: req.user.id,
              reference: newReference(),
              status: "active",
            },
            { transaction }
          );
        });
      } catch (error) {
        if (error.name !== "SequelizeUniqueConstraintError") throw error;
        const constraint = error.parent?.constraint || error.original?.constraint || "";
        if (constraint === "church_bookings_active_seat_unique") {
          throw httpError(409, "Sorry, someone has just booked that seat. Please pick another one.", {
            code: "SEAT_TAKEN",
          });
        }
        if (constraint === "church_bookings_active_user_unique") {
          throw httpError(409, "You already have a seat for this service.", { code: "ALREADY_BOOKED" });
        }
        // Reference collision: retry with a fresh reference.
      }
    }
    if (!booking) throw httpError(500, "Could not complete the booking. Please try again.");

    await notify(req.user.id, {
      type: "church_booking",
      title: `Seat ${seat.label} booked`,
      body: `${service.title} · ${formatWhen(service.starts_at)}. Booking reference ${booking.reference}. Please be seated on time; attendance is checked during the service.`,
      data: { service_id: service.id, booking_id: booking.id, seat_label: seat.label, reference: booking.reference },
    });

    const counts = await bookingCounts([service.id]);
    return res.status(201).json({
      success: true,
      message: `Seat ${seat.label} is yours.`,
      data: serializeBooking(booking, { service: serializeService(service, counts.get(service.id)) }),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.myBookings = async (req, res) => {
  try {
    const bookings = await ChurchBooking.findAll({
      where: { user_id: req.user.id, ...(req.query.include_cancelled === "1" ? {} : { status: "active" }) },
      include: [{ model: ChurchService, as: "service", attributes: { exclude: ["layout"] } }],
      order: [[{ model: ChurchService, as: "service" }, "starts_at", "DESC"]],
      limit: 100,
    });
    return res.json({
      success: true,
      data: {
        bookings: bookings.map((b) =>
          serializeBooking(b, { service: b.service ? serializeService(b.service, null) : null })
        ),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    assertUuid(req.params.id, "Booking");
    const manager = isManager(req.user);
    const booking = await ChurchBooking.findByPk(req.params.id, {
      include: [{ model: ChurchService, as: "service", attributes: ["id", "title", "starts_at", "status"] }],
    });
    if (!booking || (!manager && booking.user_id !== req.user.id)) throw httpError(404, "Booking not found.");
    if (booking.status !== "active") throw httpError(409, "This booking is already cancelled.");
    if (!manager && new Date() >= new Date(booking.service.starts_at)) {
      throw httpError(409, "The service has started; this booking can no longer be cancelled.");
    }

    await booking.update({ status: "cancelled", cancelled_at: new Date(), cancelled_by: req.user.id });

    await notify(booking.user_id, {
      type: "church_booking_cancelled",
      title: `Seat ${booking.seat_label} released`,
      body:
        booking.user_id === req.user.id
          ? `You cancelled your seat for ${booking.service.title} (${formatWhen(booking.service.starts_at)}).`
          : `Your seat for ${booking.service.title} (${formatWhen(booking.service.starts_at)}) was cancelled by the church office.`,
      data: { service_id: booking.service_id, booking_id: booking.id, seat_label: booking.seat_label },
    });

    return res.json({ success: true, message: "Booking cancelled.", data: serializeBooking(booking) });
  } catch (error) {
    return sendError(res, error);
  }
};
