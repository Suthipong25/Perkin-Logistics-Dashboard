import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
jobs_file = os.path.join(BASE_DIR, 'dashboard', 'data', 'jobs.json')
out_file = os.path.join(BASE_DIR, 'backend', 'sql', 'update_status_only.sql')

with open(jobs_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

jobs = data if isinstance(data, list) else data.get('jobs', [])
with_update = [j for j in jobs if j.get('updateStatus')]

lines = [
    "-- =============================================================================",
    "-- PERKIN LOGISTICS — UPDATE STATUS PATCH FOR POSTGRESQL (Test001)",
    "-- Updates 687 operational update status notes into public.jobs",
    "-- =============================================================================",
    "BEGIN;"
]

for j in with_update:
    jno = str(j['jobNo']).replace("'", "''")
    up = str(j['updateStatus']).replace("'", "''")
    lines.append(f"UPDATE public.jobs SET update_status = '{up}', updated_at = CURRENT_TIMESTAMP WHERE job_no = '{jno}';")

lines.append("COMMIT;")
lines.append("")

with open(out_file, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f"[SUCCESS] Written {len(with_update)} statements to {out_file}")
