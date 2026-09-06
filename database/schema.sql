-- =========================================
-- CHANDAN STEEL TRACEABILITY DATABASE
-- =========================================

-- =========================================
-- 1. UNITS
-- =========================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE units (
    id SERIAL PRIMARY KEY,

    unit_code VARCHAR(30) NOT NULL UNIQUE,

    unit_name VARCHAR(100) NOT NULL,

    parent_unit_id INTEGER REFERENCES units(id),

    is_active BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- 2. GRADES
-- =========================================

CREATE TABLE grades (
    id SERIAL PRIMARY KEY,

    grade_code VARCHAR(50) NOT NULL UNIQUE,

    grade_name VARCHAR(100) NOT NULL,

    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- 3. MATERIAL MASTER
-- =========================================

CREATE TABLE materials (
    id SERIAL PRIMARY KEY,

    material_code VARCHAR(50) NOT NULL UNIQUE,

    material_name VARCHAR(150) NOT NULL,

    material_type VARCHAR(30) NOT NULL,

    unit VARCHAR(20) DEFAULT 'KG',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CHECK (
        material_type IN (
            'SCRAP',
            'ALLOY',
            'ADDITIVE',
            'OTHER'
        )
    )
);


-- =========================================
-- 4. SMS HEAT
-- =========================================

CREATE TABLE heats (
    id SERIAL PRIMARY KEY,

    heat_no VARCHAR(50) NOT NULL UNIQUE,

    grade_id INTEGER NOT NULL,

    unit_id INTEGER NOT NULL,

    heat_date DATE NOT NULL,

    start_time TIMESTAMP,

    end_time TIMESTAMP,

    total_input_qty DECIMAL(14,3) DEFAULT 0,

    total_output_qty DECIMAL(14,3) DEFAULT 0,

    unit VARCHAR(20) DEFAULT 'KG',

    status VARCHAR(30) DEFAULT 'COMPLETED',

    remarks TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (grade_id)
        REFERENCES grades(id),

    FOREIGN KEY (unit_id)
        REFERENCES units(id)
);


-- =========================================
-- 5. HEAT MATERIALS
-- =========================================

CREATE TABLE heat_materials (
    id SERIAL PRIMARY KEY,

    heat_id INTEGER NOT NULL,

    material_id INTEGER NOT NULL,

    quantity DECIMAL(14,3) NOT NULL,

    unit VARCHAR(20) DEFAULT 'KG',

    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    remarks TEXT,

    FOREIGN KEY (heat_id)
        REFERENCES heats(id)
        ON DELETE CASCADE,

    FOREIGN KEY (material_id)
        REFERENCES materials(id)
);


-- =========================================
-- 6. BILLETS
-- =========================================

CREATE TABLE billets (
    id SERIAL PRIMARY KEY,

    billet_no VARCHAR(50) NOT NULL UNIQUE,

    heat_id INTEGER NOT NULL,

    grade_id INTEGER NOT NULL,

    quantity DECIMAL(14,3) NOT NULL,

    unit VARCHAR(20) DEFAULT 'KG',

    production_date DATE NOT NULL,

    status VARCHAR(30) DEFAULT 'AVAILABLE',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (heat_id)
        REFERENCES heats(id),

    FOREIGN KEY (grade_id)
        REFERENCES grades(id)
);


-- =========================================
-- 7. BILLET TRANSFERS
-- =========================================

CREATE TABLE billet_transfers (
    id SERIAL PRIMARY KEY,

    billet_id INTEGER NOT NULL,

    from_unit_id INTEGER,

    to_unit_id INTEGER NOT NULL,

    quantity DECIMAL(14,3) NOT NULL,

    transfer_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    transfer_type VARCHAR(30) DEFAULT 'TRANSFER',

    remarks TEXT,

    FOREIGN KEY (billet_id)
        REFERENCES billets(id),

    FOREIGN KEY (from_unit_id)
        REFERENCES units(id),

    FOREIGN KEY (to_unit_id)
        REFERENCES units(id)
);


-- =========================================
-- 8. PRODUCTION BATCH
-- =========================================

CREATE TABLE production_batches (
    id SERIAL PRIMARY KEY,

    batch_no VARCHAR(50) NOT NULL UNIQUE,

    unit_id INTEGER NOT NULL,

    production_date DATE NOT NULL,

    input_quantity DECIMAL(14,3) DEFAULT 0,

    output_quantity DECIMAL(14,3) DEFAULT 0,

    unit VARCHAR(20) DEFAULT 'KG',

    status VARCHAR(30) DEFAULT 'COMPLETED',

    remarks TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (unit_id)
        REFERENCES units(id)
);


-- =========================================
-- 9. PRODUCTION INPUTS
-- =========================================

CREATE TABLE production_inputs (
    id SERIAL PRIMARY KEY,

    production_batch_id INTEGER NOT NULL,

    billet_id INTEGER NOT NULL,

    quantity DECIMAL(14,3) NOT NULL,

    unit VARCHAR(20) DEFAULT 'KG',

    FOREIGN KEY (production_batch_id)
        REFERENCES production_batches(id)
        ON DELETE CASCADE,

    FOREIGN KEY (billet_id)
        REFERENCES billets(id)
);


-- =========================================
-- 10. PRODUCTS
-- =========================================

CREATE TABLE products (
    id SERIAL PRIMARY KEY,

    product_code VARCHAR(50) NOT NULL UNIQUE,

    product_name VARCHAR(150) NOT NULL,

    product_type VARCHAR(100),

    unit_id INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (unit_id)
        REFERENCES units(id)
);


-- =========================================
-- 11. PRODUCTION OUTPUTS
-- =========================================

CREATE TABLE production_outputs (
    id SERIAL PRIMARY KEY,

    production_batch_id INTEGER NOT NULL,

    product_id INTEGER NOT NULL,

    quantity DECIMAL(14,3) NOT NULL,

    unit VARCHAR(20) DEFAULT 'KG',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (production_batch_id)
        REFERENCES production_batches(id),

    FOREIGN KEY (product_id)
        REFERENCES products(id)
);

-- =========================================
-- 12. PERFORMANCE INDEXES
-- =========================================
CREATE INDEX IF NOT EXISTS idx_billets_heat_id ON billets(heat_id);
CREATE INDEX IF NOT EXISTS idx_billet_transfers_billet_id ON billet_transfers(billet_id);
CREATE INDEX IF NOT EXISTS idx_heat_materials_heat_id ON heat_materials(heat_id);
CREATE INDEX IF NOT EXISTS idx_production_inputs_billet_id ON production_inputs(billet_id);
CREATE INDEX IF NOT EXISTS idx_production_inputs_batch_id ON production_inputs(production_batch_id);
CREATE INDEX IF NOT EXISTS idx_production_outputs_batch_id ON production_outputs(production_batch_id);