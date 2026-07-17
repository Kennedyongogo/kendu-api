/**
 * Thin generic CRUD handlers for Sequelize models (admin/internal modules).
 */
function makeCrudHandlers(Model, options = {}) {
  const order = options.order ?? [["created_at", "DESC"]];
  const defaultLimit = options.defaultLimit ?? 100;
  const maxLimit = options.maxLimit ?? 500;

  return {
    list: async (req, res) => {
      try {
        const limit = Math.min(Number(req.query.limit) || defaultLimit, maxLimit);
        const rows = await Model.findAll({ order, limit });
        return res.json({ success: true, data: rows });
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    },

    getById: async (req, res) => {
      try {
        const row = await Model.findByPk(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Not found" });
        return res.json({ success: true, data: row });
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    },

    create: async (req, res) => {
      try {
        const row = await Model.create(req.body);
        return res.status(201).json({ success: true, data: row });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
    },

    update: async (req, res) => {
      try {
        const row = await Model.findByPk(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Not found" });
        await row.update(req.body);
        return res.json({ success: true, data: row });
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
    },

    remove: async (req, res) => {
      try {
        const row = await Model.findByPk(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: "Not found" });
        await row.destroy();
        return res.json({ success: true, message: "Deleted" });
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    },
  };
}

function registerCrud(router, path, Model, middlewares, opts) {
  const h = makeCrudHandlers(Model, opts);
  const chain = Array.isArray(middlewares) ? middlewares : [middlewares];

  router.get(path, ...chain, h.list);
  router.get(`${path}/:id`, ...chain, h.getById);
  router.post(path, ...chain, h.create);
  router.put(`${path}/:id`, ...chain, h.update);
  router.delete(`${path}/:id`, ...chain, h.remove);
}

module.exports = { makeCrudHandlers, registerCrud };
