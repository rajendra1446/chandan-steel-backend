import express from "express";

import {
    createTransfer,
    getTransfers,
    getBilletTransfers
} from "../controllers/transfer.controller.js";

const router = express.Router();

router.post("/", createTransfer);

router.get("/", getTransfers);

router.get(
    "/billet/:billetId",
    getBilletTransfers
);

export default router;