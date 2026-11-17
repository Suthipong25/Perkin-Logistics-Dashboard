"""
=============================================================================
PERKIN LOGISTICS — SQLITE DATABASE ENGINE & HISTORY TRACKER
=============================================================================
Manages local SQLite database (dashboard/data/perkin_logistics.db):
1. Ingests and synchronizes all jobs from Excel/JSON.
2. Tracks historical changes in `job_history` (audit trail).
3. Records volume snapshots over time in `snapshots`.
4. Provides 1-click migration to PostgreSQL.
=============================================================================
"""
import sqlite3
import json
import os
import sys
import datetime

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if not os.path.exists(os.path.join(BASE_DIR, 'package.json')):
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.path.join(BASE_DIR, 'data', 'perkin_logistics.db')
if not os.path.exists(os.path.dirname(DB_PATH)):
    DB_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'perkin_logistics.db')

SCHEMA_PATH = os.path.join(BASE_DIR, 'sql', 'schema_sqlite.sql')
if not os.path.exists(SCHEMA_PATH):
    SCHEMA_PATH = os.path.join(BASE_DIR, 'backend', 'sql', 'schema_sqlite.sql')

JOBS_JSON = os.path.join(BASE_DIR, 'data', 'jobs.json')
if not os.path.exists(JOBS_JSON):
    JOBS_JSON = os.path.join(BASE_DIR, 'dashboard', 'data', 'jobs.json')

TRANSPORT_JSON = os.path.join(BASE_DIR, 'data', 'transport.json')
if not os.path.exists(TRANSPORT_JSON):
    TRANSPORT_JSON = os.path.join(BASE_DIR, 'dashboard', 'data', 'transport.json')


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
    cursor.executescript(schema_sql)
    conn.commit()
    conn.close()
    print(f"[DB] Initialized schema in {DB_PATH}")


def sync_jobs(source_file="2026 Booking Report.xlsx"):
    if not os.path.exists(JOBS_JSON):
        print(f"[DB] Warning: {JOBS_JSON} does not exist.")
        return 0, 0

    with open(JOBS_JSON, 'r', encoding='utf-8') as f:
        jobs = json.load(f)

    conn = get_connection()
    cursor = conn.cursor()

    # Load existing jobs for comparison
    cursor.execute("SELECT id, job_no, status, status_detail, etd, eta, customer, bl, cleared, do_released FROM jobs")
    existing = {row['id']: dict(row) for row in cursor.fetchall()}

    inserted = 0
    updated = 0
    history_entries = 0
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for j in jobs:
        jid = j.get('id') or f"{j.get('month', '')}_{j.get('runningNo', '')}_{j.get('jobNo', '')}"
        old = existing.get(jid)

        flags_json = json.dumps(j.get('flags', []), ensure_ascii=False)
        gross_w = float(j.get('grossWeight') or 0.0) if j.get('grossWeight') is not None else 0.0
        cbm_val = float(j.get('cbm') or 0.0) if j.get('cbm') is not None else 0.0

        if old:
            # Check for changes in tracked fields
            tracked = [
                ('status', old.get('status'), j.get('status')),
                ('status_detail', old.get('status_detail'), j.get('statusDetail')),
                ('etd', old.get('etd'), j.get('etd')),
                ('eta', old.get('eta'), j.get('eta')),
                ('customer', old.get('customer'), j.get('customer')),
                ('bl', old.get('bl'), j.get('bl')),
                ('cleared', bool(old.get('cleared')), bool(j.get('cleared'))),
                ('do_released', bool(old.get('do_released')), bool(j.get('doReleased')))
            ]
            for f_name, old_v, new_v in tracked:
                if str(old_v or '') != str(new_v or ''):
                    cursor.execute("""
                        INSERT INTO job_history (job_no, field_name, old_value, new_value, source_file, changed_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (j.get('jobNo', ''), f_name, str(old_v or ''), str(new_v or ''), source_file, now_str))
                    history_entries += 1

            cursor.execute("""
                UPDATE jobs SET
                    service = ?, service_label = ?, status = ?, status_detail = ?, status_raw = ?,
                    customer = ?, consignee = ?, bl = ?, mbl = ?, hbl = ?, join_no = ?,
                    update_status = ?, etd = ?, eta = ?, job_date = ?, month = ?, year = ?,
                    draft_customs = ?, advance_doc = ?, do_released = ?, customs_filed = ?, cleared = ?,
                    draft_date = ?, customs_date = ?, do_date = ?, clear_date = ?, advance_date = ?,
                    remark = ?, source_sheet = ?, source_row = ?, running_no = ?, version = version + 1,
                    next_action = ?, age_days = ?, flags = ?, invoice_no = ?, container_type = ?,
                    gross_weight = ?, cbm = ?, commodity = ?, cs_name = ?, data_source = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                j.get('service', ''), j.get('serviceLabel', ''), j.get('status', ''), j.get('statusDetail', ''), j.get('statusRaw', ''),
                j.get('customer', ''), j.get('consignee', ''), j.get('bl', ''), j.get('mbl', ''), j.get('hbl', ''), j.get('joinNo', ''),
                j.get('updateStatus', ''), j.get('etd'), j.get('eta'), j.get('jobDate'), j.get('month', ''), j.get('year', 2026),
                1 if j.get('draftCustoms') else 0, 1 if j.get('advanceDoc') else 0, 1 if j.get('doReleased') else 0,
                1 if j.get('customsFiled') else 0, 1 if j.get('cleared') else 0,
                j.get('draftDate'), j.get('customsDate'), j.get('doDate'), j.get('clearDate'), j.get('advanceDate'),
                j.get('remark'), j.get('sourceSheet', ''), j.get('sourceRow'), j.get('runningNo'),
                j.get('nextAction'), j.get('ageDays'), flags_json, j.get('invoiceNo', ''), j.get('containerType', ''),
                gross_w, cbm_val, j.get('commodity', ''), j.get('csName', ''), j.get('dataSource', source_file),
                now_str, jid
            ))
            updated += 1
        else:
            cursor.execute("""
                INSERT INTO jobs (
                    id, job_no, service, service_label, status, status_detail, status_raw,
                    customer, consignee, bl, mbl, hbl, join_no, update_status, etd, eta,
                    job_date, month, year, draft_customs, advance_doc, do_released, customs_filed,
                    cleared, draft_date, customs_date, do_date, clear_date, advance_date,
                    remark, source_sheet, source_row, running_no, version, next_action, age_days,
                    flags, invoice_no, container_type, gross_weight, cbm, commodity, cs_name,
                    data_source, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            """, (
                jid, j.get('jobNo', ''), j.get('service', ''), j.get('serviceLabel', ''), j.get('status', ''), j.get('statusDetail', ''), j.get('statusRaw', ''),
                j.get('customer', ''), j.get('consignee', ''), j.get('bl', ''), j.get('mbl', ''), j.get('hbl', ''), j.get('joinNo', ''),
                j.get('updateStatus', ''), j.get('etd'), j.get('eta'), j.get('jobDate'), j.get('month', ''), j.get('year', 2026),
                1 if j.get('draftCustoms') else 0, 1 if j.get('advanceDoc') else 0, 1 if j.get('doReleased') else 0,
                1 if j.get('customsFiled') else 0, 1 if j.get('cleared') else 0,
                j.get('draftDate'), j.get('customsDate'), j.get('doDate'), j.get('clearDate'), j.get('advanceDate'),
                j.get('remark'), j.get('sourceSheet', ''), j.get('sourceRow'), j.get('runningNo'), 1,
                j.get('nextAction'), j.get('ageDays'), flags_json, j.get('invoiceNo', ''), j.get('containerType', ''),
                gross_w, cbm_val, j.get('commodity', ''), j.get('csName', ''), j.get('dataSource', source_file),
                now_str, now_str
            ))
            inserted += 1

    # Delete obsolete records that no longer exist in master jobs.json
    current_ids = set(j.get('id') or f"{j.get('month', '')}_{j.get('runningNo', '')}_{j.get('jobNo', '')}" for j in jobs)
    cursor.execute("SELECT id FROM jobs")
    all_db_ids = set(r[0] for r in cursor.fetchall())
    obsolete_ids = all_db_ids - current_ids
    if obsolete_ids:
        cursor.executemany("DELETE FROM jobs WHERE id = ?", [(oid,) for oid in obsolete_ids])
        print(f"[DB] Cleaned up {len(obsolete_ids)} obsolete job records.")

    # Record daily snapshot
    today_str = datetime.date.today().isoformat()
    cursor.execute("SELECT status, count(*) FROM jobs GROUP BY status")
    status_counts = dict(cursor.fetchall())
    cursor.execute("SELECT service, count(*) FROM jobs GROUP BY service")
    service_counts = dict(cursor.fetchall())
    cursor.execute("SELECT month, count(*) FROM jobs GROUP BY month")
    month_counts = dict(cursor.fetchall())

    tot = sum(status_counts.values())
    comp = status_counts.get('Completed', 0)
    inp = status_counts.get('In Progress', 0)
    canc = status_counts.get('Cancelled', 0)

    cursor.execute("""
        INSERT INTO snapshots (snapshot_date, total_jobs, completed_jobs, in_progress_jobs, cancelled_jobs, services_breakdown, monthly_breakdown, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (today_str, tot, comp, inp, canc, json.dumps(service_counts, ensure_ascii=False), json.dumps(month_counts, ensure_ascii=False), now_str))

    conn.commit()
    conn.close()
    print(f"[DB] Synced Jobs: {inserted} inserted, {updated} updated, {history_entries} change logs created.")
    return inserted, updated


def sync_transport():
    if not os.path.exists(TRANSPORT_JSON):
        return 0

    with open(TRANSPORT_JSON, 'r', encoding='utf-8') as f:
        trips = json.load(f)

    conn = get_connection()
    cursor = conn.cursor()
    count = 0
    now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for t in trips:
        trip_no = t.get('tripNo', '')
        if not trip_no:
            continue
        cursor.execute("""
            INSERT INTO transport_trips (trip_no, job_no, customer, driver, truck_type, deliver_date, status, pod, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(trip_no) DO UPDATE SET
                job_no = excluded.job_no,
                customer = excluded.customer,
                driver = excluded.driver,
                truck_type = excluded.truck_type,
                deliver_date = excluded.deliver_date,
                status = excluded.status,
                pod = excluded.pod,
                updated_at = excluded.updated_at
        """, (
            trip_no, t.get('jobNo', ''), t.get('customer', ''), t.get('driver', ''),
            t.get('truckType', ''), t.get('deliverDate') or t.get('deliver', ''),
            t.get('status', ''), t.get('pod', ''), now_str
        ))
        count += 1

    conn.commit()
    conn.close()
    print(f"[DB] Synced Transport: {count} trips recorded.")
    return count


def get_db_stats():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM jobs")
    job_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM transport_trips")
    transport_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM job_history")
    history_count = cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM snapshots")
    snapshot_count = cursor.fetchone()[0]
    conn.close()
    return {
        "jobs": job_count,
        "transport": transport_count,
        "history": history_count,
        "snapshots": snapshot_count
    }


if __name__ == '__main__':
    init_db()
    sync_jobs()
    sync_transport()
    stats = get_db_stats()
    print(f"[DB READY] Status: {stats}")
