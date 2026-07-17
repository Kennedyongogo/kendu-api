const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/auth");
const { getIceServers } = require("../controllers/realtimeController");

router.get("/ice-servers", authenticateUser, getIceServers);

module.exports = router;
