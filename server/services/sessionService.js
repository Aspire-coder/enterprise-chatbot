import {
  buildCacheKey,
  deleteCacheValue,
  getCacheValue,
  setCacheValue,
} from "./cacheService.js";

const DEFAULT_SESSION_TTL_SECONDS =
  Number(process.env.CHAT_SESSION_TTL_SECONDS) || 60 * 60 * 24;

const buildSessionKey = (sessionId = "") => buildCacheKey("session", [sessionId]);

const getSession = async (sessionId) => {
  if (!sessionId) return null;

  return getCacheValue(buildSessionKey(sessionId));
};

const saveSession = async (
  sessionId,
  session,
  { ttlSeconds = DEFAULT_SESSION_TTL_SECONDS } = {},
) => {
  if (!sessionId) return false;

  return setCacheValue(
    buildSessionKey(sessionId),
    {
      ...session,
      sessionId,
      updatedAt: new Date().toISOString(),
    },
    { ttlSeconds },
  );
};

const updateSession = async (
  sessionId,
  updater,
  { ttlSeconds = DEFAULT_SESSION_TTL_SECONDS } = {},
) => {
  const currentSession = (await getSession(sessionId)) || {};
  const nextSession =
    typeof updater === "function" ? updater(currentSession) : { ...currentSession, ...updater };

  await saveSession(sessionId, nextSession, { ttlSeconds });
  return nextSession;
};

const appendSessionTurn = async (
  sessionId,
  turn,
  { maxTurns = 20, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS } = {},
) =>
  updateSession(
    sessionId,
    (session) => ({
      ...session,
      turns: [...(Array.isArray(session.turns) ? session.turns : []), turn].slice(-maxTurns),
    }),
    { ttlSeconds },
  );

const deleteSession = async (sessionId) => {
  if (!sessionId) return false;

  return deleteCacheValue(buildSessionKey(sessionId));
};

export {
  DEFAULT_SESSION_TTL_SECONDS,
  appendSessionTurn,
  buildSessionKey,
  deleteSession,
  getSession,
  saveSession,
  updateSession,
};
