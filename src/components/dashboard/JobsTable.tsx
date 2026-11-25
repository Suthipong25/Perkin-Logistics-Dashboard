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

import React, { useState, useMemo, useRef, useEffect } from "react";
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
  classifyJob,
} from "@/lib/dashboard-helpers";
import { Search, Layers, Plane, Ship, X, ChevronDown, Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

/**
 * ลำดับกลุ่มหมวดงานตามที่ผู้ใช้งานกำหนด: SHAI -> SHSE -> SHSI -> SHAE -> อื่นๆ
 * (รองรับรหัสย่อ AI, SE, SI, AE ให้จัดเข้าหมวดเดียวกัน)
 */
const PREFIX_ORDER: Record<string, number> = {
  SHAI: 1,
  AI: 1,
  SHSE: 2,
  SE: 2,
  SHSI: 3,
  SI: 3,
  SHAE: 4,
  AE: 4,
  SHT: 5,
  TS: 5,
};

/**
 * แยกองค์ประกอบรหัสงาน เช่น "SHAI26010001" -> { prefixRank: 1, prefix: "SHAI", year: 26, month: 1, seq: 1 }
 */
function parseJobNo(jobNo: string | undefined) {
  const raw = String(jobNo || "").trim().toUpperCase();
  const m = raw.match(/^([A-Z]+)(\d{2})(\d{2})(\d+)$/);
  if (!m) {
    return { prefixRank: 99, prefix: raw, year: 99, month: 99, seq: 999999 };
  }
  const prefix = m[1];
  return {
    prefixRank: PREFIX_ORDER[prefix] ?? 90,
    prefix,
    year: parseInt(m[2], 10),
    month: parseInt(m[3], 10),
    seq: parseInt(m[4], 10),
  };
}

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
  // กรองตามเดือนแบบ Checklist (เลือกได้หลายเดือน; ว่าง = ทุกเดือน)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() =>
    monthFilter && monthFilter !== "all" ? [monthFilter] : []
  );
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  // กรองตามผู้นำเข้า / ส่งออก (รองรับการเลือกหลายบริษัทแบบ Checklist; ว่าง = ทั้งหมด)
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // ซิงค์เฉพาะเมื่อผู้ใช้เปลี่ยนเดือนจากแถบด้านบนของหน้า Overview
  useEffect(() => {
    setSelectedMonths(monthFilter && monthFilter !== "all" ? [monthFilter] : []);
  }, [monthFilter]);

  // ปิดเมนู Checklist เมื่อคลิกด้านนอกหรือกดปุ่ม Escape (รวมศูนย์ใน Effect เดียว)
  useEffect(() => {
    if (!monthDropdownOpen && !customerDropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(target)) {
        setMonthDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(target)) {
        setCustomerDropdownOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMonthDropdownOpen(false);
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [monthDropdownOpen, customerDropdownOpen]);

  const toggleMonth = (key: string) => {
    setSelectedMonths((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
    setPageNum(1);
  };

  const toggleCustomer = (name: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
    setPageNum(1);
  };
  // กรองตามสถานะ ("all", "Control", "Waiting", "Completed", "Cancelled")
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // กรองตามขั้นตอนพิธีการศุลกากร ("all", "0109", "0209", "0309", "0409")
  const [customsFilter, setCustomsFilter] = useState<string>(initialCustomsFilter);
  // เฉพาะงานที่เลยกำหนด ETD หรือไม่
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);
  // ทิศทางการเรียงลำดับเดือนและเลขลำดับงาน ("asc" = เดือน 1->12, ลำดับ 0001->9999 | "desc" = ใหม่สุดขึ้นก่อน)
  const [jobSortDir, setJobSortDir] = useState<"asc" | "desc">("asc");
  // หน้าปัจจุบัน
  const [pageNum, setPageNum] = useState(1);
  const pageSize = 25;

  /* ==========================================================================
   * 0.9 MONTH OPTIONS WITH COUNTS (MEMOIZED)
   * รายการเดือนพร้อมจำนวนงานตามบริการที่เลือก
   * ========================================================================== */
  const monthOptions = useMemo(() => {
    let baseList = jobs;
    if (serviceFilter !== "all") {
      baseList = baseList.filter((j) => j.service === serviceFilter);
    }
    const counts = new Map<string, number>();
    for (const j of baseList) {
      const m = getJobMonth(j);
      if (m) counts.set(m, (counts.get(m) || 0) + 1);
    }
    return MONTH_FILTER_OPTIONS.filter((m) => m.key !== "all").map((m) => ({
      ...m,
      count: counts.get(m.key) || 0,
    }));
  }, [jobs, serviceFilter]);

  /* ==========================================================================
   * 1.0 CUSTOMER / IMPORTER OPTIONS (MEMOIZED)
   * รายชื่อผู้นำเข้า / ส่งออกตามบริบทเดือนและบริการที่เลือก
   * ========================================================================== */
  const customerOptions = useMemo(() => {
    let baseList = jobs;
    if (selectedMonths.length > 0) {
      const mSet = new Set(selectedMonths);
      baseList = baseList.filter((j) => mSet.has(getJobMonth(j) || ""));
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
  }, [jobs, selectedMonths, serviceFilter]);

  /* ==========================================================================
   * 1.1 FWD SYSTEM STATUS COUNTS (MEMOIZED)
   * คำนวณจำนวนงานในแต่ละสถานะ FWD System ตามบริบทเดือน บริการ และลูกค้าที่เลือก
   * Flow: Job Booking Request > Job Control > Job Waiting > Job Complete
   * ========================================================================== */
  const fwdCounts = useMemo(() => {
    let baseList = jobs;
    if (selectedMonths.length > 0) {
      const mSet = new Set(selectedMonths);
      baseList = baseList.filter((j) => mSet.has(getJobMonth(j) || ""));
    }
    if (serviceFilter !== "all") {
      baseList = baseList.filter((j) => j.service === serviceFilter);
    }
    if (selectedCustomers.length > 0) {
      const targetSet = new Set(selectedCustomers.map((c) => c.trim().toLowerCase()));
      baseList = baseList.filter((j) => {
        const c1 = (j.consignee || "").trim().toLowerCase();
        const c2 = (j.customer || "").trim().toLowerCase();
        return targetSet.has(c1) || targetSet.has(c2);
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
      counts[classifyJob(j)]++;
    }
    return counts;
  }, [jobs, selectedMonths, serviceFilter, selectedCustomers]);

  /* ==========================================================================
   * 2. FILTERED & SORTED JOBS (MEMOIZED)
   * คำนวณรายการงานที่ผ่านการกรองและเรียงลำดับความสำคัญ
   * ========================================================================== */
  const filteredJobs = useMemo(() => {
    let list = [...jobs];

    // 2.1 กรองตามเดือน (รองรับหลายเดือนแบบ Checklist)
    if (selectedMonths.length > 0) {
      const mSet = new Set(selectedMonths);
      list = list.filter((j) => mSet.has(getJobMonth(j) || ""));
    }

    // 2.2 กรองตามกลุ่มบริการ
    if (serviceFilter !== "all") {
      list = list.filter((j) => j.service === serviceFilter);
    }

    // 2.2.1 กรองตามผู้นำเข้า / ส่งออก (Importer / Customer — รองรับหลายบริษัท)
    if (selectedCustomers.length > 0) {
      const targetSet = new Set(selectedCustomers.map((c) => c.trim().toLowerCase()));
      list = list.filter((j) => {
        const c1 = (j.consignee || "").trim().toLowerCase();
        const c2 = (j.customer || "").trim().toLowerCase();
        return targetSet.has(c1) || targetSet.has(c2);
      });
    }

    // 2.3 กรองตามสถานะ (Job Booking Request > Job Control > Job Waiting > Job Complete)
    if (statusFilter !== "all") {
      list = list.filter((j) => classifyJob(j) === statusFilter);
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

    // 2.7 เรียงลำดับตามโครงสร้างรหัสงาน (Job No):
    //     1) หมวดงาน: SHAI -> SHSE -> SHSI -> SHAE
    //     2) ปี ค.ศ. (เช่น 26)
    //     3) เดือน 01 -> 12
    //     4) ลำดับงานของเดือนนั้น 0001 -> 9999 (สลับ asc/desc ได้ที่หัวตาราง)
    const dir = jobSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const pa = parseJobNo(a.jobNo);
      const pb = parseJobNo(b.jobNo);
      if (pa.prefixRank !== pb.prefixRank) return pa.prefixRank - pb.prefixRank;
      if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
      if (pa.year !== pb.year) return (pa.year - pb.year) * dir;
      if (pa.month !== pb.month) return (pa.month - pb.month) * dir;
      if (pa.seq !== pb.seq) return (pa.seq - pb.seq) * dir;
      return String(a.jobNo || "").localeCompare(String(b.jobNo || ""));
    });

    return list;
  }, [jobs, selectedMonths, serviceFilter, selectedCustomers, statusFilter, customsFilter, overdueOnly, q, jobSortDir]);

  // คำนวณจำนวนหน้าทั้งหมด
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));

  /* ==========================================================================
   * 3. RENDER UI
   * ========================================================================== */
  return (
    <section className="bg-white rounded-[12px] border border-[#dce2e8] shadow-xs">
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

        {/* ดรอปดาวน์เลือกเดือนแบบ Checklist (เลือกได้หลายเดือน) */}
        <div className="relative" ref={monthDropdownRef}>
          <button
            type="button"
            onClick={() => setMonthDropdownOpen((v) => !v)}
            aria-expanded={monthDropdownOpen}
            aria-haspopup="listbox"
            aria-label="กรองตามเดือน (เลือกได้หลายเดือน)"
            className={`h-9 px-3 rounded-lg border text-xs font-semibold outline-none inline-flex items-center justify-between gap-2 transition-colors cursor-pointer ${
              selectedMonths.length > 0
                ? "border-[#0284c7] bg-[#f0f9ff] text-[#0369a1] ring-1 ring-[#0284c7]"
                : "border-[#c5cfd9] bg-white text-[#073766] hover:border-slate-400"
            }`}
          >
            <span className="truncate max-w-[180px]">
              {selectedMonths.length === 0
                ? "ทุกเดือน (All 12 Months)"
                : selectedMonths.length <= 2
                ? selectedMonths
                    .map((k) => MONTH_FILTER_OPTIONS.find((m) => m.key === k)?.label || k)
                    .join(", ")
                : `เลือกแล้ว ${selectedMonths.length} เดือน`}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                monthDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {monthDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-[300px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 font-medium">
                  เลือกได้หลายเดือน ({selectedMonths.length}/{monthOptions.length})
                </span>
                {selectedMonths.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonths([]);
                      setMonthFilter("all");
                      setPageNum(1);
                    }}
                    className="text-[#0284c7] hover:underline font-semibold cursor-pointer"
                  >
                    ทุกเดือน
                  </button>
                )}
              </div>

              <div
                className="grid grid-cols-2 gap-1 p-2"
                role="listbox"
                aria-multiselectable="true"
              >
                {monthOptions.map((m) => {
                  const checked = selectedMonths.includes(m.key);
                  return (
                      <button
                        key={m.key}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggleMonth(m.key)}
                        className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-md text-xs text-left cursor-pointer select-none border transition-colors ${
                          checked
                            ? "bg-[#f0f9ff] border-[#bae6fd] text-[#0369a1] font-semibold"
                            : "border-transparent text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              checked
                                ? "bg-[#0284c7] border-[#0284c7] text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                          <span className="truncate">{m.label}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                          {m.count}
                        </span>
                      </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ดรอปดาวน์กรองผู้นำเข้า / ส่งออก แบบ Checklist (เลือกได้หลายบริษัท) */}
        <div className="relative" ref={customerDropdownRef}>
          <button
            type="button"
            onClick={() => setCustomerDropdownOpen((v) => !v)}
            aria-expanded={customerDropdownOpen}
            aria-haspopup="listbox"
            aria-label="กรองตามผู้นำเข้า / ส่งออก (เลือกได้หลายรายการ)"
            className={`h-9 px-3 max-w-[270px] rounded-lg border text-xs font-medium outline-none inline-flex items-center justify-between gap-2 transition-colors cursor-pointer ${
              selectedCustomers.length > 0
                ? "border-[#0284c7] bg-[#f0f9ff] text-[#0369a1] font-semibold ring-1 ring-[#0284c7]"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 focus-visible:border-[#073766]"
            }`}
          >
            <span className="truncate">
              {selectedCustomers.length === 0
                ? `ผู้นำเข้า / ส่งออกทั้งหมด (${customerOptions.length})`
                : selectedCustomers.length === 1
                ? selectedCustomers[0]
                : `เลือกแล้ว ${selectedCustomers.length} บริษัท`}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                customerDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {customerDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 w-[330px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
              <div className="p-2 border-b border-slate-100 bg-slate-50/70 space-y-1.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="ค้นหาชื่อบริษัทผู้นำเข้า / ส่งออก…"
                    aria-label="ค้นหาชื่อบริษัทผู้นำเข้า / ส่งออก"
                    className="w-full h-8 pl-8 pr-2.5 rounded-md border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-[#0284c7]"
                  />
                </div>
                <div className="flex items-center justify-between px-1 text-[11px]">
                  <span className="text-slate-500 font-medium">
                    เลือกได้หลายบริษัท ({selectedCustomers.length}/{customerOptions.length})
                  </span>
                  {selectedCustomers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomers([]);
                        setPageNum(1);
                      }}
                      className="text-[#0284c7] hover:underline font-semibold cursor-pointer"
                    >
                      ล้างทั้งหมด
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-50 p-1" role="listbox" aria-multiselectable="true">
                {customerOptions
                  .filter((c) =>
                    !customerSearch.trim()
                      ? true
                      : c.name.toLowerCase().includes(customerSearch.trim().toLowerCase())
                  )
                  .map((c) => {
                    const checked = selectedCustomers.includes(c.name);
                    return (
                      <button
                        key={c.name}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggleCustomer(c.name)}
                        className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-xs text-left cursor-pointer select-none transition-colors ${
                          checked
                            ? "bg-[#f0f9ff] text-[#0369a1] font-semibold"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              checked
                                ? "bg-[#0284c7] border-[#0284c7] text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                          <span className="truncate" title={c.name}>
                            {c.name}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                          {c.count}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* ป้ายแสดงสถานะตัวกรองผู้นำเข้า/ส่งออก พร้อมปุ่มล้างแต่ละรายการ */}
        {selectedCustomers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedCustomers.slice(0, 3).map((cust) => (
              <div
                key={cust}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-medium text-slate-800"
              >
                <span className="font-semibold truncate max-w-[150px]" title={cust}>
                  {cust}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCustomer(cust)}
                  title={`นำ ${cust} ออกจากการกรอง`}
                  aria-label={`นำ ${cust} ออกจากการกรอง`}
                  className="w-4 h-4 rounded hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {selectedCustomers.length > 3 && (
              <span className="px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono font-semibold text-slate-600">
                +{selectedCustomers.length - 3}
              </span>
            )}
            {selectedCustomers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomers([]);
                  setPageNum(1);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 underline px-1 cursor-pointer"
              >
                ล้างทั้งหมด
              </button>
            )}
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
              <th className="py-3 px-4">
                <button
                  type="button"
                  onClick={() => {
                    setJobSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    setPageNum(1);
                  }}
                  title={
                    jobSortDir === "asc"
                      ? "กำลังเรียง: เดือน 01→12 และลำดับงาน 0001→9999 (คลิกเพื่อเรียงจากล่าสุดลงมา)"
                      : "กำลังเรียง: เดือน 12→01 และลำดับงานล่าสุด→0001 (คลิกเพื่อเรียงจาก 0001 ขึ้นไป)"
                  }
                  className="inline-flex items-center gap-1.5 uppercase tracking-wider text-slate-700 hover:text-[#073766] cursor-pointer select-none"
                >
                  <span>Job No</span>
                  {jobSortDir === "asc" ? (
                    <ArrowUp className="w-3.5 h-3.5 text-[#0284c7]" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-[#0284c7]" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3">บริการ</th>
              <th className="py-3 px-4">
                <span>ผู้นำเข้า / ส่งออก (Importer / Customer)</span>
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
                          toggleCustomer(mainTrader);
                        }}
                        title={`คลิกเพื่อเลือก/ยกเลิกการกรอง: ${mainTrader}`}
                        className={`font-semibold truncate block text-left transition-colors cursor-pointer w-full ${
                          selectedCustomers.includes(mainTrader)
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
                          {j.service?.includes("AIR") ? (
                            <Plane className="w-3 h-3 text-sky-600 shrink-0" />
                          ) : (
                            <Ship className="w-3 h-3 text-slate-500 shrink-0" />
                          )}
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
      <div className="px-4 py-3 border-t border-[#dce2e8] rounded-b-[12px] flex items-center justify-between text-[13px] text-[#526275]">
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
