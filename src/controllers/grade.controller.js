import pool from "../config/db.js";


// GET ALL GRADES

export const getGrades = async (req, res, next) => {

    try {

        const result = await pool.query(`
            SELECT *
            FROM grades
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


// CREATE GRADE

export const createGrade = async (req, res, next) => {

    try {

        const {
            grade_code,
            grade_name,
            description
        } = req.body;

        if (!grade_code || !grade_name) {

            return res.status(400).json({
                success: false,
                message: "grade_code and grade_name are required"
            });

        }

        const result = await pool.query(`
            INSERT INTO grades
            (
                grade_code,
                grade_name,
                description
            )
            VALUES ($1, $2, $3)
            RETURNING *;
        `, [
            grade_code,
            grade_name,
            description || null
        ]);

        res.status(201).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};