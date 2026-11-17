import { NextResponse } from "next/server";
import { getJobs, getTransport, getQuality, ADVANCE_ROWS } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
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
