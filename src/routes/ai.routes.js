import express from "express";
import { handleAiQuery, getAiInsights } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/query", handleAiQuery);
router.get("/insights", getAiInsights);

export default router;
