import { NextResponse } from "next/server";
import { getJobs, getTransport, getQuality, ADVANCE_ROWS } from "@/lib/data-store";
import { fetchJobsFromPostgres, fetchTransportFromPostgres } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const pgJobs = await fetchJobsFromPostgres();
  const pgTransport = await fetchTransportFromPostgres();

  const jobs = pgJobs && pgJobs.length > 0 ? pgJobs : getJobs();
  const transport = pgTransport && pgTransport.length > 0 ? pgTransport : getTransport();

  return NextResponse.json(
    {
      jobs,
      transport,
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
