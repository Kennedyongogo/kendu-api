const webrtcRoomService = require("../services/webrtcRoomService");

exports.getIceServers = async (req, res) => {
  try {
    return res.json({
      success: true,
      data: { iceServers: webrtcRoomService.getIceServers() },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
