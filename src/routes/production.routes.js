import express from "express";

import {
    getProductionBatches,
    createProductionBatch,
    addProductionInput
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

export default router;