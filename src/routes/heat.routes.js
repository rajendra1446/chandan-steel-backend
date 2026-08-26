import express from "express";

import {
    getHeats,
    createHeat
} from "../controllers/heat.controller.js";

const router = express.Router();

router.get("/", getHeats);

router.post("/", createHeat);

export default router;