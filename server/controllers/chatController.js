import { defaultMarket } from "../config/markets.js";
import { detectResponseLanguage } from "../services/languageService.js";
import {
  childSafetyPattern,
  getIncomeOpportunityMessage,
  getLocalizedSafetyMessage,
  healthGuidanceMessages,
  isHealthSafetyQuestion,
  isIncomeOpportunityQuestion,
  isMedicalEmergencyQuestion,
  medicalEmergencyMessages,
} from "../services/complianceService.js";
import { normalizeBedrockSessionId } from "../services/bedrockService.js";
import { processQuestion } from "../services/chatService.js";
import { createUnavailableHandoff, writeChatTurnInsight } from "../services/analyticsService.js";
import { buildChatPayload } from "../utils/helpers.js";

export const chatHandler = async (req, res) => {
  try {
  const {
    message,
    selectedCountry = defaultMarket,
    selectedLanguage = "",
    conversationId = null,
    transcript = [],
  } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  const startedAt = Date.now();
  const responseLanguage = detectResponseLanguage(message, selectedLanguage);
  const sessionId =
    responseLanguage === "English" ? normalizeBedrockSessionId(conversationId) : null;
  const healthSafetyQuestion = isHealthSafetyQuestion(message);
  const incomeOpportunityQuestion = isIncomeOpportunityQuestion(message);

  if (isMedicalEmergencyQuestion(message)) {
    const payload = buildChatPayload({
      answer: getLocalizedSafetyMessage(medicalEmergencyMessages, responseLanguage),
      conversationId: sessionId,
    });

    writeChatTurnInsight({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: "medical-emergency-safety-response",
      outcome: "safety",
      startedAt,
    });

    return res.json(payload);
  }

  if (childSafetyPattern.test(message)) {
    const payload = buildChatPayload({
      answer: getLocalizedSafetyMessage(healthGuidanceMessages, responseLanguage),
      conversationId: sessionId,
    });

    writeChatTurnInsight({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: "child-product-safety-response",
      outcome: "safety",
      startedAt,
    });

    return res.json(payload);
  }

  if (incomeOpportunityQuestion) {
    const payload = buildChatPayload({
      answer: getIncomeOpportunityMessage(responseLanguage),
      conversationId: sessionId,
    });

    writeChatTurnInsight({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: "income-opportunity-compliance-response",
      outcome: "compliance",
      startedAt,
    });

    return res.json(payload);
  }

  const chatResult = await processQuestion({
    message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    sessionId,
    transcript,
    healthSafetyQuestion,
    incomeOpportunityQuestion,
  });

  const payload = buildChatPayload({
    answer: chatResult.answer,
    imageCards: chatResult.imageCards,
    citations: chatResult.citations,
    conversationId: chatResult.conversationId,
  });

  writeChatTurnInsight({
    message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    responseSource: chatResult.responseSource,
    outcome: chatResult.outcome,
    citationCount: chatResult.citations.length,
    startedAt,
  });

  if (chatResult.outcome === "unavailable") {
    createUnavailableHandoff({
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      transcript,
      answer: chatResult.answer,
      source: chatResult.responseSource,
    });
  }

  res.json(payload);
  } catch (error) {
    console.error("Bedrock chat error:", error);
    res.status(500).json({
      error: "ASK Vera could not reach the knowledge base. Please try again.",
    });
  }
};
