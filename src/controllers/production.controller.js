import pool from "../config/db.js";

// ============================================
// GET PRODUCTION BATCHES (WITH INPUTS & OUTPUTS)
// ============================================
export const getProductionBatches = async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id,
                p.batch_no,
                u.unit_code,
                u.unit_name,
                p.production_date,
                COALESCE(p.input_quantity, 0) AS input_quantity,
                COALESCE(p.output_quantity, 0) AS output_quantity,
                p.unit,
                p.status,
                p.remarks,
                COALESCE(SUM(pi.quantity), p.input_quantity, 0) AS billet_consumed,
                MAX(b.billet_no) AS billet_no,
                MAX(b.id) AS billet_id,
                MAX(pr.product_code) AS product_code,
                MAX(pr.product_name) AS product_name,
                MAX(pr.product_type) AS product_type,
                COALESCE(SUM(po.quantity), p.output_quantity, 0) AS product_quantity
            FROM production_batches p
            JOIN units u ON p.unit_id = u.id
            LEFT JOIN production_inputs pi ON p.id = pi.production_batch_id
            LEFT JOIN billets b ON pi.billet_id = b.id
            LEFT JOIN production_outputs po ON p.id = po.production_batch_id
            LEFT JOIN products pr ON po.product_id = pr.id
            GROUP BY p.id, u.unit_code, u.unit_name
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
export const createProductionBatch = async (req, res, next) => {
    try {
        const {
            batch_no,
            unit_id,
            production_date,
            billet_id,
            billet_consumed,
            input_quantity,
            output_quantity,
            remarks
        } = req.body;

        if (!batch_no || !unit_id) {
            return res.status(400).json({
                success: false,
                message: "batch_no and unit_id are required"
            });
        }

        const date = production_date || new Date().toISOString().split("T")[0];
        const inputQty = parseFloat(billet_consumed || input_quantity || 0);

        // 1. Create the production batch
        const batchResult = await pool.query(`
            INSERT INTO production_batches
            (
                batch_no,
                unit_id,
                production_date,
                input_quantity,
                output_quantity,
                status,
                remarks
            )
            VALUES
            ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `, [
            batch_no,
            unit_id,
            date,
            inputQty,
            output_quantity || 0,
            "IN_PRODUCTION",
            remarks || null
        ]);

        const newBatch = batchResult.rows[0];

        // 2. If a billet input is provided, record it in production_inputs
        if (billet_id && inputQty > 0) {
            await pool.query(`
                INSERT INTO production_inputs
                (
                    production_batch_id,
                    billet_id,
                    quantity,
                    unit
                )
                VALUES
                ($1, $2, $3, $4)
            `, [
                newBatch.id,
                billet_id,
                inputQty,
                "KG"
            ]);

            // Update billet status
            const billetCheck = await pool.query(`
                SELECT b.quantity, COALESCE(SUM(pi.quantity), 0) AS total_consumed
                FROM billets b
                LEFT JOIN production_inputs pi ON b.id = pi.billet_id
                WHERE b.id = $1
                GROUP BY b.id, b.quantity
            `, [billet_id]);

            if (billetCheck.rows.length > 0) {
                const bQty = parseFloat(billetCheck.rows[0].quantity || 0);
                const cQty = parseFloat(billetCheck.rows[0].total_consumed || 0);
                const newStatus = cQty >= bQty ? "CONSUMED" : "IN_PRODUCTION";

                await pool.query(`
                    UPDATE billets
                    SET status = $1
                    WHERE id = $2
                `, [newStatus, billet_id]);
            }
        }

        res.status(201).json({
            success: true,
            message: "Production batch created successfully",
            data: newBatch
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// ADD BILLET INPUT TO BATCH
// ============================================
export const addProductionInput = async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const { billet_id, quantity } = req.body;

        if (!billet_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: "billet_id and quantity are required"
            });
        }

        const qty = parseFloat(quantity);

        const result = await pool.query(`
            INSERT INTO production_inputs
            (
                production_batch_id,
                billet_id,
                quantity,
                unit
            )
            VALUES
            ($1, $2, $3, $4)
            RETURNING *;
        `, [
            batchId,
            billet_id,
            qty,
            "KG"
        ]);

        // Update batch input_quantity
        await pool.query(`
            UPDATE production_batches
            SET input_quantity = (
                SELECT COALESCE(SUM(quantity), 0)
                FROM production_inputs
                WHERE production_batch_id = $1
            )
            WHERE id = $1
        `, [batchId]);

        res.status(201).json({
            success: true,
            message: "Billet input added to production batch",
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// ADD PRODUCT OUTPUT TO BATCH
// ============================================
export const addProductionOutput = async (req, res, next) => {
    try {
        const { batchId } = req.params;
        const { product_id, quantity, unit } = req.body;

        if (!product_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: "product_id and quantity are required"
            });
        }

        const qty = parseFloat(quantity);

        const result = await pool.query(`
            INSERT INTO production_outputs
            (
                production_batch_id,
                product_id,
                quantity,
                unit
            )
            VALUES
            ($1, $2, $3, $4)
            RETURNING *;
        `, [
            batchId,
            product_id,
            qty,
            unit || "KG"
        ]);

        // Update batch output_quantity and status
        await pool.query(`
            UPDATE production_batches
            SET
                output_quantity = (
                    SELECT COALESCE(SUM(quantity), 0)
                    FROM production_outputs
                    WHERE production_batch_id = $1
                ),
                status = 'COMPLETED'
            WHERE id = $1
        `, [batchId]);

        res.status(201).json({
            success: true,
            message: "Production output recorded successfully",
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};