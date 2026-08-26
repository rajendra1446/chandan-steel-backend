import { getBilletTraceability } from "../services/traceability.services.js";




export const traceBillet = async (
    req,
    res,
    next
) => {

    try {

        const {
            billetNo
        } = req.params;


        const trace =
            await getBilletTraceability(
                billetNo
            );


        if (!trace) {

            return res.status(404).json({
                success: false,
                message:
                    `Billet ${billetNo} not found`
            });

        }


        res.json({
            success: true,
            data: trace
        });

    } catch (error) {

        next(error);

    }
};