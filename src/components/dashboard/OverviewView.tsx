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
} from "@/lib/dashboard-helpers";
import TrendChart from "./TrendChart";
import { Calendar } from "lucide-react";
import {
  OverviewKpiCards,
  ServiceBreakdown,
  OverdueJobsTable,
} from "./overview";

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

    // 1.3 จำแนกสถานะงานสำหรับตาราง Matrix & Service Breakdown ตามลำดับ FWD System
    // Flow: Job Booking Request > Job Control > Job Waiting > Job Complete
    const classifyJob = (
      job: JobRecord
    ): "Booking" | "Control" | "Waiting" | "Completed" | "Cancelled" => {
      const st = job.status || "";
      const std = job.statusDetail || "";
      const raw = job.statusRaw || "";
      if (st === "Completed" || std.includes("Complete") || raw.includes("Complete")) {
        return "Completed";
      }
      if (st === "Cancelled" || std.includes("Cancel") || raw.includes("Cancel")) {
        return "Cancelled";
      }
      if (
        st === "Booking" ||
        std.includes("Booking") ||
        std.includes("Request") ||
        raw.includes("Booking") ||
        raw.includes("Request")
      ) {
        return "Booking";
      }
      if (
        std.includes("Wait") ||
        std === "Job Waiting" ||
        raw.includes("Wait") ||
        raw === "Job Waiting"
      ) {
        return "Waiting";
      }
      return "Control";
    };

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

  const months12Data = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const mNum = idx + 1;
      const mKey = `2026-${String(mNum).padStart(2, "0")}`;

      const mJobs = jobs.filter((j) => getJobMonth(j) === mKey);
      const mTransport = mJobs.filter((j) => j.service === "Transport");

      const si = mJobs.filter((j) => j.service === "SEA Import").length;
      const se = mJobs.filter((j) => j.service === "SEA Export").length;
      const ai = mJobs.filter((j) => j.service === "AIR Import").length;
      const ae = mJobs.filter((j) => (j.service || "").toUpperCase().includes("AIR EXP")).length;
      const trn = mTransport.length;
      const frt = mJobs.filter((j) => j.service === "Freight").length;
      const total = si + se + ai + ae + frt;

      return {
        key: mKey,
        label: THAI_MONTH_SHORT[idx],
        fullLabel: `${THAI_MONTH_NAMES[idx]} 2026`,
        total,
        seaImport: si,
        seaExport: se,
        airImport: ai,
        airExport: ae,
        transport: trn,
        freight: frt,
        completed: mJobs.filter((j) => j.status === "Completed").length,
      };
    });
  }, [jobs]);

  const activeTargetMonth = monthFilter === "all" ? "2026-11" : monthFilter;
  const dailyData = useMemo(() => {
    const parts = activeTargetMonth.split("-");
    const year = Number(parts[0]) || 2026;
    const month = Number(parts[1]) || 9;
    const daysInMonth = new Date(year, month, 0).getDate();

    const monthJobs = jobs.filter((j) => getJobMonth(j) === activeTargetMonth);
    const monthName = THAI_MONTH_SHORT[month - 1] || "";

    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      const dKey = `${activeTargetMonth}-${String(day).padStart(2, "0")}`;

      const dayJobs = monthJobs.filter((j) => {
        const s = (j.service || "").toLowerCase();
        const jn = (j.jobNo || "").toUpperCase();
        const isExp =
          s.includes("export") ||
          jn.startsWith("SE") ||
          jn.startsWith("AE") ||
          jn.startsWith("SHSE") ||
          jn.startsWith("SHAE");
        const isImp =
          s.includes("import") ||
          jn.startsWith("SI") ||
          jn.startsWith("AI") ||
          jn.startsWith("SHSI") ||
          jn.startsWith("SHAI");
        let d = "";
        if (isExp) {
          d = j.etd || j.jobDate || "";
        } else if (isImp) {
          d = j.eta || j.jobDate || j.etd || "";
        } else {
          d = j.jobDate || j.etd || j.eta || "";
        }
        return d.startsWith(dKey);
      });

      const dayTransport = dayJobs.filter((j) => j.service === "Transport");

      const si = dayJobs.filter((j) => j.service === "SEA Import").length;
      const se = dayJobs.filter((j) => j.service === "SEA Export").length;
      const ai = dayJobs.filter((j) => j.service === "AIR Import").length;
      const ae = dayJobs.filter((j) => (j.service || "").toUpperCase().includes("AIR EXP")).length;
      const trn = dayTransport.length;
      const frt = dayJobs.filter((j) => j.service === "Freight").length;
      const total = si + se + ai + ae + frt;

      return {
        key: dKey,
        label: String(day),
        fullLabel: `วันที่ ${day} ${monthName} 2026`,
        total,
        seaImport: si,
        seaExport: se,
        airImport: ai,
        airExport: ae,
        transport: trn,
        freight: frt,
        completed: dayJobs.filter((j) => j.status === "Completed").length,
      };
    });
  }, [jobs, transport, activeTargetMonth]);

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

      {/* SECTION 4: MULTI-SERVICE & TRANSPORT TREND CHART */}
      <section className="bg-white rounded-xl border border-slate-200/90 p-5 lg:p-6 flex flex-col shadow-xs">
        <div className="mb-4">
          <h2 className="text-[16px] font-bold text-[#0c2340]">
            แนวโน้มปริมาณงานขนส่ง 2026
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            วิเคราะห์ปริมาณงานชิปเมนท์และงานรถขนส่งรายเดือน และรายวัน 1–31
          </p>
        </div>
        <TrendChart
          monthsData={months12Data}
          dailyData={dailyData}
          activeMonth={monthFilter}
          onSelectMonth={(m) => setMonthFilter(m)}
        />
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
