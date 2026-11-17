"""
=============================================================================
PERKIN LOGISTICS — PULL FROM POSTGRESQL TO DASHBOARD
=============================================================================
Pulls fresh jobs and transport records directly from PostgreSQL database (Test001)
and updates dashboard/data/jobs.json and dashboard/data/transport.json.
Uses C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe with zero extra dependencies.
=============================================================================
"""
import os
import sys
import json
import subprocess

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(LOCAL_DIR, 'data')
ENV_PATH = os.path.join(LOCAL_DIR, '.env')
if not os.path.exists(ENV_PATH):
    ENV_PATH = os.path.join(os.path.dirname(LOCAL_DIR), 'dashboard', '.env')
PSQL_PATH = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"


def load_env():
    env_vars = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars


def query_postgres_json(query, host='localhost', port=5432, user='postgres', db='Test001', password=None):
    psql_bin = PSQL_PATH if os.path.exists(PSQL_PATH) else 'psql'
    cmd = [
        psql_bin,
        '-h', str(host),
        '-p', str(port),
        '-U', str(user),
        '-d', str(db),
        '-w',
        '-t', '-A',
        '-c', query
    ]
    env = os.environ.copy()
    if password:
        env['PGPASSWORD'] = password

    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', env=env)
    if res.returncode != 0:
        raise RuntimeError(f"psql error: {res.stderr.strip()}")
    
    out = res.stdout.strip()
    if not out or out == 'null':
        return []
    return json.loads(out)


def pull_from_postgres():
    env_vars = load_env()
    
    # Parse DATABASE_URL if present, else use individual vars
    db_url = env_vars.get('DATABASE_URL') or env_vars.get('DATABASE_URL_WEB') or ''
    host = env_vars.get('PGHOST', 'localhost')
    port = int(env_vars.get('PGPORT', 5432))
    user = env_vars.get('PGUSER', 'postgres')
    db = env_vars.get('PGDATABASE', 'Test001')
    password = env_vars.get('PGPASSWORD')

    if db_url and '://' in db_url:
        import urllib.parse
        parsed = urllib.parse.urlparse(db_url)
        user = parsed.username or user
        password = parsed.password or password
        host = parsed.hostname or host
        port = parsed.port or port
        db = parsed.path.lstrip('/') or db

    print(f"[POSTGRES PULL] Connecting to {host}:{port}/{db} as {user}...")

    # 1. Pull Jobs
    jobs_query = """
    SELECT json_agg(row_to_json(j)) FROM (
        SELECT
            id,
            job_no AS "jobNo",
            service,
            service_label AS "serviceLabel",
            status,
            status_detail AS "statusDetail",
            status_raw AS "statusRaw",
            customer,
            consignee,
            bl,
            mbl,
            hbl,
            join_no AS "joinNo",
            update_status AS "updateStatus",
            TO_CHAR(etd, 'YYYY-MM-DD') AS etd,
            TO_CHAR(eta, 'YYYY-MM-DD') AS eta,
            TO_CHAR(job_date, 'YYYY-MM-DD') AS "jobDate",
            month,
            year,
            draft_customs AS "draftCustoms",
            advance_doc AS "advanceDoc",
            do_released AS "doReleased",
            customs_filed AS "customsFiled",
            cleared,
            TO_CHAR(draft_date, 'YYYY-MM-DD') AS "draftDate",
            TO_CHAR(customs_date, 'YYYY-MM-DD') AS "customsDate",
            TO_CHAR(do_date, 'YYYY-MM-DD') AS "doDate",
            TO_CHAR(clear_date, 'YYYY-MM-DD') AS "clearDate",
            TO_CHAR(advance_date, 'YYYY-MM-DD') AS "advanceDate",
            remark,
            source_sheet AS "sourceSheet",
            source_row AS "sourceRow",
            running_no AS "runningNo",
            version,
            next_action AS "nextAction",
            age_days AS "ageDays",
            flags,
            invoice_no AS "invoiceNo",
            container_type AS "containerType",
            gross_weight AS "grossWeight",
            cbm,
            commodity,
            cs_name AS "csName",
            data_source AS "dataSource"
        FROM public.jobs
        ORDER BY id
    ) j;
    """
    jobs = query_postgres_json(jobs_query, host, port, user, db, password)
    print(f"[POSTGRES PULL] Retrieved {len(jobs)} jobs from public.jobs")

    # 2. Pull Transport
    transport_query = """
    SELECT json_agg(row_to_json(t)) FROM (
        SELECT
            trip_no AS "tripNo",
            trip_no AS "transportNo",
            job_no AS "jobNo",
            customer,
            driver,
            truck_type AS "truckType",
            truck_type AS "container",
            deliver_date AS "deliver",
            deliver_date AS "deliverDate",
            status,
            pod
        FROM public.transport_trips
        ORDER BY trip_no
    ) t;
    """
    transport = query_postgres_json(transport_query, host, port, user, db, password)
    print(f"[POSTGRES PULL] Retrieved {len(transport)} trips from public.transport_trips")

    if jobs:
        jobs_file = os.path.join(DATA_DIR, 'jobs.json')
        with open(jobs_file, 'w', encoding='utf-8') as f:
            json.dump(jobs, f, ensure_ascii=False, indent=2)
        print(f"[POSTGRES PULL] Written {len(jobs)} jobs to {jobs_file}")

    if transport:
        trans_file = os.path.join(DATA_DIR, 'transport.json')
        with open(trans_file, 'w', encoding='utf-8') as f:
            json.dump(transport, f, ensure_ascii=False, indent=2)
        print(f"[POSTGRES PULL] Written {len(transport)} trips to {trans_file}")

    return len(jobs), len(transport)


if __name__ == '__main__':
    try:
        j_cnt, t_cnt = pull_from_postgres()
        print(f"[SUCCESS] Dashboard synced from PostgreSQL: {j_cnt} jobs, {t_cnt} trips")
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
