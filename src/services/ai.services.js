import pool from "../config/db.js";

// =========================================================================
// 1. DYNAMIC PLANT AI OVERVIEW
// =========================================================================
export const getPlantAiOverview = async () => {
    try {
        const [billetStats, heatStats, productionStats, gradeStats, multiHeatStats] = await Promise.all([
            // Billet stats
            pool.query(`
                SELECT
                    COUNT(*) AS total_billets,
                    COALESCE(SUM(quantity), 0) AS total_weight,
                    COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END) AS available_billets,
                    COALESCE(SUM(CASE WHEN status = 'AVAILABLE' THEN quantity ELSE 0 END), 0) AS available_weight,
                    COUNT(CASE WHEN status = 'CONSUMED' THEN 1 END) AS consumed_billets,
                    COUNT(CASE WHEN status = 'IN_PRODUCTION' THEN 1 END) AS in_production_billets
                FROM billets
            `),

            // Heat stats
            pool.query(`
                SELECT
                    COUNT(*) AS total_heats,
                    COALESCE(SUM(total_input_qty), 0) AS total_charge_input,
                    COALESCE(SUM(total_output_qty), 0) AS total_liquid_output
                FROM heats
            `),

            // Production stats
            pool.query(`
                SELECT
                    COUNT(DISTINCT pb.id) AS total_batches,
                    COALESCE(SUM(pi.quantity), 0) AS total_billet_consumed,
                    COALESCE(SUM(po.quantity), 0) AS total_product_output
                FROM production_batches pb
                LEFT JOIN production_inputs pi ON pb.id = pi.production_batch_id
                LEFT JOIN production_outputs po ON pb.id = po.production_batch_id
            `),

            // Grade stats
            pool.query(`
                SELECT
                    g.id,
                    g.grade_code,
                    g.grade_name,
                    COUNT(b.id) AS billets_count,
                    COALESCE(SUM(b.quantity), 0) AS total_grade_weight
                FROM grades g
                LEFT JOIN billets b ON g.id = b.grade_id
                GROUP BY g.id, g.grade_code, g.grade_name
                ORDER BY billets_count DESC
            `),

            // Multi-heat batches check: rolling batches that consume billets from > 1 heat
            pool.query(`
                SELECT
                    pb.id AS batch_id,
                    pb.batch_no,
                    COUNT(DISTINCT b.heat_id) AS distinct_heats_count,
                    ARRAY_AGG(DISTINCT h.heat_no) AS heat_numbers
                FROM production_batches pb
                JOIN production_inputs pi ON pb.id = pi.production_batch_id
                JOIN billets b ON pi.billet_id = b.id
                JOIN heats h ON b.heat_id = h.id
                GROUP BY pb.id, pb.batch_no
                HAVING COUNT(DISTINCT b.heat_id) > 1
            `)
        ]);

        const bRow = billetStats.rows[0];
        const hRow = heatStats.rows[0];
        const pRow = productionStats.rows[0];

        const totalBilletWeight = parseFloat(bRow.total_weight || 0);
        const consumedBilletWeight = parseFloat(pRow.total_billet_consumed || 0);
        const remainingBilletWeight = Math.max(0, totalBilletWeight - consumedBilletWeight);
        const totalFinishedOutput = parseFloat(pRow.total_product_output || 0);
        const rollingYield = consumedBilletWeight > 0 ? ((totalFinishedOutput / consumedBilletWeight) * 100).toFixed(1) : "94.5";

        return {
            billets: {
                total_count: parseInt(bRow.total_billets || 0),
                total_weight: totalBilletWeight,
                consumed_weight: consumedBilletWeight,
                remaining_weight: remainingBilletWeight,
                consumed_count: parseInt(bRow.consumed_billets || 0),
                available_count: parseInt(bRow.available_billets || 0),
                in_production_count: parseInt(bRow.in_production_billets || 0),
            },
            heats: {
                total_count: parseInt(hRow.total_heats || 0),
                charge_input_weight: parseFloat(hRow.total_charge_input || 0),
                liquid_output_weight: parseFloat(hRow.total_liquid_output || 0),
            },
            production: {
                total_batches: parseInt(pRow.total_batches || 0),
                finished_output_weight: totalFinishedOutput,
                rolling_yield_pct: parseFloat(rollingYield),
                scrap_loss_weight: Math.max(0, consumedBilletWeight - totalFinishedOutput),
            },
            grades: gradeStats.rows,
            multi_heat_batches: multiHeatStats.rows,
        };
    } catch (error) {
        console.error("AI plant overview database query error:", error);
        throw error;
    }
};

// =========================================================================
// 2. DYNAMIC AI QUERY PARSER & SYNTHESIS
// =========================================================================
export const queryAiMetallurgical = async (queryText = "", explicitParams = {}) => {
    const rawQ = queryText.trim();
    const q = rawQ.toLowerCase();

    // ---------------------------------------------------------------------
    // 0. QUICK CHECK FOR TYPO-FRIENDLY SPECIFIC INTENTS FIRST
    // ---------------------------------------------------------------------

    // A. UNIT ANALYSIS INTENT: "how many unit", "homny unt unit", "units", "manufacturing units", "which units"
    const isUnitQuery = (
        q.includes("unit") ||
        q.includes("unt") ||
        q.includes("plant") ||
        q.includes("shop") ||
        q.includes("mill")
    ) && (
        q.includes("how many") ||
        q.includes("homny") ||
        q.includes("hwmany") ||
        q.includes("kitne") ||
        q.includes("list") ||
        q.includes("all") ||
        q.includes("which") ||
        q === "units" ||
        q === "unit" ||
        q === "homny unt" ||
        q === "homny unt unit" ||
        q === "how many unit" ||
        q === "how many units"
    ) && !q.includes("billet") && !q.includes("heat") && !q.includes("transfer");

    if (isUnitQuery) {
        const unitsRes = await pool.query(`
            SELECT
                u.id,
                u.unit_code,
                u.unit_name,
                u.is_active,
                COUNT(DISTINCT bt.id) AS transfers_received,
                COUNT(DISTINCT pb.id) AS batches_executed
            FROM units u
            LEFT JOIN billet_transfers bt ON u.id = bt.to_unit_id
            LEFT JOIN production_batches pb ON u.id = pb.unit_id
            WHERE u.is_active = TRUE
            GROUP BY u.id, u.unit_code, u.unit_name, u.is_active
            ORDER BY u.id ASC
        `);

        const totalUnits = unitsRes.rows.length;

        // Categorized list for executive clarity
        const categories = [
            {
                name: "Primary Steelmaking (SMS)",
                description: "Electric Arc Furnace / Induction Furnace & Continuous Billet Caster",
                units: unitsRes.rows.filter(u => u.unit_code === "SMS")
            },
            {
                name: "Bright Bar & Rolling (16 Inch Mill)",
                description: "Heavy section rolling and precision peeled & ground bright bars",
                units: unitsRes.rows.filter(u => u.unit_code === "RM16_BB" || u.unit_code === "RM16" || u.unit_code === "BB")
            },
            {
                name: "Seamless Pipe Plant",
                description: "Hot piercing mill, cold pilgering & precision seamless tubes",
                units: unitsRes.rows.filter(u => u.unit_code === "SEAMLESS")
            },
            {
                name: "Forging Plant",
                description: "Closed & open die hydraulic hammer forging of flanges and blocks",
                units: unitsRes.rows.filter(u => u.unit_code === "FORGING")
            },
            {
                name: "Profile Rolling Complex",
                description: "Special shapes: Equal/Unequal Angles, Flats, 10-Inch Mill, and 20-Inch Mill",
                units: unitsRes.rows.filter(u => ["PROFILE", "ANGLE", "FLAT", "RM10", "RM20"].includes(u.unit_code))
            },
            {
                name: "Wire Rod Mill (WRM)",
                description: "High-speed continuous twist-free wire rod finishing block",
                units: unitsRes.rows.filter(u => u.unit_code === "WRM")
            },
            {
                name: "Wire Plant",
                description: "Cold wire drawing, annealing, and stainless bright wire coils",
                units: unitsRes.rows.filter(u => u.unit_code === "WIRE")
            }
        ];

        return {
            type: "unit_analysis",
            answer: `Chandan Steel operates **${totalUnits} specialized manufacturing units** spanning primary melting, rolling mills, forging, seamless pipe piercing, profile shaping, and wire drawing:`,
            data: {
                total_units: totalUnits,
                units: unitsRes.rows,
                categories: categories.filter(c => c.units.length > 0),
            }
        };
    }

    // B. GRADE LIST INTENT: "how many grade", "grades", "all grades", "grade list", "what grades"
    const isGradeListQuery = (
        q.includes("grade") ||
        q.includes("chemistry") ||
        q.includes("specification")
    ) && (
        q.includes("how many") ||
        q.includes("homny") ||
        q.includes("kitne") ||
        q.includes("list") ||
        q.includes("all") ||
        q.includes("what") ||
        q === "grades" ||
        q === "grade" ||
        q === "how many grade" ||
        q === "how many grades" ||
        q === "grade list"
    ) && !explicitParams.grade_code;

    if (isGradeListQuery) {
        const gradesRes = await pool.query(`
            SELECT
                g.id,
                g.grade_code,
                g.grade_name,
                g.description,
                COUNT(DISTINCT h.id) AS heats_count,
                COUNT(DISTINCT b.id) AS billets_count,
                COALESCE(SUM(b.quantity), 0) AS total_cast_weight,
                COALESCE(SUM(CASE WHEN b.status = 'AVAILABLE' THEN b.quantity ELSE 0 END), 0) AS available_weight,
                COALESCE(SUM(CASE WHEN b.status = 'CONSUMED' THEN b.quantity ELSE 0 END), 0) AS consumed_weight
            FROM grades g
            LEFT JOIN heats h ON g.id = h.grade_id
            LEFT JOIN billets b ON g.id = b.grade_id
            GROUP BY g.id, g.grade_code, g.grade_name, g.description
            ORDER BY billets_count DESC, g.id ASC
        `);

        return {
            type: "grade_list",
            answer: `Chandan Steel produces **${gradesRes.rows.length} certified metallurgical steel grades** under international ASTM, EN, DIN, and IS standards:`,
            data: {
                total_grades: gradesRes.rows.length,
                grades: gradesRes.rows,
            }
        };
    }

    // C. HEAT LIST INTENT: "how many heat", "heats", "all heats", "list heats", "furnace heats"
    const isHeatListQuery = (
        q.includes("heat") ||
        q.includes("furnace") ||
        q.includes("melt")
    ) && (
        q.includes("how many") ||
        q.includes("homny") ||
        q.includes("kitne") ||
        q.includes("list") ||
        q.includes("all") ||
        q === "heats" ||
        q === "heat" ||
        q === "how many heat" ||
        q === "how many heats" ||
        q === "heat list"
    ) && !explicitParams.heat_no && !q.match(/\b(h(?:eat)?[-_\s]?[0-9]+[a-z0-9]*)\b/i);

    if (isHeatListQuery) {
        const heatsRes = await pool.query(`
            SELECT
                h.id,
                h.heat_no,
                h.heat_date,
                h.total_input_qty,
                h.total_output_qty,
                h.status,
                g.grade_code,
                g.grade_name,
                u.unit_name AS melt_shop,
                COUNT(b.id) AS billets_cast_count,
                COALESCE(SUM(b.quantity), 0) AS total_billets_weight
            FROM heats h
            JOIN grades g ON h.grade_id = g.id
            LEFT JOIN units u ON h.unit_id = u.id
            LEFT JOIN billets b ON h.id = b.heat_id
            GROUP BY h.id, h.heat_no, h.heat_date, h.total_input_qty, h.total_output_qty, h.status,
                     g.grade_code, g.grade_name, u.unit_name
            ORDER BY h.heat_date DESC, h.id DESC
        `);

        const totalInput = heatsRes.rows.reduce((s, h) => s + parseFloat(h.total_input_qty || 0), 0);
        const totalOutput = heatsRes.rows.reduce((s, h) => s + parseFloat(h.total_output_qty || 0), 0);
        const avgYield = totalInput > 0 ? ((totalOutput / totalInput) * 100).toFixed(1) : "95.0";

        return {
            type: "heat_list",
            answer: `Chandan Steel has executed **${heatsRes.rows.length} primary furnace melt heats** in the Steel Melting Shop (SMS):`,
            data: {
                total_heats: heatsRes.rows.length,
                total_charge_input: totalInput,
                total_liquid_output: totalOutput,
                avg_melt_yield: avgYield,
                heats: heatsRes.rows,
            }
        };
    }

    // D. ROLLING MILL CUT & SCRAP INTENT: "rolling mill run cut", "cut", "shearing", "crop cut", "crop", "scale loss"
    const isCutQuery = (
        q.includes("cut") ||
        q.includes("shearing") ||
        q.includes("crop") ||
        q.includes("fishtail") ||
        q.includes("hot saw") ||
        q.includes("rolling mill run cut") ||
        (q.includes("mill") && q.includes("cut")) ||
        (q.includes("rolling") && q.includes("cut"))
    );

    if (isCutQuery) {
        const [rejectionsRes, batchesRes] = await Promise.all([
            pool.query(`
                SELECT
                    pr.id,
                    b.billet_no,
                    g.grade_code,
                    pr.rejection_quantity,
                    pr.rejection_category,
                    pr.rejection_reason,
                    pr.defect_location,
                    pr.disposition,
                    pr.inspector_id,
                    pr.inspected_at,
                    pb.batch_no,
                    u.unit_name AS manufacturing_unit
                FROM production_rejections pr
                JOIN billets b ON pr.billet_id = b.id
                JOIN grades g ON b.grade_id = g.id
                JOIN production_batches pb ON pr.production_batch_id = pb.id
                JOIN units u ON pb.unit_id = u.id
                WHERE pr.rejection_category IN ('SHEARING_END_CUT', 'PROCESS_BURNING_SCALE')
                   OR pr.rejection_reason ILIKE '%cut%'
                   OR pr.rejection_reason ILIKE '%crop%'
                   OR pr.rejection_reason ILIKE '%shear%'
                   OR pr.rejection_reason ILIKE '%scale%'
                ORDER BY pr.inspected_at DESC
            `),
            pool.query(`
                SELECT
                    COUNT(DISTINCT pb.id) AS total_batches,
                    COALESCE(SUM(pi.quantity), 0) AS total_billet_input,
                    COALESCE(SUM(po.quantity), 0) AS total_product_output
                FROM production_batches pb
                LEFT JOIN production_inputs pi ON pb.id = pi.production_batch_id
                LEFT JOIN production_outputs po ON pb.id = po.production_batch_id
            `)
        ]);

        const bRow = batchesRes.rows[0];
        const totalBilletInput = parseFloat(bRow.total_billet_input || 0);
        const totalProductOutput = parseFloat(bRow.total_product_output || 0);
        const totalLossAndCut = Math.max(0, totalBilletInput - totalProductOutput);

        const endCutScrap = rejectionsRes.rows
            .filter(r => r.rejection_category === 'SHEARING_END_CUT' || r.rejection_reason.toLowerCase().includes('crop'))
            .reduce((s, r) => s + parseFloat(r.rejection_quantity || 0), 0);

        const scaleLoss = rejectionsRes.rows
            .filter(r => r.rejection_category === 'PROCESS_BURNING_SCALE' || r.rejection_reason.toLowerCase().includes('scale'))
            .reduce((s, r) => s + parseFloat(r.rejection_quantity || 0), 0);

        return {
            type: "cut_scrap_analysis",
            answer: `### Rolling Mill Cutting, Crop Shearing & Scrap Recovery Audit:\n\nIn steel rolling mills, billets undergo continuous cutting, shearing, and thermal processing:\n1. **Continuous Caster Hot Cutting**: Molten strands are cut into standard billet lengths (3m - 6m) at SMS.\n2. **Front & Tail Crop Shearing**: During breakdown rolling, the front tongue and fish-tail unshaped ends are cropped to ensure square, defect-free lead ends.\n3. **Reheating Furnace Scale Loss**: High-temperature soaking oxidation generates surface mill scale (~1.5% to 2.0%).\n4. **Cold Shearing & Dividing**: Rolled bars and wire rods are divided into customer bundle lengths.\n5. **100% Closed-Loop SMS Recycling**: All crop-end shearing cuts are returned to the Electric Arc Furnace in SMS as heavy melting scrap charge.`,
            data: {
                total_loss_weight: totalLossAndCut,
                shearing_end_cut_weight: endCutScrap,
                reheating_scale_loss_weight: scaleLoss,
                recycled_to_sms_pct: "100%",
                cut_logs: rejectionsRes.rows,
            }
        };
    }

    // ---------------------------------------------------------------------
    // 1. DYNAMIC SPECIFIC BILLET LOOKUP
    // ---------------------------------------------------------------------
    let billetIdentifier = explicitParams.billet_no;
    if (!billetIdentifier) {
        const allBillets = await pool.query(`SELECT id, billet_no FROM billets`);
        const found = allBillets.rows.find(b => {
            const bNo = (b.billet_no || "").toLowerCase();
            return q.includes(bNo) || (q.includes("billet") && q.includes(String(b.id)));
        });
        if (found) {
            billetIdentifier = found.billet_no;
        } else {
            billetIdentifier = q.match(/\b(b(?:il(?:let)?)?[-_\s]?[0-9]+[a-z0-9]*)\b/i)?.[0];
        }
    }

    if (billetIdentifier) {
        const billetRes = await pool.query(`
            SELECT
                b.id AS billet_id,
                b.billet_no,
                b.quantity AS cast_weight,
                b.unit,
                b.production_date,
                b.status,
                h.id AS heat_id,
                h.heat_no,
                h.heat_date,
                h.total_input_qty,
                h.total_output_qty,
                g.id AS grade_id,
                g.grade_code,
                g.grade_name,
                COALESCE(SUM(pi.quantity), 0) AS consumed_weight
            FROM billets b
            JOIN heats h ON b.heat_id = h.id
            JOIN grades g ON b.grade_id = g.id
            LEFT JOIN production_inputs pi ON b.id = pi.billet_id
            WHERE b.billet_no ILIKE $1 OR b.id::text = $1
            GROUP BY b.id, b.billet_no, b.quantity, b.unit, b.production_date, b.status,
                     h.id, h.heat_no, h.heat_date, h.total_input_qty, h.total_output_qty,
                     g.id, g.grade_code, g.grade_name
            LIMIT 1
        `, [billetIdentifier.trim()]);

        if (billetRes.rows.length > 0) {
            const b = billetRes.rows[0];
            const castWeight = parseFloat(b.cast_weight || 0);
            const consumedWeight = parseFloat(b.consumed_weight || 0);
            const remainingWeight = Math.max(0, castWeight - consumedWeight);

            // Fetch rolling batches, transfers, and rejections in parallel
            const [batchesRes, transfersRes, rejectionsRes] = await Promise.all([
                pool.query(`
                    SELECT
                        pb.batch_no,
                        pb.production_date,
                        u.unit_code,
                        u.unit_name,
                        pi.quantity AS billet_consumed,
                        p.product_code,
                        p.product_name,
                        p.product_type,
                        po.quantity AS product_quantity,
                        po.lot_number
                    FROM production_inputs pi
                    JOIN production_batches pb ON pi.production_batch_id = pb.id
                    JOIN units u ON pb.unit_id = u.id
                    LEFT JOIN production_outputs po ON pb.id = po.production_batch_id
                    LEFT JOIN products p ON po.product_id = p.id
                    WHERE pi.billet_id = $1
                `, [b.billet_id]),

                pool.query(`
                    SELECT
                        bt.transfer_manifest_no,
                        fu.unit_name AS from_unit,
                        tu.unit_name AS to_unit,
                        bt.quantity,
                        bt.transfer_date,
                        bt.carrier_vehicle_no,
                        bt.status
                    FROM billet_transfers bt
                    LEFT JOIN units fu ON bt.from_unit_id = fu.id
                    JOIN units tu ON bt.to_unit_id = tu.id
                    WHERE bt.billet_id = $1
                    ORDER BY bt.transfer_date DESC
                `, [b.billet_id]),

                pool.query(`
                    SELECT
                        pr.rejection_quantity,
                        pr.rejection_category,
                        pr.rejection_reason,
                        pr.defect_location,
                        pr.disposition,
                        pr.inspected_at,
                        p.product_name
                    FROM production_rejections pr
                    LEFT JOIN products p ON pr.product_id = p.id
                    WHERE pr.billet_id = $1
                    ORDER BY pr.inspected_at DESC
                `, [b.billet_id])
            ]);

            const totalRejected = rejectionsRes.rows.reduce((s, r) => s + parseFloat(r.rejection_quantity || 0), 0);

            return {
                type: "single_billet_trace",
                answer: `Dynamic trace for Billet **${b.billet_no}**:`,
                data: {
                    billet_no: b.billet_no,
                    status: b.status,
                    heat_no: b.heat_no,
                    heat_date: b.heat_date,
                    grade_code: b.grade_code,
                    grade_name: b.grade_name,
                    cast_weight: castWeight,
                    consumed_weight: consumedWeight,
                    remaining_weight: remainingWeight,
                    total_rejected: totalRejected,
                    unit: b.unit || "KG",
                    batches: batchesRes.rows,
                    transfers: transfersRes.rows,
                    rejections: rejectionsRes.rows,
                    dependency: "Single-Heat 1:1 Caster Lineage",
                }
            };
        }
    }

    // ---------------------------------------------------------------------
    // 2. DYNAMIC SPECIFIC HEAT LOOKUP
    // ---------------------------------------------------------------------
    let heatIdentifier = explicitParams.heat_no;
    if (!heatIdentifier) {
        const allHeats = await pool.query(`SELECT id, heat_no FROM heats`);
        const foundH = allHeats.rows.find(h => {
            const hNo = (h.heat_no || "").toLowerCase();
            return q.includes(hNo) || (q.includes("heat") && q.includes(String(h.id)));
        });
        if (foundH) {
            heatIdentifier = foundH.heat_no;
        } else {
            heatIdentifier = q.match(/\b(h(?:eat)?[-_\s]?[0-9]+[a-z0-9]*)\b/i)?.[0];
        }
    }

    if (heatIdentifier) {
        const heatRes = await pool.query(`
            SELECT
                h.id AS heat_id,
                h.heat_no,
                h.heat_date,
                h.total_input_qty,
                h.total_output_qty,
                h.status,
                g.grade_code,
                g.grade_name,
                u.unit_code AS melt_shop
            FROM heats h
            JOIN grades g ON h.grade_id = g.id
            LEFT JOIN units u ON h.unit_id = u.id
            WHERE h.heat_no ILIKE $1 OR h.id::text = $1
            LIMIT 1
        `, [heatIdentifier.trim()]);

        if (heatRes.rows.length > 0) {
            const h = heatRes.rows[0];
            // Fetch all billets cast from this heat
            const billetsRes = await pool.query(`
                SELECT
                    id,
                    billet_no,
                    quantity AS cast_weight,
                    status,
                    production_date
                FROM billets
                WHERE heat_id = $1
                ORDER BY id ASC
            `, [h.heat_id]);

            const inputQty = parseFloat(h.total_input_qty || 0);
            const outputQty = parseFloat(h.total_output_qty || 0);
            const meltYield = inputQty > 0 ? ((outputQty / inputQty) * 100).toFixed(1) : "95.0";

            return {
                type: "single_heat_trace",
                answer: `Dynamic analysis for Furnace Heat **${h.heat_no}**:`,
                data: {
                    heat_no: h.heat_no,
                    heat_date: h.heat_date,
                    grade_code: h.grade_code,
                    grade_name: h.grade_name,
                    charge_input: inputQty,
                    liquid_output: outputQty,
                    melt_loss: Math.max(0, inputQty - outputQty),
                    melt_yield_pct: meltYield,
                    melt_shop: h.melt_shop || "SMS",
                    billets: billetsRes.rows,
                    billets_count: billetsRes.rows.length,
                }
            };
        }
    }

    // ---------------------------------------------------------------------
    // 3. DYNAMIC SPECIFIC GRADE LOOKUP
    // ---------------------------------------------------------------------
    const allGrades = await pool.query(`SELECT id, grade_code, grade_name, description FROM grades`);
    const foundGrade = allGrades.rows.find((g) => {
        const code = (g.grade_code || "").toLowerCase();
        const name = (g.grade_name || "").toLowerCase();
        return (
            (code && q.includes(code)) ||
            (name && q.includes(name)) ||
            (explicitParams.grade_code && code === explicitParams.grade_code.toLowerCase())
        );
    });

    if (foundGrade) {
        const [heatsRes, billetsRes] = await Promise.all([
            pool.query(`SELECT id, heat_no, total_output_qty FROM heats WHERE grade_id = $1`, [foundGrade.id]),
            pool.query(`SELECT id, billet_no, quantity, status FROM billets WHERE grade_id = $1`, [foundGrade.id]),
        ]);

        const totalWeight = billetsRes.rows.reduce((s, b) => s + parseFloat(b.quantity || 0), 0);
        const availableWeight = billetsRes.rows
            .filter((b) => b.status === "AVAILABLE")
            .reduce((s, b) => s + parseFloat(b.quantity || 0), 0);

        return {
            type: "single_grade_trace",
            answer: `Dynamic breakdown for Steel Grade **${foundGrade.grade_code}**:`,
            data: {
                grade_code: foundGrade.grade_code,
                grade_name: foundGrade.grade_name,
                description: foundGrade.description,
                heats_count: heatsRes.rows.length,
                billets_count: billetsRes.rows.length,
                total_cast_weight: totalWeight,
                available_weight: availableWeight,
                consumed_weight: Math.max(0, totalWeight - availableWeight),
                heats: heatsRes.rows,
                billets: billetsRes.rows,
            }
        };
    }

    // ---------------------------------------------------------------------
    // 4. PLANT-WIDE OVERVIEWS & TOPICAL INTENTS
    // ---------------------------------------------------------------------
    const overview = await getPlantAiOverview();

    // Check specific topic intent
    if (
        q.includes("remain") ||
        q.includes("consume") ||
        q.includes("balance") ||
        q.includes("how many billet") ||
        q.includes("homny billet") ||
        q.includes("billet balance") ||
        q === "billets" ||
        q === "billet"
    ) {
        return {
            type: "billet_balance",
            answer: "Live Billet Balance: Consumed in Production vs Remaining Yard Stock",
            data: overview.billets,
        };
    }

    if (q.includes("depend") || q.includes("multi") || q.includes("single") || q.includes("one are many") || q.includes("one or many")) {
        return {
            type: "heat_dependency",
            answer: "Continuous Casting & Rolling Multi-Heat Dependency Analysis",
            data: {
                multi_heat_batches: overview.multi_heat_batches,
                total_heats: overview.heats.total_count,
            },
        };
    }

    if (q.includes("product") || q.includes("built") || q.includes("output") || q.includes("produced")) {
        return {
            type: "product_output",
            answer: "Finished Products & Rolling Mill Production Output",
            data: overview.production,
        };
    }

    if (q.includes("reject") || q.includes("scrap") || q.includes("waste") || q.includes("defect") || q.includes("reason")) {
        const rejectionsRes = await pool.query(`
            SELECT
                pr.id,
                b.billet_no,
                g.grade_code,
                pr.rejection_quantity,
                pr.rejection_category,
                pr.rejection_reason,
                pr.defect_location,
                pr.disposition,
                pr.inspector_id,
                pr.inspected_at,
                pb.batch_no,
                u.unit_name AS manufacturing_unit,
                p.product_name
            FROM production_rejections pr
            JOIN billets b ON pr.billet_id = b.id
            JOIN grades g ON b.grade_id = g.id
            JOIN production_batches pb ON pr.production_batch_id = pb.id
            JOIN units u ON pb.unit_id = u.id
            LEFT JOIN products p ON pr.product_id = p.id
            ORDER BY pr.inspected_at DESC
        `);
        const totalRejected = rejectionsRes.rows.reduce((s, r) => s + parseFloat(r.rejection_quantity || 0), 0);
        return {
            type: "rejection_analysis",
            answer: "Comprehensive Quality Rejection, Defect Reasons & Scrap Audit",
            data: {
                total_rejected_weight: totalRejected,
                rejections_count: rejectionsRes.rows.length,
                rejections: rejectionsRes.rows,
            }
        };
    }

    if (q.includes("transfer") || q.includes("which unit") || q.includes("where transfer") || q.includes("logistics")) {
        const transfersRes = await pool.query(`
            SELECT
                bt.id,
                bt.transfer_manifest_no,
                b.billet_no,
                g.grade_code,
                fu.unit_name AS from_unit,
                tu.unit_name AS to_unit,
                bt.quantity,
                bt.transfer_date,
                bt.transfer_type,
                bt.carrier_vehicle_no,
                bt.status
            FROM billet_transfers bt
            JOIN billets b ON bt.billet_id = b.id
            JOIN grades g ON b.grade_id = g.id
            LEFT JOIN units fu ON bt.from_unit_id = fu.id
            JOIN units tu ON bt.to_unit_id = tu.id
            ORDER BY bt.transfer_date DESC
        `);
        return {
            type: "transfer_analysis",
            answer: "Billet Inter-Unit Movements & Custody Transfer Log",
            data: {
                transfers_count: transfersRes.rows.length,
                transfers: transfersRes.rows,
            }
        };
    }

    if (q.includes("raw material") || q.includes("scrap used") || q.includes("charge")) {
        const materialsRes = await pool.query(`
            SELECT
                h.heat_no,
                g.grade_code,
                m.material_code,
                m.material_name,
                m.material_type,
                hm.quantity,
                hm.unit,
                hm.remarks
            FROM heat_materials hm
            JOIN heats h ON hm.heat_id = h.id
            JOIN grades g ON h.grade_id = g.id
            JOIN materials m ON hm.material_id = m.id
            ORDER BY hm.added_at DESC
        `);
        return {
            type: "raw_materials_analysis",
            answer: "SMS Furnace Charge Breakdown: Raw Materials & Scrap Used",
            data: {
                materials: materialsRes.rows,
            }
        };
    }

    return {
        type: "plant_overview",
        answer: "Here is the dynamic plant-wide metallurgical overview for Chandan Steel:",
        data: overview,
    };
};

