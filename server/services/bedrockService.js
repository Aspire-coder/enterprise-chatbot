import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { defaultMarket, countryMarketCodeMap, countryMarketMetadataMap, getMarketMetadataValue, toMarketEnvKey } from "../config/markets.js";
import { veraPromptTemplate } from "../config/prompts.js";
import { isUnavailableAnswer, decodeBasicHtmlEntities } from "../utils/helpers.js";
import { writeRetrievalDiagnosticsEvent } from "./analyticsService.js";

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
});

const getMarketKnowledgeBaseId = (selectedCountry = defaultMarket) => {
  const marketCode = countryMarketCodeMap[selectedCountry];
  const marketSpecificKnowledgeBaseId =
    process.env[`BEDROCK_KNOWLEDGE_BASE_ID_${toMarketEnvKey(selectedCountry)}`];

  if (marketSpecificKnowledgeBaseId) {
    return marketSpecificKnowledgeBaseId;
  }

  if (marketCode && process.env[`BEDROCK_KNOWLEDGE_BASE_ID_${marketCode}`]) {
    return process.env[`BEDROCK_KNOWLEDGE_BASE_ID_${marketCode}`];
  }

  if (selectedCountry === defaultMarket && process.env.BEDROCK_KNOWLEDGE_BASE_ID) {
    return process.env.BEDROCK_KNOWLEDGE_BASE_ID;
  }

  const globalKnowledgeBaseId = process.env.BEDROCK_GLOBAL_KNOWLEDGE_BASE_ID;

  if (globalKnowledgeBaseId) {
    return globalKnowledgeBaseId;
  }

  return null;
};

let lastBedrockDebug = null;

const isInternationalDirectoryQuestion = (message = "") =>
  /\b(international|global|worldwide|office|offices|office address|address|directory|staff|contact|contacts|phone|email|thailand|thai|country office)\b|ufficio|indirizzo|directory|contatto|contatti|sede|thailandia|internazionale|mondiale|kantoor|adres|gids|contactpersoon|contacten|bureau|adresse|annuaire|coordonn[�e]es/i.test(
    message,
  );

const getRetrievalHints = (message = "") => {
  const hints = [];

  if (isInternationalDirectoryQuestion(message)) {
    hints.push("International directory retrieval intent: answer from global-scoped office directory, staff contacts, country office, address, phone, email, and international contact records. Global-scoped directory results apply regardless of the selected market, so provide the requested office/contact details if they are retrieved.");
  } else {
    hints.push("Document retrieval intent: answer the user's question from selected-market documents first. Search exact user wording, translated equivalents, document titles, headings, policy section numbers, policy clause titles, FBO rules, company conduct rules, program names, qualification rules, benefits, requirements, and support details. Use global-scoped content only as a fallback unless the question is about international offices, staff, contacts, or directory entries.");
  }

  return hints.join("\n");
};

const getExactRetrievalTerms = (message = "") => {
  const text = String(message || "");
  const terms = new Set();

  for (const match of text.matchAll(/\b(?:Art\.?\s*#?|SKU|Product\s*(?:ID|Number)|Artikel(?:nummer)?\.?\s*#?)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,})/gi)) {
    terms.add(match[1]);
  }

  for (const match of text.matchAll(/\b\d{3,8}\b/g)) {
    terms.add(match[0]);
  }

  for (const match of text.matchAll(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,}\b/g)) {
    terms.add(match[0]);
  }

  return Array.from(terms);
};

const hasExactRetrievalTerms = (message = "") => getExactRetrievalTerms(message).length > 0;


const buildMetadataEqualsFilters = (key, values = []) => {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  return uniqueValues.map((value) => ({
    equals: {
      key,
      value,
    },
  }));
};

const buildFlatOrFilter = (filters = []) => {
  const validFilters = filters.filter(Boolean);
  if (validFilters.length === 0) return null;
  return validFilters.length === 1 ? validFilters[0] : { orAll: validFilters };
};

const globalMetadataFilters = [
  ...buildMetadataEqualsFilters("market", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("country", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("region", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("locale", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("scope", ["global", "Global", "GLOBAL"]),
];

const buildMarketScopeFilter = (selectedCountry = defaultMarket) => {
  const metadata = countryMarketMetadataMap[selectedCountry];

  if (!metadata) {
    return buildFlatOrFilter(
      buildMetadataEqualsFilters("market", [getMarketMetadataValue(selectedCountry)]),
    );
  }

  const filters = [
    ...buildMetadataEqualsFilters("market", metadata.marketValues),
    ...buildMetadataEqualsFilters("locale", metadata.localeValues),
    ...buildMetadataEqualsFilters("language", metadata.localeValues),
    ...buildMetadataEqualsFilters("country", metadata.countryValues),
    ...buildMetadataEqualsFilters("region", metadata.regionValues),
    ...buildMetadataEqualsFilters("country", [selectedCountry]),
  ];

  return buildFlatOrFilter(filters);
};

const buildMarketOrGlobalScopeFilter = (selectedCountry = defaultMarket) => {
  const marketFilter = buildMarketScopeFilter(selectedCountry);
  const marketFilters = marketFilter?.orAll ?? (marketFilter ? [marketFilter] : []);
  const combinedFilters = [...marketFilters, ...globalMetadataFilters];

  return buildFlatOrFilter(combinedFilters);
};

const buildGlobalScopeFilter = () => buildFlatOrFilter(globalMetadataFilters);

const getQuestionContentType = () => "document";

const buildRetrievalFilter = ({
  selectedCountry = defaultMarket,
  message = "",
}) => {
  const marketFilter = isInternationalDirectoryQuestion(message)
    ? buildMarketOrGlobalScopeFilter(selectedCountry)
    : buildMarketScopeFilter(selectedCountry);

  if (!marketFilter) return undefined;

  return marketFilter;
};

const buildBedrockQuery = ({
  message = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "English",
}) => {
  const retrievalHints = getRetrievalHints(message);
  const exactTerms = getExactRetrievalTerms(message);
  const contextLines = [
    `Market: ${selectedCountry}`,
    `Required response language: ${responseLanguage}`,
    `You MUST write the final answer entirely in ${responseLanguage}. If the retrieved chunks are in English or another language, translate the explanation into ${responseLanguage} and preserve product names, article numbers, SKU numbers, and symbols exactly.`,
    "Global scope: Content tagged as global applies to every selected market and may be used alongside selected-market documents.",
  ];

  if (selectedLanguage) contextLines.push(`UI language: ${selectedLanguage}`);
  if (retrievalHints) contextLines.push(`Retrieval hint: ${retrievalHints}`);
  if (exactTerms.length > 0) {
    contextLines.push(
      `Exact-match retrieval priority: first find chunks that contain these exact terms before broader semantic matching: ${exactTerms.join(", ")}.`,
    );
  }

  return `${contextLines.join("\n")}\nQuestion: ${message}`;
};


const sendKnowledgeBaseRequest = async ({
  knowledgeBaseId,
  message,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  retrievalFilter,
  sessionId = null,
  forceSemanticSearch = false,
}) =>
  client.send(
    new RetrieveAndGenerateCommand({
      input: {
        text: buildBedrockQuery({
          message,
          selectedCountry,
          selectedLanguage,
          responseLanguage,
        }),
      },
      ...(sessionId ? { sessionId } : {}),
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId,
          modelArn: process.env.BEDROCK_MODEL_ARN,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: hasExactRetrievalTerms(message) ? 24 : 16,
              ...(hasExactRetrievalTerms(message) && !forceSemanticSearch ? { overrideSearchType: "HYBRID" } : {}),
              ...(retrievalFilter ? { filter: retrievalFilter } : {}),
            },
          },
          generationConfiguration: {
            promptTemplate: {
              textPromptTemplate: veraPromptTemplate,
            },
          },
        },
      },
    })
  );


const normalizeBedrockSessionId = (sessionId = "") => {
  const value = String(sessionId || "").trim();

  if (!value || value.startsWith("conv_")) return null;

  return value;
};

const isInvalidBedrockSessionError = (error) =>
  error?.name === "ValidationException" &&
  /session with id .* is not valid/i.test(error?.message || "");

const isBedrockFilterValidationError = (error) =>
  error?.name === "ValidationException" &&
  /filter|filtering|logical operators|nest more than|metadata/i.test(error?.message || "");

const isBedrockHybridSearchValidationError = (error) =>
  error?.name === "ValidationException" &&
  /overrideSearchType|hybrid|search type/i.test(error?.message || "");

const sendKnowledgeBaseRequestWithSessionFallback = async (request) => {
  try {
    return await sendKnowledgeBaseRequest(request);
  } catch (error) {
    if (request.sessionId && isInvalidBedrockSessionError(error)) {
      console.warn(
        "Bedrock rejected the saved session. Retrying without conversation memory.",
        error.message,
      );

      return sendKnowledgeBaseRequestWithSessionFallback({
        ...request,
        sessionId: null,
      });
    }

    if (request.retrievalFilter && isBedrockFilterValidationError(error)) {
      console.warn(
        "Bedrock rejected the metadata filter. Retrying without a retrieval filter.",
        error.message,
      );

      return sendKnowledgeBaseRequestWithSessionFallback({
        ...request,
        retrievalFilter: undefined,
      });
    }

    if (!request.forceSemanticSearch && isBedrockHybridSearchValidationError(error)) {
      console.warn(
        "Bedrock rejected hybrid exact-match search. Retrying with semantic search.",
        error.message,
      );

      return sendKnowledgeBaseRequestWithSessionFallback({
        ...request,
        forceSemanticSearch: true,
      });
    }

    throw error;
  }
};

const getRelaxedRetryFilters = ({
  message = "",
  retrievalFilter,
}) => {
  if (!retrievalFilter) return [];

  if (getQuestionContentType(message) === "document") {
    if (isInternationalDirectoryQuestion(message)) {
      return [buildGlobalScopeFilter()];
    }

    return [buildGlobalScopeFilter()];
  }

  return [];
};

const shouldRetryKnowledgeBaseWithRelaxedFilter = ({
  answer = "",
  message = "",
  selectedCountry = "",
  retrievalFilter,
}) =>
  Boolean(retrievalFilter) &&
  isUnavailableAnswer(answer) &&
  getRelaxedRetryFilters({ selectedCountry, message, retrievalFilter }).length > 0;

const getRetrievedReferenceCount = (response = {}) =>
  (response.citations || []).reduce(
    (count, citation) => count + (citation.retrievedReferences || []).length,
    0,
  );

const getKnowledgeBaseResult = async ({
  knowledgeBaseId,
  message,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  retrievalFilter,
  sessionId = null,
}) => {
  const firstResponse = await sendKnowledgeBaseRequestWithSessionFallback({
    knowledgeBaseId,
    message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    retrievalFilter,
    sessionId,
  });

  const firstParsedAnswer = {
    answer: firstResponse.output?.text || "I couldn't find an answer in the selected market Knowledge Base.",
  };
  const firstRetrievedReferenceCount = getRetrievedReferenceCount(firstResponse);
  writeRetrievalDiagnosticsEvent({
    question: message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    responseSource: "bedrock-knowledge-base",
    retrievalFilter,
    exactTerms: getExactRetrievalTerms(message),
    response: firstResponse,
  });

  if (!shouldRetryKnowledgeBaseWithRelaxedFilter({
    answer: firstParsedAnswer.answer,
    message,
    selectedCountry,
    retrievalFilter,
  })) {
    return {
      response: firstResponse,
      parsedAnswer: firstParsedAnswer,
      responseSource: "bedrock-knowledge-base",
    };
  }

  const retryFilters = getRelaxedRetryFilters({ selectedCountry, message, retrievalFilter });
  let lastRetryResponse = null;
  let lastRetryParsedAnswer = null;

  for (const retryFilter of retryFilters) {
    const retryResponse = await sendKnowledgeBaseRequestWithSessionFallback({
      knowledgeBaseId,
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      retrievalFilter: retryFilter,
      sessionId,
    });
    const retryParsedAnswer = {
      answer: retryResponse.output?.text || "...",
    };
    const retryResponseSource = retryFilter
      ? "bedrock-knowledge-base-document-global-retry"
      : "bedrock-knowledge-base-document-unfiltered-retry";

    lastRetryResponse = retryResponse;
    lastRetryParsedAnswer = retryParsedAnswer;
    writeRetrievalDiagnosticsEvent({
      question: message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: retryResponseSource,
      retrievalFilter: retryFilter,
      exactTerms: getExactRetrievalTerms(message),
      response: retryResponse,
    });

    if (!isUnavailableAnswer(retryParsedAnswer.answer)) {
      return {
        response: retryResponse,
        parsedAnswer: retryParsedAnswer,
        responseSource: retryResponseSource,
      };
    }
  }

  if (firstRetrievedReferenceCount > 0 && getRetrievedReferenceCount(lastRetryResponse) === 0) {
    return {
      response: firstResponse,
      parsedAnswer: firstParsedAnswer,
      responseSource: "bedrock-knowledge-base",
    };
  }

  return {
    response: lastRetryResponse || firstResponse,
    parsedAnswer: lastRetryParsedAnswer || firstParsedAnswer,
    responseSource: lastRetryResponse
      ? "bedrock-knowledge-base-document-global-retry"
      : "bedrock-knowledge-base-document-retry",
  };
};

const getLastBedrockDebug = () => lastBedrockDebug;

export {
  buildBedrockQuery,
  buildMarketOrGlobalScopeFilter,
  buildMarketScopeFilter,
  buildRetrievalFilter,
  decodeBasicHtmlEntities,
  getExactRetrievalTerms,
  getKnowledgeBaseResult,
  getLastBedrockDebug,
  getMarketKnowledgeBaseId,
  getRelaxedRetryFilters,
  normalizeBedrockSessionId,
  sendKnowledgeBaseRequest,
  sendKnowledgeBaseRequestWithSessionFallback,
};
