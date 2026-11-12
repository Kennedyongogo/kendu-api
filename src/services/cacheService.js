const { getRedis, connectRedis } = require("./redisClient");

const DEFAULT_TTL_SEC = Number(process.env.REDIS_DEFAULT_TTL || 60);

function cacheKey(...parts) {
  return ["kendu", ...parts.map((p) => String(p ?? "").replace(/\s+/g, "_"))].join(":");
}

async function cacheGet(key) {
  const redis = getRedis() || (await connectRedis());
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttlSec = DEFAULT_TTL_SEC) {
  const redis = getRedis() || (await connectRedis());
  if (!redis) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlSec > 0) await redis.set(key, payload, "EX", ttlSec);
    else await redis.set(key, payload);
    return true;
  } catch {
    return false;
  }
}

async function cacheDel(...keys) {
  const redis = getRedis() || (await connectRedis());
  if (!redis || !keys.length) return 0;
  try {
    return await redis.del(...keys);
  } catch {
    return 0;
  }
}

/** Delete keys matching a prefix (SCAN — safe for production). */
async function cacheDelByPrefix(prefix) {
  const redis = getRedis() || (await connectRedis());
  if (!redis) return 0;
  let cursor = "0";
  let removed = 0;
  try {
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      if (keys.length) removed += await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    return removed;
  }
  return removed;
}

/**
 * Read-through cache helper.
 * @param {string} key
 * @param {() => Promise<any>} loader
 * @param {number} [ttlSec]
 */
async function cached(key, loader, ttlSec = DEFAULT_TTL_SEC) {
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await loader();
  await cacheSet(key, value, ttlSec);
  return value;
}

module.exports = {
  cacheKey,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelByPrefix,
  cached,
  DEFAULT_TTL_SEC,
};
