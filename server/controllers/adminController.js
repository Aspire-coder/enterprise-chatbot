import { getLastBedrockDebug } from "../services/bedrockService.js";
import {
  chatInsightsLogPath,
  readChatInsightEvents,
  readHandoffEvents,
  renderSupportAdminDashboard,
  summarizeChatInsightEvents,
  summarizeHandoffEvents,
} from "../services/analyticsService.js";

const canReadChatInsights = (req) => {
  const token = process.env.CHAT_INSIGHTS_TOKEN;

  if (token) {
    return req.get("x-admin-token") === token;
  }

  const remoteAddress = req.socket.remoteAddress || "";

  return [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ].includes(remoteAddress);
};


export const chatInsightsHandler = (req, res) => {
if (!canReadChatInsights(req)) {
  return res.status(401).json({
    error:
      "Unauthorized. Set CHAT_INSIGHTS_TOKEN and send it as the x-admin-token header, or access this endpoint from localhost.",
  });
}

const limit = Math.min(Number(req.query.limit) || 1000, 5000);
const events = readChatInsightEvents().slice(-limit);

const insights = {
  generatedAt: new Date().toISOString(),
  logFile: chatInsightsLogPath,
  limit,
  ...summarizeChatInsightEvents(events),
};
const handoffs = summarizeHandoffEvents(readHandoffEvents().slice(-limit));

if (req.query.format === "json") {
  return res.json({
    ...insights,
    handoffs,
  });
}

res.type("html").send(renderSupportAdminDashboard(insights, handoffs));
};

export const lastBedrockDebugHandler = (req, res) => {
if (!canReadChatInsights(req)) {
  return res.status(401).json({
    error:
      "Unauthorized. Set CHAT_INSIGHTS_TOKEN and send it as the x-admin-token header, or access this endpoint from localhost.",
  });
}

res.json(getLastBedrockDebug() || { message: "No Bedrock response captured yet." });
};
