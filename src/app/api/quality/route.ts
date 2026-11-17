import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const qualityPath = path.join(process.cwd(), "data/quality_alerts.json");

export async function GET() {
  try {
    if (!fs.existsSync(qualityPath)) {
      return NextResponse.json({
        summary: { totalAlerts: 0, dateSwapsCount: 0, crossSheetDupsCount: 0, unlinkedTransportCount: 0, hiddenSheetsCount: 0 },
        dateSwaps: [],
        crossSheetDuplicates: [],
        unlinkedTransport: [],
        hiddenSheets: [],
      });
    }
    const data = JSON.parse(fs.readFileSync(qualityPath, "utf-8"));
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
