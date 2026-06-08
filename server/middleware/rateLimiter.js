import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "../config/constants.js";
import { buildCacheKey, connectRedis } from "../services/cacheService.js";

const memoryStore = new Map();

const getClientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";

const logRateLimitExceeded = (ip) => {
  console.warn(`RATE_LIMIT_EXCEEDED\nip=${ip}`);
};

const getMemoryRateLimitCount = (ip) => {
  const now = Date.now();
  const record = memoryStore.get(ip);

  if (!record || now > record.resetAt) {
    const nextRecord = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
    memoryStore.set(ip, nextRecord);
    return nextRecord.count;
  }

  record.count += 1;
  memoryStore.set(ip, record);
  return record.count;
};

const getRedisRateLimitCount = async (ip) => {
  const client = await connectRedis();
  if (!client) return null;

  const key = buildCacheKey("rate-limit", [ip]);
  const count = await client.incr(key);

  if (count === 1) {
    await client.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
  }

  return count;
};

const getRateLimitCount = async (ip) => {
  try {
    const redisCount = await getRedisRateLimitCount(ip);
    if (redisCount !== null) return redisCount;
  } catch (error) {
    console.warn("Redis rate limiter unavailable, using memory storage:", error.message);
  }

  return getMemoryRateLimitCount(ip);
};

const rateLimiter = async (req, res, next) => {
  try {
    const ip = getClientIp(req);
    const count = await getRateLimitCount(ip);

    if (count > RATE_LIMIT_MAX_REQUESTS) {
      logRateLimitExceeded(ip);
      return res.status(429).json({
        error: "Too many requests. Please try again in a minute.",
      });
    }
  } catch (error) {
    console.warn("Rate limiter failed open:", error.message);
  }

  next();
};

export { rateLimiter };
