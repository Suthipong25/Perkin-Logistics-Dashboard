-- =============================================================================
-- PERKIN LOGISTICS DATABASE SCHEMA (SQLite / PostgreSQL Compatible)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    job_no TEXT NOT NULL,
    service TEXT NOT NULL,
    service_label TEXT,
    status TEXT NOT NULL,
    status_detail TEXT,
    status_raw TEXT,
    customer TEXT,
    consignee TEXT,
    bl TEXT,
    mbl TEXT,
    hbl TEXT,
    join_no TEXT,
    update_status TEXT,
    etd TEXT,
    eta TEXT,
    job_date TEXT,
    month TEXT,
    year INTEGER,
    draft_customs INTEGER DEFAULT 0,
    advance_doc INTEGER DEFAULT 0,
    do_released INTEGER DEFAULT 0,
    customs_filed INTEGER DEFAULT 0,
    cleared INTEGER DEFAULT 0,
    draft_date TEXT,
    customs_date TEXT,
    do_date TEXT,
    clear_date TEXT,
    advance_date TEXT,
    remark TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    running_no INTEGER,
    version INTEGER DEFAULT 1,
    next_action TEXT,
    age_days INTEGER,
    flags TEXT,
    invoice_no TEXT,
    container_type TEXT,
    gross_weight REAL,
    cbm REAL,
    commodity TEXT,
    cs_name TEXT,
    data_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_job_no ON jobs(job_no);
CREATE INDEX IF NOT EXISTS idx_jobs_service ON jobs(service);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_month ON jobs(month);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer);

-- Audit log: Tracks every single change when a new Excel/FWD file is uploaded
CREATE TABLE IF NOT EXISTS job_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_no TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source_file TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_job_no ON job_history(job_no);
CREATE INDEX IF NOT EXISTS idx_history_changed_at ON job_history(changed_at);

-- Inland Transport Trips
CREATE TABLE IF NOT EXISTS transport_trips (
    trip_no TEXT PRIMARY KEY,
    job_no TEXT,
    customer TEXT,
    driver TEXT,
    truck_type TEXT,
    deliver_date TEXT,
    status TEXT,
    pod TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transport_job_no ON transport_trips(job_no);
CREATE INDEX IF NOT EXISTS idx_transport_customer ON transport_trips(customer);

-- Snapshots of volume & status over time
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    total_jobs INTEGER NOT NULL,
    completed_jobs INTEGER NOT NULL,
    in_progress_jobs INTEGER NOT NULL,
    cancelled_jobs INTEGER NOT NULL,
    services_breakdown TEXT,
    monthly_breakdown TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
