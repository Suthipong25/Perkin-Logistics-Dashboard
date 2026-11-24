"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — JOBS TABLE COMPONENT
 * ============================================================================
 * ตารางแสดงรายการงานทั้งหมด (All Shipments Data Table)
 * 
 * ความสามารถหลัก:
 * 1. แถบค้นหาข้อความ (Full-text Search): ค้นหา Job No, ลูกค้า, B/L, MBL/HBL, 
 *    Invoice, หมายเหตุ, CS, และข้อความ Update Status
 * 2. ตัวกรองกลุ่มบริการ (Service Filter): ทั้งหมด, SEA-IMP, AIR-IMP, SEA-EXP, AIR-EXP, FRT
 * 3. ตัวกรองเดือน (Month Filter): ดูงานเฉพาะเดือนตาม ETD
 * 4. ตัวกรองสถานะ (Status Filter): กำลังดำเนินการ, รอเอกสาร, เสร็จสิ้น, ยกเลิก
 * 5. ช่องเลือกกรองงานค้างเกินกำหนด (Overdue Only Checkbox)
 * 6. ตารางแสดงผลที่ละเอียด รองรับการคลิกแถวเพื่อเปิด JobDrawer ตรวจสอบ/แก้ไข
 * 7. ระบบแบ่งหน้า (Client-side Pagination) ครั้งละ 25 รายการ
 * ============================================================================
 */

import React, { useState, useMemo } from "react";
import { JobRecord } from "@/types/dashboard";
import {
  SERVICES,
  MONTH_FILTER_OPTIONS,
  fmtNum,
  fmtDate,
  serviceMeta,
  statusMeta,
  getJobMonth,
  daysOpen,
  isOpen,
} from "@/lib/dashboard-helpers";
import { Search, Layers } from "lucide-react";

/* ============================================================================
 * PROPS INTERFACE
 * ============================================================================ */
export interface JobsTableProps {
  /** รายการงานทั้งหมดจาก SharePoint */
  jobs: JobRecord[];
  /** ตัวกรองเดือนปัจจุบัน */
  monthFilter: string;
  /** ฟังก์ชันเปลี่ยนตัวกรองเดือน */
  setMonthFilter: (m: string) => void;
  /** ฟังก์ชันเมื่อคลิกเลือกงานเพื่อเปิด Drawer */
  onSelectJobNo: (jobNo: string) => void;
  /** ตัวเลือกเปิดการกรองเฉพาะงานเกินกำหนดตั้งแต่เริ่มต้น */
  initialOverdueOnly?: boolean;
  /** ตัวกรองขั้นตอนศุลกากรเริ่มต้น ("all" | "0109" | "0209" | "0309" | "0409") */
  initialCustomsFilter?: string;
  /** รหัสงานที่เพิ่งได้รับการแก้ไขหรืออัปเดต (เพื่อแสดง Flash Highlight) */
  highlightedJobNo?: string | null;
}

/* ============================================================================
 * FWD SYSTEM STATUS DEFINITIONS
 * สถานะงานชิปเมนท์หลักตามระบบ FWD System
 * ============================================================================ */
const FWD_STATUS_STEPS = [
  {
    code: "Booking",
    name: "Job Booking Request",
    desc: "งานที่อยู่ระหว่างคำขอเปิดงาน / จองระวางเรือ-เครื่องบิน",
    activeBg: "bg-[#8b5cf6] border-[#8b5cf6] text-white",
    inactiveBorder: "border-[#8b5cf6]/30 text-[#6d28d9] hover:bg-[#f5f3ff]",
    badgeInactive: "bg-[#ede9fe] text-[#6d28d9]",
    dotColor: "bg-[#8b5cf6]",
  },
  {
    code: "Control",
    name: "Job Control",
    desc: "กำลังดำเนินการ",
    activeBg: "bg-[#0284c7] border-[#0284c7] text-white",
    inactiveBorder: "border-[#0284c7]/30 text-[#0369a1] hover:bg-[#f0f9ff]",
    badgeInactive: "bg-[#e0f2fe] text-[#0369a1]",
    dotColor: "bg-[#0284c7]",
  },
  {
    code: "Waiting",
    name: "Job Waiting",
    desc: "รอเอกสารปล่อยสินค้า / ตรวจปล่อย รอเตรียมเอกสารวางบิล",
    activeBg: "bg-[#f56a22] border-[#f56a22] text-white",
    inactiveBorder: "border-[#f56a22]/30 text-[#c2410c] hover:bg-[#fff7ed]",
    badgeInactive: "bg-[#fff1e8] text-[#c2410c]",
    dotColor: "bg-[#f56a22]",
  },
  {
    code: "Completed",
    name: "Job Complete",
    desc: "งานที่ปิดงานและจัดส่งสมบูรณ์เรียบร้อย",
    activeBg: "bg-[#0d7a5f] border-[#0d7a5f] text-white",
    inactiveBorder: "border-[#0d7a5f]/30 text-[#0d7a5f] hover:bg-[#e6f5f0]",
    badgeInactive: "bg-[#e6f5f0] text-[#0d7a5f]",
    dotColor: "bg-[#0d7a5f]",
  },
  {
    code: "Cancelled",
    name: "Job Cancelled",
    desc: "งานที่ถูกยกเลิก",
    activeBg: "bg-[#64748b] border-[#64748b] text-white",
    inactiveBorder: "border-[#64748b]/30 text-[#475569] hover:bg-slate-100",
    badgeInactive: "bg-slate-100 text-[#475569]",
    dotColor: "bg-[#64748b]",
  },
];

export default function JobsTable({
  jobs,
  monthFilter,
  setMonthFilter,
  onSelectJobNo,
  initialOverdueOnly = false,
  initialCustomsFilter = "all",
  highlightedJobNo = null,
}: JobsTableProps) {
  /* ==========================================================================
   * 1. LOCAL FILTER STATE
   * ========================================================================== */
  // คำค้นหาในตาราง
  const [q, setQ] = useState("");
  // กรองตามบริการ ("all" หรือชื่อบริการ)
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  // กรองตามผู้นำเข้า / ส่งออก ("all" หรือชื่อบริษัท)
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  // กรองตามสถานะ ("all", "Control", "Waiting", "Completed", "Cancelled")
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // กรองตามขั้นตอนพิธีการศุลกากร ("all", "0109", "0209", "0309", "0409")
  const [customsFilter, setCustomsFilter] = useState<string>(initialCustomsFilter);
  // เฉพาะงานที่เลยกำหนด ETD หรือไม่
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);
  // หน้าปัจจุบัน
  const [pageNum, setPageNum] = useState(1);
  const pageSize = 25;

  /* ==========================================================================
   * 1.0 CUSTOMER / IMPORTER OPTIONS (MEMOIZED)
   * รายชื่อผู้นำเข้า / ส่งออกตามบริบทเดือนและบริการที่เลือก
   * ========================================================================== */
  const customerOptions = useMemo(() => {
    let baseList = jobs;
    if (monthFilter !== "all") {
      baseList = baseList.filter((j) => getJobMonth(j) === monthFilter);
    }
    if (serviceFilter !== "all") {
      baseList = baseList.filter((j) => j.service === serviceFilter);
    }
    const map = new Map<string, number>();
    for (const j of baseList) {
      const c = (j.consignee || j.customer || "").trim();
      if (c) {
        map.set(c, (map.get(c) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [jobs, monthFilter, serviceFilter]);

  /* ==========================================================================
   * 1.1 FWD SYSTEM STATUS COUNTS (MEMOIZED)
   * คำนวณจำนวนงานในแต่ละสถานะ FWD System ตามบริบทเดือน บริการ และลูกค้าที่เลือก
   * Flow: Job Booking Request > Job Control > Job Waiting > Job Complete
   * ========================================================================== */
  const fwdCounts = useMemo(() => {
    let baseList = jobs;
    if (monthFilter !== "all") {
      baseList = baseList.filter((j) => getJobMonth(j) === monthFilter);
    }
    if (serviceFilter !== "all") {
      baseList = baseList.filter((j) => j.service === serviceFilter);
    }
    if (customerFilter !== "all") {
      const target = customerFilter.trim().toLowerCase();
      baseList = baseList.filter((j) => {
        const c1 = (j.consignee || "").trim().toLowerCase();
        const c2 = (j.customer || "").trim().toLowerCase();
        return c1 === target || c2 === target;
      });
    }

    const counts: Record<string, number> = {
      all: baseList.length,
      Booking: 0,
      Control: 0,
      Waiting: 0,
      Completed: 0,
      Cancelled: 0,
    };

    for (const j of baseList) {
      if (j.status === "Completed") {
        counts.Completed++;
      } else if (j.status === "Cancelled") {
        counts.Cancelled++;
      } else if (
        (j.statusDetail || "").includes("Booking") ||
        (j.statusDetail || "").includes("Request") ||
        j.status === "Booking"
      ) {
        counts.Booking++;
      } else if (
        (j.statusDetail || "").includes("Wait") ||
        j.statusDetail === "Job Waiting"
      ) {
        counts.Waiting++;
      } else {
        counts.Control++;
      }
    }
    return counts;
  }, [jobs, monthFilter, serviceFilter]);

  /* ==========================================================================
   * 2. FILTERED & SORTED JOBS (MEMOIZED)
   * คำนวณรายการงานที่ผ่านการกรองและเรียงลำดับความสำคัญ
   * ========================================================================== */
  const filteredJobs = useMemo(() => {
    let list = [...jobs];

    // 2.1 กรองตามเดือน
    if (monthFilter !== "all") {
      list = list.filter((j) => getJobMonth(j) === monthFilter);
    }

    // 2.2 กรองตามกลุ่มบริการ
    if (serviceFilter !== "all") {
      list = list.filter((j) => j.service === serviceFilter);
    }

    // 2.2.1 กรองตามผู้นำเข้า / ส่งออก (Importer / Customer)
    if (customerFilter !== "all") {
      const target = customerFilter.trim().toLowerCase();
      list = list.filter((j) => {
        const c1 = (j.consignee || "").trim().toLowerCase();
        const c2 = (j.customer || "").trim().toLowerCase();
        return c1 === target || c2 === target;
      });
    }

    // 2.3 กรองตามสถานะ (Job Booking Request > Job Control > Job Waiting > Job Complete)
    if (statusFilter !== "all") {
      if (statusFilter === "Booking") {
        list = list.filter(
          (j) =>
            (j.statusDetail || "").includes("Booking") ||
            (j.statusDetail || "").includes("Request") ||
            j.status === "Booking"
        );
      } else if (statusFilter === "Control") {
        list = list.filter(
          (j) =>
            (j.statusDetail || "").includes("Control") ||
            (j.status === "In Progress" &&
              !(j.statusDetail || "").includes("Wait") &&
              !(j.statusDetail || "").includes("Booking") &&
              !(j.statusDetail || "").includes("Request"))
        );
      } else if (statusFilter === "Waiting") {
        list = list.filter(
          (j) =>
            (j.statusDetail || "").includes("Wait") ||
            j.statusDetail === "Job Waiting"
        );
      } else if (statusFilter === "Completed") {
        list = list.filter((j) => j.status === "Completed");
      } else if (statusFilter === "Cancelled") {
        list = list.filter((j) => j.status === "Cancelled");
      } else {
        list = list.filter(
          (j) => j.status === statusFilter || j.statusDetail === statusFilter
        );
      }
    }

    // 2.4 กรองตามขั้นตอนพิธีการศุลกากร (e-Customs Pipeline)
    if (customsFilter !== "all") {
      list = list.filter((j) => j.customsStatus === customsFilter);
    }

    // 2.5 กรองเฉพาะงานที่เลยกำหนด ETD
    if (overdueOnly) {
      list = list.filter((j) => {
        const a = daysOpen(j);
        return isOpen(j) && a !== null && a > 0;
      });
    }

    // 2.6 กรองค้นหาข้อความ
    if (q.trim()) {
      const low = q.toLowerCase();
      list = list.filter((j) =>
        [
          j.jobNo,
          j.joinNo,
          j.customer,
          j.consignee,
          j.bl,
          j.mbl,
          j.hbl,
          j.declarationNo,
          j.referenceNo,
          j.invoiceNo,
          j.commodity,
          j.csName,
          j.carrier,
          j.vessel,
          j.feeder,
          j.flightNo,
          j.linerBooking,
          j.pol,
          j.pod,
          j.terminal,
          j.shed,
          j.depoPort,
          j.placeOfDelivery,
          j.updateStatus,
        ].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(low)
        )
      );
    }

    // 2.7 เรียงลำดับ: งานที่ยังทำอยู่ขึ้นก่อน (In Progress -> Booking -> Completed -> Cancelled)
    // ตามด้วยเรียงวันที่ ETD ล่าสุดลงมา
    const prio: Record<string, number> = {
      "In Progress": 0,
      Booking: 1,
      Completed: 2,
      Cancelled: 3,
    };
    list.sort((a, b) => {
      const p = (prio[a.status] ?? 9) - (prio[b.status] ?? 9);
      if (p !== 0) return p;
      return String(b.etd || "").localeCompare(String(a.etd || ""));
    });

    return list;
  }, [jobs, monthFilter, serviceFilter, customerFilter, statusFilter, customsFilter, overdueOnly, q]);

  // คำนวณจำนวนหน้าทั้งหมด
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));

  /* ==========================================================================
   * 3. RENDER UI
   * ========================================================================== */
  return (
    <section className="bg-white rounded-[12px] border border-[#dce2e8] overflow-hidden shadow-xs">
      {/* --------------------------------------------------------------------
       * TOOLBAR: ค้นหา, กรองบริการ, กรองเดือน, กรองสถานะ, และกรองงานเกินกำหนด
       * -------------------------------------------------------------------- */}
      <div className="p-4 border-b border-[#dce2e8] flex flex-wrap items-center gap-3">
        {/* ช่องค้นหาด่วน */}
        <div className="relative w-full sm:w-[280px]">
          <Search className="w-4 h-4 text-[#6e7e91] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="ค้นหาตาม Job No, ลูกค้า หรือ B/L"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPageNum(1);
            }}
            placeholder="ค้นหา Job No, ลูกค้า, B/L…"
            className="w-full h-9 pl-9 pr-3 rounded-[6px] border border-[#c5cfd9] text-[13.5px] outline-none focus:border-[#f56a22]"
          />
        </div>

        {/* ปุ่มเลือกกลุ่มบริการ (Segmented Buttons) */}
        <div className="inline-flex rounded-[6px] border border-[#c5cfd9] overflow-hidden text-[12.5px] font-medium">
          <button
            onClick={() => {
              setServiceFilter("all");
              setPageNum(1);
            }}
            className={`px-3 h-9 ${
              serviceFilter === "all"
                ? "bg-[#071a2f] text-white"
                : "bg-white text-[#526275] hover:bg-slate-50"
            }`}
          >
            ทั้งหมด
          </button>
          {SERVICES.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setServiceFilter(s.key);
                setPageNum(1);
              }}
              className={`px-3 h-9 border-l border-[#dce2e8] font-mono text-xs ${
                serviceFilter === s.key
                  ? "bg-[#071a2f] text-white"
                  : "bg-white text-[#526275] hover:bg-slate-50"
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>

        {/* ดรอปดาวน์เลือกเดือน */}
        <select
          value={monthFilter}
          onChange={(e) => {
            setMonthFilter(e.target.value);
            setPageNum(1);
          }}
          aria-label="กรองตามเดือน"
          className="h-9 px-3 rounded-[6px] border border-[#c5cfd9] bg-white text-[13px] text-[#073766] font-semibold"
        >
          {MONTH_FILTER_OPTIONS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>

        {/* ดรอปดาวน์กรองผู้นำเข้า / ส่งออก */}
        <div className="relative">
          <select
            value={customerFilter}
            onChange={(e) => {
              setCustomerFilter(e.target.value);
              setPageNum(1);
            }}
            aria-label="กรองตามผู้นำเข้า / ส่งออก"
            className={`h-9 px-3 max-w-[260px] rounded-lg border text-xs font-medium outline-none truncate transition-colors cursor-pointer ${
              customerFilter !== "all"
                ? "border-[#0284c7] bg-[#f0f9ff] text-[#0369a1] font-semibold ring-1 ring-[#0284c7]"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 focus:border-[#073766]"
            }`}
          >
            <option value="all">
              🏢 ผู้นำเข้า/ส่งออกทั้งหมด ({customerOptions.length})
            </option>
            {customerOptions.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>

        {/* ป้ายแสดงสถานะตัวกรองผู้นำเข้า/ส่งออก พร้อมปุ่มล้าง */}
        {customerFilter !== "all" && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#e0f2fe] border border-[#bae6fd] text-xs font-semibold text-[#0369a1]">
            <span className="truncate max-w-[160px]" title={customerFilter}>
              {customerFilter}
            </span>
            <button
              type="button"
              onClick={() => {
                setCustomerFilter("all");
                setPageNum(1);
              }}
              title="ยกเลิกตัวกรองผู้นำเข้า/ส่งออก"
              className="w-4 h-4 rounded-full hover:bg-[#bae6fd] flex items-center justify-center text-[#0369a1] text-xs font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* ดรอปดาวน์กรองสถานะ */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPageNum(1);
          }}
          aria-label="กรองตามสถานะ"
          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:border-[#f56a22] focus:ring-1 focus:ring-[#f56a22] outline-none"
        >
          <option value="all">ทุกสถานะ (All)</option>
          <option value="Booking">Job Booking Request</option>
          <option value="Control">Job Control</option>
          <option value="Waiting">Job Waiting</option>
          <option value="Completed">Job Complete</option>
          <option value="Cancelled">Job Cancelled</option>
        </select>

        {/* ตัวเลือกเฉพาะงานเกินกำหนด ETD */}
        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 cursor-pointer select-none hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPageNum(1);
            }}
            className="w-3.5 h-3.5 accent-[#f56a22] rounded cursor-pointer"
          />
          <span>เฉพาะเกินกำหนด</span>
        </label>

        {/* จำนวนงานที่พบ */}
        <span className="ml-auto text-xs font-medium text-slate-500">
          พบ <strong className="text-slate-900 num font-bold">{fmtNum(filteredJobs.length)}</strong> งาน
        </span>
      </div>

      {/* --------------------------------------------------------------------
       * FWD SYSTEM STATUS FILTER BAR: ตัวกรองด่วนตามสถานะ FWD System
       * Flow: Job Booking Request > Job Control > Job Waiting > Job Complete
       * -------------------------------------------------------------------- */}
      <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#dce2e8] flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[#073766] flex items-center gap-1.5 mr-1 select-none">
          <Layers className="w-3.5 h-3.5 text-[#073766]" />
          <span>สถานะ FWD System:</span>
        </span>

        {/* ปุ่ม ทั้งหมด */}
        <button
          onClick={() => {
            setStatusFilter("all");
            setPageNum(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-[background-color,border-color,color,box-shadow] duration-150 ease-out text-xs font-medium cursor-pointer ${
            statusFilter === "all"
              ? "bg-[#071a2f] border-[#071a2f] text-white shadow-sm font-semibold"
              : "bg-white border-[#dce2e8] text-[#526275] hover:bg-slate-100 hover:text-[#102238]"
          }`}
        >
          <span>ทั้งหมด</span>
          <span
            className={`px-1.5 py-0.2 text-[11px] rounded-full font-mono font-semibold ${
              statusFilter === "all"
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-[#526275]"
            }`}
          >
            {fmtNum(fwdCounts.all)}
          </span>
        </button>

        {FWD_STATUS_STEPS.map((step, idx) => {
          const isActive = statusFilter === step.code;
          const count = fwdCounts[step.code] || 0;
          return (
            <React.Fragment key={step.code}>
              {idx > 0 && idx < 4 && (
                <span className="text-[#94a3b8] font-bold select-none text-xs hidden sm:inline px-0.5">
                  &gt;
                </span>
              )}
              {idx === 4 && (
                <span className="text-[#cbd5e1] select-none mx-1 hidden sm:inline">|</span>
              )}
              <button
                onClick={() => {
                  setStatusFilter(isActive ? "all" : step.code);
                  setPageNum(1);
                }}
                title={`${step.desc} (คลิกเพื่อกรอง / คลิกซ้ำเพื่อยกเลิก)`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-[background-color,border-color,color,box-shadow] duration-150 ease-out text-xs font-medium cursor-pointer ${
                  isActive
                    ? `${step.activeBg} shadow-sm font-semibold`
                    : `bg-white ${step.inactiveBorder}`
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive ? "bg-white" : step.dotColor
                  }`}
                />
                <span>{step.name}</span>
                <span
                  className={`px-1.5 py-0.2 text-[11px] rounded-full font-mono font-semibold ${
                    isActive ? "bg-white/25 text-white" : step.badgeInactive
                  }`}
                >
                  {fmtNum(count)}
                </span>
              </button>
            </React.Fragment>
          );
        })}

        {/* แสดงคำอธิบายของสถานะที่เลือกอยู่ */}
        {statusFilter !== "all" && (
          <span className="ml-auto text-[11.5px] text-[#073766] font-medium bg-[#eaf4fc] px-2.5 py-1 rounded-md border border-[#073766]/15 hidden md:inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#073766]" />
            {statusFilter === "Booking" && "Job Booking Request: คำขอเปิดงาน / จองระวางเรือ-เครื่องบิน"}
            {statusFilter === "Control" && "Job Control: อยู่ระหว่างควบคุมและดำเนินงานขนส่ง"}
            {statusFilter === "Waiting" && "Job Waiting: รอเอกสาร / รอตรวจสอบ / รอปล่อยสินค้า"}
            {statusFilter === "Completed" && "Job Complete: ปิดงานและจัดส่งสมบูรณ์เรียบร้อย"}
            {statusFilter === "Cancelled" && "Job Cancelled: งานที่ถูกยกเลิก"}
          </span>
        )}
      </div>

      {/* --------------------------------------------------------------------
       * TABLE VIEW: แสดงข้อมูลชิปเมนท์อย่างละเอียด
       * -------------------------------------------------------------------- */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[980px]">
          <thead>
            <tr className="bg-[#f0f4f8] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap">
              <th className="py-3 px-4">Job No</th>
              <th className="py-3 px-3">บริการ</th>
              <th className="py-3 px-4">
                <div className="flex items-center gap-1.5">
                  <span>ผู้นำเข้า / ส่งออก (Importer / Customer)</span>
                  {customerFilter !== "all" && (
                    <span
                      className="px-1.5 py-0.2 rounded bg-[#0369a1] text-white text-[10px] font-mono font-bold"
                      title={`กำลังกรองเฉพาะ: ${customerFilter}`}
                    >
                      กรองอยู่
                    </span>
                  )}
                </div>
              </th>
              <th className="py-3 px-3">สถานะ</th>
              <th className="py-3 px-3">B/L No. (MBL / HBL)</th>
              <th className="py-3 px-3">Invoice No</th>
              <th className="py-3 px-3">ETD / ETA</th>
              <th className="py-3 px-3">สายเรือ / ตู้ / เส้นทาง</th>
              <th className="py-3 px-3">CS</th>
              <th className="py-3 px-3 min-w-[200px]">Update Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[13px] tabular-nums">
            {filteredJobs
              .slice((pageNum - 1) * pageSize, pageNum * pageSize)
              .map((j) => {
                const sm = serviceMeta(j.service);
                const st = statusMeta(j);
                const mainTrader = j.consignee || j.customer || "—";
                const showSubCust =
                  j.customer && j.consignee && j.customer !== j.consignee;
                const isHighlighted = highlightedJobNo === j.jobNo;

                return (
                  <tr
                    key={`${j.service}-${j.jobNo}-${j.sourceRow}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`เปิดรายละเอียดงาน ${j.jobNo}`}
                    onClick={() => onSelectJobNo(j.jobNo)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectJobNo(j.jobNo);
                      }
                    }}
                    className={`cursor-pointer transition-[background-color] duration-150 focus-visible:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#073766] ${
                      isHighlighted
                        ? "animate-row-flash"
                        : "hover:bg-slate-50/90"
                    }`}
                  >
                    {/* Job No & Join No */}
                    <td className="py-3 px-4 font-mono font-bold text-[#073766] whitespace-nowrap">
                      <div>{j.jobNo}</div>
                      {j.joinNo && (
                        <div className="text-[10.5px] font-normal text-slate-400 font-mono">
                          Join: {j.joinNo}
                        </div>
                      )}
                    </td>

                    {/* Service Code Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-block font-mono text-[11px] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-100 text-slate-800 font-semibold whitespace-nowrap">
                        {sm.code}
                      </span>
                    </td>

                    {/* Trader / Customer */}
                    <td className="py-3 px-4 max-w-[260px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomerFilter(
                            mainTrader === customerFilter ? "all" : mainTrader
                          );
                          setPageNum(1);
                        }}
                        title={`คลิกเพื่อกรองเฉพาะ: ${mainTrader}`}
                        className={`font-semibold truncate block text-left transition-colors cursor-pointer w-full ${
                          customerFilter === mainTrader
                            ? "text-[#0284c7] underline decoration-[#0284c7] decoration-2"
                            : "text-slate-900 hover:text-[#0284c7] hover:underline"
                        }`}
                      >
                        {mainTrader}
                      </button>
                      {showSubCust && (
                        <div className="text-[11.5px] text-[#6e7e91] truncate">
                          Agent: {j.customer}
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-0.5 rounded border whitespace-nowrap ${st.badge}`}
                      >
                        <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>

                    {/* B/L No (MBL / HBL) */}
                    <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                      {j.mbl || j.hbl || j.bl ? (
                        <div>
                          <div className="font-semibold text-[#102238]">
                            {j.mbl || j.bl}
                          </div>
                          {j.hbl && j.mbl && j.hbl !== j.mbl && (
                            <div className="text-[10.5px] text-[#6e7e91] font-mono">
                              HBL: {j.hbl}
                            </div>
                          )}
                          {j.declarationNo && (
                            <div className="text-[10px] text-[#0d7a5f] font-mono">
                              ใบขน: {j.declarationNo}
                            </div>
                          )}
                        </div>
                      ) : j.declarationNo ? (
                        <div className="font-semibold text-[#102238]">
                          {j.declarationNo}
                        </div>
                      ) : (
                        <span className="text-slate-300 font-mono">—</span>
                      )}
                    </td>

                    {/* Invoice No */}
                    <td className="py-3 px-3 font-mono text-xs text-[#102238] max-w-[150px] truncate">
                      {j.invoiceNo || <span className="text-slate-300 font-mono">—</span>}
                    </td>

                    {/* ETD & ETA */}
                    <td className="py-3 px-3 num text-[#102238] whitespace-nowrap">
                      <div>ETD: {fmtDate(j.etd)}</div>
                      {j.eta && (
                        <div className="text-[11px] text-[#5288b6] font-mono">
                          ETA: {fmtDate(j.eta)}
                        </div>
                      )}
                    </td>

                    {/* Carrier, Vessel, Container & Route */}
                    <td className="py-2.5 px-3 font-mono text-xs text-[#526275] max-w-[210px]">
                      <div className="font-semibold text-[#102238] truncate">{j.containerType || "—"}</div>
                      {j.carrier && (
                        <div className="text-[11px] font-semibold text-[#073766] truncate mt-0.5 flex items-center gap-1" title={j.carrier}>
                          <span>{j.service?.includes("AIR") ? "✈️" : "🚢"}</span>
                          <span className="truncate">{j.carrier}</span>
                        </div>
                      )}
                      {(j.vessel || j.flightNo) && (
                        <div className="text-[10.5px] text-[#6e7e91] truncate font-normal" title={j.vessel || j.flightNo}>
                          {j.vessel || j.flightNo} {j.flightTime ? `(${j.flightTime})` : ""}
                        </div>
                      )}
                      {(j.pol || j.pod) && (
                        <div className="text-[10px] text-[#8a3800] truncate font-medium mt-0.5" title={`${j.pol || ''} → ${j.pod || ''}`}>
                          {j.pol ? j.pol.split(',')[0].trim() : ''}{j.pol && j.pod ? ' → ' : ''}{j.pod ? j.pod.split(',')[0].trim() : ''}
                        </div>
                      )}
                    </td>

                    {/* CS In-charge */}
                    <td className="py-3 px-3 font-mono text-xs font-semibold text-[#073766] whitespace-nowrap">
                      {j.csName || "—"}
                    </td>

                    {/* Update Status Banner Text */}
                    <td className="py-3 px-3 text-[12px] max-w-[240px]">
                      {j.updateStatus ? (
                        <div
                          className="line-clamp-2 text-[#073766] font-medium bg-[#eaf4fc] px-2 py-1 rounded border border-[#073766]/15 leading-tight text-[11.5px]"
                          title={j.updateStatus}
                        >
                          {j.updateStatus}
                        </div>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------------------
       * PAGINATION TOOLBAR: สลับหน้าข้อมูล
       * -------------------------------------------------------------------- */}
      <div className="px-4 py-3 border-t border-[#dce2e8] flex items-center justify-between text-[13px] text-[#526275]">
        <span>
          หน้า <b className="text-[#102238]">{pageNum}</b> จาก {totalPages}
        </span>
        <div className="flex gap-1.5">
          <button
            disabled={pageNum <= 1}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded border border-[#c5cfd9] disabled:opacity-40 hover:bg-slate-50"
          >
            ก่อนหน้า
          </button>
          <button
            disabled={pageNum >= totalPages}
            onClick={() => setPageNum((p) => p + 1)}
            className="px-3 py-1 rounded border border-[#c5cfd9] disabled:opacity-40 hover:bg-slate-50"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </section>
  );
}
