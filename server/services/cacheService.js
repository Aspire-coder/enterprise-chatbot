import { createClient } from "redis";

const DEFAULT_CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS) || 15 * 60;
const CACHE_KEY_PREFIX = process.env.CACHE_KEY_PREFIX || "ask-vera";

let redisClient = null;
let redisConnectionPromise = null;

const isCacheEnabled = () => Boolean(process.env.REDIS_URL);

const getRedisClient = () => {
  if (!isCacheEnabled()) return null;

  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: false,
      },
    });

    redisClient.on("error", (error) => {
      console.warn("Redis cache error:", error.message);
    });
  }

  return redisClient;
};

const connectRedis = async () => {
  const client = getRedisClient();
  if (!client) return null;
  if (client.isOpen) return client;

  redisConnectionPromise ||= client.connect().catch((error) => {
    redisConnectionPromise = null;
    throw error;
  });

  await redisConnectionPromise;
  return client;
};

const closeRedis = async () => {
  if (!redisClient || !redisClient.isOpen) return;

  await redisClient.quit();
  redisConnectionPromise = null;
};

const normalizeKeyPart = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const buildCacheKey = (namespace = "general", parts = []) =>
  [CACHE_KEY_PREFIX, normalizeKeyPart(namespace), ...parts.map(normalizeKeyPart)]
    .filter(Boolean)
    .join(":");

const serializeCacheValue = (value) =>
  JSON.stringify({
    value,
    cachedAt: new Date().toISOString(),
  });

const deserializeCacheValue = (cachedValue) => {
  if (!cachedValue) return null;

  try {
    return JSON.parse(cachedValue).value ?? null;
  } catch {
    return null;
  }
};

const getCacheValue = async (key) => {
  const client = await connectRedis();
  if (!client || !key) return null;

  return deserializeCacheValue(await client.get(key));
};

const setCacheValue = async (key, value, { ttlSeconds = DEFAULT_CACHE_TTL_SECONDS } = {}) => {
  const client = await connectRedis();
  if (!client || !key) return false;

  const serializedValue = serializeCacheValue(value);

  if (ttlSeconds > 0) {
    await client.set(key, serializedValue, { EX: ttlSeconds });
  } else {
    await client.set(key, serializedValue);
  }

  return true;
};

const deleteCacheValue = async (key) => {
  const client = await connectRedis();
  if (!client || !key) return false;

  await client.del(key);
  return true;
};

const getOrSetCacheValue = async (key, resolver, options = {}) => {
  const cachedValue = await getCacheValue(key);
  if (cachedValue !== null) return cachedValue;

  const freshValue = await resolver();
  await setCacheValue(key, freshValue, options);

  return freshValue;
};

export {
  DEFAULT_CACHE_TTL_SECONDS,
  buildCacheKey,
  closeRedis,
  connectRedis,
  deleteCacheValue,
  getCacheValue,
  getOrSetCacheValue,
  getRedisClient,
  isCacheEnabled,
  setCacheValue,
};
