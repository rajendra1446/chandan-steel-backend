import pool from "../config/db.js";


// GET ALL UNITS
export const getUnits = async (req, res, next) => {

    try {

        const result = await pool.query(`
            SELECT
                u.id,
                u.unit_code,
                u.unit_name,
                p.unit_code AS parent_code,
                p.unit_name AS parent_name,
                u.is_active,
                u.created_at
            FROM units u
            LEFT JOIN units p
                ON u.parent_unit_id = p.id
            ORDER BY u.id;
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


// CREATE UNIT
export const createUnit = async (req, res, next) => {

    try {

        const {
            unit_code,
            unit_name,
            parent_unit_id
        } = req.body;

        if (!unit_code || !unit_name) {

            return res.status(400).json({
                success: false,
                message: "unit_code and unit_name are required"
            });

        }

        const result = await pool.query(`
            INSERT INTO units
            (
                unit_code,
                unit_name,
                parent_unit_id
            )
            VALUES ($1, $2, $3)
            RETURNING *;
        `, [
            unit_code,
            unit_name,
            parent_unit_id || null
        ]);

        res.status(201).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};