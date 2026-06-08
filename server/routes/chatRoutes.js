import { Router } from "express";
import { chatHandler } from "../controllers/chatController.js";
import { rateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/", rateLimiter, chatHandler);

export default router;
