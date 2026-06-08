import { Router } from "express";
import { escalationHandler } from "../controllers/escalationController.js";

const router = Router();

router.post("/", escalationHandler);

export default router;
