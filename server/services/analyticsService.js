import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultMarket } from "../config/markets.js";
import { firstMetadataValue } from "../utils/helpers.js";
import { getSourceName } from "../utils/formatters.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chatInsightsLogDir = path.join(__dirname, "..", "logs");
const chatInsightsLogPath = path.join(chatInsightsLogDir, "chat-events.jsonl");

const handoffLogPath = path.join(chatInsightsLogDir, "handoff-events.jsonl");
const retrievalDiagnosticsLogPath = path.join(chatInsightsLogDir, "retrieval-diagnostics.jsonl");

const readJsonlFile = (filePath) => {
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const writeJsonlFile = (filePath, event) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(
    filePath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      ...event,
    })}\n`,
    "utf8",
  );
};

const createHandoffEvent = ({
  question = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "",
  reason = "manual",
  status = "open",
  transcript = [],
  answer = "",
  source = "",
  outcome = "",
}) => {
  const event = {
    id: `handoff-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status,
    reason,
    question: redactQuestionForLog(question),
    normalizedQuestion: normalizeQuestionForInsights(question),
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    answer: redactQuestionForLog(answer).slice(0, 1200),
    source,
    outcome,
    transcript: Array.isArray(transcript)
      ? transcript.slice(-10).map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          text: redactQuestionForLog(String(message.text || "")).slice(0, 1200),
        }))
      : [],
  };

  try {
    writeJsonlFile(handoffLogPath, event);
  } catch (error) {
    console.warn("Unable to write handoff event:", error.message);
  }

  return event;
};

const readHandoffEvents = () => readJsonlFile(handoffLogPath);

const getReferenceUri = (reference = {}) =>
  reference.location?.s3Location?.uri ||
  reference.location?.webLocation?.url ||
  reference.location?.confluenceLocation?.url ||
  reference.location?.sharePointLocation?.url ||
  reference.location?.salesforceLocation?.url ||
  "";

const getReferenceText = (reference = {}) =>
  String(
    reference.content?.text ||
      reference.content?.byteContent ||
      reference.content?.row?.toString?.() ||
      "",
  );

const getChunkIdFromMetadata = (metadata = {}) =>
  firstMetadataValue(metadata, [
    "x-amz-bedrock-kb-chunk-id",
    "x-amz-bedrock-kb-source-uri",
    "chunk_id",
    "chunkId",
    "id",
  ]);

const getRetrievedReferenceDiagnostics = (response = {}) =>
  (response.citations || [])
    .flatMap((citation) => citation.retrievedReferences || [])
    .map((reference) => {
      const metadata = reference.metadata || {};
      const uri = getReferenceUri(reference);
      const text = getReferenceText(reference);

      return {
        documentName:
          firstMetadataValue(metadata, ["document_name", "documentName", "title", "name"]) ||
          getSourceName(uri),
        uri,
        chunkId: getChunkIdFromMetadata(metadata),
        textPreview: text.replace(/\s+/g, " ").slice(0, 700),
        metadata,
      };
    });

const writeRetrievalDiagnosticsEvent = ({
  question = "",
  selectedCountry = "",
  selectedLanguage = "",
  responseLanguage = "",
  responseSource = "",
  retrievalFilter,
  exactTerms = [],
  response = {},
}) => {
  try {
    writeJsonlFile(retrievalDiagnosticsLogPath, {
      question: redactQuestionForLog(question),
      normalizedQuestion: normalizeQuestionForInsights(question),
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource,
      exactTerms,
      retrievalFilter,
      retrievedReferences: getRetrievedReferenceDiagnostics(response),
    });
  } catch (error) {
    console.warn("Unable to write retrieval diagnostics:", error.message);
  }
};

const summarizeHandoffEvents = (events = []) => {
  const byReason = new Map();
  const byStatus = new Map();

  events.forEach((event) => {
    byReason.set(event.reason || "unknown", (byReason.get(event.reason || "unknown") || 0) + 1);
    byStatus.set(event.status || "open", (byStatus.get(event.status || "open") || 0) + 1);
  });

  const toList = (map) =>
    Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalHandoffs: events.length,
    openHandoffs: events.filter((event) => event.status === "open").length,
    recentHandoffs: events.slice(-30).reverse(),
    handoffsByReason: toList(byReason),
    handoffsByStatus: toList(byStatus),
  };
};


const redactQuestionForLog = (value = "") =>
  value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .trim();

const normalizeQuestionForInsights = (value = "") =>
  redactQuestionForLog(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isUnavailableAnswer = (answer = "") =>
  /couldn'?t find|could not find|not available|not configured|unable to assist|could not reach|try again|no configured knowledge base|do not have|don'?t have|no information|not found|not in (the )?(selected )?(market )?knowledge base|informazion[ei].*non .*disponibil[ei]|non .*disponibil[ei].*documenti|non riesco .*trovare|non sono presenti|non .*present[ei].*risultat|je ne .*trouve|pas disponible|nicht .*verf.{0,3}gbar|nicht .*enthalten|nicht .*gefunden|konnte .*nicht finden|no .*disponible|no encuentro/i.test(
    answer,
  );

const writeChatInsightEvent = (event) => {
  try {
    fs.mkdirSync(chatInsightsLogDir, { recursive: true });
    fs.appendFileSync(
      chatInsightsLogPath,
      `${JSON.stringify({
        createdAt: new Date().toISOString(),
        ...event,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    console.warn("Unable to write chat insight event:", error.message);
  }
};

const buildChatPayload = ({
  answer = "",
  productCards = [],
  imageCards = [],
  citations = [],
  conversationId = null,
}) => ({
  answer,
  productCards,
  imageCards,
  citations,
  conversationId,
});

const writeChatTurnInsight = ({
  message = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "",
  responseSource = "",
  outcome = "ok",
  citationCount = 0,
  startedAt = Date.now(),
}) => {
  writeChatInsightEvent({
    question: redactQuestionForLog(message),
    normalizedQuestion: normalizeQuestionForInsights(message),
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    responseSource,
    outcome,
    productCardCount: 0,
    citationCount,
    durationMs: Date.now() - startedAt,
  });
};

const createUnavailableHandoff = ({
  message = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "",
  transcript = [],
  answer = "",
  source = "",
}) =>
  createHandoffEvent({
    question: message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    reason: "unavailable-answer",
    status: "open",
    transcript,
    answer,
    source,
    outcome: "unavailable",
  });

const readChatInsightEvents = () => readJsonlFile(chatInsightsLogPath);

const summarizeChatInsightEvents = (events) => {
  const byQuestion = new Map();
  const byCountry = new Map();
  const byLanguage = new Map();
  const bySource = new Map();
  const failures = [];

  events.forEach((event) => {
    const questionKey = event.normalizedQuestion || "";

    if (questionKey) {
      const current = byQuestion.get(questionKey) || {
        question: event.question,
        normalizedQuestion: questionKey,
        count: 0,
        lastAskedAt: event.createdAt,
        failures: 0,
      };

      current.count += 1;
      current.lastAskedAt = event.createdAt;
      if (event.outcome !== "ok") current.failures += 1;
      byQuestion.set(questionKey, current);
    }

    if (event.selectedCountry) {
      byCountry.set(
        event.selectedCountry,
        (byCountry.get(event.selectedCountry) || 0) + 1,
      );
    }

    if (event.responseLanguage) {
      byLanguage.set(
        event.responseLanguage,
        (byLanguage.get(event.responseLanguage) || 0) + 1,
      );
    }

    if (event.responseSource) {
      bySource.set(event.responseSource, (bySource.get(event.responseSource) || 0) + 1);
    }

    if (event.outcome !== "ok") {
      failures.push(event);
    }
  });

  const toSortedList = (map) =>
    Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalQuestions: events.length,
    failedOrUnavailableQuestions: failures.length,
    repeatedQuestions: Array.from(byQuestion.values())
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count || b.failures - a.failures)
      .slice(0, 25),
    topQuestions: Array.from(byQuestion.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    recentFailures: failures.slice(-25).reverse(),
    byCountry: toSortedList(byCountry),
    byLanguage: toSortedList(byLanguage),
    bySource: toSortedList(bySource),
  };
};


const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderAdminTableRows = (items = [], columns = [], emptyText = "No data yet.") => {
  if (!items.length) {
    return `<tr><td colspan="${columns.length}" class="empty">${escapeHtml(emptyText)}</td></tr>`;
  }

  return items
    .map(
      (item) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(column.value(item))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
};

const renderAdminBreakdown = (items = []) =>
  items.length
    ? items
        .map((item) => `<span class="pill">${escapeHtml(item.label)} <strong>${escapeHtml(item.count)}</strong></span>`)
        .join("")
    : `<span class="empty">No data yet.</span>`;

const renderSupportAdminDashboard = (insights, handoffs) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ASK Vera Support Desk</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f3ec;
        color: #1f2937;
      }
      body { margin: 0; padding: 32px; }
      main { max-width: 1180px; margin: 0 auto; }
      header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      h2 { margin: 0 0 14px; font-size: 18px; }
      .muted, .empty { color: #647067; font-size: 14px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
      .card, section { background: #fffdf8; border: 1px solid #e4dccf; border-radius: 14px; box-shadow: 0 10px 30px rgba(31, 41, 55, 0.06); }
      .card { padding: 18px; }
      .number { display: block; margin-top: 8px; font-size: 30px; font-weight: 750; color: #0f766e; }
      section { padding: 18px; margin-top: 18px; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { text-align: left; border-top: 1px solid #eee5d8; padding: 11px 10px; vertical-align: top; }
      th { color: #536158; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
      .pill { display: inline-flex; gap: 8px; align-items: center; margin: 0 8px 8px 0; padding: 8px 11px; border-radius: 999px; background: #eaf4ef; color: #1f6f61; font-size: 14px; }
      .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #dbeafe; color: #1d4ed8; }
      .bad { background: #fee2e2; color: #991b1b; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; }
      a.button { display: inline-flex; align-items: center; min-height: 38px; padding: 0 14px; border-radius: 10px; background: #0f766e; color: white; text-decoration: none; font-weight: 700; font-size: 14px; }
      @media (max-width: 820px) {
        body { padding: 18px; }
        header { display: block; }
        .actions { margin-top: 14px; }
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>ASK Vera Support Desk</h1>
          <div class="muted">Handoff queue and chatbot monitoring generated ${escapeHtml(insights.generatedAt)}</div>
        </div>
        <div class="actions">
          <a class="button" href="/api/admin/chat-insights">Refresh</a>
          <a class="button" href="/api/admin/chat-insights?format=json">View JSON</a>
        </div>
      </header>

      <div class="grid">
        <div class="card"><span class="muted">Open handoffs</span><span class="number">${escapeHtml(handoffs.openHandoffs)}</span></div>
        <div class="card"><span class="muted">Total handoffs</span><span class="number">${escapeHtml(handoffs.totalHandoffs)}</span></div>
        <div class="card"><span class="muted">Questions</span><span class="number">${escapeHtml(insights.totalQuestions)}</span></div>
        <div class="card"><span class="muted">Failed/unavailable</span><span class="number">${escapeHtml(insights.failedOrUnavailableQuestions)}</span></div>
      </div>

      <section>
        <h2>Handoff Queue</h2>
        <div>${renderAdminBreakdown(handoffs.handoffsByReason)}</div>
        <table>
          <thead><tr><th>Created</th><th>Question</th><th>Country</th><th>Language</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>${renderAdminTableRows(handoffs.recentHandoffs, [
            { value: (item) => item.createdAt || "" },
            { value: (item) => item.question || "" },
            { value: (item) => item.selectedCountry || "" },
            { value: (item) => item.responseLanguage || item.selectedLanguage || "" },
            { value: (item) => item.reason || "" },
            { value: (item) => item.status || "" },
          ], "No handoffs yet.")}</tbody>
        </table>
      </section>

      <section>
        <h2>Repeated Questions</h2>
        <table>
          <thead><tr><th>Question</th><th>Count</th><th>Failures</th><th>Last asked</th></tr></thead>
          <tbody>${renderAdminTableRows(insights.repeatedQuestions, [
            { value: (item) => item.question || "" },
            { value: (item) => item.count ?? "" },
            { value: (item) => item.failures ?? "" },
            { value: (item) => item.lastAskedAt || "" },
          ], "No repeated questions yet.")}</tbody>
        </table>
      </section>

      <section>
        <h2>Recent Failed Or Unavailable Bot Responses</h2>
        <table>
          <thead><tr><th>Time</th><th>Question</th><th>Country</th><th>Language</th><th>Outcome</th></tr></thead>
          <tbody>${renderAdminTableRows(insights.recentFailures, [
            { value: (item) => item.createdAt || "" },
            { value: (item) => item.question || "" },
            { value: (item) => item.selectedCountry || "" },
            { value: (item) => item.responseLanguage || "" },
            { value: (item) => item.outcome || "" },
          ], "No failed or unavailable responses yet.")}</tbody>
        </table>
      </section>

      <section>
        <h2>Breakdown</h2>
        <div>${renderAdminBreakdown(insights.byCountry)}</div>
        <div>${renderAdminBreakdown(insights.byLanguage)}</div>
        <div>${renderAdminBreakdown(insights.bySource)}</div>
      </section>
    </main>
  </body>
</html>`;

export {
  chatInsightsLogPath,
  createHandoffEvent,
  createUnavailableHandoff,
  normalizeQuestionForInsights,
  readChatInsightEvents,
  readHandoffEvents,
  redactQuestionForLog,
  renderSupportAdminDashboard,
  summarizeChatInsightEvents,
  summarizeHandoffEvents,
  writeChatInsightEvent,
  writeChatTurnInsight,
  writeRetrievalDiagnosticsEvent,
};
