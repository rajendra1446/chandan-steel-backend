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

                g.grade_code,
                g.grade_name,

                u.unit_code,
                u.unit_name,

                h.heat_date,
                h.total_input_qty,
                h.total_output_qty,
                h.status,
                h.remarks

            FROM heats h

            JOIN grades g
                ON h.grade_id = g.id

            JOIN units u
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

            heat_no,
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
export const addHeatMaterial = async (req, res, next) => {

    try {

        const { heatId } = req.params;

        const {
            material_id,
            quantity,
            unit,
            remarks
        } = req.body;


        if (
            !material_id ||
            !quantity
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "material_id and quantity are required"
            });

        }


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
            heatId,
            material_id,
            quantity,
            unit || "KG",
            remarks || null
        ]);


        res.status(201).json({
            success: true,
            message: "Material added to heat",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};