// services/bedrockService.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { readS3Json } from "../utils/s3Loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client    = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });

// ── Country config cache ───────────────────────────────────────────────────
let _countryConfig = null;

export const loadCountryConfig = async () => {
  if (_countryConfig) return _countryConfig; // already cached

  // Try S3 first
  if (process.env.COUNTRY_CONFIG_S3_URI) {
    try {
      _countryConfig = await readS3Json(process.env.COUNTRY_CONFIG_S3_URI);
      console.log("Country config loaded from S3");
      return _countryConfig;
    } catch (err) {
      console.warn("S3 country config failed, using local fallback:", err.message);
    }
  }

  // Local fallback — reads v2/config/countries.json
  const localPath = path.join(__dirname, "..", "config", "countries.json");
  _countryConfig  = JSON.parse(readFileSync(localPath, "utf8"));
  console.log("Country config loaded from local file");
  return _countryConfig;
};

export const getCountryConfig = async (country = "United Kingdom") => {
  const config = await loadCountryConfig();
  return config[country] ?? { code: "UK", language: "en", name: "United Kingdom" };
};

// ── Retrieval filter — exactly 2 conditions, always ───────────────────────
const buildRetrievalFilter = (countryCode) => ({
  orAll: [
    { equals: { key: "country_code", value: countryCode } },
    { equals: { key: "scope",        value: "global"    } },
  ],
});

// ── System prompt — lean, token-efficient, injected per request ───────────
const buildSystemPrompt = ({ countryName, responseLanguage }) => `
You are ASK Vera, a helpful assistant for Forever Living Products FBOs and customers in ${countryName}.

CRITICAL RULES:
1. Answer ONLY from the retrieved knowledge base documents. Do not use outside knowledge.
2. Only provide information relevant to ${countryName}. Never reveal policies from other countries.
3. Always respond in ${responseLanguage}.
4. Never make medical claims, health benefit claims, or mention FDA or regulatory approval.
5. Never guarantee income, financial returns, or business earnings of any kind.
6. If information is not in the retrieved documents, say: "I don't have that information for ${countryName}. Please contact your local Forever Living office."
7. For international office contacts or the global directory, you may use global-scoped documents.
8. Be concise, professional, and factual.
`.trim();

// ── Core Bedrock request ───────────────────────────────────────────────────
export const sendKnowledgeBaseRequest = async ({
  message,
  selectedCountry  = "United Kingdom",
  selectedLanguage = "English",
  sessionId        = null,
}) => {
  const config   = await getCountryConfig(selectedCountry);
  const kbId     = process.env.BEDROCK_KNOWLEDGE_BASE_ID;
  const modelArn = process.env.BEDROCK_MODEL_ARN;

  if (!kbId)     throw new Error("BEDROCK_KNOWLEDGE_BASE_ID is not configured.");
  if (!modelArn) throw new Error("BEDROCK_MODEL_ARN is not configured.");

  const systemPrompt = buildSystemPrompt({
    countryName:      config.name,
    responseLanguage: selectedLanguage,
  });

  // sessionId must be undefined (not null) to start a new Bedrock session
  const sessionParam = sessionId ? { sessionId } : {};

  const requestParams = {
    ...sessionParam,
    input: { text: message },
    retrieveAndGenerateConfiguration: {
      type: "KNOWLEDGE_BASE",
      knowledgeBaseConfiguration: {
        knowledgeBaseId: kbId,
        modelArn,
        generationConfiguration: {
          promptTemplate: {
            textPromptTemplate: `${systemPrompt}\n\n$search_results$\n\nUser question: $query$`,
          },
          // Guardrails — only attached if configured in .env
          ...(process.env.BEDROCK_GUARDRAIL_ID
            ? {
                guardrailConfiguration: {
                  guardrailId:      process.env.BEDROCK_GUARDRAIL_ID,
                  guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION ?? "DRAFT",
                },
              }
            : {}),
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults:      5,
            overrideSearchType:   "HYBRID",
            filter: buildRetrievalFilter(config.code),
          },
        },
      },
    },
  };

  const response = await client.send(new RetrieveAndGenerateCommand(requestParams));

  return {
    answer:    response.output?.text ?? "",
    sessionId: response.sessionId    ?? null,
    citations: response.citations    ?? [],
  };
};