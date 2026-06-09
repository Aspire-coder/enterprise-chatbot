const unavailableAnswerPattern = /I don't know|not available|cannot find/i;

const getCitationCount = (citations = []) => (Array.isArray(citations) ? citations.length : 0);

const validateAnswer = ({
  answer = "",
  citations = [],
  intent = "",
} = {}) => {
  const trimmedAnswer = String(answer || "").trim();
  const reasons = [];
  let confidence = 0.85;

  if (!trimmedAnswer) {
    reasons.push("EMPTY_ANSWER");
    confidence = Math.min(confidence, 0);
  }

  if (getCitationCount(citations) === 0) {
    reasons.push("NO_CITATIONS");
    confidence = Math.min(confidence, 0.4);
  }

  if (unavailableAnswerPattern.test(trimmedAnswer)) {
    reasons.push("UNAVAILABLE_ANSWER");
    confidence = Math.min(confidence, 0.3);
  }

  if (trimmedAnswer && trimmedAnswer.length < 30) {
    reasons.push("SHORT_ANSWER");
    confidence = Math.min(confidence, 0.5);
  }

  return {
    isValid: confidence >= 0.6,
    confidence,
    reasons,
    intent,
  };
};

export { validateAnswer };
