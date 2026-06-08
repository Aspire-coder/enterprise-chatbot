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
    console.log("CACHE SAVE", cacheKey);
  } catch (error) {
    console.warn("Redis cache write skipped:", error.message);
  }
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
  const knowledgeBaseId = getMarketKnowledgeBaseId(selectedCountry);
  const shouldUseCache = !healthSafetyQuestion && !incomeOpportunityQuestion;

  if (!knowledgeBaseId) {
    const answer = healthSafetyQuestion
      ? appendHealthGuidance("", responseLanguage)
      : getMarketUnavailableMessage(selectedCountry, responseLanguage);

    return {
      answer,
      citations: [],
      imageCards: [],
      conversationId: sessionId,
      responseSource: "market-knowledge-base-unavailable",
      outcome: "unavailable",
    };
  }

  const cacheKey = generateCacheKey({ message, selectedCountry, responseLanguage });

  if (shouldUseCache) {
    const cachedAnswer = await getCachedAnswer(cacheKey);

    if (cachedAnswer) {
      console.log("CACHE HIT", cacheKey);
      return cachedAnswer;
    }

    console.log("CACHE MISS", cacheKey);
  }

  const retrievalFilter = buildRetrievalFilter({ selectedCountry, message });
  const knowledgeBaseResult = await getKnowledgeBaseResult({
    knowledgeBaseId,
    message,
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
  const outcome = isUnavailableAnswer(answer) ? "unavailable" : "ok";
  const chatResult = {
    answer,
    citations,
    imageCards,
    conversationId: knowledgeBaseResult.response.sessionId || sessionId,
    responseSource: knowledgeBaseResult.responseSource,
    outcome,
  };

  if (shouldUseCache && outcome === "ok") {
    await setCachedAnswer(cacheKey, chatResult);
  }

  return chatResult;
};

export {
  generateCacheKey,
  getCachedAnswer,
  normalizeQuestionForCache,
  processQuestion,
  setCachedAnswer,
};
