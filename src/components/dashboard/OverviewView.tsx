"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — EXECUTIVE OVERVIEW VIEW
 * ============================================================================
 * คอมโพเนนต์หน้าภาพรวมหลัก (Executive Overview)
 * 
 * ความสามารถหลัก:
 * 1. แถบเลือกเดือนแบบเรียลไทม์ (Month Selector Filter Bar) เพื่อดูงานเฉพาะเดือน
 * 2. การ์ดตัวชี้วัดหลัก 4 ใบ (KPI Cards):
 *    - งานขนส่งทั้งหมด (Total Jobs) พร้อม Progress bar สัดส่วนบริการ
 *    - อัตราปิดงานสำเร็จ (Completed Rate)
 *    - งานกำลังดำเนินการ (In Progress / Job Control / Job Waiting)
 *    - งานที่ต้องเร่งติดตาม (Action Required: เลยกำหนด ETD)
 * 3. สัดส่วนงานแยกตามบริการ (Service Mix Breakdown) แสดงสถานะย่อยตามสี
 * 4. กราฟแนวโน้มปริมาณงานรายเดือน (Monthly Trend Chart) แบบ SVG โต้ตอบได้
 * 5. ตารางงานค้างที่ต้องเร่งติดตาม (Overdue Exceptions Queue)
 * ============================================================================
 */

import React, { useMemo, useState } from "react";
import { JobRecord, TransportRecord } from "@/types/dashboard";
import {
  SERVICES,
  MONTH_FILTER_OPTIONS,
  fmtNum,
  fmtDate,
  fmtMonth,
  serviceMeta,
  getJobMonth,
  daysOpen,
  pct,
  isOpen,
} from "@/lib/dashboard-helpers";
import TrendChart from "./TrendChart";
import { Calendar, ChevronRight, CheckCircle2 } from "lucide-react";

/* ============================================================================
 * PROPS INTERFACE
 * ============================================================================ */
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
  // สลับมุมมองระหว่างแถบสัดส่วน Bars (ชื่องานด้านซ้าย เส้นกลาง ขวาสุดจำนวนงาน) และ ตาราง Matrix
  const [serviceViewMode, setServiceViewMode] = useState<"bars" | "matrix">("bars");
  /* ==========================================================================
   * 1. COMPUTED STATISTICS (MEMOIZED)
   * คำนวณสรุปสถิติ KPI ตามเงื่อนไขเดือนที่เลือก เพื่อให้ Dashboard อัปเดตทันที
   * ========================================================================== */
  const stats = useMemo(() => {
    // กรองงานตามเดือนที่เลือก (หากเป็น "all" ให้ใช้ข้อมูลทั้งหมด)
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
      // ตรวจสอบงานที่เลยกำหนด ETD
      const age = daysOpen(job);
      if (isOpen(job) && age !== null && age > 0) overdue += 1;
    }

    // 1.3 จำแนกสถานะงานสำหรับตาราง Matrix (Completed, Control, Waiting)
    const classifyJob = (job: JobRecord): "Completed" | "Control" | "Waiting" => {
      const st = job.status || "";
      const std = (job.statusDetail || "").toLowerCase();
      const raw = (job.statusRaw || "").toLowerCase();
      if (st === "Completed" || std.includes("complete") || raw.includes("complete")) {
        return "Completed";
      }
      if (
        st === "Booking" ||
        std.includes("wait") ||
        std.includes("booking") ||
        std.includes("draft") ||
        raw.includes("wait") ||
        raw.includes("booking") ||
        raw.includes("draft")
      ) {
        return "Waiting";
      }
      return "Control";
    };

    // 1.5 สร้างรายการ 6 หมวดบริการเรียงตามภาพที่ผู้ออกแบบกำหนด:
    // 1. SEA Import, 2. SEA Export, 3. AIR Import, 4. AIR Export, 5. Transport, 6. Freight
    const matrixDefs = [
      { key: "SEA Import", name: "SEA Import", code: "SEA-IMP", color: "#073766", isTransport: false },
      { key: "SEA Export", name: "SEA Export", code: "SEA-EXP", color: "#f56a22", isTransport: false },
      { key: "AIR Import", name: "AIR Import", code: "AIR-IMP", color: "#0d7a5f", isTransport: false },
      { key: "AIR Export", name: "AIR Export", code: "AIR-EXP", color: "#5288b6", isTransport: false },
      { key: "Transport",  name: "Transport",  code: "TRN",     color: "#d97706", isTransport: true },
      { key: "Freight",    name: "Freight",    code: "FRT",     color: "#c07d53", isTransport: false },
    ];

    // ทุกบริการ (รวม Transport) นับจากแถวใน 2026 Booking Report — ตรงกับ SharePoint
    const matrixRows = matrixDefs.map((def) => {
      const list = targetJobs.filter(
        (j) => (j.service || "").toUpperCase() === def.key.toUpperCase()
      );
      const completed = list.filter((j) => classifyJob(j) === "Completed").length;
      const control = list.filter((j) => classifyJob(j) === "Control").length;
      const waiting = list.filter((j) => classifyJob(j) === "Waiting").length;
      return {
        ...def,
        total: list.length,
        completed,
        control,
        waiting,
        cancelled: list.filter((j) => j.status === "Cancelled").length,
      };
    });

    const matrixTotals = {
      total: matrixRows.reduce((acc, r) => acc + r.total, 0),
      completed: matrixRows.reduce((acc, r) => acc + r.completed, 0),
      control: matrixRows.reduce((acc, r) => acc + r.control, 0),
      waiting: matrixRows.reduce((acc, r) => acc + r.waiting, 0),
    };

    const services = matrixRows;

    // 1.5 รวบรวมแนวโน้มปริมาณงานรายเดือน (คำนวณจากทุกงานในระบบ)
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

    // 1.5 ดึงงานที่เลยกำหนด ETD สูงสุดเพื่อแสดงใน Action Queue
    // คำนวณงานค้างเลยกำหนดทั้งระบบ (System-wide Overdue)
    const allOverdueJobs = jobs
      .map((j) => ({ ...j, _age: daysOpen(j) }))
      .filter((j) => isOpen(j) && j._age !== null && j._age > 0)
      .sort((a, b) => (b._age || 0) - (a._age || 0));

    // คำนวณงานค้างในเดือนที่เลือก (Selected Month Overdue)
    const monthOverdueJobs = targetJobs
      .map((j) => ({ ...j, _age: daysOpen(j) }))
      .filter((j) => isOpen(j) && j._age !== null && j._age > 0)
      .sort((a, b) => (b._age || 0) - (a._age || 0));

    // หากเดือนที่เลือกมีงานค้าง ให้แสดงงานของเดือนนั้น
    // หากเดือนที่เลือกไม่มีงานค้าง (เช่น ก.ย. ซึ่งเสร็จสิ้น 100% แล้ว) ให้ดึงงานค้างทั้งระบบ (16 งาน) มาแสดง
    // เพื่อให้ Action Queue มีประโยชน์ต่อการติดตามงาน ไม่ว่างเปล่า
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

    const controlCount = (byDetail["Job Control"] || 0) + (byDetail.Control || 0);
    const waitingCount = (byDetail["Job Waiting"] || 0) + (byDetail["Job Booking"] || 0) + (byDetail.Waiting || 0);

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

  // คำนวณยอด 12 เดือน ครบทุกประเภทงาน + งานรถขนส่ง (Transport)
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
      // ยอดงานรวม (Total Jobs): นับเฉพาะงานชิปเมนท์จริง (ไม่นำเที่ยวรถขนส่งมารวมเป็นงาน)
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

  // คำนวณยอดรายวัน (วันที่ 1 - 31) ของเดือนที่กำลังเลือก (ยึดหลัก: ETD จับ Export ETA จับ Import)
  const activeTargetMonth = monthFilter === "all" ? "2026-11" : monthFilter;
  const dailyData = useMemo(() => {
    const parts = activeTargetMonth.split("-");
    const year = Number(parts[0]) || 2026;
    const month = Number(parts[1]) || 9;
    const daysInMonth = new Date(year, month, 0).getDate(); // 28, 30, หรือ 31

    const monthJobs = jobs.filter((j) => getJobMonth(j) === activeTargetMonth);

    const monthName = THAI_MONTH_SHORT[month - 1] || "";

    return Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      const dKey = `${activeTargetMonth}-${String(day).padStart(2, "0")}`;

      const dayJobs = monthJobs.filter((j) => {
        const s = (j.service || "").toLowerCase();
        const jn = (j.jobNo || "").toUpperCase();
        const isExp = s.includes("export") || jn.startsWith("SE") || jn.startsWith("AE") || jn.startsWith("SHSE") || jn.startsWith("SHAE");
        const isImp = s.includes("import") || jn.startsWith("SI") || jn.startsWith("AI") || jn.startsWith("SHSI") || jn.startsWith("SHAI");
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
      // ยอดงานรวมรายวัน: นับเฉพาะงานชิปเมนท์จริง ไม่รวมเที่ยวรถขนส่ง
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
    <>
      {/* --------------------------------------------------------------------
       * SECTION 1: FREIGHT TIMELINE SCRUBBER (แถบเลือกเดือนปฏิบัติการ)
       * -------------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 px-5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs tracking-wide uppercase">
            <Calendar className="w-4 h-4 text-[#f56a22]" />
            <span>รอบเดือนปฏิบัติการ:</span>
          </div>
          <div className="bg-slate-100/80 p-1 rounded-lg border border-slate-200/60 inline-flex flex-wrap items-center gap-1">
            {MONTH_FILTER_OPTIONS.map((m) => {
              const active = monthFilter === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMonthFilter(m.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 ease-out cursor-pointer ${
                    active
                      ? "bg-[#0c2340] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                  }`}
                  aria-pressed={active}
                  aria-label={`เลือกดูข้อมูลเดือน ${m.label}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {monthFilter !== "all" ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#0c2340] bg-slate-100 px-3 py-1 rounded-md border border-slate-200 text-xs">
                {MONTH_FILTER_OPTIONS.find((o) => o.key === monthFilter)?.label || monthFilter}
                <span className="text-slate-500 font-normal ml-1.5">
                  ({fmtNum(stats.total)} ชิปเมนท์)
                </span>
              </span>
              <button
                type="button"
                onClick={() => setMonthFilter("all")}
                className="text-xs font-semibold text-[#f56a22] hover:text-[#d45610] transition-colors cursor-pointer underline underline-offset-2"
                aria-label="รีเซ็ตตัวกรองเดือนเป็นทั้งหมด"
              >
                ดูทั้งปี
              </button>
            </div>
          ) : (
            <span className="text-slate-600 font-medium text-xs bg-slate-100 px-3 py-1 rounded-md border border-slate-200">
              ข้อมูลสะสมปี 2026 ({fmtNum(stats.allJobsCount)} ชิปเมนท์)
            </span>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------------------
       * SECTION 2: OPERATIONAL METRIC STRIP (ศูนย์ควบคุมชิปเมนท์ 4 เสาหลัก)
       * -------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: ปริมาณชิปเมนท์รวม */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 card-hover-lift animate-fade-in-up">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>ปริมาณชิปเมนท์รวม</span>
              <span className="text-[11px] font-mono text-slate-400">VOLUME</span>
            </div>
            <div className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight num text-[#0c2340]">
              {fmtNum(stats.total)}
            </div>
            <div className="mt-1 text-xs text-slate-600 flex items-center gap-2">
              <span>ชิปเมนท์หลัก <strong className="text-slate-900 font-semibold">{fmtNum(stats.shipmentCount)}</strong></span>
              <span className="text-slate-300">|</span>
              <span>รถขนส่ง <strong className="text-amber-700 font-semibold">{fmtNum(stats.transportCount)}</strong></span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="h-1.5 rounded-full bg-slate-100 flex overflow-hidden">
              {stats.services.map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: `${pct(s.total, stats.totalWithTransport)}%`,
                    backgroundColor: s.color,
                  }}
                  className="transition-[width] duration-500 ease-out"
                  title={`${s.name}: ${s.total} งาน`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* KPI 2: อัตราปิดงานสำเร็จ */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 card-hover-lift animate-fade-in-up [animation-delay:60ms]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>อัตราปิดงานสำเร็จ</span>
              <span className="text-[11px] font-mono text-emerald-700 font-semibold">DELIVERY</span>
            </div>
            <div className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight num text-emerald-700">
              {pct(stats.completed, stats.total).toFixed(1)}
              <span className="text-xl ml-1 font-semibold text-slate-500">%</span>
            </div>
            <div className="mt-1 text-xs text-slate-600">
              ปิดงานสมบูรณ์แล้ว <strong className="text-slate-900 font-semibold">{fmtNum(stats.completed)}</strong> จาก {fmtNum(stats.total)} งาน
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${pct(stats.completed, stats.total)}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: งานกำลังดำเนินการ */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 card-hover-lift animate-fade-in-up [animation-delay:120ms]">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>กำลังดำเนินการ</span>
              <span className="text-[11px] font-mono text-amber-700 font-semibold">ACTIVE</span>
            </div>
            <div className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight num text-[#0c2340]">
              {fmtNum(stats.open)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-800 text-[11px] font-semibold">
                Job Control: {stats.controlCount}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200/80 text-blue-800 text-[11px] font-semibold">
                รอเอกสาร: {stats.waitingCount}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-[#f56a22] rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${pct(stats.open, stats.total)}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 4: งานเปิดที่เลยกำหนด ETD (Action Required) */}
        <div className={`rounded-xl p-5 shadow-xs flex flex-col justify-between card-hover-lift animate-fade-in-up [animation-delay:180ms] ${
          stats.overdue > 0
            ? "bg-rose-50/60 border border-rose-200 hover:border-rose-300"
            : "bg-white border border-slate-200/90 hover:border-slate-300"
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs font-medium">
              <span className={stats.overdue > 0 ? "text-rose-900 font-semibold" : "text-slate-500"}>
                งานเลยกำหนด ETD
              </span>
              <span className={`text-[11px] font-mono font-semibold ${
                stats.overdue > 0 ? "text-rose-700" : "text-slate-400"
              }`}>
                {stats.overdue > 0 ? "ATTENTION" : "CLEARED"}
              </span>
            </div>
            <div className={`mt-2 text-[38px] font-extrabold leading-tight tracking-tight num ${
              stats.overdue > 0 ? "text-rose-700" : "text-slate-800"
            }`}>
              {fmtNum(stats.overdue)}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {stats.overdue > 0 ? (
                <span>
                  คิดเป็น <strong className="text-rose-700 font-bold">{pct(stats.overdue, stats.open)}%</strong> ของงานเปิดอยู่
                </span>
              ) : (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  ✓ กำหนดการเดินเรือ/ส่งมอบตรงเวลาทั้งหมด
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
            {stats.overdue > 0 ? (
              <button
                type="button"
                onClick={() => onNavigateJobs(true)}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900 transition-colors cursor-pointer"
                aria-label="ดูตารางงานค้างที่เลยกำหนด"
              >
                ดูงานค้างทันที →
              </button>
            ) : (
              <span className="text-[11px] text-slate-500">สถานะปกติ</span>
            )}
            <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${stats.overdue > 0 ? "bg-rose-600" : "bg-emerald-600"}`}
                style={{ width: `${stats.overdue > 0 ? pct(stats.overdue, stats.open) : 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------
       * SECTION 3: SERVICE MIX BREAKDOWN & MATRIX TABLE
       * สัดส่วนงานแยกตามประเภทบริการ 6 หมวด
       * -------------------------------------------------------------------- */}
      <section className="bg-white rounded-xl border border-slate-200/90 flex flex-col shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-[16px] font-bold text-[#0c2340]">
                สัดส่วนบริการขนส่งสินค้า
              </h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                6 บริการหลัก
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {monthFilter === "all"
                ? "สรุปภาพรวมครบ 12 เดือน (ชิปเมนท์หลักและงานรถขนส่งในประเทศ)"
                : `แสดงข้อมูลเฉพาะรอบเดือน ${fmtMonth(monthFilter)}`}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="font-extrabold font-mono text-[17px] text-[#0c2340] tabular-nums">
                {fmtNum(stats.matrixTotals.total)}
              </span>
              <span className="text-xs text-slate-500 ml-1">
                {monthFilter === "all" ? "รายการ" : "งาน"}
              </span>
            </div>

            {/* Segmented View Switcher */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setServiceViewMode("bars")}
                className={`px-3 py-1 rounded-md font-semibold transition-[background-color,color,box-shadow] duration-150 flex items-center gap-1.5 cursor-pointer ${
                  serviceViewMode === "bars"
                    ? "bg-white text-[#0c2340] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                aria-label="แสดงแบบแถบสัดส่วน Bars"
              >
                <span>แถบสัดส่วน</span>
              </button>
              <button
                type="button"
                onClick={() => setServiceViewMode("matrix")}
                className={`px-3 py-1 rounded-md font-semibold transition-[background-color,color,box-shadow] duration-150 flex items-center gap-1.5 cursor-pointer ${
                  serviceViewMode === "matrix"
                    ? "bg-white text-[#0c2340] shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                aria-label="แสดงแบบตารางสรุป Matrix"
              >
                <span>ตารางสรุป</span>
              </button>
            </div>
          </div>
        </div>

          {serviceViewMode === "matrix" ? (
            /* Matrix Table View ตามภาพที่ผู้ใช้วาด */
            <div className="overflow-x-auto flex-1 flex flex-col justify-between">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[12px] font-bold text-[#526275]">
                    <th scope="col" className="py-2.5 px-4 font-semibold text-[#102238]">
                      ประเภทบริการ (Service)
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right font-bold text-[#102238]">
                      Total
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right font-bold text-[#0d7a5f]">
                      Completed
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right font-bold text-[#db5610]">
                      Control
                    </th>
                    <th scope="col" className="py-2.5 px-4 text-right font-bold text-[#073766]">
                      Waiting
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f7]">
                  {stats.matrixRows.map((row) => (
                    <tr
                      key={row.key}
                      className="hover:bg-[#f1f5f9]/70 transition-colors duration-150"
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="font-bold text-[#102238] text-[13.5px]">
                            {row.name}
                          </span>
                          <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded bg-slate-100 text-[#64748b] border border-slate-200">
                            {row.code}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className="font-extrabold text-[15px] text-[#102238] font-mono tabular-nums">
                          {fmtNum(row.total)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className="inline-block min-w-[38px] text-center px-2 py-0.5 rounded-md font-bold text-[13px] font-mono tabular-nums bg-[#e6f5f0] text-[#0d7a5f] border border-[#bbf0df]">
                          {fmtNum(row.completed)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span
                          className={`inline-block min-w-[38px] text-center px-2 py-0.5 rounded-md font-bold text-[13px] font-mono tabular-nums ${
                            row.control > 0
                              ? "bg-[#fff1e8] text-[#db5610] border border-[#fed7aa]"
                              : "text-[#94a3b8]"
                          }`}
                        >
                          {fmtNum(row.control)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-block min-w-[38px] text-center px-2 py-0.5 rounded-md font-bold text-[13px] font-mono tabular-nums ${
                            row.waiting > 0
                              ? "bg-[#eaf4fc] text-[#073766] border border-[#bfdbfe]"
                              : "text-[#94a3b8]"
                          }`}
                        >
                          {fmtNum(row.waiting)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#cbd5e1] bg-[#f8fafc] font-bold">
                    <td className="py-3 px-4 text-[#102238] font-extrabold text-[13.5px]">
                      รวมทั้งหมด (Total)
                    </td>
                    <td className="py-3 px-3 text-right text-[#102238] font-extrabold text-[16px] font-mono tabular-nums">
                      {fmtNum(stats.matrixTotals.total)}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-[14px] font-mono tabular-nums text-[#0d7a5f]">
                      {fmtNum(stats.matrixTotals.completed)}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-[14px] font-mono tabular-nums text-[#db5610]">
                      {fmtNum(stats.matrixTotals.control)}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-[14px] font-mono tabular-nums text-[#073766]">
                      {fmtNum(stats.matrixTotals.waiting)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="p-3 border-t border-[#dce2e8] bg-[#fafafa] flex flex-wrap items-center justify-between text-[11.5px] text-[#64748b]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#0d7a5f] inline-block" />
                  Completed: ส่งมอบ/ปิดงานแล้ว
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#db5610] inline-block" />
                  Control: อยู่ระหว่างดำเนินการ/วิ่งงาน
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#073766] inline-block" />
                  Waiting: รอเอกสาร/รอจองเรือ
                </span>
              </div>
            </div>
          ) : (
            /* Visual Bars View (ด้านซ้าย: ชื่องาน | ตรงกลาง: แถบสัดส่วน | ขวาสุด: จำนวนงาน) */
            <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-5">
                {stats.services.map((sv) => (
                  <div key={sv.key} className="space-y-1.5">
                    <div className="grid grid-cols-[136px_1fr_84px] items-center gap-3.5">
                      <div>
                        <div className="text-[15px] font-bold text-[#102238] leading-tight">
                          {sv.name}
                        </div>
                        <div className="text-[11px] font-mono font-medium text-[#6e7e91]">
                          {sv.code}
                        </div>
                      </div>
                      <div className="h-6.5 rounded-[6px] bg-slate-100 flex overflow-hidden text-[11.5px] font-mono font-bold text-white shadow-inner">
                        {sv.completed > 0 && (
                          <div
                            className="flex items-center justify-center overflow-hidden transition-all duration-300"
                            style={{
                              width: `${pct(sv.completed, sv.total)}%`,
                              backgroundColor: "#0d7a5f",
                            }}
                            title={`เสร็จสิ้น: ${sv.completed}`}
                          >
                            {pct(sv.completed, sv.total) >= 12 ? fmtNum(sv.completed) : ""}
                          </div>
                        )}
                        {sv.control > 0 && (
                          <div
                            className="flex items-center justify-center overflow-hidden transition-all duration-300"
                            style={{
                              width: `${pct(sv.control, sv.total)}%`,
                              backgroundColor: sv.isTransport ? "#d97706" : "#f56a22",
                            }}
                            title={sv.isTransport ? `กำลังวิ่ง: ${sv.control}` : `กำลังทำ: ${sv.control}`}
                          >
                            {pct(sv.control, sv.total) >= 10 ? fmtNum(sv.control) : ""}
                          </div>
                        )}
                        {sv.waiting > 0 && (
                          <div
                            className="flex items-center justify-center overflow-hidden transition-all duration-300"
                            style={{
                              width: `${pct(sv.waiting, sv.total)}%`,
                              backgroundColor: "#073766",
                            }}
                            title={`รอเอกสาร: ${sv.waiting}`}
                          >
                            {pct(sv.waiting, sv.total) >= 10 ? fmtNum(sv.waiting) : ""}
                          </div>
                        )}
                        {sv.cancelled > 0 && (
                          <div
                            className="flex items-center justify-center overflow-hidden transition-all duration-300"
                            style={{
                              width: `${pct(sv.cancelled, sv.total)}%`,
                              backgroundColor: "#94a3b8",
                            }}
                            title={`ยกเลิก: ${sv.cancelled}`}
                          >
                            {pct(sv.cancelled, sv.total) >= 10 ? fmtNum(sv.cancelled) : ""}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold font-mono text-[22px] text-[#102238] tabular-nums leading-none">
                          {fmtNum(sv.total)}
                        </div>
                        <div className="text-[11px] font-sans font-medium text-[#64748b] mt-0.5">
                          งาน
                        </div>
                      </div>
                    </div>

                    <div className="pl-[148px] pr-[94px] flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] font-mono">
                      <span className="inline-flex items-center gap-1 text-[#0d7a5f] font-bold">
                        <i className="w-2 h-2 rounded-xs bg-[#0d7a5f] inline-block" />
                        {sv.isTransport ? "ส่งมอบแล้ว" : "เสร็จสิ้น"} {fmtNum(sv.completed)}
                      </span>
                      {sv.control > 0 && (
                        <span className="inline-flex items-center gap-1 font-bold" style={{ color: sv.isTransport ? "#b45309" : "#db5610" }}>
                          <i
                            className="w-2 h-2 rounded-xs inline-block"
                            style={{ backgroundColor: sv.isTransport ? "#d97706" : "#f56a22" }}
                          />
                          {sv.isTransport ? "กำลังวิ่ง" : "กำลังทำ"} {fmtNum(sv.control)}
                        </span>
                      )}
                      {sv.waiting > 0 && (
                        <span className="inline-flex items-center gap-1 text-[#073766] font-bold">
                          <i className="w-2 h-2 rounded-xs bg-[#073766] inline-block" />
                          รอเอกสาร {fmtNum(sv.waiting)}
                        </span>
                      )}
                      {sv.cancelled > 0 && (
                        <span className="inline-flex items-center gap-1 text-[#526275] font-semibold">
                          <i className="w-2 h-2 rounded-xs bg-[#94a3b8] inline-block" />
                          ยกเลิก {fmtNum(sv.cancelled)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[#dce2e8] flex flex-wrap gap-4 text-[12px] text-[#526275]">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <i className="w-2.5 h-2.5 rounded-xs bg-[#0d7a5f] inline-block" />
                  เสร็จสิ้น / ส่งมอบแล้ว
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <i className="w-2.5 h-2.5 rounded-xs bg-[#f56a22] inline-block" />
                  กำลังดำเนินการ
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <i className="w-2.5 h-2.5 rounded-xs bg-[#d97706] inline-block" />
                  รถกำลังวิ่ง (Transport)
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <i className="w-2.5 h-2.5 rounded-xs bg-[#073766] inline-block" />
                  รอเอกสาร
                </span>
              </div>
            </div>
          )}
        </section>

      {/* --------------------------------------------------------------------
       * SECTION 4: MULTI-SERVICE & TRANSPORT TREND CHART
       * -------------------------------------------------------------------- */}
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

      {/* --------------------------------------------------------------------
       * SECTION 5: ACTIONABLE OVERDUE EXCEPTIONS TABLE
       * -------------------------------------------------------------------- */}
      <section className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-bold text-[#0c2340]">
                รายการงานที่ต้องเร่งติดตาม
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                {stats.exceptions.length} งาน
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {stats.isShowingAllFallback ? (
                <span className="text-amber-700 font-medium inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  รอบเดือน {fmtMonth(monthFilter)} ปิดงานครบ 100% แล้ว · แสดงงานค้างจากทั้งระบบ ({stats.allOverdueCount} งาน)
                </span>
              ) : (
                `รายการงานสถานะ Control และ Waiting ที่ผ่านกำหนด ETD แล้ว (${stats.overdue} งาน)`
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {monthFilter !== "all" && (
              <button
                type="button"
                onClick={() => setMonthFilter("all")}
                className="px-2.5 py-1.5 rounded-[6px] border border-[#cbd5e1] bg-white hover:bg-slate-50 text-[12px] font-semibold text-[#073766] cursor-pointer shadow-2xs"
              >
                ดูงานค้างทั้งระบบ ({stats.allOverdueCount})
              </button>
            )}
            <button
              onClick={() => onNavigateJobs(true)}
              className="px-3 py-1.5 rounded-[6px] border border-[#dce2e8] hover:bg-slate-50 text-[13px] font-semibold text-[#073766] inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>ดูตารางเต็ม</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f5f6f8] border-b border-[#dce2e8] text-[11.5px] font-semibold uppercase tracking-wider text-[#526275] whitespace-nowrap">
                <th className="py-3 px-4">Job No</th>
                <th className="py-3 px-3">บริการ</th>
                <th className="py-3 px-4">ลูกค้า (Customer)</th>
                <th className="py-3 px-3">กำหนดการ</th>
                <th className="py-3 px-4">หมายเหตุ / สถานะล่าสุด (Update Status)</th>
                <th className="py-3 px-3 text-right">เกินกำหนด</th>
                <th className="py-3 px-4">ขั้นตอนถัดไป</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dce2e8] text-[13.5px]">
              {stats.exceptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#64748b]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-[#e6f5f0] text-[#0d7a5f] flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-[#102238] text-[14px]">
                        ไม่มีงานค้างเกินกำหนดในระบบ (งานทั้งหมดเสร็จสมบูรณ์เรียบร้อย)
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                stats.exceptions.map((j) => {
                const sm = serviceMeta(j.service);
                const isExport = j.service.includes("Export") || j.jobNo.startsWith("SE") || j.jobNo.startsWith("AE");
                const displayDate = (!isExport && j.eta) ? j.eta : j.etd;
                const dateLabel = (!isExport && j.eta) ? "ETA" : "ETD";
                return (
                  <tr
                    key={j.jobNo}
                    tabIndex={0}
                    role="button"
                    aria-label={`เปิดดูรายละเอียดงาน ${j.jobNo}`}
                    onClick={() => onSelectJobNo(j.jobNo)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectJobNo(j.jobNo);
                      }
                    }}
                    className="hover:bg-[#fff1e8]/50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-[#fff1e8]/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f56a22]"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-[#073766] whitespace-nowrap">
                      {j.jobNo}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-block font-mono text-[11px] font-medium px-2 py-0.5 rounded border border-[#c5cfd9] bg-white text-[#102238] whitespace-nowrap">
                        {sm.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#102238] font-medium max-w-[260px] truncate">
                      {j.consignee || j.customer || "—"}
                    </td>
                    <td className="py-3 px-3 num text-[#526275] whitespace-nowrap">
                      <span className="text-[10px] font-mono text-[#6e7e91] mr-1 bg-[#f0f3f6] px-1 py-0.5 rounded">
                        {dateLabel}
                      </span>
                      {fmtDate(displayDate)}
                    </td>
                    <td className="py-3 px-4 max-w-[280px]">
                      {j.updateStatus ? (
                        <div
                          className="line-clamp-2 text-[#073766] font-medium bg-[#eaf4fc] px-2.5 py-1 rounded border border-[#073766]/15 leading-tight text-[11.5px]"
                          title={j.updateStatus}
                        >
                          {j.updateStatus}
                        </div>
                      ) : (
                        <span className="text-[#94a3b8] text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right num font-semibold text-[#c9252d] whitespace-nowrap">
                      {j._age} วัน
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#b45309] bg-[#fef3c7] px-2.5 py-0.5 rounded whitespace-nowrap">
                        {j.nextAction || "ติดตามปิดงาน"}
                      </span>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
