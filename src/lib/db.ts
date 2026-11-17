import { Pool } from "pg";
import { JobRecord, TransportRecord } from "@/types/dashboard";

let pool: Pool | null = null;

export function getDbPool(): Pool | null {
  const connStr = process.env.DATABASE_URL || process.env.DATABASE_URL_WEB;
  if (!connStr) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function fetchJobsFromPostgres(): Promise<JobRecord[] | null> {
  const p = getDbPool();
  if (!p) return null;
  try {
    const res = await p.query(`
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
        to_char(etd, 'YYYY-MM-DD') AS etd,
        to_char(eta, 'YYYY-MM-DD') AS eta,
        to_char(job_date, 'YYYY-MM-DD') AS "jobDate",
        month,
        year,
        draft_customs AS "draftCustoms",
        advance_doc AS "advanceDoc",
        do_released AS "doReleased",
        customs_filed AS "customsFiled",
        cleared,
        to_char(draft_date, 'YYYY-MM-DD') AS "draftDate",
        to_char(customs_date, 'YYYY-MM-DD') AS "customsDate",
        to_char(do_date, 'YYYY-MM-DD') AS "doDate",
        to_char(clear_date, 'YYYY-MM-DD') AS "clearDate",
        to_char(advance_date, 'YYYY-MM-DD') AS "advanceDate",
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
      ORDER BY id ASC;
    `);
    return res.rows.map((row) => ({
      ...row,
      grossWeight: row.grossWeight ? Number(row.grossWeight) : 0,
      cbm: row.cbm ? Number(row.cbm) : 0,
      flags: Array.isArray(row.flags) ? row.flags : [],
    })) as JobRecord[];
  } catch (err) {
    console.warn("[DB] Failed to fetch jobs from PostgreSQL:", err);
    return null;
  }
}

export async function fetchTransportFromPostgres(): Promise<TransportRecord[] | null> {
  const p = getDbPool();
  if (!p) return null;
  try {
    const res = await p.query(`
      SELECT 
        trip_no AS "tripNo",
        to_char(date, 'YYYY-MM-DD') AS date,
        month,
        year,
        job_no AS "jobNo",
        service,
        carrier,
        truck_type AS "truckType",
        plate_no AS "plateNo",
        driver,
        driver_phone AS "driverPhone",
        from_loc AS "from",
        to_loc AS "to",
        status,
        cost,
        billing,
        remark
      FROM public.transport_trips
      ORDER BY trip_no ASC;
    `);
    return res.rows.map((row) => ({
      ...row,
      cost: row.cost ? Number(row.cost) : 0,
      billing: row.billing ? Number(row.billing) : 0,
    })) as TransportRecord[];
  } catch (err) {
    console.warn("[DB] Failed to fetch transport from PostgreSQL:", err);
    return null;
  }
}

export async function updateJobInPostgres(
  jobNo: string,
  patch: Partial<JobRecord>
): Promise<boolean> {
  const p = getDbPool();
  if (!p) return false;

  const fieldMap: Record<string, string> = {
    updateStatus: "update_status",
    status: "status",
    statusDetail: "status_detail",
    statusRaw: "status_raw",
    remark: "remark",
    version: "version",
    etd: "etd",
    eta: "eta",
    draftDate: "draft_date",
    customsDate: "customs_date",
    doDate: "do_date",
    clearDate: "clear_date",
    advanceDate: "advance_date",
    customer: "customer",
    bl: "bl",
    consignee: "consignee",
  };

  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(patch)) {
    if (key in fieldMap) {
      setClauses.push(`${fieldMap[key]} = $${paramIdx++}`);
      values.push(val === "" ? null : val);
    }
  }

  if (setClauses.length === 0) return false;
  setClauses.push("updated_at = CURRENT_TIMESTAMP");
  values.push(jobNo);

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.jobs SET ${setClauses.join(", ")} WHERE job_no = $${paramIdx}`,
      values
    );

    // Audit logs
    for (const [key, val] of Object.entries(patch)) {
      if (key in fieldMap && key !== "version") {
        await client.query(
          `INSERT INTO public.job_history (job_no, field_name, new_value, source_file, changed_at)
           VALUES ($1, $2, $3, 'web_edit', CURRENT_TIMESTAMP)`,
          [jobNo, key, String(val ?? "")]
        );
      }
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DB] updateJobInPostgres error:", err);
    return false;
  } finally {
    client.release();
  }
}
