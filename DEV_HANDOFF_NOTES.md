# Vera Enterprise Chatbot - Dev Handoff Notes

## Current State

- Frontend: React/Vite app in `src/App.jsx`.
- Backend: Express API in `server/index.js`.
- Knowledge base: Amazon Bedrock RetrieveAndGenerate.
- Markets currently wired: United Kingdom, Germany, Belgium.
- Product cards:
  - United Kingdom: local JSON catalog in `server/product-catalog/uk-en`.
  - Belgium: S3 JSON catalog configured by `BELGIUM_PRODUCT_CATALOG_S3_URI`.
  - Germany: Knowledge Base citations plus fallback source-name mapping.
- Monitoring:
  - Chat logs: `server/logs/chat-events.jsonl`
  - Handoff logs: `server/logs/handoff-events.jsonl`
  - Admin dashboard: `/api/admin/chat-insights`
  - Bedrock debug: `/api/admin/last-bedrock-debug`

## Recent Hardening

- Product intent now uses word boundaries so `chairman's bonus` is not misread as a hair query.
- Policy/bonus questions cannot generate product cards.
- Belgium product requests can use the S3 catalog JSON directly.
- Category-specific product requests now apply a hard eligibility filter before scoring cards.
- Hair-care requests now require hair-related product name/category terms, preventing broad `personal-care` items such as Liquid Soap from appearing.
- Bedrock query wrapper was shortened to reduce repeated prompt tokens.
- Product-card debug logging is gated behind `DEBUG_PRODUCT_CARDS=true`.
- ESLint now ignores backup files and passes on the active code.

## Environment Variables

Required:

```text
AWS_REGION=us-east-1
BEDROCK_MODEL_ARN=...
BEDROCK_GLOBAL_KNOWLEDGE_BASE_ID=YIKEZ84KMX
BEDROCK_GLOBAL_KNOWLEDGE_BASE_MARKETS=United Kingdom,Germany,Belgium
BELGIUM_PRODUCT_CATALOG_S3_URI=s3://global-chatbot-kb/Foreverliving-NL-BE/Products-NL-BE/products-nl-be.json
```

Recommended for admin endpoints in shared environments:

```text
CHAT_INSIGHTS_TOKEN=<set-a-secret-token>
```

Optional:

```text
DEBUG_PRODUCT_CARDS=true
```

## Verification Commands

```powershell
npm run lint
npm run build
node --check server/index.js
```

## Recommended Dev Refactors

- Split `server/index.js` into focused modules:
  - Bedrock client/routing
  - product catalogs/cards
  - market metadata filters
  - admin dashboard/logging
  - Express routes
- Move country/market metadata, product category rules, and retrieval hints into JSON/config files.
- Add unit tests for:
  - intent classification
  - policy vs product card suppression
  - product category filtering
  - Belgium S3 catalog normalization
  - market routing
- Replace demo-era relaxed policy filtering with a clear production retrieval strategy once S3 metadata is consistent.
- Consider adding a Germany product catalog JSON, matching the UK/Belgium approach, to avoid relying on citation/source-name fallbacks.
- Move backup files out of `server/` and `src/` before production packaging.
