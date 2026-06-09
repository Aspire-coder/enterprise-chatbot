// routes/chat.js
import express from "express";
import { rateLimiter }              from "../middleware/rateLimiter.js";
import { runComplianceCheck }       from "../services/complianceService.js";
import { sendKnowledgeBaseRequest } from "../services/bedrockService.js";
import {
  getComplianceMessage,
  appendHealthGuidance,
  detectResponseLanguage,
} from "../services/languageService.js";
import {
  stripInlineMetadataBlocks,
  isUnavailableAnswer,
  formatCitations,
} from "../utils/helpers.js";
import {
  writeChatTurnInsight,
  writeHandoffEvent,
} from "../utils/logger.js";

export const chatRouter = express.Router();

// ── Health check ───────────────────────────────────────────────────────────
chatRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "2.0" });
});

// ── Main chat endpoint ─────────────────────────────────────────────────────
chatRouter.post("/", rateLimiter, async (req, res) => {
  const startedAt = Date.now();

  const {
    message          = "",
    selectedCountry  = "United Kingdom",
    selectedLanguage = "English",
    sessionId        = null,
    transcript       = [],
  } = req.body;

  // Validate
  if (!message.trim()) {
    return res.status(400).json({ error: "Message is required." });
  }

  // ── Step 1: Detect response language ────────────────────────────────────
  const responseLanguage = detectResponseLanguage(selectedLanguage);

  // ── Step 2: Compliance check — ALWAYS before Bedrock ────────────────────
  const compliance = runComplianceCheck(message);

  if (compliance.blocked) {
    const answer = await getComplianceMessage(compliance.type, responseLanguage);

    writeChatTurnInsight({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource:  "compliance",
      outcome:         "blocked",
      complianceType:  compliance.type,
      durationMs:      Date.now() - startedAt,
    });

    return res.json({
      answer,
      sessionId,   // echo back unchanged — no new session started
      citations:   [],
      blocked:     true,
      complianceType: compliance.type,
    });
  }

  // ── Step 3–9: Bedrock Knowledge Base ────────────────────────────────────
  try {
    const {
      answer:    rawAnswer,
      sessionId: newSessionId,
      citations: rawCitations,
    } = await sendKnowledgeBaseRequest({
      message,
      selectedCountry,
      selectedLanguage: responseLanguage,
      sessionId,
    });

    // Step 4: Strip Bedrock metadata noise
    let answer = stripInlineMetadataBlocks(rawAnswer);

    // Step 5: Append health guidance footer when answer covers product topics
    if (/\b(supplement|vitamin|wellness|aloe|product|ingredient|formula|gel)\b/i.test(answer)) {
      answer = await appendHealthGuidance(answer, responseLanguage);
    }

    // Step 6: Detect unavailable answer → trigger handoff
    const unavailable = isUnavailableAnswer(answer);
    if (unavailable) {
      writeHandoffEvent({
        message,
        selectedCountry,
        selectedLanguage,
        responseLanguage,
        reason:     "unavailable-answer",
        transcript,
      });
    }

    // Step 7: Format citations
    const citations = formatCitations(rawCitations);

    // Step 8: Log the turn
    writeChatTurnInsight({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: "bedrock",
      outcome:        unavailable ? "unavailable" : "ok",
      citationCount:  citations.length,
      durationMs:     Date.now() - startedAt,
    });

    // Step 9: Return response
    // newSessionId MUST be returned — frontend stores it and sends it back next turn
    return res.json({
      answer,
      sessionId: newSessionId,
      citations,
      blocked:   false,
    });

  } catch (err) {
    console.error("Bedrock request failed:", err);

    writeChatTurnInsight({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: "bedrock",
      outcome:        "error",
      durationMs:     Date.now() - startedAt,
    });

    return res.status(500).json({
      answer:    "I'm having trouble connecting right now. Please try again in a moment.",
      sessionId, // echo back so frontend doesn't lose the session
      citations: [],
      blocked:   false,
    });
  }
});