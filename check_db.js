import pool from "./src/config/db.js";

async function run() {
    const units = await pool.query("SELECT id, unit_code, unit_name FROM units ORDER BY id");
    console.log("Current units:", units.rows);

    const prods = await pool.query("SELECT id, product_code, product_name, product_type FROM products ORDER BY id");
    console.log("Current products:", prods.rows);

    const billets = await pool.query("SELECT id, billet_no, quantity, status FROM billets ORDER BY id");
    console.log("Current billets:", billets.rows);

    const heats = await pool.query("SELECT id, heat_no, total_input_qty, total_output_qty FROM heats ORDER BY id");
    console.log("Current heats:", heats.rows);

    process.exit(0);
}

run();
