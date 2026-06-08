export const port = process.env.PORT || 3001;

export const RATE_LIMIT_MS = 60 * 1000;
export const MAX_REQUESTS_PER_WINDOW = 30;

export const allowedFrontendOrigins = new Set(
  [
    process.env.FRONTEND_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean),
);
