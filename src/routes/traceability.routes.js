import express from "express";
import {
    traceBillet,
    traceHeat
} from "../controllers/traceability.controller.js";

const router = express.Router();

router.get("/billet/:billetNo", traceBillet);
router.get("/billet", traceBillet);

router.get("/heat/:heatNo", traceHeat);
router.get("/heat", traceHeat);

export default router;