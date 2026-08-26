import express from "express";

import {
    getGrades,
    createGrade
} from "../controllers/grade.controller.js";

const router = express.Router();

router.get("/", getGrades);

router.post("/", createGrade);

export default router;