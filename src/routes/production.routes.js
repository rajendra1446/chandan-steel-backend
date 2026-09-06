import express from "express";

import {
    getProductionBatches,
    createProductionBatch,
    addProductionInput,
    addProductionOutput
} from "../controllers/production.controller.js";

const router = express.Router();

router.get(
    "/",
    getProductionBatches
);

router.post(
    "/",
    createProductionBatch
);

router.post(
    "/:batchId/inputs",
    addProductionInput
);

router.post(
    "/:batchId/outputs",
    addProductionOutput
);

export default router;