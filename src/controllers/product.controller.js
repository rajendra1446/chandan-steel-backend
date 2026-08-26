import pool from "../config/db.js";


// GET PRODUCTS

export const getProducts = async (
    req,
    res,
    next
) => {

    try {

        const result = await pool.query(`
            SELECT

                p.id,
                p.product_code,
                p.product_name,
                p.product_type,

                u.unit_code,
                u.unit_name

            FROM products p

            LEFT JOIN units u
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


// CREATE PRODUCT

export const createProduct = async (
    req,
    res,
    next
) => {

    try {

        const {
            product_code,
            product_name,
            product_type,
            unit_id
        } = req.body;


        if (
            !product_code ||
            !product_name
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "product_code and product_name are required"
            });

        }


        const result = await pool.query(`
            INSERT INTO products
            (
                product_code,
                product_name,
                product_type,
                unit_id
            )
            VALUES
            ($1, $2, $3, $4)
            RETURNING *;
        `, [
            product_code,
            product_name,
            product_type || null,
            unit_id || null
        ]);


        res.status(201).json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};

export const addProductionOutput = async (
    req,
    res,
    next
) => {

    try {

        const { batchId } = req.params;

        const {
            product_id,
            quantity
        } = req.body;


        if (
            !product_id ||
            !quantity
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "product_id and quantity are required"
            });

        }


        const result = await pool.query(`
            INSERT INTO production_outputs
            (
                production_batch_id,
                product_id,
                quantity
            )
            VALUES
            ($1, $2, $3)
            RETURNING *;
        `, [
            batchId,
            product_id,
            quantity
        ]);


        res.status(201).json({
            success: true,
            message:
                "Production output added successfully",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};