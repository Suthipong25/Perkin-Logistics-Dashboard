import { Pool, PoolClient } from "pg";
import { JobRecord, TransportRecord } from "@/types/dashboard";

let pool: Pool | null = null;
let localPool: Pool | null = null;

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

export function getLocalDbPool(): Pool | null {
  if (process.env.VERCEL) return null;
  const connStr = process.env.DATABASE_URL_LOCAL;
  if (!connStr) return null;
  if (!localPool) {
    localPool = new Pool({
      connectionString: connStr,
      connectionTimeoutMillis: 2500,
      idleTimeoutMillis: 30000,
      max: 5,
    });
  }
  return localPool;
}

function sanitizeDate(d: any): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s || s === "null" || s === "undefined") return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (y >= 1990 && y <= 2050 && mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

function sanitizeNum(n: any): number | null {
  if (n === null || n === undefined || n === "") return null;
  const num = Number(n);
  return isNaN(num) ? null : num;
}

const JOB_SELECT_SQL = `
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
    declaration_no AS "declarationNo",
    container_type AS "containerType",
    gross_weight AS "grossWeight",
    cbm,
    commodity,
    cs_name AS "csName",
    data_source AS "dataSource"
  FROM public.jobs
`;

function mapPostgresJobRow(row: any): JobRecord {
  return {
    ...row,
    customsStatus: ["0109", "0209", "0309", "0409"].includes(String(row.updateStatus || ""))
      ? String(row.updateStatus)
      : row.cleared || row.status === "Completed"
      ? "0409"
      : row.customsFiled || Boolean(row.declarationNo)
      ? "0309"
      : undefined,
    grossWeight: row.grossWeight ? Number(row.grossWeight) : 0,
    cbm: row.cbm ? Number(row.cbm) : 0,
    flags: Array.isArray(row.flags) ? row.flags : [],
  } as JobRecord;
}

export async function fetchJobsFromPostgres(): Promise<JobRecord[] | null> {
  const p = getDbPool();
  if (!p) return null;
  try {
    const res = await p.query(`${JOB_SELECT_SQL} ORDER BY id ASC;`);
    return res.rows.map(mapPostgresJobRow);
  } catch (err) {
    console.warn("[DB] Failed to fetch jobs from PostgreSQL:", err);
    return null;
  }
}

export async function fetchJobByNoFromPostgres(jobNo: string): Promise<JobRecord | null> {
  const p = getDbPool();
  if (!p) return null;
  try {
    const res = await p.query(`${JOB_SELECT_SQL} WHERE job_no = $1 LIMIT 1;`, [jobNo]);
    return res.rows[0] ? mapPostgresJobRow(res.rows[0]) : null;
  } catch (err) {
    console.warn("[DB] Failed to fetch single job from PostgreSQL:", err);
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
        trip_no AS "transportNo",
        job_no AS "jobNo",
        customer,
        driver,
        COALESCE(driver_name, driver) AS "driverName",
        transporter,
        plate_no AS "plateNo",
        truck_type AS "truckType",
        truck_type AS "container",
        pickup_location AS "pickupLocation",
        pickup_date AS "pickupDate",
        delivery_location AS "deliveryLocation",
        deliver_date AS "deliverDate",
        deliver_date AS "deliver",
        return_depot AS "returnDepot",
        status,
        pod
      FROM public.transport_trips
      ORDER BY trip_no ASC;
    `);
    return res.rows as TransportRecord[];
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

  const applyUpdate = async (poolInstance: Pool) => {
    const client = await poolInstance.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE public.jobs SET ${setClauses.join(", ")} WHERE job_no = $${paramIdx}`,
        values
      );

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
      console.error("[DB] update error:", err);
      return false;
    } finally {
      client.release();
    }
  };

  const successCloud = await applyUpdate(p);

  // Best effort sync to local LAN PostgreSQL if reachable
  const localP = getLocalDbPool();
  if (localP) {
    applyUpdate(localP).catch(() => {});
  }

  return successCloud;
}

const JOB_COLS = [
  "id", "job_no", "service", "service_label", "status", "status_detail", "status_raw",
  "customer", "consignee", "bl", "mbl", "hbl", "join_no", "update_status",
  "etd", "eta", "job_date", "month", "year",
  "draft_customs", "advance_doc", "do_released", "customs_filed", "cleared",
  "draft_date", "customs_date", "do_date", "clear_date", "advance_date",
  "remark", "source_sheet", "source_row", "running_no", "version",
  "next_action", "age_days", "flags", "invoice_no", "declaration_no", "container_type",
  "gross_weight", "cbm", "commodity", "cs_name", "data_source"
];

async function executeJobsUpsertOnPool(poolInstance: Pool, jobs: JobRecord[], chunkSize = 100): Promise<number> {
  // Deduplicate by primary key `id` to prevent PostgreSQL "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const dedupedMap = new Map<string, JobRecord>();
  jobs.forEach((j, idx) => {
    const rowId = j.id || `${j.month || "M"}_${j.sourceRow || (idx + 1)}_${j.jobNo || "UNKNOWN"}`;
    dedupedMap.set(rowId, { ...j, id: rowId });
  });
  const uniqueJobs = Array.from(dedupedMap.values());

  const client: PoolClient = await poolInstance.connect();
  let totalProcessed = 0;

  try {
    await client.query("BEGIN");

    for (let i = 0; i < uniqueJobs.length; i += chunkSize) {
      const chunk = uniqueJobs.slice(i, i + chunkSize);
      const valueRows: string[] = [];
      const params: any[] = [];
      let pIdx = 1;

      for (const j of chunk) {
        const rowId = j.id;
        const rowPlaceholders: string[] = [];
        const rowVals = [
          rowId,
          j.jobNo || "UNKNOWN",
          j.service || "SEA Import",
          j.serviceLabel || j.service || "SEA Import",
          j.status || "In Progress",
          j.statusDetail || "",
          j.statusRaw || "",
          j.customer || "",
          j.consignee || "",
          j.bl || "",
          j.mbl || "",
          j.hbl || "",
          j.joinNo || "",
          j.updateStatus || j.customsStatus || "",
          sanitizeDate(j.etd),
          sanitizeDate(j.eta),
          sanitizeDate(j.jobDate),
          j.month || "",
          sanitizeNum(j.year),
          Boolean(j.draftCustoms),
          Boolean(j.advanceDoc),
          Boolean(j.doReleased),
          Boolean(j.customsFiled),
          Boolean(j.cleared),
          sanitizeDate(j.draftDate),
          sanitizeDate(j.customsDate),
          sanitizeDate(j.doDate),
          sanitizeDate(j.clearDate),
          sanitizeDate(j.advanceDate),
          j.remark || "",
          j.sourceSheet || "",
          sanitizeNum(j.sourceRow),
          sanitizeNum(j.runningNo),
          sanitizeNum(j.version) || 1,
          j.nextAction || "",
          sanitizeNum(j.ageDays),
          JSON.stringify(Array.isArray(j.flags) ? j.flags : []),
          j.invoiceNo || "",
          j.declarationNo || "",
          j.containerType || "",
          sanitizeNum(j.grossWeight),
          sanitizeNum(j.cbm),
          j.commodity || "",
          j.csName || "",
          j.dataSource || "upload"
        ];

        for (const val of rowVals) {
          rowPlaceholders.push(`$${pIdx++}`);
          params.push(val);
        }
        valueRows.push(`(${rowPlaceholders.join(", ")})`);
      }

      const updateSet = JOB_COLS
        .filter((c) => c !== "id")
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(", ") + ", updated_at = CURRENT_TIMESTAMP";

      const query = `
        INSERT INTO public.jobs (${JOB_COLS.join(", ")})
        VALUES ${valueRows.join(",\n")}
        ON CONFLICT (id) DO UPDATE SET
          ${updateSet};
      `;

      await client.query(query, params);
      totalProcessed += chunk.length;
    }

    await client.query("COMMIT");
    return totalProcessed;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertJobsToPostgres(
  jobs: JobRecord[]
): Promise<{ success: boolean; total: number; error?: string }> {
  if (!jobs || jobs.length === 0) return { success: true, total: 0 };
  const p = getDbPool();
  if (!p) return { success: false, total: 0, error: "No DATABASE_URL configured" };

  try {
    const total = await executeJobsUpsertOnPool(p, jobs);
    
    // Also sync to local LAN PostgreSQL if accessible
    const localP = getLocalDbPool();
    if (localP) {
      executeJobsUpsertOnPool(localP, jobs).catch((err) => {
        console.warn("[DB] Local LAN postgres jobs sync warning:", err?.message);
      });
    }

    return { success: true, total };
  } catch (err: any) {
    console.error("[DB] upsertJobsToPostgres error:", err);
    return { success: false, total: 0, error: err?.message || String(err) };
  }
}

const TRANSPORT_COLS = [
  "trip_no", "job_no", "customer", "driver", "truck_type", "deliver_date", "status", "pod",
  "driver_name", "transporter", "plate_no", "pickup_location", "pickup_date", "delivery_location", "return_depot"
];

async function executeTransportUpsertOnPool(poolInstance: Pool, trips: any[], chunkSize = 100): Promise<number> {
  // Deduplicate by primary key `trip_no` to prevent PostgreSQL "ON CONFLICT DO UPDATE command cannot affect row a second time"
  const dedupedTripsMap = new Map<string, any>();
  for (const t of trips) {
    const tripNo = (t.tripNo || t.transportNo || "").trim();
    if (tripNo) dedupedTripsMap.set(tripNo, t);
  }
  const uniqueTrips = Array.from(dedupedTripsMap.values());

  const client: PoolClient = await poolInstance.connect();
  let totalProcessed = 0;

  try {
    await client.query("BEGIN");

    for (let i = 0; i < uniqueTrips.length; i += chunkSize) {
      const chunk = uniqueTrips.slice(i, i + chunkSize);
      const valueRows: string[] = [];
      const params: any[] = [];
      let pIdx = 1;

      for (const t of chunk) {
        const tripNo = (t.tripNo || t.transportNo || "").trim();
        if (!tripNo) continue;

        const placeholders: string[] = [];
        const rowVals = [
          tripNo,
          t.jobNo || "",
          t.customer || "",
          t.driver || t.driverName || "",
          t.truckType || t.container || "",
          t.deliverDate || t.deliver || null,
          t.status || "",
          t.pod || "",
          t.driverName || t.driver || "",
          t.transporter || "",
          t.plateNo || "",
          t.pickupLocation || "",
          t.pickupDate || null,
          t.deliveryLocation || "",
          t.returnDepot || ""
        ];

        for (const v of rowVals) {
          placeholders.push(`$${pIdx++}`);
          params.push(v);
        }
        valueRows.push(`(${placeholders.join(", ")})`);
      }

      if (valueRows.length === 0) continue;

      const updateSet = TRANSPORT_COLS
        .filter((c) => c !== "trip_no")
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(", ") + ", updated_at = CURRENT_TIMESTAMP";

      const query = `
        INSERT INTO public.transport_trips (${TRANSPORT_COLS.join(", ")})
        VALUES ${valueRows.join(",\n")}
        ON CONFLICT (trip_no) DO UPDATE SET
          ${updateSet};
      `;

      await client.query(query, params);
      totalProcessed += valueRows.length;
    }

    await client.query("COMMIT");
    return totalProcessed;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertTransportToPostgres(
  trips: any[]
): Promise<{ success: boolean; total: number; error?: string }> {
  if (!trips || trips.length === 0) return { success: true, total: 0 };
  const p = getDbPool();
  if (!p) return { success: false, total: 0, error: "No DATABASE_URL configured" };

  try {
    const total = await executeTransportUpsertOnPool(p, trips);

    const localP = getLocalDbPool();
    if (localP) {
      executeTransportUpsertOnPool(localP, trips).catch((err) => {
        console.warn("[DB] Local LAN postgres transport sync warning:", err?.message);
      });
    }

    return { success: true, total };
  } catch (err: any) {
    console.error("[DB] upsertTransportToPostgres error:", err);
    return { success: false, total: 0, error: err?.message || String(err) };
  }
}
