import { Router } from "express";
import { s3ImageHandler } from "../controllers/assetController.js";

const router = Router();

router.get("/s3-image", s3ImageHandler);

export default router;
