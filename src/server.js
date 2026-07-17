const { app, appInitialized } = require("./app");
const config = require("./config/config");
const { testConnections } = require("./config/database");

const PORT = process.env.PORT || 4000;

async function createServer() {
  try {
    await testConnections();
    await appInitialized;

    const server = app.listen(PORT, () => {
      console.log(`🚀 Worker ${process.pid} listening on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(
        `🗄️  Database: ${config.database.direct.database}@${config.database.direct.host}:${config.database.direct.port}`
      );
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
    });

    process.on("SIGTERM", () => {
      console.log(`🔄 Worker ${process.pid} received SIGTERM, shutting down...`);
      server.close(() => {
        console.log(`✅ Worker ${process.pid} closed`);
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      console.log(`🔄 Worker ${process.pid} received SIGINT, shutting down...`);
      server.close(() => {
        console.log(`✅ Worker ${process.pid} closed`);
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
}

module.exports = { createServer };

if (require.main === module) {
  createServer().catch((error) => {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  });
}
