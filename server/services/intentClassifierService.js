const fallbackIntent = {
  intent: "general_query",
  confidence: 0.5,
};

const intentRules = [
  {
    intent: "relocation",
    patterns: [
      /\btransfer\b/i,
      /\bmove\b/i,
      /\brelocating\b/i,
      /\bchange country\b/i,
      /\bmoving from\b/i,
      /\bmoving to\b/i,
    ],
  },
  {
    intent: "office_location",
    patterns: [
      /\boffice\b/i,
      /\baddress\b/i,
      /\blocation\b/i,
      /\bheadquarters\b/i,
    ],
  },
  {
    intent: "complaint",
    patterns: [
      /\bcomplaint\b/i,
      /\bissue\b/i,
      /\bproblem\b/i,
      /\breport\b/i,
    ],
  },
  {
    intent: "business_opportunity",
    patterns: [
      /\bincome\b/i,
      /\bearnings\b/i,
      /\bcompensation\b/i,
      /\bopportunity\b/i,
      /\bcommission\b/i,
    ],
  },
  {
    intent: "product_question",
    patterns: [
      /\bproduct\b/i,
      /\bingredients\b/i,
      /\baloe vera\b/i,
      /\bsupplement\b/i,
    ],
  },
  {
    intent: "pricing",
    patterns: [
      /\bprice\b/i,
      /\bcost\b/i,
      /\bpricing\b/i,
    ],
  },
  {
    intent: "order_support",
    patterns: [
      /\border\b/i,
      /\bshipment\b/i,
      /\bshipping\b/i,
      /\btracking\b/i,
    ],
  },
  {
    intent: "policy_question",
    patterns: [
      /\bpolicy\b/i,
      /\brule\b/i,
      /\brequirement\b/i,
      /\bprocedure\b/i,
    ],
  },
];

const getConfidenceForMatchCount = (matchCount = 0) => {
  if (matchCount >= 2) return 0.9;
  if (matchCount === 1) return 0.7;
  return 0;
};

const classifyIntent = (message = "") => {
  const normalizedMessage = String(message || "").toLowerCase().trim();

  if (!normalizedMessage) return fallbackIntent;

  const bestMatch = intentRules
    .map((rule) => {
      const matchCount = rule.patterns.filter((pattern) => pattern.test(normalizedMessage)).length;

      return {
        intent: rule.intent,
        confidence: getConfidenceForMatchCount(matchCount),
      };
    })
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!bestMatch || bestMatch.confidence < 0.6) return fallbackIntent;

  return bestMatch;
};

export { classifyIntent };
