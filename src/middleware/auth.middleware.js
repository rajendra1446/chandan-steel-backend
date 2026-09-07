import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization token required"
            });
        }

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format"
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = {
            userId: decoded.userId,
            role: decoded.role,
            unitId: decoded.unitId
        };

        next();

    } catch (error) {
        console.error("Auth Middleware Error:", error);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

export const optionalAuthMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            );

            req.user = {
                userId: decoded.userId,
                role: decoded.role,
                unitId: decoded.unitId
            };
        }

        next();
    } catch (error) {
        next();
    }
};