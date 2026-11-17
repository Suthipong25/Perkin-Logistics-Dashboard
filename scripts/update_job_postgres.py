import json
import sys
import os
import subprocess

PSQL_PATH = r"C:\Program Files\PostgreSQL\18\bin\psql.exe"
LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(LOCAL_DIR, ".env")


def load_env():
    env_vars = {}
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars


def escape_str(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def main():
    if len(sys.argv) < 3:
        sys.exit(0)

    job_no = sys.argv[1].strip()
    try:
        patch = json.loads(sys.argv[2])
    except Exception:
        sys.exit(0)

    env_vars = load_env()
    db_url = env_vars.get("DATABASE_URL") or env_vars.get("DATABASE_URL_WEB") or ""
    host = env_vars.get("PGHOST", "aws-1-ap-northeast-1.pooler.supabase.com")
    port = env_vars.get("PGPORT", "5432")
    user = env_vars.get("PGUSER", "postgres.vdygytdzouvqwypbgqmd")
    db = env_vars.get("PGDATABASE", "postgres")
    password = env_vars.get("PGPASSWORD", "Perkin2Logistics")

    if db_url and "://" in db_url:
        import urllib.parse
        parsed = urllib.parse.urlparse(db_url)
        user = parsed.username or user
        password = parsed.password or password
        host = parsed.hostname or host
        port = parsed.port or port
        db = parsed.path.lstrip("/") or db

    field_map = {
        "updateStatus": "update_status",
        "status": "status",
        "statusDetail": "status_detail",
        "statusRaw": "status_raw",
        "remark": "remark",
        "version": "version",
        "etd": "etd",
        "eta": "eta",
        "draftDate": "draft_date",
        "customsDate": "customs_date",
        "doDate": "do_date",
        "clearDate": "clear_date",
        "advanceDate": "advance_date",
        "customer": "customer",
        "bl": "bl",
        "consignee": "consignee",
    }

    updates = []
    for k, v in patch.items():
        if k in field_map:
            col = field_map[k]
            if v is None or v == "":
                updates.append(f"{col} = NULL")
            elif col in ("version",):
                updates.append(f"{col} = {int(v)}")
            else:
                updates.append(f"{col} = {escape_str(v)}")

    if not updates:
        sys.exit(0)

    updates.append("updated_at = CURRENT_TIMESTAMP")
    sql_update = f"UPDATE public.jobs SET {', '.join(updates)} WHERE job_no = {escape_str(job_no)};"

    # Audit history insert
    history_inserts = []
    for k, v in patch.items():
        if k in field_map and k != "version":
            f_name = escape_str(k)
            n_val = escape_str(v)
            history_inserts.append(
                f"INSERT INTO public.job_history (job_no, field_name, new_value, source_file, changed_at) "
                f"VALUES ({escape_str(job_no)}, {f_name}, {n_val}, 'web_edit', CURRENT_TIMESTAMP);"
            )

    full_sql = "BEGIN;\n" + sql_update + "\n" + "\n".join(history_inserts) + "\nCOMMIT;"

    psql_bin = PSQL_PATH if os.path.exists(PSQL_PATH) else "psql"
    cmd = [
        psql_bin,
        "-h", host,
        "-p", str(port),
        "-U", user,
        "-d", db,
        "-w",
        "-c", full_sql
    ]

    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    try:
        subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=10)
    except Exception:
        pass


if __name__ == "__main__":
    main()
