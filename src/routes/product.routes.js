import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";

import {
    createProduct,
    getProducts
} from "../controllers/product.controller.js";

const router = express.Router();

router.post(
    "/",
    authMiddleware,
    createProduct
);

router.get(
    "/",
    authMiddleware,
    getProducts
);

export default router;