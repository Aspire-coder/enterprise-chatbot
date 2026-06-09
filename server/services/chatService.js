import {
  buildRetrievalFilter,
  getKnowledgeBaseResult,
  getMarketKnowledgeBaseId,
} from "./bedrockService.js";
import {
  appendHealthGuidance,
  appendIncomeOpportunityGuidance,
} from "./complianceService.js";
import { getImageCardsForResponse } from "./imageService.js";
import { getCacheValue, setCacheValue } from "./cacheService.js";
import { classifyIntent } from "./intentClassifierService.js";
import { rewriteQuery } from "./queryRewriterService.js";
import { validateAnswer } from "./answerValidationService.js";
import {
  buildRetryQuery,
  shouldRetryRetrieval,
} from "./retrievalRecoveryService.js";
import {
  buildContextualQuery,
  getConversationContext,
  saveConversationMessage,
} from "./conversationMemoryService.js";
import { recordMetric } from "./metricsService.js";
import { getMarketUnavailableMessage } from "../controllers/sharedControllerHelpers.js";
import { countryMarketCodeMap } from "../config/markets.js";
import { isUnavailableAnswer } from "../utils/helpers.js";
import { formatCitations, stripInlineMetadataBlocks } from "../utils/formatters.js";

const CHAT_CACHE_TTL_SECONDS = 86400;

const responseLanguageCodeMap = {
  Dutch: "NL",
  English: "EN",
  French: "FR",
  German: "DE",
  Italian: "IT",
  Japanese: "JP",
  Polish: "PL",
  Serbian: "SR",
  Spanish: "ES",
};

const normalizeQuestionForCache = (message = "") =>
  String(message)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?;:,\s]+$/g, "")
    .replace(/\s+/g, "_");

const generateCacheKey = ({
  message = "",
  selectedCountry = "",
  responseLanguage = "",
}) => [
  countryMarketCodeMap[selectedCountry] || selectedCountry,
  responseLanguageCodeMap[responseLanguage] || responseLanguage,
  normalizeQuestionForCache(message),
]
  .map((value) => String(value || "").trim())
  .filter(Boolean)
  .join(":");

const getCachedAnswer = async (cacheKey) => {
  try {
    return await getCacheValue(cacheKey);
  } catch (error) {
    console.warn("Redis cache read skipped:", error.message);
    return null;
  }
};

const setCachedAnswer = async (cacheKey, chatResult) => {
  try {
    await setCacheValue(cacheKey, chatResult, { ttlSeconds: CHAT_CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("Redis cache write skipped:", error.message);
  }
};

const retrieveAndBuildChatResult = async ({
  knowledgeBaseId,
  query,
  message,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  sessionId,
  healthSafetyQuestion,
  incomeOpportunityQuestion,
  intentResult,
  rewrittenQuery,
}) => {
  const retrievalFilter = buildRetrievalFilter({
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    message: query,
  });
  const knowledgeBaseResult = await getKnowledgeBaseResult({
    knowledgeBaseId,
    message: query,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    retrievalFilter,
    sessionId,
  });

  const rawAnswer = stripInlineMetadataBlocks(knowledgeBaseResult.parsedAnswer.answer);
  const answer = healthSafetyQuestion
    ? appendHealthGuidance(rawAnswer, responseLanguage)
    : incomeOpportunityQuestion
      ? appendIncomeOpportunityGuidance(rawAnswer, responseLanguage)
      : rawAnswer;
  const citations = formatCitations(knowledgeBaseResult.response.citations || []);
  const imageCards = getImageCardsForResponse({
    citations: knowledgeBaseResult.response.citations || [],
    message,
    selectedCountry,
  });
  const validation = validateAnswer({
    answer,
    citations,
    intent: intentResult.intent,
  });
  recordMetric({
    type: "ANSWER_VALIDATED",
    data: {
      confidence: validation.confidence,
      valid: validation.isValid,
      reasons: validation.reasons,
      intent: intentResult.intent,
    },
  });

  return {
    answer,
    citations,
    imageCards,
    conversationId: knowledgeBaseResult.response.sessionId || sessionId,
    responseSource: knowledgeBaseResult.responseSource,
    outcome: isUnavailableAnswer(answer) ? "unavailable" : "ok",
    intent: intentResult,
    rewrittenQuery,
    validation,
  };
};

const processQuestion = async ({
  message,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  sessionId,
  healthSafetyQuestion,
  incomeOpportunityQuestion,
}) => {
  const conversationContext = await getConversationContext(sessionId);
  const contextualQuery = buildContextualQuery({
    message,
    context: conversationContext,
  });

  if (sessionId && contextualQuery !== message) {
    recordMetric({
      type: "CONVERSATION_CONTEXT_USED",
      data: {
        conversationId: sessionId,
        message,
        contextualQuery,
      },
    });
  }

  const intentResult = classifyIntent(contextualQuery);
  recordMetric({
    type: "INTENT_CLASSIFIED",
    data: intentResult,
  });
  const queryRewrite = rewriteQuery({
    message: contextualQuery,
    intent: intentResult.intent,
  });
  recordMetric({
    type: "QUERY_REWRITTEN",
    data: {
      intent: intentResult.intent,
      ...queryRewrite,
    },
  });

  const knowledgeBaseId = getMarketKnowledgeBaseId(selectedCountry);
  const shouldUseCache = !healthSafetyQuestion && !incomeOpportunityQuestion;

  if (!knowledgeBaseId) {
    const answer = healthSafetyQuestion
      ? appendHealthGuidance("", responseLanguage)
      : getMarketUnavailableMessage(selectedCountry, responseLanguage);

    const unavailableResult = {
      answer,
      citations: [],
      imageCards: [],
      conversationId: sessionId,
      responseSource: "market-knowledge-base-unavailable",
      outcome: "unavailable",
      intent: intentResult,
      rewrittenQuery: queryRewrite.rewrittenQuery,
    };
    recordMetric({
      type: "UNAVAILABLE_RESPONSE",
      data: {
        responseSource: unavailableResult.responseSource,
        selectedCountry,
        responseLanguage,
        intent: intentResult.intent,
      },
    });

    await saveConversationMessage({
      conversationId: sessionId,
      message,
    });

    return unavailableResult;
  }

  const cacheKey = generateCacheKey({
    message: contextualQuery,
    selectedCountry,
    responseLanguage,
  });

  if (shouldUseCache) {
    const cachedAnswer = await getCachedAnswer(cacheKey);

    if (cachedAnswer) {
      recordMetric({
        type: "CACHE_HIT",
        data: { cacheKey },
      });
      await saveConversationMessage({
        conversationId: sessionId,
        message,
      });
      return {
        ...cachedAnswer,
        conversationId: sessionId || cachedAnswer.conversationId,
      };
    }

    recordMetric({
      type: "CACHE_MISS",
      data: { cacheKey },
    });
  }

  const firstChatResult = await retrieveAndBuildChatResult({
    knowledgeBaseId,
    query: queryRewrite.rewrittenQuery,
    message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    sessionId,
    healthSafetyQuestion,
    incomeOpportunityQuestion,
    intentResult,
    rewrittenQuery: queryRewrite.rewrittenQuery,
  });
  let chatResult = firstChatResult;
  const retryDecision = shouldRetryRetrieval(firstChatResult.validation);

  if (retryDecision.shouldRetry) {
    recordMetric({
      type: "RETRIEVAL_RETRY_TRIGGERED",
      data: {
        reason: retryDecision.reason,
        intent: intentResult.intent,
      },
    });

    const retryQuery = buildRetryQuery({
      originalQuery: queryRewrite.originalQuery,
      rewrittenQuery: queryRewrite.rewrittenQuery,
      intent: intentResult.intent,
    });
    const retryChatResult = await retrieveAndBuildChatResult({
      knowledgeBaseId,
      query: retryQuery,
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      sessionId,
      healthSafetyQuestion,
      incomeOpportunityQuestion,
      intentResult,
      rewrittenQuery: retryQuery,
    });
    const selectedResult =
      retryChatResult.validation.confidence > firstChatResult.validation.confidence
        ? "retry"
        : "original";

    recordMetric({
      type: "RETRIEVAL_RETRY_COMPLETED",
      data: {
        originalConfidence: firstChatResult.validation.confidence,
        retryConfidence: retryChatResult.validation.confidence,
        selected: selectedResult,
      },
    });

    if (selectedResult === "retry") {
      chatResult = retryChatResult;
    }
  }

  if (shouldUseCache && chatResult.outcome === "ok") {
    await setCachedAnswer(cacheKey, chatResult);
  }

  if (chatResult.outcome === "unavailable") {
    recordMetric({
      type: "UNAVAILABLE_RESPONSE",
      data: {
        responseSource: chatResult.responseSource,
        selectedCountry,
        responseLanguage,
        intent: intentResult.intent,
      },
    });
  }

  await saveConversationMessage({
    conversationId: chatResult.conversationId || sessionId,
    message,
  });

  return chatResult;
};

export {
  generateCacheKey,
  getCachedAnswer,
  normalizeQuestionForCache,
  processQuestion,
  setCachedAnswer,
};
