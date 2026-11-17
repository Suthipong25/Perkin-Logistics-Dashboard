"""
=============================================================================
PERKIN LOGISTICS — SQLITE TO POSTGRESQL MIGRATION UTILITY
=============================================================================
Exports SQLite database (perkin_logistics.db) to PostgreSQL-compatible SQL
and can optionally execute it directly against a local or remote PostgreSQL instance.

Usage:
  # 1. Generate SQL migration dump file:
  python backend/scripts/migrate_to_postgres.py

  # 2. Directly pipe/apply into PostgreSQL (if PostgreSQL is running):
  python backend/scripts/migrate_to_postgres.py --apply --user postgres --db perkin_logistics
=============================================================================
"""
import sqlite3
import os
import sys
import subprocess
import argparse

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if not os.path.exists(os.path.join(BASE_DIR, 'package.json')):
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(BASE_DIR, 'data', 'perkin_logistics.db')
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'perkin_logistics.db')

OUTPUT_SQL = os.path.join(BASE_DIR, 'sql', 'postgres_migration.sql')
if not os.path.exists(os.path.dirname(OUTPUT_SQL)):
    OUTPUT_SQL = os.path.join(BASE_DIR, 'backend', 'sql', 'postgres_migration.sql')
PSQL_PATH = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"


import re

def validate_pg_date(val, fallback_month=None):
    if not val:
        return None
    s = str(val).strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if mo == 0:
        if fallback_month and '-' in str(fallback_month):
            try:
                mo = int(str(fallback_month).split('-')[1])
            except Exception:
                mo = 8
        else:
            mo = 8
    elif mo > 12 and 1 <= d <= 12:
        mo, d = d, mo

    if y < 1990 or y > 2050:
        y = 2026
    if mo < 1 or mo > 12 or d < 1 or d > 31:
        return None
    return f"{y:04d}-{mo:02d}-{d:02d}"


def escape_sql_val(val):
    if val is None:
        return "NULL"
    if isinstance(val, (int, float)):
        return str(val)
    # String escaping for Postgres ($$ or single quote doubled)
    s = str(val).replace("'", "''")
    return f"'{s}'"


def generate_postgres_sql():
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"SQLite database not found at {DB_PATH}. Run sqlite_db.py first.")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    lines = []
    lines.append("-- =============================================================================")
    lines.append("-- PERKIN LOGISTICS — POSTGRESQL MIGRATION SCRIPT")
    lines.append("-- Auto-generated from SQLite database")
    lines.append("-- =============================================================================")
    lines.append("ROLLBACK; -- Clear any previously aborted transaction state")
    lines.append("BEGIN;")
    lines.append("")

    # Schema definition in PostgreSQL syntax
    schema_pg = """
CREATE TABLE IF NOT EXISTS public.jobs (
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
    etd DATE,
    eta DATE,
    job_date DATE,
    month TEXT,
    year INTEGER,
    draft_customs BOOLEAN DEFAULT FALSE,
    advance_doc BOOLEAN DEFAULT FALSE,
    do_released BOOLEAN DEFAULT FALSE,
    customs_filed BOOLEAN DEFAULT FALSE,
    cleared BOOLEAN DEFAULT FALSE,
    draft_date DATE,
    customs_date DATE,
    do_date DATE,
    clear_date DATE,
    advance_date DATE,
    remark TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    running_no INTEGER,
    version INTEGER DEFAULT 1,
    next_action TEXT,
    age_days INTEGER,
    flags JSONB,
    invoice_no TEXT,
    container_type TEXT,
    gross_weight NUMERIC(12,2),
    cbm NUMERIC(12,2),
    commodity TEXT,
    cs_name TEXT,
    data_source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_job_no ON public.jobs(job_no);
CREATE INDEX IF NOT EXISTS idx_jobs_service ON public.jobs(service);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_month ON public.jobs(month);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON public.jobs(customer);

CREATE TABLE IF NOT EXISTS public.job_history (
    id SERIAL PRIMARY KEY,
    job_no TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source_file TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_job_no ON public.job_history(job_no);

CREATE TABLE IF NOT EXISTS public.transport_trips (
    trip_no TEXT PRIMARY KEY,
    job_no TEXT,
    customer TEXT,
    driver TEXT,
    truck_type TEXT,
    deliver_date TEXT,
    status TEXT,
    pod TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date TEXT NOT NULL,
    total_jobs INTEGER NOT NULL,
    completed_jobs INTEGER NOT NULL,
    in_progress_jobs INTEGER NOT NULL,
    cancelled_jobs INTEGER NOT NULL,
    services_breakdown JSONB,
    monthly_breakdown JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
"""
    lines.append(schema_pg.strip())
    lines.append("")

    # 1. Export Jobs
    cursor.execute("SELECT * FROM jobs")
    job_rows = cursor.fetchall()
    print(f"[EXPORT] Preparing {len(job_rows)} jobs for PostgreSQL...")
    cols = [col[0] for col in cursor.description]
    cols_str = ", ".join(cols)

    for r in job_rows:
        val_list = []
        for c in cols:
            v = r[c]
            if c in ('draft_customs', 'advance_doc', 'do_released', 'customs_filed', 'cleared'):
                val_list.append('TRUE' if v else 'FALSE')
            elif c == 'flags':
                val_list.append(f"'{str(v or '[]')}'::jsonb")
            elif c in ('etd', 'eta', 'job_date', 'draft_date', 'customs_date', 'do_date', 'clear_date', 'advance_date'):
                clean_d = validate_pg_date(v, fallback_month=r['month'])
                val_list.append(escape_sql_val(clean_d))
            else:
                val_list.append(escape_sql_val(v))
        vals_str = ", ".join(val_list)
        lines.append(f"INSERT INTO public.jobs ({cols_str}) VALUES ({vals_str}) ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;")

    # 2. Export Transport Trips
    cursor.execute("SELECT * FROM transport_trips")
    t_rows = cursor.fetchall()
    print(f"[EXPORT] Preparing {len(t_rows)} transport trips for PostgreSQL...")
    if t_rows:
        t_cols = [col[0] for col in cursor.description]
        t_cols_str = ", ".join(t_cols)
        for r in t_rows:
            row_vals = []
            for c in t_cols:
                v = r[c]
                if c == 'deliver_date':
                    fb_mo = None
                    t_no = str(r['trip_no'] or '')
                    if len(t_no) >= 6 and t_no[4:6].isdigit():
                        fb_mo = f"20{t_no[2:4]}-{t_no[4:6]}"
                    v = validate_pg_date(v, fallback_month=fb_mo)
                row_vals.append(escape_sql_val(v))
            vals_str = ", ".join(row_vals)
            lines.append(f"INSERT INTO public.transport_trips ({t_cols_str}) VALUES ({vals_str}) ON CONFLICT (trip_no) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;")

    # 3. Export History
    cursor.execute("SELECT * FROM job_history")
    h_rows = cursor.fetchall()
    print(f"[EXPORT] Preparing {len(h_rows)} audit history logs for PostgreSQL...")
    for r in h_rows:
        lines.append(f"INSERT INTO public.job_history (job_no, field_name, old_value, new_value, source_file, changed_at) VALUES ({escape_sql_val(r['job_no'])}, {escape_sql_val(r['field_name'])}, {escape_sql_val(r['old_value'])}, {escape_sql_val(r['new_value'])}, {escape_sql_val(r['source_file'])}, {escape_sql_val(r['changed_at'])});")

    # 4. Export Snapshots
    cursor.execute("SELECT * FROM snapshots")
    s_rows = cursor.fetchall()
    print(f"[EXPORT] Preparing {len(s_rows)} snapshots for PostgreSQL...")
    for r in s_rows:
        sb = f"'{r['services_breakdown']}'::jsonb" if r['services_breakdown'] else "NULL"
        mb = f"'{r['monthly_breakdown']}'::jsonb" if r['monthly_breakdown'] else "NULL"
        lines.append(f"INSERT INTO public.snapshots (snapshot_date, total_jobs, completed_jobs, in_progress_jobs, cancelled_jobs, services_breakdown, monthly_breakdown, created_at) VALUES ({escape_sql_val(r['snapshot_date'])}, {r['total_jobs']}, {r['completed_jobs']}, {r['in_progress_jobs']}, {r['cancelled_jobs']}, {sb}, {mb}, {escape_sql_val(r['created_at'])});")

    lines.append("")
    lines.append("COMMIT;")

    os.makedirs(os.path.dirname(OUTPUT_SQL), exist_ok=True)
    with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))

    file_size_mb = os.path.getsize(OUTPUT_SQL) / (1024 * 1024)
    print(f"[SUCCESS] Exported PostgreSQL migration file to: {OUTPUT_SQL} ({file_size_mb:.2f} MB)")
    return OUTPUT_SQL


def apply_to_postgres(host='localhost', port=5432, user='postgres', db='perkin_logistics'):
    if not os.path.exists(OUTPUT_SQL):
        generate_postgres_sql()

    psql_bin = PSQL_PATH if os.path.exists(PSQL_PATH) else 'psql'
    print(f"[POSTGRES] Executing migration via {psql_bin} on {host}:{port}/{db}...")
    cmd = [psql_bin, '-h', str(host), '-p', str(port), '-U', str(user), '-d', str(db), '-f', OUTPUT_SQL]
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print("[POSTGRES] Migration completed successfully!")
    else:
        print(f"[POSTGRES] Failed with exit code {res.returncode}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Migrate SQLite to PostgreSQL")
    parser.add_argument('--apply', action='store_true', help="Execute migration against PostgreSQL directly")
    parser.add_argument('--host', default='localhost')
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--user', default='postgres')
    parser.add_argument('--db', default='perkin_logistics')
    args = parser.parse_args()

    sql_file = generate_postgres_sql()
    if args.apply:
        apply_to_postgres(args.host, args.port, args.user, args.db)
    else:
        print("\nTo apply to PostgreSQL when ready:")
        print(f'  1. Run command: python backend/scripts/migrate_to_postgres.py --apply --db <your_db>')
        print(f'  2. Or run via psql: "{PSQL_PATH}" -U postgres -d <your_db> -f "{sql_file}"')
