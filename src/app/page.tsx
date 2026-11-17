import DashboardClient from "@/components/DashboardClient";
import {
  getJobs,
  getTransport,
  getQuality,
  getQualityAlerts,
  getSnapshots,
  ADVANCE_ROWS,
} from "@/lib/data-store";

export const dynamic = "force-dynamic";

type PageKey =
  | "overview"
  | "jobs"
  | "transport"
  | "advances"
  | "upload"
  | "safety";

export default function HomePage({
  searchParams,
}: {
  searchParams?: {
    page?: string;
    job?: string;
    edit?: string;
  };
}) {
  const jobs = getJobs();
  const transport = getTransport();
  const quality = getQuality();
  const qualityAlerts = getQualityAlerts();
  const snapshots = getSnapshots();

  const validPages: PageKey[] = [
    "overview",
    "jobs",
    "transport",
    "advances",
    "upload",
    "safety",
  ];
  const initialPage: PageKey =
    searchParams?.page && validPages.includes(searchParams.page as PageKey)
      ? (searchParams.page as PageKey)
      : "overview";

  return (
    <DashboardClient
      initialJobs={jobs}
      initialTransport={transport}
      quality={quality}
      initialAdvances={ADVANCE_ROWS}
      initialQualityAlerts={qualityAlerts}
      initialSnapshots={snapshots}
      initialPage={initialPage}
      initialJobNo={searchParams?.job}
      initialEdit={searchParams?.edit === "1"}
    />
  );
}
