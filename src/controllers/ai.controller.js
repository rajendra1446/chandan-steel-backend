import { queryAiMetallurgical, getPlantAiOverview } from "../services/ai.services.js";

export const handleAiQuery = async (req, res, next) => {
    try {
        const { query, billet_no, heat_no, grade_code } = req.body || {};
        const response = await queryAiMetallurgical(query || "", {
            billet_no,
            heat_no,
            grade_code,
        });

        res.json({
            success: true,
            ...response,
        });
    } catch (error) {
        console.error("AI Query Controller Error:", error);
        res.status(500).json({
            success: false,
            message: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        });
    }
};


export const getAiInsights = async (req, res, next) => {
    try {
        const overview = await getPlantAiOverview();
        res.json({
            success: true,
            data: overview,
        });
    } catch (error) {
        next(error);
    }
};
