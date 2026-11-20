import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import {
  getJobs,
  getTransport,
  getQuality,
  getQualityAlerts,
  getSnapshots,
  ADVANCE_ROWS,
} from "@/lib/data-store";
import { fetchJobsFromPostgres, fetchTransportFromPostgres } from "@/lib/db";
import { resolveScript } from "@/lib/upload-sync-helpers";

const execFileAsync = promisify(execFile);
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const pythonExe = process.env.PYTHON_PATH || "python";

    // 1. Pull fresh data from PostgreSQL if on a system with Python & scripts
    const pgSyncScript = resolveScript("sync_from_postgres.py");
    if (
      fs.existsSync(pgSyncScript) &&
      (process.env.PGPASSWORD || process.env.DATABASE_URL)
    ) {
      try {
        await execFileAsync(pythonExe, [pgSyncScript]);
        console.log("[SYNC] Pulled latest data via Python script.");
      } catch (pgErr) {
        console.warn("Python Postgres sync warning:", pgErr);
      }
    }

    // 2. Fetch directly from Postgres (works seamlessly on Vercel Node.js runtime)
    const pgJobs = await fetchJobsFromPostgres();
    const pgTransport = await fetchTransportFromPostgres();

    const jobs = pgJobs && pgJobs.length > 0 ? pgJobs : getJobs();
    const transport =
      pgTransport && pgTransport.length > 0 ? pgTransport : getTransport();

    return NextResponse.json(
      {
        ok: true,
        source: "Local Master Database",
        totalJobs: jobs.length,
        totalTransport: transport.length,
        jobs,
        transport,
        quality: getQuality(),
        qualityAlerts: getQualityAlerts(),
        snapshots: getSnapshots(),
        advances: ADVANCE_ROWS,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: any) {
    console.error("Live SharePoint sync failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Sync failed",
        jobs: getJobs(),
        transport: getTransport(),
        quality: getQuality(),
        advances: ADVANCE_ROWS,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }
}

export async function GET() {
  return POST();
}
