import pool from "../config/db.js";


export const getBilletTraceability = async (
    billetNo
) => {

    // ==========================================
    // 1. BILLET + HEAT + GRADE
    // ==========================================

    const billetResult = await pool.query(`

        SELECT

            b.id AS billet_id,
            b.billet_no,
            b.quantity AS billet_quantity,
            b.unit AS billet_unit,
            b.production_date,
            b.status,

            h.id AS heat_id,
            h.heat_no,
            h.heat_date,

            g.id AS grade_id,
            g.grade_code,
            g.grade_name,

            u.unit_code AS heat_unit,
            u.unit_name AS heat_unit_name

        FROM billets b

        JOIN heats h
            ON b.heat_id = h.id

        JOIN grades g
            ON b.grade_id = g.id

        JOIN units u
            ON h.unit_id = u.id

        WHERE b.billet_no = $1

    `, [billetNo]);


    if (billetResult.rows.length === 0) {

        return null;

    }


    const billet = billetResult.rows[0];


    // ==========================================
    // 2. SCRAP + ALLOY USED IN HEAT
    // ==========================================

    const materialResult = await pool.query(`

        SELECT

            hm.id,

            m.material_code,
            m.material_name,
            m.material_type,

            hm.quantity,
            hm.unit,

            hm.added_at,
            hm.remarks

        FROM heat_materials hm

        JOIN materials m
            ON hm.material_id = m.id

        WHERE hm.heat_id = $1

        ORDER BY hm.added_at

    `, [billet.heat_id]);


    // ==========================================
    // 3. BILLET TRANSFERS
    // ==========================================

    const transferResult = await pool.query(`

        SELECT

            bt.id,

            fu.unit_code AS from_unit,
            fu.unit_name AS from_unit_name,

            tu.unit_code AS to_unit,
            tu.unit_name AS to_unit_name,

            bt.quantity,

            bt.transfer_date,

            bt.transfer_type,

            bt.remarks

        FROM billet_transfers bt

        LEFT JOIN units fu
            ON bt.from_unit_id = fu.id

        JOIN units tu
            ON bt.to_unit_id = tu.id

        WHERE bt.billet_id = $1

        ORDER BY bt.transfer_date

    `, [billet.billet_id]);


    // ==========================================
    // 4. PRODUCTION + PRODUCTS
    // ==========================================

    const productionResult = await pool.query(`

        SELECT

            pb.id AS batch_id,
            pb.batch_no,

            u.unit_code,
            u.unit_name,

            pb.production_date,

            pi.quantity AS billet_consumed,

            p.product_code,
            p.product_name,
            p.product_type,

            po.quantity AS product_quantity

        FROM production_inputs pi

        JOIN production_batches pb
            ON pi.production_batch_id = pb.id

        JOIN units u
            ON pb.unit_id = u.id

        LEFT JOIN production_outputs po
            ON pb.id = po.production_batch_id

        LEFT JOIN products p
            ON po.product_id = p.id

        WHERE pi.billet_id = $1

        ORDER BY pb.production_date

    `, [billet.billet_id]);


    return {

        billet: {
            id: billet.billet_id,
            billet_no: billet.billet_no,
            quantity: billet.billet_quantity,
            unit: billet.billet_unit,
            production_date: billet.production_date,
            status: billet.status
        },

        source: {

            heat: {
                id: billet.heat_id,
                heat_no: billet.heat_no,
                heat_date: billet.heat_date
            },

            grade: {
                id: billet.grade_id,
                code: billet.grade_code,
                name: billet.grade_name
            },

            materials: materialResult.rows

        },

        transfers: transferResult.rows,

        production: productionResult.rows

    };
};