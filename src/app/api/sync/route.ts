import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getJobs, getTransport, getQuality, getQualityAlerts, getSnapshots, ADVANCE_ROWS } from "@/lib/data-store";

const execFileAsync = promisify(execFile);
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const pythonExe =
      process.env.PYTHON_PATH ||
      "python";

    // 1. Pull fresh data from PostgreSQL if configured
    const localPgSync = path.resolve(process.cwd(), "scripts/sync_from_postgres.py");
    const fallbackPgSync = path.resolve(process.cwd(), "../backend/scripts/sync_from_postgres.py");
    const pgSyncScript = fs.existsSync(localPgSync) ? localPgSync : fallbackPgSync;

    if (fs.existsSync(pgSyncScript) && (process.env.PGPASSWORD || process.env.DATABASE_URL)) {
      try {
        await execFileAsync(pythonExe, [pgSyncScript]);
        console.log("[SYNC] Pulled latest data from PostgreSQL.");
      } catch (pgErr) {
        console.warn("Postgres sync warning:", pgErr);
      }
    }

    const jobs = getJobs();
    const transport = getTransport();

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
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
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
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
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
