import { pathToFileURL } from "node:url";
import app, { startServer } from "./app.js";

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  startServer();
}

export { app };
export { buildBedrockQuery, buildMarketOrGlobalScopeFilter, buildRetrievalFilter, getExactRetrievalTerms, getMarketKnowledgeBaseId, getRelaxedRetryFilters } from "./services/bedrockService.js";
export { decodeBasicHtmlEntities, isUnavailableAnswer } from "./utils/helpers.js";
export { detectResponseLanguage } from "./services/languageService.js";
export { isHealthSafetyQuestion, isIncomeOpportunityQuestion, isMedicalEmergencyQuestion } from "./services/complianceService.js";
