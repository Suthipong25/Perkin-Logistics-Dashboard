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
 * E-CUSTOMS PIPELINE DEFINITIONS
 * ขั้นตอนพิธีการศุลกากร 4 ลำดับ
 * ============================================================================ */
const PIPELINE_STEPS = [
  {
    code: "0109",
    name: "ร่างใบขน (0109)",
    desc: "ดูงานที่เอกสารยังไม่ครบ ยังไม่ได้ยิงใบขน",
    activeBg: "bg-[#f56a22] border-[#f56a22] text-white",
    inactiveBorder: "border-[#f56a22]/30 text-[#8a3800] hover:bg-[#fff6f0]",
    badgeInactive: "bg-[#fff1e8] text-[#db5610]",
    dotColor: "bg-[#f56a22]",
  },
  {
    code: "0209",
    name: "ยิงใบขนแล้ว (0209)",
    desc: "ดูงานที่รอเจ้าหน้าที่ศุลกากรตรวจปล่อย",
    activeBg: "bg-[#0284c7] border-[#0284c7] text-white",
    inactiveBorder: "border-[#0284c7]/30 text-[#0369a1] hover:bg-[#f0f9ff]",
    badgeInactive: "bg-[#e0f2fe] text-[#0369a1]",
    dotColor: "bg-[#0284c7]",
  },
  {
    code: "0309",
    name: "ชำระภาษีแล้ว (0309)",
    desc: "งานพร้อมนำสินค้าออกจากท่า",
    activeBg: "bg-[#6366f1] border-[#6366f1] text-white",
    inactiveBorder: "border-[#6366f1]/30 text-[#4338ca] hover:bg-[#eef2ff]",
    badgeInactive: "bg-[#e0e7ff] text-[#4338ca]",
    dotColor: "bg-[#6366f1]",
  },
  {
    code: "0409",
    name: "ตรวจปล่อยสมบูรณ์ (0409)",
    desc: "งานที่พร้อมปิดชุดทำเบิกเงิน",
    activeBg: "bg-[#0d7a5f] border-[#0d7a5f] text-white",
    inactiveBorder: "border-[#0d7a5f]/30 text-[#0d7a5f] hover:bg-[#e6f5f0]",
    badgeInactive: "bg-[#e6f5f0] text-[#0d7a5f]",
    dotColor: "bg-[#0d7a5f]",
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
   * 1.1 CUSTOMS PIPELINE COUNTS (MEMOIZED)
   * คำนวณจำนวนงานในแต่ละขั้นตอนพิธีการศุลกากรตามบริบทเดือนและบริการที่เลือก
   * ========================================================================== */
  const customsCounts = useMemo(() => {
    let baseList = jobs;
    if (monthFilter !== "all") {
      baseList = baseList.filter((j) => getJobMonth(j) === monthFilter);
    }
    if (serviceFilter !== "all") {
      baseList = baseList.filter((j) => j.service === serviceFilter);
    }

    const counts: Record<string, number> = {
      all: baseList.length,
      "0109": 0,
      "0209": 0,
      "0309": 0,
      "0409": 0,
    };

    for (const j of baseList) {
      if (j.customsStatus === "0409") {
        counts["0409"]++;
      } else if (j.customsStatus === "0309") {
        counts["0309"]++;
      } else if (j.customsStatus === "0209") {
        counts["0209"]++;
      } else if (j.customsStatus === "0109") {
        counts["0109"]++;
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

    // 2.3 กรองตามสถานะ
    if (statusFilter !== "all") {
      if (statusFilter === "Control") {
        list = list.filter(
          (j) =>
            (j.statusDetail || "").includes("Control") ||
            j.status === "In Progress"
        );
      } else if (statusFilter === "Waiting") {
        list = list.filter(
          (j) =>
            (j.statusDetail || "").includes("Wait") ||
            (j.statusDetail || "").includes("Booking") ||
            j.status === "Booking"
        );
      } else {
        list = list.filter((j) => j.status === statusFilter);
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
  }, [jobs, monthFilter, serviceFilter, statusFilter, customsFilter, overdueOnly, q]);

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
          <option value="all">ทุกสถานะ</option>
          <option value="Control">กำลังดำเนินการ</option>
          <option value="Waiting">รอเอกสาร</option>
          <option value="Completed">เสร็จสิ้น</option>
          <option value="Cancelled">ยกเลิก</option>
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
       * PIPELINE FILTER BAR: ตัวกรองด่วนตามขั้นตอนพิธีการศุลกากร (e-Customs Pipeline)
       * -------------------------------------------------------------------- */}
      <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#dce2e8] flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[#073766] flex items-center gap-1.5 mr-1 select-none">
          <Layers className="w-3.5 h-3.5 text-[#073766]" />
          <span>ขั้นตอนใบขน (e-Customs Pipeline):</span>
        </span>

        {/* ปุ่ม ทั้งหมด */}
        <button
          onClick={() => {
            setCustomsFilter("all");
            setPageNum(1);
          }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-[background-color,border-color,color,box-shadow] duration-150 ease-out text-xs font-medium cursor-pointer ${
            customsFilter === "all"
              ? "bg-[#071a2f] border-[#071a2f] text-white shadow-sm font-semibold"
              : "bg-white border-[#dce2e8] text-[#526275] hover:bg-slate-100 hover:text-[#102238]"
          }`}
        >
          <span>ทั้งหมด</span>
          <span
            className={`px-1.5 py-0.2 text-[11px] rounded-full font-mono font-semibold ${
              customsFilter === "all"
                ? "bg-white/20 text-white"
                : "bg-slate-100 text-[#526275]"
            }`}
          >
            {fmtNum(customsCounts.all)}
          </span>
        </button>

        {PIPELINE_STEPS.map((step) => {
          const isActive = customsFilter === step.code;
          const count = customsCounts[step.code] || 0;
          return (
            <React.Fragment key={step.code}>
              <span className="text-[#94a3b8] font-bold select-none hidden sm:inline">
                →
              </span>
              <button
                onClick={() => {
                  setCustomsFilter(isActive ? "all" : step.code);
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

        {/* แสดงคำอธิบายของขั้นตอนที่เลือกอยู่ */}
        {customsFilter !== "all" && (
          <span className="ml-auto text-[11.5px] text-[#073766] font-medium bg-[#eaf4fc] px-2.5 py-1 rounded-md border border-[#073766]/15 hidden md:inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#073766]" />
            {customsFilter === "0109" && "ร่างใบขน (0109): ดูงานที่เอกสารยังไม่ครบ ยังไม่ได้ยิงใบขน"}
            {customsFilter === "0209" && "ยิงใบขนแล้ว (0209): ดูงานที่รอเจ้าหน้าที่ศุลกากรตรวจปล่อย"}
            {customsFilter === "0309" && "ชำระภาษีแล้ว (0309): งานพร้อมนำสินค้าออกจากท่า"}
            {customsFilter === "0409" && "ตรวจปล่อยสมบูรณ์ (0409): งานที่พร้อมปิดชุดทำเบิกเงิน"}
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
              <th className="py-3 px-4">ผู้นำเข้า / ส่งออก (Importer / Customer)</th>
              <th className="py-3 px-3">เลขที่ใบขน (Declaration)</th>
              <th className="py-3 px-3">Invoice No</th>
              <th className="py-3 px-3">ETD / Submit</th>
              <th className="py-3 px-3">สายเรือ / ตู้ / เส้นทาง</th>
              <th className="py-3 px-3">CS</th>
              <th className="py-3 px-3 min-w-[200px]">Update Status</th>
              <th className="py-3 px-3">สถานะ</th>
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
                      <div className="font-semibold text-slate-900 truncate">
                        {mainTrader}
                      </div>
                      {showSubCust && (
                        <div className="text-[11.5px] text-[#6e7e91] truncate">
                          Agent: {j.customer}
                        </div>
                      )}
                    </td>

                    {/* Declaration No & Customs Status (0109-0409) */}
                    <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                      {j.declarationNo ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#102238]">
                              {j.declarationNo}
                            </span>
                            {j.customsStatus && (
                              <span
                                className={`text-[10.5px] px-1.5 py-0.5 rounded font-semibold ${
                                  j.customsStatus === "0409"
                                    ? "bg-[#e6f5f0] text-[#0d7a5f]"
                                    : j.customsStatus === "0309"
                                    ? "bg-[#e0e7ff] text-[#4338ca]"
                                    : j.customsStatus === "0209"
                                    ? "bg-[#e0f2fe] text-[#0369a1]"
                                    : "bg-[#fff1e8] text-[#db5610]"
                                }`}
                              >
                                {j.customsStatus}
                              </span>
                            )}
                          </div>
                          {j.referenceNo && (
                            <div className="text-[11px] text-[#6e7e91]">
                              Ref: {j.referenceNo}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-xs font-mono">— รอยิงใบขน</span>
                          {j.customsStatus && (
                            <span
                              className={`text-[10.5px] px-1.5 py-0.5 rounded font-semibold ${
                                j.customsStatus === "0409"
                                  ? "bg-[#e6f5f0] text-[#0d7a5f]"
                                  : j.customsStatus === "0309"
                                  ? "bg-[#e0e7ff] text-[#4338ca]"
                                  : j.customsStatus === "0209"
                                  ? "bg-[#e0f2fe] text-[#0369a1]"
                                  : "bg-[#fff1e8] text-[#db5610]"
                              }`}
                            >
                              {j.customsStatus}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Invoice No */}
                    <td className="py-3 px-3 font-mono text-xs text-[#102238] max-w-[150px] truncate">
                      {j.invoiceNo || <span className="text-slate-300 font-mono">—</span>}
                    </td>

                    {/* ETD & Clear Date */}
                    <td className="py-3 px-3 num text-[#102238] whitespace-nowrap">
                      <div>{fmtDate(j.etd)}</div>
                      {j.clearDate && (
                        <div className="text-[11px] text-[#0d7a5f] font-mono">
                          ปล่อย: {fmtDate(j.clearDate)}
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

                    {/* Status Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-0.5 rounded border whitespace-nowrap ${st.badge}`}
                      >
                        <i className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                        {st.label}
                      </span>
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
