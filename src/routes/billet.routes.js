import express from "express";

import {
    getBillets,
    createBillet
} from "../controllers/billet.controller.js";

const router = express.Router();

router.get("/", getBillets);

router.post("/", createBillet);

export default router;