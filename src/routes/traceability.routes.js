import express from "express";

import {
    traceBillet
} from "../controllers/traceability.controller.js";

const router = express.Router();


router.get(
    "/billet/:billetNo",
    traceBillet
);


export default router;