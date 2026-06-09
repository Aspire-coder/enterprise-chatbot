import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const supportedMetricTypes = new Set([
  "INTENT_CLASSIFIED",
  "QUERY_REWRITTEN",
  "CACHE_HIT",
  "CACHE_MISS",
  "ANSWER_VALIDATED",
  "RETRIEVAL_RETRY_TRIGGERED",
  "RETRIEVAL_RETRY_COMPLETED",
  "CONVERSATION_CONTEXT_USED",
  "UNAVAILABLE_RESPONSE",
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const metricsLogPath = path.join(__dirname, "..", "logs", "metrics.log");

const recordMetric = async ({
  type,
  data = {},
} = {}) => {
  try {
    if (!supportedMetricTypes.has(type)) return false;

    await fs.mkdir(path.dirname(metricsLogPath), { recursive: true });
    await fs.appendFile(
      metricsLogPath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        type,
        data,
      })}\n`,
      "utf8",
    );

    return true;
  } catch (error) {
    console.warn("Metric write skipped:", error.message);
    return false;
  }
};

const getMetricSummary = async () => {
  try {
    const content = await fs.readFile(metricsLogPath, "utf8");

    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .reduce((summary, line) => {
        try {
          const metric = JSON.parse(line);
          summary[metric.type] = (summary[metric.type] || 0) + 1;
        } catch {
          return summary;
        }

        return summary;
      }, {});
  } catch {
    return {};
  }
};

export {
  getMetricSummary,
  metricsLogPath,
  recordMetric,
};
