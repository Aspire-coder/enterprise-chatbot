// utils/logger.js
import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactForLog } from "./helpers.js";

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const logsDir     = path.join(__dirname, "..", "logs");
const chatLogPath = path.join(logsDir, "chat-events.jsonl");
const handoffPath = path.join(logsDir, "handoffs.jsonl");

// ── Auto-create logs/ directory if it doesn't exist ───────────────────────
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ── Internal append helper — never throws ─────────────────────────────────
const appendJsonl = (filePath, record) => {
  try {
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.warn("Logger write error:", err.message);
  }
};

// ── Write one chat turn event ──────────────────────────────────────────────
export const writeChatTurnInsight = ({
  message          = "",
  selectedCountry  = "",
  selectedLanguage = "",
  responseLanguage = "",
  responseSource   = "bedrock",
  outcome          = "ok",       // "ok" | "blocked" | "unavailable" | "error"
  citationCount    = 0,
  complianceType   = null,
  durationMs       = 0,
}) => {
  appendJsonl(chatLogPath, {
    ts:              new Date().toISOString(),
    question:        redactForLog(message),
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    responseSource,
    outcome,
    complianceType,
    citationCount,
    durationMs,
  });
};

// ── Write a handoff event (when Bedrock can't answer) ─────────────────────
export const writeHandoffEvent = ({
  message          = "",
  selectedCountry  = "",
  selectedLanguage = "",
  responseLanguage = "",
  reason           = "unavailable-answer",
  transcript       = [],
}) => {
  appendJsonl(handoffPath, {
    ts:               new Date().toISOString(),
    question:         redactForLog(message),
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    reason,
    status:           "open",
    transcriptLength: transcript.length,  // length only — never log full transcript
  });
};

// ── Internal reader — parses JSONL safely ─────────────────────────────────
const readJsonl = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
};

// ── Public readers ─────────────────────────────────────────────────────────
export const readChatEvents    = () => readJsonl(chatLogPath);
export const readHandoffEvents = () => readJsonl(handoffPath);