import { Router } from "express";
import { chatInsightsHandler, lastBedrockDebugHandler } from "../controllers/adminController.js";

const router = Router();

router.get("/chat-insights", chatInsightsHandler);
router.get("/last-bedrock-debug", lastBedrockDebugHandler);

export default router;
