const normalizeQuery = (value = "") =>
  String(value)
    .trim()
    .replace(/\s+/g, " ");

const messageRewriteRules = [
  {
    pattern: /\b(moving from|moving to|relocat|transfer|change country|move country)\b/i,
    rewrittenQuery: "country transfer relocation policy sponsor transfer",
  },
  {
    pattern: /\b(office|address|location|headquarters)\b/i,
    rewrittenQuery: "office location address Canada office",
  },
  {
    pattern: /\b(price|cost|pricing)\b/i,
    rewrittenQuery: "product pricing aloe vera gel",
  },
  {
    pattern: /\b(complaint|issue|problem|report)\b/i,
    rewrittenQuery: "complaint procedure support escalation",
  },
];

const intentRewriteRules = {
  business_opportunity: "business opportunity income earnings compensation commission",
  order_support: "order support shipment shipping tracking",
  policy_question: "policy rule requirement procedure",
  product_question: "product ingredients aloe vera supplement",
  pricing: "product pricing aloe vera gel",
  relocation: "country transfer relocation policy sponsor transfer",
  office_location: "office location address Canada office",
  complaint: "complaint procedure support escalation",
};

const rewriteQuery = ({ message = "", intent = "" } = {}) => {
  const originalQuery = normalizeQuery(message);
  const messageRule = messageRewriteRules.find((rule) => rule.pattern.test(originalQuery));

  return {
    originalQuery,
    rewrittenQuery: messageRule?.rewrittenQuery || intentRewriteRules[intent] || originalQuery,
  };
};

export { rewriteQuery };
