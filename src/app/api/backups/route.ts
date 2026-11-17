import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getBackupsDir(): string {
  const candidates = [
    process.env.BACKUPS_SNAPSHOTS_DIR,
    path.join(process.cwd(), "backups", "snapshots"),
    path.join(process.cwd(), "../backups/snapshots"),
    "C:/Users/User/Desktop/n8n/backups/snapshots",
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) || path.join(process.cwd(), "backups", "snapshots");
}

export async function GET() {
  try {
    const backupsDir = getBackupsDir();
    const manifestPath = path.join(backupsDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return NextResponse.json({ snapshots: [] });
    }
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return NextResponse.json({ snapshots: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
