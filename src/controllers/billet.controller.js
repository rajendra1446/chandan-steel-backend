import pool from "../config/db.js";


// ============================================
// GET ALL BILLETS
// ============================================

export const getBillets = async (req, res, next) => {

    try {

        const result = await pool.query(`
            SELECT

                b.id,
                b.billet_no,
                b.quantity,
                b.unit,
                b.production_date,
                b.status,

                h.heat_no,

                g.grade_code,
                g.grade_name

            FROM billets b

            JOIN heats h
                ON b.heat_id = h.id

            JOIN grades g
                ON b.grade_id = g.id

            ORDER BY b.id DESC
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
// CREATE BILLET
// ============================================

export const createBillet = async (req, res, next) => {

    try {

        const {
            billet_no,
            heat_id,
            grade_id,
            quantity,
            production_date
        } = req.body;


        if (
            !billet_no ||
            !heat_id ||
            !grade_id ||
            !quantity ||
            !production_date
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "billet_no, heat_id, grade_id, quantity and production_date are required"
            });

        }


        const result = await pool.query(`
            INSERT INTO billets
            (
                billet_no,
                heat_id,
                grade_id,
                quantity,
                production_date
            )
            VALUES
            ($1, $2, $3, $4, $5)
            RETURNING *;
        `, [
            billet_no,
            heat_id,
            grade_id,
            quantity,
            production_date
        ]);


        res.status(201).json({
            success: true,
            message: "Billet created successfully",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};