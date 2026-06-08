import { defaultMarket } from "../config/markets.js";
import { detectResponseLanguage } from "../services/languageService.js";
import {
  createHandoffEvent,
  normalizeQuestionForInsights,
  redactQuestionForLog,
  writeChatInsightEvent,
} from "../services/analyticsService.js";

export const escalationHandler = (req, res) => {
const {
  question = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  reason = "manual",
  transcript = [],
} = req.body || {};

const responseLanguage = detectResponseLanguage(question, selectedLanguage);
const handoff = createHandoffEvent({
  question,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  reason,
  status: "open",
  transcript,
  source: "manual-handoff",
  outcome: "handoff",
});

writeChatInsightEvent({
  question: redactQuestionForLog(question),
  normalizedQuestion: normalizeQuestionForInsights(question),
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  responseSource: "manual-handoff",
  outcome: "handoff",
  productCardCount: 0,
  citationCount: 0,
  durationMs: 0,
});

res.status(201).json({
  ok: true,
  handoffId: handoff.id,
  message: "This conversation has been shared with the customer care team.",
});
};
