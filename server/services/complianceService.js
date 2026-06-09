// services/complianceService.js

// ── Medical Emergency ──────────────────────────────────────────────────────
const medicalEmergencyPattern =
  /\b(emergency|call\s*911|call\s*999|call\s*112|ambulance|heart\s*attack|stroke|seizure|unconscious|choking|bleeding\s*heavily|overdose)\b/i;

// ── Health & Safety — English ──────────────────────────────────────────────
const healthSafetyPattern =
  /\b(pregnan\w*|breastfeed\w*|nursing|medication|medicine|prescription|drug\s*interaction|doctor|pharmacist|medical|condition|disease|diagnos\w*|treat\w*|cure|prevent\w*|diabet\w*|blood\s*pressure|heart\s*condition|allerg\w*|asthma|cancer|kidney|liver|autoimmune|safe\s*to\s*use|is\s*it\s*safe|contraindicat\w*|side\s*effects?|symptoms?|pain|fever|infection|rash|dizzy|dizziness|nausea|vomit\w*|diarrhea|headache|migraine|surgery|chemotherapy|insulin|antibiotic|antidepressant|blood\s*thinner|supplement\s*interaction|can\s*i\s*take|should\s*i\s*take|safe\s*for\s*me|safe\s*with)\b/i;

// ── Health & Safety — Multilingual (IT, DE, FR, ES, NL, SV) ───────────────
const healthSafetyMultilingualPattern =
  /gravidanza|incinta|allattamento|farmac[oi]|medicin[ae]|prescrizione|dottore|medico|farmacista|malattia|diagnosi|curare|diabete|pressione|allergia|sicuro|dolore|febbre|sintomi|effetti\s*collaterali|Schwangerschaft|Medikament|Arzt|Apotheker|Krankheit|Symptome|Schmerzen|Allergie|Behandlung|m[eé]dicament|sympt[oô]mes|grossesse|allaitement|m[eé]decin|pharmacien|maladie|traiter|gu[eé]rir|embarazo|lactancia|medicamento|doctor|farmac[eé]utico|dolor|fiebre|s[ií]ntomas|seguro|zwanger|borstvoeding|medicatie|arts|apotheker|ziekte|behandelen|genezen|bloeddruk|allergie|veilig|contra-indicatie|gravid|amning|l[äa]kemedel|l[äa]kare|apotekare|sjukdom|symptom|sm[äa]rta|feber|allergi/i;

// ── Child Safety — English + Multilingual ─────────────────────────────────
const childSafetyPattern =
  /\b(child|children|kid|kids|baby|babies|toddler|infant|minor|teen|teenager|under\s*18|son|daughter|my\s+boy|my\s+girl|for\s+my\s+child|give\s+to\s+my\s+child)\b|bambin[oi]|figli[ao]|minorenne|Kind|Kinder|Jugendliche|minderj[äa]hrig|b[eé]b[eé]|enfant|mineur|ni[nñ][oa]|menor|baby|kind|kinderen|peuter|minderjarige|barn|tonåring/i;

// ── Income / Financial Claims ──────────────────────────────────────────────
const incomeOpportunityPattern =
  /\b(get\s*rich|become\s*rich|become\s*wealthy|millionaire|make\s*a\s*lot\s*of\s*money|earn\s*a\s*lot|financial\s*freedom|guaranteed\s*income|guarantee.{0,10}earn|passive\s*income|quit\s*my\s*job|replace\s*my\s*salary|join\s*and\s*earn|how\s*much\s*can\s*i\s*make|get\s*paid|make\s*money\s*fast)\b|diventare\s*ricc[oa]|reddito\s*garantito|libert[aà]\s*finanziaria|devenir\s*riche|revenu\s*garanti|hacerse\s*rico|ingresos\s*garantizados|rijk\s*worden|gegarandeerd\s*inkomen|bli\s*rik/i;

// ── Legitimate Comp Plan Terms — these must NEVER be blocked ──────────────
const compensationPlanPattern =
  /\b(leadership\s*bonus|chairman.?s?\s*bonus|case\s*credits?|preferred\s*customer\s*profit|retail\s*profit|personal\s*bonus|manager\s*bonus|eagle\s*manager|compensation\s*plan|forever\s*plus|soaring\s*manager|assistant\s*supervisor|supervisor|assistant\s*manager|ccs?)\b/i;

// ── FDA / Medical Approval Claims ─────────────────────────────────────────
const medicalClaimPattern =
  /\b(fda\s*approved|fda\s*cleared|clinically\s*proven\s*to\s*treat|cures?\s+(cancer|diabetes|disease|condition)|proven\s*to\s*heal|medically\s*approved|health\s*authority\s*approved|treats?\s+(disease|condition|cancer|diabetes))\b/i;

// ── Individual exports (available if needed independently) ────────────────
export const isMedicalEmergency = (msg = "") =>
  medicalEmergencyPattern.test(msg);

export const isHealthSafetyQuestion = (msg = "") =>
  medicalEmergencyPattern.test(msg)          ||
  healthSafetyPattern.test(msg)              ||
  healthSafetyMultilingualPattern.test(msg)  ||
  childSafetyPattern.test(msg);

export const isIncomeOpportunityQuestion = (msg = "") =>
  incomeOpportunityPattern.test(msg) && !compensationPlanPattern.test(msg);

export const isMedicalClaimQuestion = (msg = "") =>
  medicalClaimPattern.test(msg);

// ── Master check — Gate 1, always runs before Bedrock ─────────────────────
// Checks in order: most critical first
export const runComplianceCheck = (message = "") => {
  if (isMedicalEmergency(message))
    return { blocked: true, type: "medical_emergency" };

  if (isHealthSafetyQuestion(message))
    return { blocked: true, type: "health_safety" };

  if (isIncomeOpportunityQuestion(message))
    return { blocked: true, type: "income_opportunity" };

  if (isMedicalClaimQuestion(message))
    return { blocked: true, type: "medical_claim" };

  return { blocked: false, type: null };
};