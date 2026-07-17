const express = require("express");
const router = express.Router();
const { authenticateUser } = require("../middleware/auth");
const googleMeetController = require("../controllers/googleMeetController");

router.get("/oauth/start", authenticateUser, googleMeetController.startOAuth);
router.get("/oauth/callback", googleMeetController.oauthCallback);
router.get("/auth/google", googleMeetController.redirectToGoogle);
router.get("/status", authenticateUser, googleMeetController.getStatus);
router.post("/disconnect", authenticateUser, googleMeetController.disconnect);

module.exports = router;
