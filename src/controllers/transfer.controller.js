import pool from "../config/db.js";


// ============================================
// CREATE TRANSFER
// ============================================

export const createTransfer = async (req, res, next) => {

    try {

        const {
            billet_id,
            from_unit_id,
            to_unit_id,
            quantity,
            transfer_type,
            remarks
        } = req.body;


        if (
            !billet_id ||
            !to_unit_id ||
            !quantity
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "billet_id, to_unit_id and quantity are required"
            });

        }


        const result = await pool.query(`
            INSERT INTO billet_transfers
            (
                billet_id,
                from_unit_id,
                to_unit_id,
                quantity,
                transfer_type,
                remarks
            )
            VALUES
            ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `, [
            billet_id,
            from_unit_id || null,
            to_unit_id,
            quantity,
            transfer_type || "TRANSFER",
            remarks || null
        ]);


        res.status(201).json({
            success: true,
            message: "Billet transferred successfully",
            data: result.rows[0]
        });

    } catch (error) {

        next(error);

    }
};


// ============================================
// GET TRANSFERS OF BILLET
// ============================================

export const getBilletTransfers = async (
    req,
    res,
    next
) => {

    try {

        const { billetId } = req.params;


        const result = await pool.query(`
            SELECT

                bt.id,

                b.billet_no,

                fu.unit_code AS from_unit,
                fu.unit_name AS from_unit_name,

                tu.unit_code AS to_unit,
                tu.unit_name AS to_unit_name,

                bt.quantity,
                bt.transfer_date,
                bt.transfer_type,
                bt.remarks

            FROM billet_transfers bt

            JOIN billets b
                ON bt.billet_id = b.id

            LEFT JOIN units fu
                ON bt.from_unit_id = fu.id

            JOIN units tu
                ON bt.to_unit_id = tu.id

            WHERE bt.billet_id = $1

            ORDER BY bt.transfer_date ASC
        `, [billetId]);


        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {

        next(error);

    }
};

export const getTransfers = async (req, res, next) => {
    try {

        const result = await pool.query(`
            SELECT

                bt.id,

                b.billet_no,

                fu.unit_code AS from_unit,
                fu.unit_name AS from_unit_name,

                tu.unit_code AS to_unit,
                tu.unit_name AS to_unit_name,

                bt.quantity,
                bt.transfer_date,
                bt.transfer_type,
                bt.remarks

            FROM billet_transfers bt

            JOIN billets b
                ON bt.billet_id = b.id

            LEFT JOIN units fu
                ON bt.from_unit_id = fu.id

            JOIN units tu
                ON bt.to_unit_id = tu.id

            ORDER BY bt.transfer_date DESC
        `);

        res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {

        next(error);

    }
};