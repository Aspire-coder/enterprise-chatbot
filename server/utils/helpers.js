// utils/helpers.js

// ── Strip noise Bedrock sometimes injects into answers ────────────────────
export const stripInlineMetadataBlocks = (text = "") =>
  text
    .replace(/\[Source:.*?\]/gi, "")
    .replace(/METADATA[\s\S]*?END_METADATA/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// ── Detect if Bedrock returned a "no answer found" response ───────────────
// Covers English + Italian, French, German, Spanish, Dutch
export const isUnavailableAnswer = (answer = "") =>
  /couldn'?t find|could not find|not available|not configured|unable to assist|do not have|don'?t have|no information|not found|not in (the )?(selected )?(market )?knowledge base|I don'?t have that information|please contact your local|informazion[ei].{0,10}non.{0,10}disponibil[ei]|non.{0,10}trovat[oa]|je ne.{0,10}trouve|pas disponible|information.{0,10}introuvable|nicht.{0,10}verf[üu]gbar|nicht.{0,10}gefunden|no.{0,10}disponible|niet.{0,10}beschikbaar|niet.{0,10}gevonden/i
    .test(answer);

// ── Format raw Bedrock citations into a clean deduplicated array ──────────
export const formatCitations = (citations = []) =>
  citations
    .flatMap((c) => c.retrievedReferences ?? [])
    .map((ref) => ({
      title:    ref.metadata?.title        ??
                ref.metadata?.document_type ??
                "Source",
      location: ref.location?.s3Location?.uri ?? "",
      excerpt:  (ref.content?.text ?? "").slice(0, 200),
    }))
    // Deduplicate by S3 location URI
    .filter((c, i, arr) =>
      arr.findIndex((x) => x.location === c.location) === i
    );

// ── Redact personal identifiers before writing to logs ────────────────────
export const redactForLog = (text = "") =>
  text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b\d{10,}\b/g, "[PHONE]")
    .replace(/\b[A-Z]{2}\d{6,}\b/g, "[ID]")
    .trim();

// ── Escape HTML for safe rendering in admin dashboard ─────────────────────
export const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");

// ── Format milliseconds into a readable duration string ──────────────────
export const formatDuration = (ms = 0) =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;