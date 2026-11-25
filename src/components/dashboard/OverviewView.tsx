"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — EXECUTIVE OVERVIEW VIEW
 * ============================================================================
 * คอมโพเนนต์หน้าภาพรวมหลัก (Executive Overview)
 * 
 * ความสามารถหลัก:
 * 1. แถบเลือกเดือนแบบเรียลไทม์ (Month Selector Filter Bar) เพื่อดูงานเฉพาะเดือน
 * 2. การ์ดตัวชี้วัดหลัก 4 ใบ (OverviewKpiCards):
 *    - งานขนส่งทั้งหมด (Total Jobs) พร้อม Progress bar สัดส่วนบริการ
 *    - อัตราปิดงานสำเร็จ (Completed Rate)
 *    - งานกำลังดำเนินการ (In Progress / Job Control / Job Waiting)
 *    - งานที่ต้องเร่งติดตาม (Action Required: เลยกำหนด ETD)
 * 3. สัดส่วนงานแยกตามบริการ (ServiceBreakdown) สลับมุมมองแถบสัดส่วนและตาราง Matrix
 * 4. กราฟแนวโน้มปริมาณงานรายเดือน (Monthly Trend Chart) แบบ SVG โต้ตอบได้
 * 5. ตารางงานค้างที่ต้องเร่งติดตาม (OverdueJobsTable)
 * ============================================================================
 */

import React, { useMemo } from "react";
import { JobRecord, TransportRecord } from "@/types/dashboard";
import {
  MONTH_FILTER_OPTIONS,
  fmtNum,
  fmtMonth,
  getJobMonth,
  daysOpen,
  isOpen,
  classifyJob,
  JobStage,
} from "@/lib/dashboard-helpers";
import TrendChart, { SERIES_LIST } from "./TrendChart";
import { Calendar } from "lucide-react";
import {
  OverviewKpiCards,
  ServiceBreakdown,
  OverdueJobsTable,
} from "./overview";

/** 4 กราฟแยกตามสถานะงาน (สีเดียวกับ Service Breakdown) */
const STAGE_CHARTS: { key: JobStage; label: string; color: string }[] = [
  { key: "Booking", label: "Job Booking Request", color: "#8b5cf6" },
  { key: "Control", label: "Job Control", color: "#0284c7" },
  { key: "Waiting", label: "Job Waiting", color: "#f56a22" },
  { key: "Completed", label: "Job Complete", color: "#0d7a5f" },
];

export interface OverviewViewProps {
  /** รายการงานทั้งหมดจาก SharePoint / Data Store */
  jobs: JobRecord[];
  /** รายการรถขนส่ง (Transport) */
  transport?: TransportRecord[];
  /** เดือนที่กำลังกรองอยู่ เช่น "all", "2026-10" */
  monthFilter: string;
  /** ฟังก์ชันเปลี่ยนตัวกรองเดือน */
  setMonthFilter: (m: string) => void;
  /** ฟังก์ชันเปิดดูรายละเอียดงานผ่าน Drawer */
  onSelectJobNo: (jobNo: string) => void;
  /** ฟังก์ชันนำทางไปยังตารางงานทั้งหมด (สามารถส่ง overdueOnly = true ได้) */
  onNavigateJobs: (overdueOnly?: boolean) => void;
}

export default function OverviewView({
  jobs,
  transport = [],
  monthFilter,
  setMonthFilter,
  onSelectJobNo,
  onNavigateJobs,
}: OverviewViewProps) {
  /* ==========================================================================
   * 1. COMPUTED STATISTICS (MEMOIZED)
   * คำนวณสรุปสถิติ KPI ตามเงื่อนไขเดือนที่เลือก เพื่อให้ Dashboard อัปเดตทันที
   * ========================================================================== */
  const stats = useMemo(() => {
    const targetJobs =
      monthFilter === "all"
        ? jobs
        : jobs.filter((j) => getJobMonth(j) === monthFilter);

    // 1.1 นับจำนวนงานตามสถานะหลัก
    const byStatus: Record<string, number> = {
      Completed: 0,
      "In Progress": 0,
      Cancelled: 0,
      Booking: 0,
    };

    // 1.2 นับจำนวนงานตามสถานะย่อยใน Excel (Job Control, Job Waiting, ฯลฯ)
    const byDetail: Record<string, number> = {
      Control: 0,
      Waiting: 0,
      Completed: 0,
      Cancelled: 0,
    };

    let overdue = 0;
    const customers = new Set<string>();

    for (const job of targetJobs) {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      if (job.statusDetail) {
        byDetail[job.statusDetail] = (byDetail[job.statusDetail] || 0) + 1;
      }
      if (job.consignee || job.customer) {
        customers.add(job.consignee || job.customer);
      }
      const age = daysOpen(job);
      if (isOpen(job) && age !== null && age > 0) overdue += 1;
    }

    // 1.3 จำแนกสถานะงานตามลำดับ FWD System (ดู classifyJob ด้านบน)

    // 1.4 สร้างรายการ 6 หมวดบริการ
    const matrixDefs = [
      { key: "SEA Import", name: "SEA Import", code: "SEA-IMP", color: "#073766", isTransport: false },
      { key: "SEA Export", name: "SEA Export", code: "SEA-EXP", color: "#f56a22", isTransport: false },
      { key: "AIR Import", name: "AIR Import", code: "AIR-IMP", color: "#0d7a5f", isTransport: false },
      { key: "AIR Export", name: "AIR Export", code: "AIR-EXP", color: "#5288b6", isTransport: false },
      { key: "Transport",  name: "Transport",  code: "TRN",     color: "#d97706", isTransport: true },
      { key: "Freight",    name: "Freight",    code: "FRT",     color: "#c07d53", isTransport: false },
    ];

    const matrixRows = matrixDefs.map((def) => {
      const list = targetJobs.filter(
        (j) => (j.service || "").toUpperCase() === def.key.toUpperCase()
      );
      const booking = list.filter((j) => classifyJob(j) === "Booking").length;
      const control = list.filter((j) => classifyJob(j) === "Control").length;
      const waiting = list.filter((j) => classifyJob(j) === "Waiting").length;
      const completed = list.filter((j) => classifyJob(j) === "Completed").length;
      return {
        ...def,
        total: list.length,
        booking,
        control,
        waiting,
        completed,
        cancelled: list.filter((j) => j.status === "Cancelled").length,
      };
    });

    const matrixTotals = {
      total: matrixRows.reduce((acc, r) => acc + r.total, 0),
      booking: matrixRows.reduce((acc, r) => acc + r.booking, 0),
      control: matrixRows.reduce((acc, r) => acc + r.control, 0),
      waiting: matrixRows.reduce((acc, r) => acc + r.waiting, 0),
      completed: matrixRows.reduce((acc, r) => acc + r.completed, 0),
    };

    const services = matrixRows;

    // รวบรวมแนวโน้มปริมาณงานรายเดือน
    const monthMap = new Map<
      string,
      { month: string; total: number; completed: number }
    >();
    for (const job of jobs) {
      const mKey = getJobMonth(job);
      if (!mKey) continue;

      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, { month: mKey, total: 0, completed: 0 });
      }
      const m = monthMap.get(mKey)!;
      m.total += 1;
      if (job.status === "Completed") m.completed += 1;
    }
    const months = Array.from(monthMap.values())
      .filter((m) => m.month >= "2026-06" && m.month <= "2026-12")
      .sort((a, b) => a.month.localeCompare(b.month));

    // คำนวณงานค้างเลยกำหนด
    const allOverdueJobs = jobs
      .map((j) => ({ ...j, _age: daysOpen(j) }))
      .filter((j) => isOpen(j) && j._age !== null && j._age > 0)
      .sort((a, b) => (b._age || 0) - (a._age || 0));

    const monthOverdueJobs = targetJobs
      .map((j) => ({ ...j, _age: daysOpen(j) }))
      .filter((j) => isOpen(j) && j._age !== null && j._age > 0)
      .sort((a, b) => (b._age || 0) - (a._age || 0));

    const isShowingAllFallback =
      monthFilter !== "all" && monthOverdueJobs.length === 0 && allOverdueJobs.length > 0;

    const exceptions = isShowingAllFallback
      ? allOverdueJobs.slice(0, 10)
      : (monthOverdueJobs.length > 0 ? monthOverdueJobs.slice(0, 10) : allOverdueJobs.slice(0, 10));

    const allOverdueCount = allOverdueJobs.length;
    const transportCount = targetJobs.filter((j) => j.service === "Transport").length;
    const totalWithTransport = targetJobs.length;
    const shipmentCount = totalWithTransport - transportCount;
    const total = totalWithTransport;
    const completed = byStatus.Completed || 0;
    const open = (byStatus["In Progress"] || 0) + (byStatus.Booking || 0);

    const bookingCount = matrixTotals.booking;
    const controlCount = matrixTotals.control;
    const waitingCount = matrixTotals.waiting;

    return {
      total,
      shipmentCount,
      transportCount,
      totalWithTransport,
      allJobsCount: jobs.length,
      allTransportCount: transport.length,
      completed,
      open,
      overdue,
      allOverdueCount,
      isShowingAllFallback,
      customers: customers.size,
      byStatus,
      byDetail,
      bookingCount,
      controlCount,
      waitingCount,
      services,
      matrixRows,
      matrixTotals,
      months,
      exceptions,
    };
  }, [jobs, transport, monthFilter]);

  /* ==========================================================================
   * 1.1 MULTI-SERVICE & TRANSPORT TREND DATA (12 เดือน & รายวัน 1-31)
   * ========================================================================== */
  const THAI_MONTH_NAMES = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const THAI_MONTH_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];

  // นับงานแยกตามบริการของรายการงานที่ส่งเข้ามา
  const countByService = (list: JobRecord[]) => {
    const si = list.filter((j) => j.service === "SEA Import").length;
    const se = list.filter((j) => j.service === "SEA Export").length;
    const ai = list.filter((j) => j.service === "AIR Import").length;
    const ae = list.filter((j) => (j.service || "").toUpperCase().includes("AIR EXP")).length;
    const trn = list.filter((j) => j.service === "Transport").length;
    const frt = list.filter((j) => j.service === "Freight").length;
    return {
      total: si + se + ai + ae + frt,
      seaImport: si,
      seaExport: se,
      airImport: ai,
      airExport: ae,
      transport: trn,
      freight: frt,
      completed: list.filter((j) => j.status === "Completed").length,
    };
  };

  // วันที่อ้างอิงของงาน: ขาออกใช้ ETD, ขาเข้าใช้ ETA
  const jobDayKey = (j: JobRecord) => {
    const s = (j.service || "").toLowerCase();
    const jn = (j.jobNo || "").toUpperCase();
    const isExp = s.includes("export") || /^(SH)?(SE|AE)/.test(jn);
    const isImp = s.includes("import") || /^(SH)?(SI|AI)/.test(jn);
    if (isExp) return j.etd || j.jobDate || "";
    if (isImp) return j.eta || j.jobDate || j.etd || "";
    return j.jobDate || j.etd || j.eta || "";
  };

  const buildMonths = (list: JobRecord[]) =>
    Array.from({ length: 12 }, (_, idx) => {
      const mKey = `2026-${String(idx + 1).padStart(2, "0")}`;
      return {
        key: mKey,
        label: THAI_MONTH_SHORT[idx],
        fullLabel: `${THAI_MONTH_NAMES[idx]} 2026`,
        ...countByService(list.filter((j) => getJobMonth(j) === mKey)),
      };
    });

  const activeTargetMonth = monthFilter === "all" ? "2026-11" : monthFilter;

  const buildDaily = (list: JobRecord[]) => {
    const [year, month] = activeTargetMonth.split("-").map(Number);
    const daysInMonth = new Date(year || 2026, month || 11, 0).getDate();
    const monthJobs = list.filter((j) => getJobMonth(j) === activeTargetMonth);
    const monthName = THAI_MONTH_SHORT[(month || 11) - 1] || "";
    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      const dKey = `${activeTargetMonth}-${String(day).padStart(2, "0")}`;
      return {
        key: dKey,
        label: String(day),
        fullLabel: `วันที่ ${day} ${monthName} 2026`,
        ...countByService(monthJobs.filter((j) => jobDayKey(j).startsWith(dKey))),
      };
    });
  };

  // ข้อมูล 4 กราฟแยกตามสถานะงาน
  const stageCharts = useMemo(
    () =>
      STAGE_CHARTS.map((s) => {
        const list = jobs.filter((j) => classifyJob(j) === s.key);
        return { ...s, months: buildMonths(list), daily: buildDaily(list) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, activeTargetMonth]
  );

  /* ==========================================================================
   * 2. RENDER UI
   * ========================================================================== */
  return (
    <div className="space-y-6">
      {/* SECTION 1: FREIGHT TIMELINE SCRUBBER (แถบเลือกเดือนปฏิบัติการ) */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 px-5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs tracking-wide uppercase">
            <Calendar className="w-4 h-4 text-[#f56a22]" />
            <span>รอบเดือนปฏิบัติการ:</span>
          </div>

          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="ตัวกรองรอบเดือนปฏิบัติการ"
          >
            {MONTH_FILTER_OPTIONS.map((opt) => {
              const active = monthFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMonthFilter(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 cursor-pointer ${
                    active
                      ? "bg-[#0c2340] text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
          <span>
            แสดงผล: <strong>{monthFilter === "all" ? "ทั้งหมด 12 เดือน" : fmtMonth(monthFilter)}</strong>
          </span>
          <span className="text-slate-300">•</span>
          <span>
            รวม <strong>{fmtNum(stats.total)}</strong> งาน
          </span>
        </div>
      </div>

      {/* SECTION 2: OPERATIONAL METRIC STRIP (ศูนย์ควบคุมชิปเมนท์ 4 เสาหลัก) */}
      <OverviewKpiCards stats={stats} onNavigateJobs={onNavigateJobs} />

      {/* SECTION 3: SERVICE BREAKDOWN (สัดส่วน 6 บริการหลัก: Bars vs Matrix) */}
      <ServiceBreakdown monthFilter={monthFilter} stats={stats} />

      {/* SECTION 4: 4 กราฟแนวโน้มแยกตามสถานะงาน (Booking / Control / Waiting / Complete) */}
      <section className="bg-white rounded-xl border border-slate-200/90 p-5 lg:p-6 flex flex-col shadow-xs">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-[#0c2340]">
              แนวโน้มปริมาณงานตามสถานะ 2026
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {monthFilter === "all"
                ? "รายเดือน ม.ค.–ธ.ค. · คลิกแท่งเพื่อดูรายวันของเดือนนั้น"
                : `รายวัน 1–31 · ${fmtMonth(monthFilter)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
            {SERIES_LIST.filter((s) => s.key !== "total").map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stageCharts.map((s) => (
            <div key={s.key} className="rounded-lg border border-slate-200 p-4">
              <TrendChart
                compact
                title={s.label}
                accent={s.color}
                monthsData={s.months}
                dailyData={s.daily}
                activeMonth={monthFilter}
                onSelectMonth={(m) => setMonthFilter(m)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 5: ACTIONABLE OVERDUE EXCEPTIONS TABLE */}
      <OverdueJobsTable
        monthFilter={monthFilter}
        setMonthFilter={setMonthFilter}
        stats={stats}
        onSelectJobNo={onSelectJobNo}
        onNavigateJobs={onNavigateJobs}
      />
    </div>
  );
}
