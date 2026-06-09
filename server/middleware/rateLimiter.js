// middleware/rateLimiter.js

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQ   = 30;         // max requests per IP per window

// ── In-memory fallback store ───────────────────────────────────────────────
const memoryStore = new Map();

const inMemoryCheck = (ip) => {
  const now   = Date.now();
  const entry = memoryStore.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count   = 0;
    entry.resetAt = now + WINDOW_MS;
  }

  entry.count++;
  memoryStore.set(ip, entry);
  return entry.count > MAX_REQ;
};

// ── Redis / ElastiCache connection ─────────────────────────────────────────
// Attempted once at startup — never throws, always falls back gracefully
let redisClient = null;

const initRedis = async () => {
  const url = process.env.ELASTICACHE_URL;
  if (!url) {
    console.log("Rate limiter: ELASTICACHE_URL not set, using in-memory fallback");
    return;
  }

  try {
    const { createClient } = await import("redis");
    const client = createClient({ url });

    client.on("error", (err) =>
      console.warn("Rate limiter Redis error:", err.message)
    );

    await client.connect();
    redisClient = client;
    console.log("Rate limiter: connected to ElastiCache");
  } catch (err) {
    console.warn("Rate limiter: Redis unavailable, using in-memory fallback:", err.message);
  }
};

// Start connection attempt at module load — non-blocking
initRedis();

// ── Rate limiter middleware ────────────────────────────────────────────────
export const rateLimiter = async (req, res, next) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";

  // ── Try Redis first ──────────────────────────────────────────────────────
  if (redisClient) {
    try {
      const key   = `ratelimit:${ip}`;
      const count = await redisClient.incr(key);

      // Set expiry only on first request in this window
      if (count === 1) await redisClient.expire(key, 60);

      if (count > MAX_REQ) {
        return res.status(429).json({
          error: "Too many requests. Please wait and try again.",
        });
      }

      return next();

    } catch (err) {
      // Redis threw mid-request — fall through to in-memory silently
      console.warn("Rate limiter Redis check failed, falling back:", err.message);
    }
  }

  // ── In-memory fallback ───────────────────────────────────────────────────
  if (inMemoryCheck(ip)) {
    return res.status(429).json({
      error: "Too many requests. Please wait and try again.",
    });
  }

  next();
};