import express from "express";

import {
    getUnits,
    createUnit
} from "../controllers/unit.controller.js";

const router = express.Router();

router.get("/", getUnits);

router.post("/", createUnit);

export default router;