import express from "express";

import {
    getMaterials,
    createMaterial
} from "../controllers/material.controller.js";

const router = express.Router();

router.get("/", getMaterials);

router.post("/", createMaterial);

export default router;