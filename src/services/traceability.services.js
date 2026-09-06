import pool from "../config/db.js";

// ==========================================
// 1. SINGLE BILLET TRACEABILITY
// ==========================================
export const getBilletTraceability = async (billetNo) => {
    // 1. Fetch Billet + Heat + Grade info
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
            h.total_input_qty AS heat_input_qty,
            h.total_output_qty AS heat_output_qty,

            g.id AS grade_id,
            g.grade_code,
            g.grade_name,

            u.unit_code AS heat_unit,
            u.unit_name AS heat_unit_name

        FROM billets b
        JOIN heats h ON b.heat_id = h.id
        JOIN grades g ON b.grade_id = g.id
        LEFT JOIN units u ON h.unit_id = u.id
        WHERE b.billet_no ILIKE $1 OR b.id::text = $1
        LIMIT 1
    `, [billetNo]);

    if (billetResult.rows.length === 0) {
        return null;
    }

    const billet = billetResult.rows[0];

    // 2. Fetch materials, transfers, and production IN PARALLEL for max performance
    const [materialResult, transferResult, productionResult] = await Promise.all([
        pool.query(`
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
            JOIN materials m ON hm.material_id = m.id
            WHERE hm.heat_id = $1
            ORDER BY hm.added_at
        `, [billet.heat_id]),

        pool.query(`
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
            LEFT JOIN units fu ON bt.from_unit_id = fu.id
            JOIN units tu ON bt.to_unit_id = tu.id
            WHERE bt.billet_id = $1
            ORDER BY bt.transfer_date
        `, [billet.billet_id]),

        pool.query(`
            SELECT
                pb.id AS batch_id,
                pb.batch_no,
                pb.production_date,
                pb.input_quantity AS batch_input_qty,
                pb.output_quantity AS batch_output_qty,
                u.unit_code,
                u.unit_name,
                pi.quantity AS billet_consumed,
                p.product_code,
                p.product_name,
                p.product_type,
                po.quantity AS product_quantity
            FROM production_inputs pi
            JOIN production_batches pb ON pi.production_batch_id = pb.id
            JOIN units u ON pb.unit_id = u.id
            LEFT JOIN production_outputs po ON pb.id = po.production_batch_id
            LEFT JOIN products p ON po.product_id = p.id
            WHERE pi.billet_id = $1
            ORDER BY pb.production_date
        `, [billet.billet_id])
    ]);

    const initialQty = parseFloat(billet.billet_quantity || 0);
    const consumedQty = productionResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.billet_consumed || 0),
        0
    );
    const remainingQty = Math.max(0, initialQty - consumedQty);

    // Production scrap
    const seenBatches = new Set();
    let productionScrap = 0;
    productionResult.rows.forEach(p => {
        if (!seenBatches.has(p.batch_id)) {
            seenBatches.add(p.batch_id);
            const bIn = parseFloat(p.batch_input_qty || 0);
            const bOut = parseFloat(p.batch_output_qty || 0);
            if (bIn > bOut) productionScrap += (bIn - bOut);
        }
    });

    const heatInput = parseFloat(billet.heat_input_qty || 0);
    const heatOutput = parseFloat(billet.heat_output_qty || 0);
    const heatMeltLoss = Math.max(0, heatInput - heatOutput);

    return {
        billet: {
            id: billet.billet_id,
            billet_no: billet.billet_no,
            quantity: initialQty,
            consumed_quantity: consumedQty,
            remaining_quantity: remainingQty,
            unit: billet.billet_unit,
            production_date: billet.production_date,
            status: billet.status
        },
        metrics: {
            initial_quantity: initialQty,
            consumed_quantity: consumedQty,
            remaining_quantity: remainingQty,
            production_scrap: productionScrap,
            heat_melt_loss: heatMeltLoss,
            total_material_rejected: heatMeltLoss + productionScrap,
            unit: billet.billet_unit
        },
        source: {
            heat: {
                id: billet.heat_id,
                heat_no: billet.heat_no,
                heat_date: billet.heat_date,
                total_input_qty: heatInput,
                total_output_qty: heatOutput
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

// ==========================================
// 2. FULL HEAT TRACEABILITY (ALL BILLETS)
// ==========================================
export const getHeatTraceability = async (heatNo) => {
    // 1. Fetch Heat details
    const heatResult = await pool.query(`
        SELECT
            h.id AS heat_id,
            h.heat_no,
            h.heat_date,
            h.start_time,
            h.end_time,
            h.total_input_qty,
            h.total_output_qty,
            h.unit,
            h.status,
            h.remarks,

            g.id AS grade_id,
            g.grade_code,
            g.grade_name,

            u.unit_code AS heat_unit,
            u.unit_name AS heat_unit_name

        FROM heats h
        JOIN grades g ON h.grade_id = g.id
        LEFT JOIN units u ON h.unit_id = u.id
        WHERE h.heat_no ILIKE $1 OR h.id::text = $1
        LIMIT 1
    `, [heatNo]);

    if (heatResult.rows.length === 0) {
        return null;
    }

    const heat = heatResult.rows[0];

    // 2. Fetch charge materials and billets IN PARALLEL
    const [materialsResult, billetsResult] = await Promise.all([
        pool.query(`
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
            JOIN materials m ON hm.material_id = m.id
            WHERE hm.heat_id = $1
            ORDER BY hm.added_at
        `, [heat.heat_id]),

        pool.query(`
            SELECT
                b.id AS billet_id,
                b.billet_no,
                b.quantity,
                b.unit,
                b.production_date,
                b.status,
                g.grade_code,
                g.grade_name
            FROM billets b
            JOIN grades g ON b.grade_id = g.id
            WHERE b.heat_id = $1
            ORDER BY b.id ASC
        `, [heat.heat_id])
    ]);

    const billets = billetsResult.rows;
    const billetIds = billets.map(b => b.billet_id);

    let transfers = [];
    let production = [];

    // 3. If billets exist, fetch their transfers & production in parallel
    if (billetIds.length > 0) {
        const [transfersRes, productionRes] = await Promise.all([
            pool.query(`
                SELECT
                    bt.id,
                    bt.billet_id,
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
                JOIN billets b ON bt.billet_id = b.id
                LEFT JOIN units fu ON bt.from_unit_id = fu.id
                JOIN units tu ON bt.to_unit_id = tu.id
                WHERE bt.billet_id = ANY($1::int[])
                ORDER BY bt.transfer_date
            `, [billetIds]),

            pool.query(`
                SELECT
                    pb.id AS batch_id,
                    pb.batch_no,
                    pb.production_date,
                    pb.input_quantity AS batch_input_qty,
                    pb.output_quantity AS batch_output_qty,
                    u.unit_code,
                    u.unit_name,
                    pi.billet_id,
                    b.billet_no,
                    pi.quantity AS billet_consumed,
                    p.product_code,
                    p.product_name,
                    p.product_type,
                    po.quantity AS product_quantity
                FROM production_inputs pi
                JOIN billets b ON pi.billet_id = b.id
                JOIN production_batches pb ON pi.production_batch_id = pb.id
                JOIN units u ON pb.unit_id = u.id
                LEFT JOIN production_outputs po ON pb.id = po.production_batch_id
                LEFT JOIN products p ON po.product_id = p.id
                WHERE pi.billet_id = ANY($1::int[])
                ORDER BY pb.production_date
            `, [billetIds])
        ]);

        transfers = transfersRes.rows;
        production = productionRes.rows;
    }

    // 4. Map detailed traceability for each billet
    const detailedBillets = billets.map(b => {
        const billetProd = production.filter(p => p.billet_id === b.billet_id);
        const consumed = billetProd.reduce(
            (sum, p) => sum + parseFloat(p.billet_consumed || 0),
            0
        );
        const initialQty = parseFloat(b.quantity || 0);
        const remaining = Math.max(0, initialQty - consumed);
        const billetTransfers = transfers.filter(t => t.billet_id === b.billet_id);

        return {
            id: b.billet_id,
            billet_no: b.billet_no,
            quantity: initialQty,
            consumed_quantity: consumed,
            remaining_quantity: remaining,
            unit: b.unit,
            production_date: b.production_date,
            status: b.status,
            grade_code: b.grade_code,
            grade_name: b.grade_name,
            transfers: billetTransfers,
            production: billetProd
        };
    });

    // 5. Aggregate metrics
    const totalBilletsCount = detailedBillets.length;
    const totalBilletsQty = detailedBillets.reduce((sum, b) => sum + b.quantity, 0);
    const consumedBilletsQty = detailedBillets.reduce((sum, b) => sum + b.consumed_quantity, 0);
    const remainingBilletsQty = detailedBillets.reduce((sum, b) => sum + b.remaining_quantity, 0);
    const consumedBilletsCount = detailedBillets.filter(b => b.consumed_quantity > 0).length;
    const remainingBilletsCount = detailedBillets.filter(b => b.remaining_quantity > 0).length;

    const heatInput = parseFloat(heat.total_input_qty || 0);
    const heatOutput = parseFloat(heat.total_output_qty || 0);
    const heatMeltLoss = Math.max(0, heatInput - heatOutput);

    // Production rolling scrap / process loss
    const seenBatches = new Set();
    let productionScrap = 0;
    production.forEach(p => {
        if (!seenBatches.has(p.batch_id)) {
            seenBatches.add(p.batch_id);
            const bIn = parseFloat(p.batch_input_qty || 0);
            const bOut = parseFloat(p.batch_output_qty || 0);
            if (bIn > bOut) productionScrap += (bIn - bOut);
        }
    });

    const totalMaterialRejected = heatMeltLoss + productionScrap;
    const yieldPercentage = heatInput > 0 ? ((heatOutput / heatInput) * 100).toFixed(2) : "100.00";

    return {
        heat: {
            id: heat.heat_id,
            heat_no: heat.heat_no,
            heat_date: heat.heat_date,
            start_time: heat.start_time,
            end_time: heat.end_time,
            total_input_qty: heatInput,
            total_output_qty: heatOutput,
            unit: heat.unit || "KG",
            status: heat.status,
            remarks: heat.remarks,
            grade: {
                id: heat.grade_id,
                code: heat.grade_code,
                name: heat.grade_name
            },
            unit_info: {
                code: heat.heat_unit,
                name: heat.heat_unit_name
            }
        },
        metrics: {
            total_billets_count: totalBilletsCount,
            total_billets_qty: totalBilletsQty,
            consumed_billets_count: consumedBilletsCount,
            consumed_billets_qty: consumedBilletsQty,
            remaining_billets_count: remainingBilletsCount,
            remaining_billets_qty: remainingBilletsQty,
            heat_melt_loss_qty: heatMeltLoss,
            production_scrap_qty: productionScrap,
            total_material_rejected_qty: totalMaterialRejected,
            yield_percentage: parseFloat(yieldPercentage),
            unit: heat.unit || "KG"
        },
        materials: materialsResult.rows,
        billets: detailedBillets,
        transfers: transfers,
        production: production
    };
};