import express from "express";
import cors from "cors";

import unitRoutes from "./routes/unit.routes.js";
import gradeRoutes from "./routes/grade.routes.js";
import materialRoutes from "./routes/material.routes.js";
import heatRoutes from "./routes/heat.routes.js";
import billetRoutes from "./routes/billet.routes.js";
import transferRoutes from "./routes/transfer.routes.js";
import productionRoutes from "./routes/production.routes.js";
import productRoutes from "./routes/product.routes.js";
import traceabilityRoutes from "./routes/traceability.routes.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import router from "./routes/unit.routes.js";
import authRouter from "./routes/auth.routes.js";
const app = express();


// ================================
// Middleware
// ================================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));


// ================================
// Health Check
// ================================
app.use("/api/auth", authRouter);

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "Chandan Steel Traceability API is running"
    });

});


// ================================
// Routes
// ================================

app.use("/api/units",authMiddleware, unitRoutes);

app.use("/api/grades",authMiddleware, gradeRoutes);

app.use("/api/materials",authMiddleware, materialRoutes);

app.use("/api/heats",authMiddleware, heatRoutes);

app.use("/api/billets",authMiddleware, billetRoutes);

app.use("/api/transfers",authMiddleware, transferRoutes);

app.use("/api/production",authMiddleware, productionRoutes);

app.use("/api/products",authMiddleware, productRoutes);

app.use("/api/traceability",authMiddleware, traceabilityRoutes);


// ================================
// 404
// ================================

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "API route not found"
    });

});


// ================================
// Global Error
// ================================

app.use((error, req, res, next) => {

    console.error(error);

    res.status(500).json({
        success: false,
        message: "Internal server error"
    });

});

export default app;