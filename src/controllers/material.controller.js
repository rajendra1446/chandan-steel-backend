import pool from "../config/db.js";


// GET MATERIALS

export const getMaterials = async (req, res, next) => {

    try {

        const result = await pool.query(`
            SELECT *
            FROM materials
            ORDER BY id DESC
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


// CREATE MATERIAL

export const createMaterial = async (req, res, next) => {

    try {

        const {
            material_code,
            material_name,
            material_type,
            unit
        } = req.body;

        if (
            !material_code ||
            !material_name ||
            !material_type
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "material_code, material_name and material_type are required"
            });

        }

        const result = await pool.query(`
            INSERT INTO materials
            (
                material_code,
                material_name,
                material_type,
                unit
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `, [
            material_code,
            material_name,
            material_type,
            unit || "KG"
        ]);

        res.status(201).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};