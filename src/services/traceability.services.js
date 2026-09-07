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

    // 2. Fetch materials, transfers, production, and rejections IN PARALLEL for max performance
    const [materialResult, transferResult, productionResult, rejectionResult] = await Promise.all([
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
                bt.transfer_manifest_no,
                fu.unit_code AS from_unit,
                fu.unit_name AS from_unit_name,
                tu.unit_code AS to_unit,
                tu.unit_name AS to_unit_name,
                bt.quantity,
                bt.transfer_date,
                bt.transfer_type,
                bt.carrier_vehicle_no,
                bt.weighbridge_slip_no,
                bt.status,
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
                po.lot_number,
                po.bundle_no,
                po.pieces_count,
                po.quantity AS product_quantity,
                po.qa_release_status
            FROM production_inputs pi
            JOIN production_batches pb ON pi.production_batch_id = pb.id
            JOIN units u ON pb.unit_id = u.id
            LEFT JOIN production_outputs po ON pb.id = po.production_batch_id
            LEFT JOIN products p ON po.product_id = p.id
            WHERE pi.billet_id = $1
            ORDER BY pb.production_date
        `, [billet.billet_id]),

        pool.query(`
            SELECT
                pr.id,
                pr.rejection_quantity,
                pr.rejection_category,
                pr.rejection_reason,
                pr.defect_location,
                pr.disposition,
                pr.inspector_id,
                pr.inspected_at,
                pb.batch_no,
                p.product_code,
                p.product_name
            FROM production_rejections pr
            JOIN production_batches pb ON pr.production_batch_id = pb.id
            LEFT JOIN products p ON pr.product_id = p.id
            WHERE pr.billet_id = $1
            ORDER BY pr.inspected_at DESC
        `, [billet.billet_id])
    ]);

    const initialQty = parseFloat(billet.billet_quantity || 0);
    const consumedQty = productionResult.rows.reduce(
        (sum, row) => sum + parseFloat(row.billet_consumed || 0),
        0
    );
    const remainingQty = Math.max(0, initialQty - consumedQty);

    // Production scrap from batch inputs vs outputs
    const seenBatches = new Set();
    let productionBatchScrap = 0;
    productionResult.rows.forEach(p => {
        if (!seenBatches.has(p.batch_id)) {
            seenBatches.add(p.batch_id);
            const bIn = parseFloat(p.batch_input_qty || 0);
            const bOut = parseFloat(p.batch_output_qty || 0);
            if (bIn > bOut) productionBatchScrap += (bIn - bOut);
        }
    });

    // Explicit rejections logged
    const loggedRejectionsQty = rejectionResult.rows.reduce(
        (sum, r) => sum + parseFloat(r.rejection_quantity || 0),
        0
    );

    const heatInput = parseFloat(billet.heat_input_qty || 0);
    const heatOutput = parseFloat(billet.heat_output_qty || 0);
    const heatMeltLoss = Math.max(0, heatInput - heatOutput);
    const heatMeltLossShare = heatOutput > 0 ? parseFloat(((initialQty / heatOutput) * heatMeltLoss).toFixed(2)) : 0;

    // Finished product outputs produced
    const finishedProductsProduced = productionResult.rows.filter(p => p.product_name);
    const finishedProductsQty = finishedProductsProduced.reduce(
        (sum, p) => sum + parseFloat(p.product_quantity || 0),
        0
    );

    // Rejection categorization
    const scaleLoss = rejectionResult.rows
        .filter(r => r.rejection_category === "PROCESS_BURNING_SCALE")
        .reduce((sum, r) => sum + parseFloat(r.rejection_quantity || 0), 0);
    const endCutScrap = rejectionResult.rows
        .filter(r => r.rejection_category === "SHEARING_END_CUT")
        .reduce((sum, r) => sum + parseFloat(r.rejection_quantity || 0), 0);
    const recycledSmsScrap = rejectionResult.rows
        .filter(r => r.disposition === "RECYCLE_TO_SMS")
        .reduce((sum, r) => sum + parseFloat(r.rejection_quantity || 0), 0);

    const totalScrapAndLoss = loggedRejectionsQty > 0 ? loggedRejectionsQty : productionBatchScrap;

    // 12-Point Management Audit Blueprint
    const auditSummary = {
        grade_produced: {
            code: billet.grade_code,
            name: billet.grade_name,
        },
        heat_number: {
            heat_no: billet.heat_no,
            heat_date: billet.heat_date,
            melt_shop: billet.heat_unit_name || billet.heat_unit || "SMS",
            total_input_qty: heatInput,
            total_output_qty: heatOutput,
        },
        raw_materials_used: materialResult.rows.map(m => ({
            code: m.material_code,
            name: m.material_name,
            type: m.material_type,
            quantity: parseFloat(m.quantity || 0),
            unit: m.unit,
        })),
        billet_produced_qty: {
            cast_weight: initialQty,
            current_remaining: remainingQty,
            unit: billet.billet_unit,
            production_date: billet.production_date,
        },
        manufacturing_units_received: [
            ...new Set([
                billet.heat_unit_name || billet.heat_unit || "Steel Melting Shop",
                ...transferResult.rows.map(t => t.to_unit_name || t.to_unit).filter(Boolean),
                ...productionResult.rows.map(p => p.unit_name || p.unit_code).filter(Boolean)
            ])
        ],
        transferred_qty_by_unit: transferResult.rows.map(t => ({
            from_unit: t.from_unit_name || t.from_unit,
            to_unit: t.to_unit_name || t.to_unit,
            quantity: parseFloat(t.quantity || 0),
            transfer_date: t.transfer_date,
            manifest_no: t.transfer_manifest_no,
            vehicle_no: t.carrier_vehicle_no,
        })),
        products_manufactured: [
            ...new Set(finishedProductsProduced.map(p => p.product_name))
        ],
        finished_product_qty: {
            total_weight: finishedProductsQty,
            unit: billet.billet_unit,
            lots: finishedProductsProduced.map(p => ({
                product_code: p.product_code,
                product_name: p.product_name,
                product_type: p.product_type,
                lot_number: p.lot_number,
                bundle_no: p.bundle_no,
                pieces_count: p.pieces_count,
                quantity: parseFloat(p.product_quantity || 0),
                qa_status: p.qa_release_status || "APPROVED",
            })),
        },
        material_rejected_qty: {
            total_rejected_weight: loggedRejectionsQty,
            rejection_count: rejectionResult.rows.length,
            unit: billet.billet_unit,
        },
        rejection_reasons: rejectionResult.rows.map(r => ({
            category: r.rejection_category,
            reason: r.rejection_reason,
            defect_location: r.defect_location,
            quantity: parseFloat(r.rejection_quantity || 0),
            disposition: r.disposition,
            batch_no: r.batch_no,
            inspector: r.inspector_id,
            date: r.inspected_at,
        })),
        scrap_and_waste_qty: {
            total_scrap_weight: totalScrapAndLoss,
            reheating_scale_loss: scaleLoss,
            crop_end_cut_scrap: endCutScrap,
            recycled_to_sms_scrap: recycledSmsScrap,
            heat_melt_loss_share: heatMeltLossShare,
            unit: billet.billet_unit,
        },
        final_destination: {
            status: billet.status,
            remaining_stock_in_yard: remainingQty,
            finished_products_destination: finishedProductsProduced.map(p => p.product_name),
            disposition_summary: remainingQty > 0
                ? `${consumedQty} KG consumed in rolling; ${remainingQty} KG available in stock.`
                : `100% processed into ${finishedProductsProduced.length} finished product lots and recycled scrap.`,
        }
    };

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
            production_scrap: totalScrapAndLoss,
            heat_melt_loss: heatMeltLoss,
            total_material_rejected: loggedRejectionsQty,
            recycled_sms_scrap: recycledSmsScrap,
            finished_products_qty: finishedProductsQty,
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
        production: productionResult.rows,
        rejections: rejectionResult.rows,
        audit_answers: auditSummary
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
    let rejections = [];

    // 3. If billets exist, fetch their transfers, production & rejections in parallel
    if (billetIds.length > 0) {
        const [transfersRes, productionRes, rejectionsRes] = await Promise.all([
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
            `, [billetIds]),

            pool.query(`
                SELECT
                    pr.id,
                    pr.billet_id,
                    b.billet_no,
                    pr.rejection_quantity,
                    pr.rejection_category,
                    pr.rejection_reason,
                    pr.defect_location,
                    pr.disposition,
                    pr.inspector_id,
                    pr.inspected_at,
                    pb.batch_no,
                    p.product_code,
                    p.product_name
                FROM production_rejections pr
                JOIN billets b ON pr.billet_id = b.id
                JOIN production_batches pb ON pr.production_batch_id = pb.id
                LEFT JOIN products p ON pr.product_id = p.id
                WHERE pr.billet_id = ANY($1::int[])
                ORDER BY pr.inspected_at DESC
            `, [billetIds])
        ]);

        transfers = transfersRes.rows;
        production = productionRes.rows;
        rejections = rejectionsRes.rows;
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
            grade_code: heat.grade_code,
            grade_name: heat.grade_name,
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
        production: production,
        rejections: rejections
    };
};

