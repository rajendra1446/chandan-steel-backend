import pool from "../config/db.js";


// ============================================
// GET PRODUCTION BATCHES
// ============================================

export const getProductionBatches = async (
    req,
    res,
    next
) => {

    try {

        const result = await pool.query(`
            SELECT

                p.id,
                p.batch_no,

                u.unit_code,
                u.unit_name,

                p.production_date,
                p.input_quantity,
                p.output_quantity,
                p.unit,
                p.status,
                p.remarks

            FROM production_batches p

            JOIN units u
                ON p.unit_id = u.id

            ORDER BY p.id DESC
        `);


        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {

        next(error);

    }
};


// ============================================
// CREATE PRODUCTION BATCH
// ============================================

export const createProductionBatch = async (
    req,
    res,
    next
) => {

    try {

        const {
            batch_no,
            unit_id,
            production_date,
            input_quantity,
            output_quantity,
            remarks
        } = req.body;


        if (
            !batch_no ||
            !unit_id ||
            !production_date
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "batch_no, unit_id and production_date are required"
            });

        }


        const result = await pool.query(`
            INSERT INTO production_batches
            (
                batch_no,
                unit_id,
                production_date,
                input_quantity,
                output_quantity,
                remarks
            )
            VALUES
            ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `, [
            batch_no,
            unit_id,
            production_date,
            input_quantity || 0,
            output_quantity || 0,
            remarks || null
        ]);


        res.status(201).json({
            success: true,
            message:
                "Production batch created successfully",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};


// ============================================
// ADD BILLET TO PRODUCTION
// ============================================

export const addProductionInput = async (
    req,
    res,
    next
) => {

    try {

        const { batchId } = req.params;

        const {
            billet_id,
            quantity
        } = req.body;


        if (
            !billet_id ||
            !quantity
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "billet_id and quantity are required"
            });

        }


        const result = await pool.query(`
            INSERT INTO production_inputs
            (
                production_batch_id,
                billet_id,
                quantity
            )
            VALUES
            ($1, $2, $3)
            RETURNING *;
        `, [
            batchId,
            billet_id,
            quantity
        ]);


        res.status(201).json({
            success: true,
            message:
                "Billet added to production batch",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};