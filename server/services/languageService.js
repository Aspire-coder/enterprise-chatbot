// services/languageService.js
import path       from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync }  from "node:fs";
import { readS3Json }    from "../utils/s3Loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── In-memory cache — loaded once, reused forever ─────────────────────────
let _complianceMessages = null;
let _healthFooters      = null;

// ── Generic local JSON reader ─────────────────────────────────────────────
const readLocalJson = (filename) => {
  const filePath = path.join(__dirname, "..", "config", filename);
  return JSON.parse(readFileSync(filePath, "utf8"));
};

// ── Load compliance messages ───────────────────────────────────────────────
const loadComplianceMessages = async () => {
  if (_complianceMessages) return _complianceMessages;

  if (process.env.COMPLIANCE_MESSAGES_S3_URI) {
    try {
      _complianceMessages = await readS3Json(process.env.COMPLIANCE_MESSAGES_S3_URI);
      console.log("Compliance messages loaded from S3");
      return _complianceMessages;
    } catch (err) {
      console.warn("S3 compliance messages failed, using local fallback:", err.message);
    }
  }

  _complianceMessages = readLocalJson("compliance-messages.json");
  console.log("Compliance messages loaded from local file");
  return _complianceMessages;
};

// ── Load health footers ────────────────────────────────────────────────────
const loadHealthFooters = async () => {
  if (_healthFooters) return _healthFooters;

  if (process.env.HEALTH_FOOTERS_S3_URI) {
    try {
      _healthFooters = await readS3Json(process.env.HEALTH_FOOTERS_S3_URI);
      console.log("Health footers loaded from S3");
      return _healthFooters;
    } catch (err) {
      console.warn("S3 health footers failed, using local fallback:", err.message);
    }
  }

  _healthFooters = readLocalJson("health-footers.json");
  console.log("Health footers loaded from local file");
  return _healthFooters;
};

// ── Public API ─────────────────────────────────────────────────────────────

// Returns the correct localized compliance message
// Always falls back to English if the requested language is not found
export const getComplianceMessage = async (type, language = "English") => {
  const messages = await loadComplianceMessages();
  const typeMessages = messages[type] ?? messages["health_safety"];
  return typeMessages[language] ?? typeMessages["English"];
};

// Appends the health guidance footer to a Bedrock answer
export const appendHealthGuidance = async (answer = "", language = "English") => {
  const footers = await loadHealthFooters();
  const footer  = footers[language] ?? footers["English"];
  return answer + footer;
};

// Returns the language to respond in
// If selectedLanguage is set and not "Auto", use it — otherwise default to English
export const detectResponseLanguage = (selectedLanguage = "") =>
  selectedLanguage && selectedLanguage !== "Auto"
    ? selectedLanguage
    : "English";

// Hot-reload — call this to force fresh load from S3 without server restart
// Useful for: POST /api/admin/reload-config
export const reloadI18nContent = async () => {
  _complianceMessages = null;
  _healthFooters      = null;
  await Promise.all([loadComplianceMessages(), loadHealthFooters()]);
  console.log("i18n content reloaded");
};