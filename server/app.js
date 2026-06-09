// app.js
import "dotenv/config";
import express from "express";
import cors    from "cors";
import { chatRouter }  from "./routes/chat.js";
import { adminRouter } from "./routes/admin.js";

// ── Pre-warm all S3 config caches at startup ───────────────────────────────
// This ensures the first real user request is never slow
import { loadCountryConfig }   from "./services/bedrockService.js";
import { reloadI18nContent }   from "./services/languageService.js";

const app  = express();
const port = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/chat",  chatRouter);
app.use("/api/admin", adminRouter);

// ── Start server ───────────────────────────────────────────────────────────
app.listen(port, async () => {
  console.log(`ASK Vera V2 running on port ${port}`);

  // Pre-warm caches — runs in background, won't block the server
  try {
    await Promise.all([
      loadCountryConfig(),
      reloadI18nContent(),
    ]);
    console.log("All config caches warmed successfully");
  } catch (err) {
    // Non-fatal — services will load lazily on first request
    console.warn("Config pre-warm warning (non-fatal):", err.message);
  }
});