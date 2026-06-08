export const port = process.env.PORT || 3001;

export const RATE_LIMIT_WINDOW_MS = 60000;
export const RATE_LIMIT_MAX_REQUESTS = 20;

export const RATE_LIMIT_MS = RATE_LIMIT_WINDOW_MS;
export const MAX_REQUESTS_PER_WINDOW = RATE_LIMIT_MAX_REQUESTS;

export const allowedFrontendOrigins = new Set(
  [
    process.env.FRONTEND_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean),
);
