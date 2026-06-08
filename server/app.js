import "dotenv/config";
import { pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import assetRoutes from "./routes/assetRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import escalationRoutes from "./routes/escalationRoutes.js";
import { allowedFrontendOrigins, port } from "./config/constants.js";

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedFrontendOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/assets", assetRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/escalations", escalationRoutes);

export const startServer = () => app.listen(port, () => {
  console.log(`Chat API running on http://localhost:${port}`);
});

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  startServer();
}

export default app;
export { app };
