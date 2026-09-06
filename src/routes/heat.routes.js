import express from "express";

import {
    getHeats,
    getHeatById,
    createHeat,
    addHeatMaterial,
    getHeatMaterials,
    getHeatBillets
} from "../controllers/heat.controller.js";

const router = express.Router();

router.get("/", getHeats);
router.post("/", createHeat);
router.get("/:id", getHeatById);
router.post("/:heatId/materials", addHeatMaterial);
router.get("/:heatId/materials", getHeatMaterials);
router.get("/:heatId/billets", getHeatBillets);

export default router;