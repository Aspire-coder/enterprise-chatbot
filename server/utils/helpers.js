import { RATE_LIMIT_MS, MAX_REQUESTS_PER_WINDOW } from "../config/constants.js";

const rateLimitMap = new Map();

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_MS };

  if (now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_MS };
  }

  record.count++;
  rateLimitMap.set(ip, record);

  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Too many requests. Please slow down a bit." });
  }
  next();
};

const firstMetadataValue = (metadata = {}, keys = []) => {
  for (const key of keys) {
    const value = metadata[key];

    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
};

const parseS3Uri = (uri = "") => {
  const match = String(uri).match(/^s3:\/\/([^/]+)\/(.+)$/i);

  return match
    ? {
        bucket: match[1],
        key: decodeURIComponent(match[2]),
      }
    : null;
};

const isImagePath = (value = "") => /\.(png|jpe?g|webp|gif)$/i.test(value);

const getContentTypeForImage = (key = "") => {
  if (/\.png$/i.test(key)) return "image/png";
  if (/\.webp$/i.test(key)) return "image/webp";
  if (/\.gif$/i.test(key)) return "image/gif";

  return "image/jpeg";
};

const getFileTitle = (value = "") =>
  decodeURIComponent(String(value).split("/").pop() || "Related image")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const decodeBasicHtmlEntities = (value = "") =>
  String(value)
    .replace(/&auml;/gi, "\u00e4")
    .replace(/&ouml;/gi, "\u00f6")
    .replace(/&uuml;/gi, "\u00fc")
    .replace(/&Auml;/g, "\u00c4")
    .replace(/&Ouml;/g, "\u00d6")
    .replace(/&Uuml;/g, "\u00dc")
    .replace(/&szlig;/gi, "\u00df")
    .replace(/&aring;/gi, "\u00e5")
    .replace(/&Aring;/g, "\u00c5")
    .replace(/&eacute;/gi, "\u00e9")
    .replace(/&egrave;/gi, "\u00e8")
    .replace(/&ecirc;/gi, "\u00ea")
    .replace(/&euml;/gi, "\u00eb")
    .replace(/&agrave;/gi, "\u00e0")
    .replace(/&acirc;/gi, "\u00e2")
    .replace(/&icirc;/gi, "\u00ee")
    .replace(/&ocirc;/gi, "\u00f4")
    .replace(/&ugrave;/gi, "\u00f9")
    .replace(/&ccedil;/gi, "\u00e7")
    .replace(/&igrave;/gi, "\u00ec")
    .replace(/&ograve;/gi, "\u00f2")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isUnavailableAnswer = (answer = "") =>
  /couldn'?t find|could not find|not available|not configured|unable to assist|could not reach|try again|no configured knowledge base|do not have|don'?t have|no information|not found|not in (the )?(selected )?(market )?knowledge base|informazion[ei].*non .*disponibil[ei]|non .*disponibil[ei].*documenti|non riesco .*trovare|non sono presenti|non .*present[ei].*risultat|je ne .*trouve|pas disponible|nicht .*verf.{0,3}gbar|nicht .*enthalten|nicht .*gefunden|konnte .*nicht finden|no .*disponible|no encuentro/i.test(
    answer,
  );

const buildChatPayload = ({
  answer = "",
  productCards = [],
  imageCards = [],
  citations = [],
  conversationId = null,
}) => ({
  answer,
  productCards,
  imageCards,
  citations,
  conversationId,
});

export {
  buildChatPayload,
  decodeBasicHtmlEntities,
  firstMetadataValue,
  getContentTypeForImage,
  getFileTitle,
  isImagePath,
  isUnavailableAnswer,
  parseS3Uri,
  rateLimiter,
};
