import pool from "../config/db.js";


// ============================================
// GET ALL HEATS
// ============================================

export const getHeats = async (req, res, next) => {

    try {

        const result = await pool.query(`
            SELECT
                h.id,
                h.heat_no,
                h.grade_id,
                g.grade_code,
                g.grade_name,
                h.unit_id,
                u.unit_code,
                u.unit_name,
                h.heat_date,
                h.start_time,
                h.end_time,
                h.total_input_qty,
                h.total_output_qty,
                h.status,
                h.remarks,
                h.created_at,
                (
                    SELECT COUNT(*)
                    FROM billets b
                    WHERE b.heat_id = h.id
                )::int AS billets_count,
                (
                    SELECT COALESCE(SUM(b.quantity), 0)
                    FROM billets b
                    WHERE b.heat_id = h.id
                )::numeric AS billets_total_qty,
                (
                    SELECT COUNT(*)
                    FROM heat_materials hm
                    WHERE hm.heat_id = h.id
                )::int AS materials_count
            FROM heats h
            JOIN grades g
                ON h.grade_id = g.id
            LEFT JOIN units u
                ON h.unit_id = u.id
            ORDER BY h.id DESC
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
// CREATE HEAT
// ============================================

export const createHeat = async (req, res, next) => {

    try {

        const {
            heat_no,
            grade_id,
            heat_date,
            start_time,
            end_time,
            total_input_qty,
            total_output_qty,
            remarks
        } = req.body;


        if (
            !heat_no ||
            !grade_id ||
            !heat_date
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "heat_no, grade_id and heat_date are required"
            });

        }


        // Get SMS unit

        const unitResult = await pool.query(`
            SELECT id
            FROM units
            WHERE unit_code = 'SMS'
        `);


        if (unitResult.rows.length === 0) {

            return res.status(400).json({
                success: false,
                message: "SMS unit not found"
            });

        }


        const smsUnitId = unitResult.rows[0].id;


        const result = await pool.query(`
            INSERT INTO heats
            (
                heat_no,
                grade_id,
                unit_id,
                heat_date,
                start_time,
                end_time,
                total_input_qty,
                total_output_qty,
                remarks
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9
            )
            RETURNING *;
        `, [

            heat_no.trim(),
            grade_id,
            smsUnitId,
            heat_date,
            start_time || null,
            end_time || null,
            total_input_qty || 0,
            total_output_qty || 0,
            remarks || null

        ]);


        res.status(201).json({
            success: true,
            message: "Heat created successfully",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};

// ============================================
// ADD CHARGE MATERIAL TO HEAT
// ============================================
export const addHeatMaterial = async (req, res, next) => {
    try {
        const { heatId } = req.params;
        const { material_id, quantity, unit, remarks } = req.body;

        if (!material_id || !quantity) {
            return res.status(400).json({
                success: false,
                message: "material_id and quantity are required"
            });
        }

        // Resolve numeric heat id whether heatId is numeric ID or heat_no
        const heatCheck = await pool.query(
            "SELECT id FROM heats WHERE id::text = $1 OR heat_no = $1 LIMIT 1",
            [heatId]
        );

        if (heatCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Heat ${heatId} not found`
            });
        }

        const numericHeatId = heatCheck.rows[0].id;

        const result = await pool.query(`
            INSERT INTO heat_materials
            (
                heat_id,
                material_id,
                quantity,
                unit,
                remarks
            )
            VALUES
            ($1, $2, $3, $4, $5)
            RETURNING *;
        `, [
            numericHeatId,
            material_id,
            quantity,
            unit || "KG",
            remarks || null
        ]);

        // Auto-update total_input_qty on the heat
        await pool.query(`
            UPDATE heats
            SET total_input_qty = (
                SELECT COALESCE(SUM(quantity), 0)
                FROM heat_materials
                WHERE heat_id = $1
            )
            WHERE id = $1
        `, [numericHeatId]);

        res.status(201).json({
            success: true,
            message: "Material added to heat",
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// GET SINGLE HEAT BY ID OR HEAT_NO
// ============================================
export const getHeatById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                h.id,
                h.heat_no,
                h.grade_id,
                g.grade_code,
                g.grade_name,
                h.unit_id,
                u.unit_code,
                u.unit_name,
                h.heat_date,
                h.start_time,
                h.end_time,
                h.total_input_qty,
                h.total_output_qty,
                h.unit,
                h.status,
                h.remarks,
                h.created_at,
                (
                    SELECT COUNT(*)
                    FROM billets b
                    WHERE b.heat_id = h.id
                )::int AS billets_count,
                (
                    SELECT COALESCE(SUM(b.quantity), 0)
                    FROM billets b
                    WHERE b.heat_id = h.id
                )::numeric AS billets_total_qty,
                (
                    SELECT COUNT(*)
                    FROM heat_materials hm
                    WHERE hm.heat_id = h.id
                )::int AS materials_count
            FROM heats h
            JOIN grades g ON h.grade_id = g.id
            LEFT JOIN units u ON h.unit_id = u.id
            WHERE h.id::text = $1 OR h.heat_no = $1
            LIMIT 1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Heat ${id} not found`
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};

// ============================================
// GET MATERIALS OF A HEAT
// ============================================
export const getHeatMaterials = async (req, res, next) => {
    try {
        const { heatId } = req.params;

        const result = await pool.query(`
            SELECT
                hm.id,
                hm.heat_id,
                hm.material_id,
                m.material_code,
                m.material_name,
                m.material_type,
                hm.quantity,
                hm.unit,
                hm.added_at,
                hm.remarks
            FROM heat_materials hm
            JOIN materials m ON hm.material_id = m.id
            WHERE hm.heat_id = (SELECT id FROM heats WHERE id::text = $1 OR heat_no = $1 LIMIT 1)
            ORDER BY hm.added_at ASC, hm.id ASC
        `, [heatId]);

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
// GET BILLETS OF A HEAT
// ============================================
export const getHeatBillets = async (req, res, next) => {
    try {
        const { heatId } = req.params;

        const result = await pool.query(`
            SELECT
                b.id,
                b.billet_no,
                b.quantity,
                COALESCE(SUM(pi.quantity), 0) AS consumed_quantity,
                GREATEST(0, b.quantity - COALESCE(SUM(pi.quantity), 0)) AS remaining_quantity,
                b.unit,
                b.production_date,
                b.status,
                g.grade_code,
                g.grade_name
            FROM billets b
            JOIN grades g ON b.grade_id = g.id
            LEFT JOIN production_inputs pi ON b.id = pi.billet_id
            WHERE b.heat_id = (SELECT id FROM heats WHERE id::text = $1 OR heat_no = $1 LIMIT 1)
            GROUP BY b.id, g.grade_code, g.grade_name
            ORDER BY b.id ASC
        `, [heatId]);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        next(error);
    }
};