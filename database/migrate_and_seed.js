import pool from "../src/config/db.js";


async function migrateAndSeed() {
    console.log("Starting Chandan Steel Traceability Database Migration & Seeding...");

    try {
        // 1. Create production_rejections table & enhance existing tables safely
        await pool.query(`
            CREATE TABLE IF NOT EXISTS production_rejections (
                id SERIAL PRIMARY KEY,
                production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE CASCADE,
                billet_id INTEGER REFERENCES billets(id),
                product_id INTEGER REFERENCES products(id),
                rejection_quantity DECIMAL(14,3) NOT NULL,
                rejection_category VARCHAR(60) NOT NULL,
                rejection_reason TEXT NOT NULL,
                defect_location VARCHAR(100),
                disposition VARCHAR(50) NOT NULL DEFAULT 'RECYCLE_TO_SMS',
                inspector_id VARCHAR(50),
                inspected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_prod_rejections_batch ON production_rejections(production_batch_id);
            CREATE INDEX IF NOT EXISTS idx_prod_rejections_billet ON production_rejections(billet_id);

            -- Safe column extensions
            ALTER TABLE billets ADD COLUMN IF NOT EXISTS current_weight DECIMAL(14,3);
            ALTER TABLE billets ADD COLUMN IF NOT EXISTS length_mm DECIMAL(10,2);
            ALTER TABLE billets ADD COLUMN IF NOT EXISTS section_mm VARCHAR(40);
            ALTER TABLE billets ADD COLUMN IF NOT EXISTS current_unit_id INTEGER REFERENCES units(id);
            ALTER TABLE billets ADD COLUMN IF NOT EXISTS yard_location VARCHAR(60);

            ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS rejection_quantity DECIMAL(14,3) DEFAULT 0;
            ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS scrap_quantity DECIMAL(14,3) DEFAULT 0;
            ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS furnace_temp_celsius INTEGER;

            ALTER TABLE production_outputs ADD COLUMN IF NOT EXISTS lot_number VARCHAR(60);
            ALTER TABLE production_outputs ADD COLUMN IF NOT EXISTS bundle_no VARCHAR(50);
            ALTER TABLE production_outputs ADD COLUMN IF NOT EXISTS pieces_count INTEGER;
            ALTER TABLE production_outputs ADD COLUMN IF NOT EXISTS qa_release_status VARCHAR(30) DEFAULT 'APPROVED';

            ALTER TABLE billet_transfers ADD COLUMN IF NOT EXISTS transfer_manifest_no VARCHAR(60);
            ALTER TABLE billet_transfers ADD COLUMN IF NOT EXISTS carrier_vehicle_no VARCHAR(40);
            ALTER TABLE billet_transfers ADD COLUMN IF NOT EXISTS weighbridge_slip_no VARCHAR(50);
            ALTER TABLE billet_transfers ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'RECEIVED';
        `);
        console.log("✓ Table production_rejections created and table schemas extended.");


        // 2. Ensure all specified manufacturing units exist
        const targetUnits = [
            { code: "SMS", name: "Steel Melting Shop", category: "SMS" },
            { code: "RM16_BB", name: "Bright Bar & Rolling – 16 Inch Mill", category: "ROLLING_MILL" },
            { code: "SEAMLESS", name: "Seamless Pipe Plant", category: "PIPE_PLANT" },
            { code: "FORGING", name: "Forging Plant", category: "FORGING" },
            { code: "PROFILE", name: "Profile Rolling Complex", category: "PROFILE_MILL" },
            { code: "ANGLE", name: "Profile Rolling – Angle Mill", category: "PROFILE_MILL" },
            { code: "FLAT", name: "Profile Rolling – Flat Mill", category: "PROFILE_MILL" },
            { code: "RM10", name: "Profile Rolling – 10-Inch Rolling Mill", category: "PROFILE_MILL" },
            { code: "RM20", name: "Profile Rolling – 20-Inch Rolling Mill", category: "PROFILE_MILL" },
            { code: "WRM", name: "Wire Rod Mill (WRM)", category: "WIRE_ROD_MILL" },
            { code: "WIRE", name: "Wire Plant", category: "WIRE_PLANT" },
        ];

        for (const u of targetUnits) {
            await pool.query(`
                INSERT INTO units (unit_code, unit_name, is_active)
                VALUES ($1, $2, TRUE)
                ON CONFLICT (unit_code) DO UPDATE 
                SET unit_name = EXCLUDED.unit_name, is_active = TRUE;
            `, [u.code, u.name]);
        }
        console.log("✓ Manufacturing units seeded.");

        // 3. Ensure materials master has diverse scrap and alloys
        const targetMaterials = [
            { code: "SCRAP-HEAVY", name: "Heavy Melting Steel Scrap (HMS-1)", type: "SCRAP" },
            { code: "SCRAP-REVERT", name: "Internal Mill Revert Scrap", type: "SCRAP" },
            { code: "FE-CR-HC", name: "High Carbon Ferro Chrome", type: "ALLOY" },
            { code: "FE-NI", name: "Ferro Nickel", type: "ALLOY" },
            { code: "FE-MN", name: "Ferro Manganese", type: "ALLOY" },
            { code: "FE-SI", name: "Ferro Silicon", type: "ALLOY" },
            { code: "LIME", name: "Calcined Lime (Flux)", type: "ADDITIVE" },
            { code: "AL-DEOX", name: "Aluminum Deoxidizer Notch Bars", type: "ADDITIVE" },
        ];

        for (const m of targetMaterials) {
            await pool.query(`
                INSERT INTO materials (material_code, material_name, material_type, unit)
                VALUES ($1, $2, $3, 'KG')
                ON CONFLICT (material_code) DO NOTHING;
            `, [m.code, m.name, m.type]);
        }
        console.log("✓ Materials master seeded.");

        // 4. Ensure grades master has SS 304L, EN8, EN9, AISI 316L, Fe 500D
        const targetGrades = [
            { code: "AISI 304L", name: "Austenitic Stainless Steel 304L", desc: "Low carbon 18/8 stainless steel for corrosive and structural applications" },
            { code: "EN8", name: "Unalloyed Medium Carbon Steel (080M40)", desc: "High strength engineering steel for shafts, axles, and gears" },
            { code: "EN9", name: "Medium Carbon Steel (070M55)", desc: "High wear resistance carbon steel for keys, cylinders, and sprockets" },
            { code: "AISI 316L", name: "Molybdenum Stainless Steel 316L", desc: "Marine and chemical grade stainless steel with 2-3% Mo" },
            { code: "Fe 500D", name: "High Ductility TMT Reinforcement Steel", desc: "Earthquake resistant high yield strength steel" },
        ];

        for (const g of targetGrades) {
            await pool.query(`
                INSERT INTO grades (grade_code, grade_name, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (grade_code) DO UPDATE 
                SET grade_name = EXCLUDED.grade_name, description = EXCLUDED.description;
            `, [g.code, g.name, g.desc]);
        }
        console.log("✓ Steel grades seeded.");

        // 5. Ensure all final product types exist in products
        const targetProducts = [
            { code: "PROD-RCS-75", name: "RCS Round Cornered Square 75x75mm", type: "RCS / Round Bars", unitCode: "RM16_BB" },
            { code: "PROD-RND-50", name: "Round Bar Dia 50mm Hot Rolled", type: "RCS / Round Bars", unitCode: "RM16_BB" },
            { code: "PROD-BB-32", name: "Bright Bar Dia 32mm Peeled & Ground", type: "RCS / Round Bars", unitCode: "RM16_BB" },
            { code: "PROD-ANG-50", name: "Equal Angle 50x50x5mm", type: "Angles", unitCode: "ANGLE" },
            { code: "PROD-FLT-65", name: "Flat Bar 65x10mm Profile Rolled", type: "Flats", unitCode: "FLAT" },
            { code: "PROD-CHN-100", name: "Structural Channel ISMC 100", type: "Channels", unitCode: "PROFILE" },
            { code: "PROD-TSEC-40", name: "Structural T-Section 40x40x5mm", type: "T-Sections", unitCode: "PROFILE" },
            { code: "PROD-HBM-150", name: "Universal H-Beam 150x150mm", type: "H-Beams", unitCode: "RM20" },
            { code: "PROD-FLG-WN4", name: "Forged Weld Neck Flange 4-Inch 150#", type: "Flanges", unitCode: "FORGING" },
            { code: "PROD-PIPE-SMLS", name: "Seamless Pipe 2-Inch Sch 40 Hot Finished", type: "Pipes", unitCode: "SEAMLESS" },
            { code: "PROD-WRM-8MM", name: "Wire Rod Coil Dia 8.0mm", type: "Wire Rods", unitCode: "WRM" },
            { code: "PROD-WIRE-2MM", name: "Drawn Spring Wire Dia 2.0mm Bright", type: "Wires", unitCode: "Wires" },
            { code: "PROD-FORG-RNG", name: "Forged Heavy Ring OD 600mm", type: "Forged Products", unitCode: "FORGING" },
        ];

        for (const p of targetProducts) {
            const unitRes = await pool.query("SELECT id FROM units WHERE unit_code = $1 LIMIT 1", [p.unitCode]);
            const unitId = unitRes.rows[0]?.id || null;
            await pool.query(`
                INSERT INTO products (product_code, product_name, product_type, unit_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (product_code) DO UPDATE 
                SET product_name = EXCLUDED.product_name, product_type = EXCLUDED.product_type;
            `, [p.code, p.name, p.type, unitId]);
        }
        console.log("✓ Final products seeded.");

        // 6. Seed Complete End-to-End Traceability Exemplar: Billet B260825001 (EN8)
        // Check if raw materials exist for Heat 1 (H260825001)
        const heat1 = await pool.query("SELECT id, heat_no FROM heats WHERE heat_no = 'H260825001' LIMIT 1");
        if (heat1.rows.length > 0) {
            const heatId = heat1.rows[0].id;
            const matScrap = (await pool.query("SELECT id FROM materials WHERE material_code = 'SCRAP-HEAVY' LIMIT 1")).rows[0]?.id;
            const matRevert = (await pool.query("SELECT id FROM materials WHERE material_code = 'SCRAP-REVERT' LIMIT 1")).rows[0]?.id;
            const matFeMn = (await pool.query("SELECT id FROM materials WHERE material_code = 'FE-MN' LIMIT 1")).rows[0]?.id;
            const matFeSi = (await pool.query("SELECT id FROM materials WHERE material_code = 'FE-SI' LIMIT 1")).rows[0]?.id;
            const matLime = (await pool.query("SELECT id FROM materials WHERE material_code = 'LIME' LIMIT 1")).rows[0]?.id;

            const existingHeatMats = await pool.query("SELECT COUNT(*) FROM heat_materials WHERE heat_id = $1", [heatId]);
            if (parseInt(existingHeatMats.rows[0].count) === 0 && matScrap) {
                await pool.query(`
                    INSERT INTO heat_materials (heat_id, material_id, quantity, unit, remarks) VALUES
                    ($1, $2, 8500.000, 'KG', 'Heavy melting scrap bundle A'),
                    ($1, $3, 2500.000, 'KG', 'Internal revert crop scrap'),
                    ($1, $4, 450.000, 'KG', 'Ferro Manganese alloy addition'),
                    ($1, $5, 250.000, 'KG', 'Ferro Silicon deoxidizer'),
                    ($1, $6, 300.000, 'KG', 'Calcined lime slag former')
                `, [heatId, matScrap, matRevert, matFeMn, matFeSi, matLime]);
                console.log("✓ Added raw materials charge breakdown for Heat H260825001.");
            }
        }

        // 7. Seed Complete End-to-End Traceability Exemplar 2: Billet BIL-2026-304L
        // Heat H-304L-901 in SMS -> Billet BIL-304L-01 -> Transferred to SEAMLESS Pipe Plant -> Production Batch -> Seamless Pipe -> Rejections
        const grade304L = (await pool.query("SELECT id FROM grades WHERE grade_code = 'AISI 304L' LIMIT 1")).rows[0]?.id;
        const unitSms = (await pool.query("SELECT id FROM units WHERE unit_code = 'SMS' LIMIT 1")).rows[0]?.id;
        const unitSeamless = (await pool.query("SELECT id FROM units WHERE unit_code = 'SEAMLESS' LIMIT 1")).rows[0]?.id;
        const prodSeamlessPipe = (await pool.query("SELECT id FROM products WHERE product_code = 'PROD-PIPE-SMLS' LIMIT 1")).rows[0]?.id;

        if (grade304L && unitSms && unitSeamless) {
            // Check if heat exists
            let heat304 = (await pool.query("SELECT id FROM heats WHERE heat_no = 'H-304L-901' LIMIT 1")).rows[0];
            if (!heat304) {
                const insHeat = await pool.query(`
                    INSERT INTO heats (heat_no, grade_id, unit_id, heat_date, total_input_qty, total_output_qty, unit, status, remarks)
                    VALUES ('H-304L-901', $1, $2, CURRENT_DATE - INTERVAL '3 days', 15000.000, 14250.000, 'KG', 'COMPLETED', 'Stainless Steel 304L Vacuum Degassed Melt')
                    RETURNING id;
                `, [grade304L, unitSms]);
                heat304 = insHeat.rows[0];

                // Materials
                const matHeavy = (await pool.query("SELECT id FROM materials WHERE material_code = 'SCRAP-HEAVY' LIMIT 1")).rows[0]?.id;
                const matFeCr = (await pool.query("SELECT id FROM materials WHERE material_code = 'FE-CR-HC' LIMIT 1")).rows[0]?.id;
                const matFeNi = (await pool.query("SELECT id FROM materials WHERE material_code = 'FE-NI' LIMIT 1")).rows[0]?.id;
                if (matHeavy && matFeCr && matFeNi) {
                    await pool.query(`
                        INSERT INTO heat_materials (heat_id, material_id, quantity, unit, remarks) VALUES
                        ($1, $2, 9200.000, 'KG', 'Selected SS 304 clean scrap'),
                        ($1, $3, 3400.000, 'KG', 'High Carbon Ferro Chrome 65% Cr'),
                        ($1, $4, 1800.000, 'KG', 'Ferro Nickel 20% Ni alloy addition'),
                        ($1, $5, 600.000, 'KG', 'Deoxidation & Fluxing package')
                    `, [heat304.id, matHeavy, matFeCr, matFeNi, matHeavy]);
                }
            }

            // Billet BIL-304L-01
            let billet304 = (await pool.query("SELECT id FROM billets WHERE billet_no = 'BIL-304L-01' LIMIT 1")).rows[0];
            if (!billet304) {
                const insBillet = await pool.query(`
                    INSERT INTO billets (billet_no, heat_id, grade_id, quantity, current_weight, unit, production_date, current_unit_id, status)
                    VALUES ('BIL-304L-01', $1, $2, 4750.000, 0.000, 'KG', CURRENT_DATE - INTERVAL '3 days', $3, 'CONSUMED')
                    RETURNING id;
                `, [heat304.id, grade304L, unitSeamless]);
                billet304 = insBillet.rows[0];

                // Unit Transfer: SMS -> Seamless Pipe Plant
                await pool.query(`
                    INSERT INTO billet_transfers (transfer_manifest_no, billet_id, from_unit_id, to_unit_id, quantity, transfer_date, transfer_type, carrier_vehicle_no, weighbridge_slip_no, status, remarks)
                    VALUES ('TRF-2026-089', $1, $2, $3, 4750.000, CURRENT_TIMESTAMP - INTERVAL '2 days', 'INTERNAL_TRANSFER', 'GJ-15-AT-4412', 'WB-88910', 'RECEIVED', 'Transferred to Seamless Pipe Plant for rotary piercing')
                `, [billet304.id, unitSms, unitSeamless]);

                // Production Batch: SMLS-260906-01
                const insBatch = await pool.query(`
                    INSERT INTO production_batches (batch_no, unit_id, production_date, input_quantity, output_quantity, rejection_quantity, scrap_quantity, unit, status, furnace_temp_celsius, remarks)
                    VALUES ('SMLS-260906-01', $1, CURRENT_DATE - INTERVAL '2 days', 4750.000, 4280.000, 290.000, 180.000, 'KG', 'COMPLETED', 1240, 'Piercing and MPM hot rolling campaign for 2-inch seamless pipes')
                    RETURNING id;
                `, [unitSeamless]);
                const batchId = insBatch.rows[0].id;

                // Production Input
                await pool.query(`
                    INSERT INTO production_inputs (production_batch_id, billet_id, quantity, unit)
                    VALUES ($1, $2, 4750.000, 'KG')
                `, [batchId, billet304.id]);

                // Production Output (Prime Finished Pipes)
                if (prodSeamlessPipe) {
                    await pool.query(`
                        INSERT INTO production_outputs (production_batch_id, product_id, lot_number, bundle_no, pieces_count, quantity, unit, qa_release_status)
                        VALUES ($1, $2, 'LOT-SMLS-304L-89', 'BUN-01/02', 86, 4280.000, 'KG', 'APPROVED')
                    `, [batchId, prodSeamlessPipe]);
                }

                // Production Rejections & Scrap
                await pool.query(`
                    INSERT INTO production_rejections (production_batch_id, billet_id, product_id, rejection_quantity, rejection_category, rejection_reason, defect_location, disposition, inspector_id) VALUES
                    ($1, $2, $3, 190.000, 'SURFACE_DEFECT', 'External spiral seam & piercing guide mark detected on OD', 'Pipe 44-47 front section', 'RECYCLE_TO_SMS', 'QC-MET-08'),
                    ($1, $2, $3, 100.000, 'INTERNAL_METALLURGICAL', 'ID bore scoring and internal ultrasonic porosity', 'Near end crop', 'RECYCLE_TO_SMS', 'QC-NDT-04'),
                    ($1, $2, NULL, 180.000, 'PROCESS_BURNING_SCALE', 'Rotary hearth furnace oxidation & scale pit loss', 'Furnace hearth', 'SCRAP_SALE', 'PROD-ENG-02')
                `, [batchId, billet304.id, prodSeamlessPipe]);

                console.log("✓ Created complete exemplar Billet BIL-304L-01 with Heat, Materials, Transfers, Production, and Rejections.");
            }
        }

        // 8. Add sample rejection record for existing Billet 1 (B260825001) in WRM batch if none exists
        const b1Inputs = await pool.query("SELECT production_batch_id FROM production_inputs WHERE billet_id = 1 LIMIT 1");
        if (b1Inputs.rows.length > 0) {
            const batchId = b1Inputs.rows[0].production_batch_id;
            const exRej = await pool.query("SELECT COUNT(*) FROM production_rejections WHERE billet_id = 1");
            if (parseInt(exRej.rows[0].count) === 0) {
                await pool.query(`
                    INSERT INTO production_rejections (production_batch_id, billet_id, product_id, rejection_quantity, rejection_category, rejection_reason, defect_location, disposition, inspector_id) VALUES
                    ($1, 1, NULL, 120.000, 'SHEARING_END_CUT', 'Rolling mill front & tail crop fishtail shearing ends', 'Front and tail ends', 'RECYCLE_TO_SMS', 'QC-INSP-01'),
                    ($1, 1, NULL, 80.000, 'PROCESS_BURNING_SCALE', 'Reheating furnace scale loss during soaking', 'Billet surface', 'SCRAP_SALE', 'PROD-WRM-01')
                `, [batchId]);
                console.log("✓ Added rejection and scrap accounting for Billet B260825001.");
            }
        }

        console.log("\n========================================================");
        console.log("SUCCESS: Database migration and seed completed!");
        console.log("========================================================");
        process.exit(0);
    } catch (err) {
        console.error("Migration error:", err);
        process.exit(1);
    }
}

migrateAndSeed();
