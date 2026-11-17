import sqlite3
import json
import sys
import os
import datetime

def main():
    if len(sys.argv) < 3:
        sys.exit(0)

    job_no = sys.argv[1].strip()
    try:
        patch = json.loads(sys.argv[2])
    except Exception:
        sys.exit(0)

    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'dashboard', 'data', 'perkin_logistics.db'))
    if not os.path.exists(db_path):
        sys.exit(0)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    field_map = {
        'updateStatus': 'update_status',
        'status': 'status',
        'statusDetail': 'status_detail',
        'statusRaw': 'status_raw',
        'remark': 'remark',
        'version': 'version',
        'etd': 'etd',
        'eta': 'eta',
        'draftDate': 'draft_date',
        'customsDate': 'customs_date',
        'doDate': 'do_date',
        'clearDate': 'clear_date',
        'advanceDate': 'advance_date',
    }

    updates = []
    params = []
    for k, v in patch.items():
        if k in field_map:
            updates.append(f"{field_map[k]} = ?")
            params.append(v)

    if updates:
        updates.append("updated_at = ?")
        now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        params.append(now_str)
        params.append(job_no)
        sql = f"UPDATE jobs SET {', '.join(updates)} WHERE job_no = ?"
        cursor.execute(sql, params)

        # Audit log in job_history table
        try:
            cursor.execute("SELECT id FROM jobs WHERE job_no = ?", (job_no,))
            row = cursor.fetchone()
            if row:
                job_id = row[0]
                if 'updateStatus' in patch:
                    cursor.execute(
                        "INSERT INTO job_history (job_id, job_no, field_name, old_value, new_value, changed_by, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (job_id, job_no, 'updateStatus', '', str(patch.get('updateStatus', '')), 'web_user', 'web_edit')
                    )
        except Exception:
            pass

        conn.commit()

    conn.close()

if __name__ == '__main__':
    main()
