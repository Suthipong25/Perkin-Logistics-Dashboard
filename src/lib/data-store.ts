import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import {
  JobRecord,
  QualityReport,
  TransportRecord,
  AdvanceRecord,
  QualityAlertsReport,
  SnapshotManifestEntry,
} from "@/types/dashboard";

const DATA_DIR = path.join(process.cwd(), "data");

// Bundled fallbacks for serverless environments (e.g. Vercel) where filesystem pathing may differ
let bundledJobs: JobRecord[] | null = null;
let bundledTransport: TransportRecord[] | null = null;
let bundledQuality: QualityReport[] | any = null;
let bundledQualityAlerts: QualityAlertsReport | any = null;
let bundledSnapshots: SnapshotManifestEntry[] | null = null;

try {
  const mod = require("../../data/jobs.json");
  bundledJobs = Array.isArray(mod) ? mod : (mod.jobs || []);
} catch {}

try {
  const mod = require("../../data/transport.json");
  bundledTransport = Array.isArray(mod) ? mod : (mod.rows || mod.trips || mod.transport || []);
} catch {}

try {
  bundledQuality = require("../../data/quality.json");
} catch {}

try {
  bundledQualityAlerts = require("../../data/quality_alerts.json");
} catch {}

try {
  bundledSnapshots = require("../../backups/snapshots/manifest.json");
} catch {}

function getDataFilePath(filename: string): string {
  const candidates = [
    path.join(DATA_DIR, filename),
    path.join(process.cwd(), "data", filename),
    path.join(__dirname, "..", "..", "data", filename),
    path.join(__dirname, "..", "..", "..", "data", filename),
    path.resolve(process.cwd(), "data", filename),
    path.resolve("data", filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(DATA_DIR, filename);
}

// In-memory master cache for sub-millisecond responses
let memoryJobsCache: JobRecord[] | null = null;
let lastJobsMtime = 0;

// Async non-blocking save queue & debounce
let saveTimeout: NodeJS.Timeout | null = null;
let isSaving = false;
let pendingSave = false;

export function getJobs(): JobRecord[] {
  const filePath = getDataFilePath("jobs.json");
  try {
    const stats = fs.statSync(filePath);
    if (memoryJobsCache && stats.mtimeMs === lastJobsMtime) {
      return memoryJobsCache;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result: JobRecord[] = Array.isArray(parsed) ? parsed : (parsed.jobs || []);
    memoryJobsCache = result;
    lastJobsMtime = stats.mtimeMs;
    return result;
  } catch {
    return memoryJobsCache || bundledJobs || [];
  }
}

async function persistJobsAsync(): Promise<void> {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  try {
    const jobs = memoryJobsCache || getJobs();
    const payload = JSON.stringify({ jobs, generatedAt: new Date().toISOString(), count: jobs.length }, null, 1);
    const targetPath = path.join(DATA_DIR, "jobs.json");
    const tmpPath = path.join(DATA_DIR, `jobs.json.tmp.${Date.now()}`);

    // Atomic write via temp file
    await fs.promises.writeFile(tmpPath, payload, "utf-8");
    await fs.promises.rename(tmpPath, targetPath);

    // Refresh last mtime
    const stats = await fs.promises.stat(targetPath);
    lastJobsMtime = stats.mtimeMs;
  } catch (err) {
    console.error("[DATA STORE] Error saving jobs.json async:", err);
  } finally {
    isSaving = false;
    if (pendingSave) {
      pendingSave = false;
      persistJobsAsync();
    }
  }
}

function syncJobToSQLiteAsync(jobNo: string, patch: Partial<JobRecord>): void {
  try {
    const localScript = path.resolve(process.cwd(), "scripts/update_job_sqlite.py");
    const fallbackScript = path.resolve(process.cwd(), "../backend/scripts/update_job_sqlite.py");
    const scriptPath = fs.existsSync(localScript) ? localScript : fallbackScript;
    if (!fs.existsSync(scriptPath)) return;

    const pythonExe = process.env.PYTHON_PATH || "python";
    execFile(pythonExe, [scriptPath, jobNo, JSON.stringify(patch)], () => {});
  } catch {
    // Non-blocking fire-and-forget
  }
}

function syncJobToPostgresAsync(jobNo: string, patch: Partial<JobRecord>): void {
  try {
    const scriptPath = path.resolve(process.cwd(), "scripts/update_job_postgres.py");
    if (!fs.existsSync(scriptPath)) return;

    const pythonExe = process.env.PYTHON_PATH || "python";
    execFile(pythonExe, [scriptPath, jobNo, JSON.stringify(patch)], () => {});
  } catch {
    // Non-blocking fire-and-forget
  }
}

export function updateJobInMemory(jobNo: string, patch: Partial<JobRecord>): JobRecord | null {
  const jobs = getJobs();
  const idx = jobs.findIndex((j) => j.jobNo === jobNo);
  if (idx === -1) return null;

  // 1. Instant in-memory mutation (< 0.1ms)
  jobs[idx] = { ...jobs[idx], ...patch };
  memoryJobsCache = jobs;

  // 2. Async non-blocking debounced dump to jobs.json (100ms coalesce)
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    persistJobsAsync();
  }, 100);

  // 3. Background sync to SQLite master database & audit history
  syncJobToSQLiteAsync(jobNo, patch);

  // 4. Background sync to PostgreSQL database & audit history
  syncJobToPostgresAsync(jobNo, patch);

  return jobs[idx];
}

export function getTransport(): TransportRecord[] {
  const filePath = getDataFilePath("transport.json");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return parsed.rows || parsed.trips || parsed.transport || [];
  } catch {
    return bundledTransport || [];
  }
}

export function getQuality(): QualityReport {
  const filePath = getDataFilePath("quality.json");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return bundledQuality || {
      totalJobs: 0,
      byService: {},
      byStatus: {},
      byStatusDetail: {},
      statusRawVariants: [],
      missing: {},
      dateFailures: {},
      rejectedRows: 0,
      duplicateJobNumbers: {},
      transportRows: 0,
      containerBuckets: {},
    };
  }
}

export function getQualityAlerts(): QualityAlertsReport {
  const filePath = getDataFilePath("quality_alerts.json");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return bundledQualityAlerts || {
      summary: { totalAlerts: 0, dateSwapsCount: 0, crossSheetDupsCount: 0, unlinkedTransportCount: 0, hiddenSheetsCount: 0 },
      dateSwaps: [],
      crossSheetDuplicates: [],
      unlinkedTransport: [],
      hiddenSheets: [],
    };
  }
}

export function getSnapshots(): SnapshotManifestEntry[] {
  try {
    const candidates = [
      process.env.SNAPSHOTS_MANIFEST,
      path.join(process.cwd(), "backups", "snapshots", "manifest.json"),
      path.join(process.cwd(), "../backups/snapshots/manifest.json"),
      "C:/Users/User/Desktop/n8n/backups/snapshots/manifest.json",
    ].filter(Boolean) as string[];

    const manifestPath = candidates.find((p) => fs.existsSync(p));
    if (!manifestPath) return bundledSnapshots || [];
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return bundledSnapshots || [];
  }
}

export const ADVANCE_ROWS: AdvanceRecord[] = [
  { advNo: "AV26070112", jobNo: "SHSI26070062", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "กรมศุลกากร (พักรายได้)", branch: "HEAD OFFICE", advDate: "2026-07-14", amount: 18500, cleared: 0, clearNo: "—", shipping: "APIRAK", ageDays: 5, state: "overdue", note: "รอใบเสร็จตัวจริงจากท่าเรือ" },
  { advNo: "AV26070056", jobNo: "SHAI26070008", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "HEAD OFFICE", advDate: "2026-07-07", amount: 4200, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 9, state: "overdue", note: "ปิดบัญชี 16/7 รอตรวจ" },
  { advNo: "AV26070076", jobNo: "SHAI26070012", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "HEAD OFFICE", advDate: "2026-07-09", amount: 3500, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 7, state: "overdue", note: "รออนุมัติ Clearing" },
  { advNo: "AV26070130", jobNo: "SHAE26070001", customer: "CN LOGISTICS (THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-18", amount: 6800, cleared: 0, clearNo: "CL26070208", shipping: "ANUCHA", ageDays: 5, state: "overdue", note: "เกินกำหนด 5 วัน · แจ้งเตือน CS" },
  { advNo: "AV26070140", jobNo: "SHSI26070079", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "GDL INTERTRANSPORT CO.,LTD.", branch: "HEAD OFFICE", advDate: "2026-07-20", amount: 2000, cleared: 0, clearNo: "—", shipping: "APIRAK", ageDays: 1, state: "pending", note: "Paid Adv. Not Post Batch" },
  { advNo: "AV26070138", jobNo: "SHSI26070074", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "นายเอกพงศ์ ศรีทอง (หัวลาก)", branch: "HEAD OFFICE", advDate: "2026-07-20", amount: 3000, cleared: 0, clearNo: "—", shipping: "APIRAK", ageDays: 1, state: "pending", note: "เบิกเพื่อทำงานหน้าท่า" },
  { advNo: "AV26070162", jobNo: "SHAI26070040", customer: "CH.KARNCHANG PUBLIC COMPANY LIMITED", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-15", amount: 9400, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 4, state: "pending", note: "รอเอกสาร DO แนบชุดเบิก" },
  { advNo: "AV26070157", jobNo: "SHAI26070044", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-22", amount: 2800, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 2, state: "pending", note: "กำลังรวบรวมใบเสร็จ" },
  { advNo: "AV26070160", jobNo: "SHAI26070045", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-22", amount: 3100, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 2, state: "pending", note: "รอลูกค้ายืนยันค่าธรรมเนียม" },
  { advNo: "AV26070121", jobNo: "SHAI26070022", customer: "KAWASAKI TRADING (THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-14", amount: 5200, cleared: 0, clearNo: "—", shipping: "ANUCHA", ageDays: 2, state: "pending", note: "CS แก้เลข Job ในใบขนเป็น SHSI" },
  { advNo: "AV26070143", jobNo: "SHAI26070035", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-19", amount: 4500, cleared: 4500, clearNo: "CL26070205", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "เคลียร์ครบตามใบเสร็จ" },
  { advNo: "AV26070147", jobNo: "SHAI26070039", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-21", amount: 3800, cleared: 3800, clearNo: "CL26070202", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070158", jobNo: "SHAI26070041", customer: "Maxis products co.,ltd.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-15", amount: 6100, cleared: 6100, clearNo: "CL26070201", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070154", jobNo: "SHAI26070042", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-21", amount: 2950, cleared: 2950, clearNo: "CL26070204", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070155", jobNo: "SHAI26070043", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-21", amount: 3400, cleared: 3400, clearNo: "CL26070203", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชีแล้ว" },
  { advNo: "AV26070114", jobNo: "SHAI26070018", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-14", amount: 4900, cleared: 4900, clearNo: "CL26070198", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "เคลียร์ 15.07.69" },
  { advNo: "AV26070110", jobNo: "SHAI26070020", customer: "SAVE LOGISTICS(THAILAND) CO.,LTD.", payTo: "SHIPPING ANUCHA", branch: "SUVARNABHUMI", advDate: "2026-07-14", amount: 3250, cleared: 3250, clearNo: "CL26070195", shipping: "ANUCHA", ageDays: 0, state: "cleared", note: "ปิดชุดบัญชี 16.07.69" },
];
