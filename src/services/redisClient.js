const Redis = require("ioredis");
const config = require("../config/config");

let client = null;
let connectAttempted = false;

function redisEnabled() {
  const flag = String(process.env.REDIS_ENABLED || "true").toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return Boolean(config.redis?.host);
}

function getRedis() {
  if (!redisEnabled()) return null;
  if (client) return client;

  client = new Redis({
    host: config.redis.host || "127.0.0.1",
    port: Number(config.redis.port || 6379),
    password: config.redis.password || undefined,
    db: Number(config.redis.db || 0),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: Number(config.redis.connectTimeout || 10000),
    commandTimeout: Number(config.redis.commandTimeout || 5000),
  });

  client.on("error", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("⚠️  Redis:", err.message);
    }
  });

  return client;
}

async function connectRedis() {
  if (!redisEnabled() || connectAttempted) return getRedis();
  connectAttempted = true;
  const redis = getRedis();
  if (!redis) return null;
  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    await redis.ping();
    console.log(
      `⚡ Redis connected (${config.redis.host}:${config.redis.port})`
    );
    return redis;
  } catch (err) {
    console.warn(`⚠️  Redis unavailable (${err.message}). Running without cache.`);
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
    client = null;
    return null;
  }
}

module.exports = {
  redisEnabled,
  getRedis,
  connectRedis,
};
