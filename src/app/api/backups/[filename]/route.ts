import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = path.basename(decodeURIComponent(params.filename));
    if (!filename.endsWith(".xlsx")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    const backupsDir = getBackupsDir();
    const filePath = path.join(backupsDir, filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
