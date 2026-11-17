import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const candidates = [
      path.resolve(process.cwd(), "public/exports/Perkin_Logistics_Master_Export.xlsx"),
      path.resolve(process.cwd(), "data/2026 Booking Report.xlsx"),
      path.resolve(process.cwd(), "../2026 Booking Report.xlsx"),
      "C:/Users/User/Desktop/n8n/2026 Booking Report.xlsx",
    ];

    let foundPath: string | null = null;
    for (const cand of candidates) {
      try {
        await fs.access(cand);
        foundPath = cand;
        break;
      } catch {}
    }

    if (!foundPath) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบไฟล์ 2026 Booking Report.xlsx สำหรับส่งออก" },
        { status: 404 }
      );
    }

    const buffer = await fs.readFile(foundPath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="2026_Booking_Report_Latest.xlsx"',
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg || "เกิดข้อผิดพลาดในการส่งออกไฟล์" },
      { status: 500 }
    );
  }
}
