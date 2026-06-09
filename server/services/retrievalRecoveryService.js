const retryReasonPriority = [
  "EMPTY_ANSWER",
  "UNAVAILABLE_ANSWER",
  "NO_CITATIONS",
];

const retryQueryByIntent = {
  relocation: "moving countries sponsor change market transfer",
  office_location: "office address headquarters contact information",
  complaint: "customer support issue resolution process",
};

const shouldRetryRetrieval = (validation = {}) => {
  const reasons = Array.isArray(validation.reasons) ? validation.reasons : [];
  const matchedReason = retryReasonPriority.find((reason) => reasons.includes(reason));

  if (Number(validation.confidence) < 0.5) {
    return {
      shouldRetry: true,
      reason: matchedReason || "LOW_CONFIDENCE",
    };
  }

  if (matchedReason) {
    return {
      shouldRetry: true,
      reason: matchedReason,
    };
  }

  return {
    shouldRetry: false,
    reason: "",
  };
};

const buildRetryQuery = ({
  rewrittenQuery = "",
  intent = "",
} = {}) => retryQueryByIntent[intent] || rewrittenQuery;

export {
  buildRetryQuery,
  shouldRetryRetrieval,
};
