"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — INLAND TRANSPORT TABLE
 * ============================================================================
 * ตารางบริหารจัดการเที่ยวรถขนส่งสินค้าในประเทศ (Inland Transport Fleet)
 * 
 * ความสามารถหลัก:
 * 1. ตรวจสอบสถานะการจัดส่งตู้คอนเทนเนอร์ 40' HQ/HC, 40' DC, 20' DC และรถบรรทุก 4/6 ล้อ
 * 2. แท็บจัดกลุ่มขนาดตู้ (Container Bucket Tabs) พร้อมแสดงจำนวนเที่ยวรถแบบไดนามิก
 * 3. ค้นหาด่วนตามรหัสเที่ยวรถ (TS NO), รหัสงาน (Job No), ลูกค้า หรือวันที่ส่งมอบ
 * 4. คลิกเปิดดูรายละเอียดชิปเมนท์หลัก (Main Job) เชื่อมต่อผ่าน Drawer ทันที
 * 5. ระบบแบ่งหน้าและปรับขนาดหน้า (Pagination: 25 / 50 / 100 / ทั้งหมด)
 * ============================================================================
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, Check, X } from "lucide-react";
import { TransportRecord } from "@/types/dashboard";
import { fmtNum, classifyContainer, MONTH_FILTER_OPTIONS } from "@/lib/dashboard-helpers";

/**
 * แยกองค์ประกอบรหัสเที่ยวรถ เช่น "TS26110012" -> { year: 26, month: 11, seq: 12 }
 */
function parseTripNo(tsNo: string | undefined) {
  const raw = String(tsNo || "").trim().toUpperCase();
  const m = raw.match(/^([A-Z]+)(\d{2})(\d{2})(\d+)$/);
  if (!m) {
    return { year: 0, month: 0, seq: 0, raw };
  }
  return {
    year: parseInt(m[2], 10),
    month: parseInt(m[3], 10),
    seq: parseInt(m[4], 10),
    raw,
  };
}

/**
 * ดึงรหัสเดือน (YYYY-MM) จากเที่ยวรถ (ยึดจากรหัส TSYYMMxxxx เป็นหลัก หรือวันที่ส่งมอบ/รับตู้)
 */
function getTripMonth(r: TransportRecord): string | null {
  const p = parseTripNo(r.transportNo || r.tripNo);
  if (p.year >= 20 && p.month >= 1 && p.month <= 12) {
    return `20${String(p.year).padStart(2, "0")}-${String(p.month).padStart(2, "0")}`;
  }
  const d = String(r.deliver || r.deliverDate || r.pickupDate || "").trim();
  if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  return null;
}

/**
 * ลำดับความสำคัญของสถานะเที่ยวรถสำหรับจัดเรียง: กำลังวิ่ง (1) -> ส่งมอบแล้ว (2) -> ยกเลิก (3)
 */
function statusRank(status: string | undefined): number {
  const s = String(status || "").toLowerCase();
  if (s.includes("ยกเลิก") || s.includes("cancel")) return 3;
  if (s.includes("ส่งมอบ") || s.includes("เสร็จ") || s.includes("complete")) return 2;
  return 1;
}

/* ============================================================================
 * PROPS INTERFACE
 * ============================================================================ */
export interface TransportTableProps {
  /** รายการเที่ยวรถขนส่งทั้งหมดจากชีต TRANSPORT ใน Excel */
  transport: TransportRecord[];
  /** ฟังก์ชันเปิดดูรายละเอียดงานหลักของเที่ยวรถนี้ */
  onSelectJobNo: (jobNo: string) => void;
}

export default function TransportTable({
  transport,
  onSelectJobNo,
}: TransportTableProps) {
  /* ==========================================================================
   * 1. LOCAL FILTER STATE
   * ========================================================================== */
  // คำค้นหาในตารางขนส่ง
  const [transQ, setTransQ] = useState("");
  // แท็บประเภทตู้คอนเทนเนอร์ที่เลือก ("all", "40' HQ/HC", "40' DC", "20' DC", "รถบรรทุก 4/6 ล้อ")
  const [transBucket, setTransBucket] = useState("all");
  // กรองตามเดือนแบบ Checklist (เลือกได้หลายเดือน; ว่าง = ทุกเดือน)
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  // หน้าปัจจุบัน
  const [transPage, setTransPage] = useState(1);
  // ขนาดต่อหน้า (-1 หมายถึงแสดงทั้งหมด)
  const [transPageSize, setTransPageSize] = useState<number>(25);
  // คอลัมน์และทิศทางการเรียงลำดับ ("tsNo" | "status" | "deliverDate" | "customer", "desc" = ใหม่ไปเก่า ค่าเริ่มต้น)
  const [sortCol, setSortCol] = useState<"tsNo" | "status" | "deliverDate" | "customer">("tsNo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const hasActiveFilters =
    Boolean(transQ.trim()) ||
    transBucket !== "all" ||
    selectedMonths.length > 0;

  const clearAllFilters = () => {
    setTransQ("");
    setTransBucket("all");
    setSelectedMonths([]);
    setTransPage(1);
  };

  useEffect(() => {
    if (!monthDropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setMonthDropdownOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMonthDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [monthDropdownOpen]);

  const toggleMonth = (key: string) => {
    setSelectedMonths((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
    setTransPage(1);
  };

  const handleSort = (col: "tsNo" | "status" | "deliverDate") => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "status" ? "asc" : "desc");
    }
    setTransPage(1);
  };

  const monthOptions = useMemo(() => {
    let baseList = transport;
    if (transBucket !== "all") {
      const target = transBucket === "LCL โกดัง" ? "รถบรรทุก 4/6 ล้อ" : transBucket;
      baseList = baseList.filter((r) => classifyContainer(r.container) === target);
    }
    const counts = new Map<string, number>();
    for (const r of baseList) {
      const m = getTripMonth(r);
      if (m) counts.set(m, (counts.get(m) || 0) + 1);
    }
    return MONTH_FILTER_OPTIONS.filter((m) => m.key !== "all").map((m) => ({
      ...m,
      count: counts.get(m.key) || 0,
    }));
  }, [transport, transBucket]);

  /* ==========================================================================
   * 2. FILTERED TRANSPORT RECORDS (MEMOIZED)
   * กรองข้อมูลเที่ยวรถตามเดือน แท็บขนาดตู้ และคำค้นหา พร้อมเรียงลำดับตามคอลัมน์ที่เลือก
   * ========================================================================== */
  const filteredTransport = useMemo(() => {
    const trimmedQ = transQ.trim();
    const low = trimmedQ.toLowerCase();
    const compactLow = low.replace(/\s+/g, "");
    const mSet = selectedMonths.length > 0 ? new Set(selectedMonths) : null;

    const list = transport.filter((r) => {
      // 2.0 กรองตามเดือน
      if (mSet && !mSet.has(getTripMonth(r) || "")) return false;

      // 2.1 กรองตามประเภทตู้
      if (transBucket !== "all") {
        const target = transBucket === "LCL โกดัง" ? "รถบรรทุก 4/6 ล้อ" : transBucket;
        if (classifyContainer(r.container) !== target) return false;
      }

      // 2.2 กรองคำค้นหา
      if (trimmedQ) {
        return [
          r.transportNo,
          r.tripNo,
          r.jobNo,
          r.customer,
          r.container,
          r.truckType,
          r.status,
          r.deliver,
          r.pod,
          r.driver,
          r.driverName,
          r.transporter,
          r.plateNo,
          r.pickupLocation,
          r.deliveryLocation,
          r.returnDepot,
        ].some((v) => {
          const str = String(v || "").toLowerCase();
          return (
            str.includes(low) ||
            (compactLow.length >= 4 && str.replace(/\s+/g, "").includes(compactLow))
          );
        });
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const compareTripNo = (a: TransportRecord, b: TransportRecord, d: number) => {
      const pa = parseTripNo(a.transportNo || a.tripNo);
      const pb = parseTripNo(b.transportNo || b.tripNo);
      if (pa.year !== pb.year) return (pa.year - pb.year) * d;
      if (pa.month !== pb.month) return (pa.month - pb.month) * d;
      if (pa.seq !== pb.seq) return (pa.seq - pb.seq) * d;
      return pa.raw.localeCompare(pb.raw) * d;
    };

    list.sort((a, b) => {
      if (sortCol === "status") {
        const ra = statusRank(a.status);
        const rb = statusRank(b.status);
        if (ra !== rb) return (ra - rb) * dir;
        return compareTripNo(a, b, -1);
      }
      if (sortCol === "deliverDate") {
        const da = String(a.deliver || a.deliverDate || "").trim();
        const db = String(b.deliver || b.deliverDate || "").trim();
        if (da !== db) {
          if (!da) return 1;
          if (!db) return -1;
          return da.localeCompare(db) * dir;
        }
        return compareTripNo(a, b, -1);
      }
      if (sortCol === "customer") {
        const ca = String(a.customer || "").trim();
        const cb = String(b.customer || "").trim();
        if (ca !== cb) {
          if (!ca || ca === "—") return 1;
          if (!cb || cb === "—") return -1;
          return ca.localeCompare(cb, "th") * dir;
        }
        return compareTripNo(a, b, -1);
      }
      return compareTripNo(a, b, dir);
    });

    return list;
  }, [transport, selectedMonths, transBucket, transQ, sortCol, sortDir]);

  // คำนวณจำนวนหน้าทั้งหมด
  const transTotalPages =
    transPageSize === -1
      ? 1
      : Math.max(1, Math.ceil(filteredTransport.length / transPageSize));

  // ตัดข้อมูลเฉพาะหน้าที่กำลังแสดง
  const pagedTransport = useMemo(() => {
    if (transPageSize === -1) return filteredTransport;
    const start = (transPage - 1) * transPageSize;
    return filteredTransport.slice(start, start + transPageSize);
  }, [filteredTransport, transPage, transPageSize]);

  // สรุปยอดตามขนาดตู้คอนเทนเนอร์สำหรับแสดงตัวเลขบนแท็บ (ตามเดือนที่เลือก)
  const bucketCounts = useMemo(() => {
    const mSet = selectedMonths.length > 0 ? new Set(selectedMonths) : null;
    const base = mSet ? transport.filter((r) => mSet.has(getTripMonth(r) || "")) : transport;
    const counts: Record<string, number> = {
      all: base.length,
      "40' HQ/HC": 0,
      "40' DC": 0,
      "20' DC": 0,
      "รถบรรทุก 4/6 ล้อ": 0,
    };
    for (const r of base) {
      const b = classifyContainer(r.container);
      counts[b] = (counts[b] || 0) + 1;
    }
    return counts;
  }, [transport, selectedMonths]);

  /* ==========================================================================
   * 3. RENDER UI
   * ========================================================================== */
  return (
    <section className="bg-white rounded-[12px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* --------------------------------------------------------------------
       * TOOLBAR: ค้นหา และแท็บประเภทตู้คอนเทนเนอร์
       * -------------------------------------------------------------------- */}
      <div className="p-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-[#fafbfc]">
        <div className="flex flex-wrap items-center gap-3">
          {/* ช่องค้นหาด่วน */}
          <div className="relative w-full sm:w-[260px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="ค้นหาตาม TS No, Job No หรือชื่อลูกค้า"
              value={transQ}
              onChange={(e) => {
                setTransQ(e.target.value);
                setTransPage(1);
              }}
              placeholder="ค้นหา TS NO, Job No, ลูกค้า..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#073766] focus:ring-2 focus:ring-[#073766]/10 transition-[border-color,box-shadow] duration-150"
            />
          </div>

          {/* แท็บประเภทตู้ (Container Filter Buttons: Segmented Control) */}
          <div className="p-0.5 bg-slate-100 rounded-lg border border-slate-200/70 inline-flex items-center gap-1 flex-wrap">
            {[
              ["all", "ทั้งหมด", bucketCounts.all],
              ["40' HQ/HC", "40' HC/HQ", bucketCounts["40' HQ/HC"]],
              ["40' DC", "40' DC", bucketCounts["40' DC"]],
              ["20' DC", "20' DC", bucketCounts["20' DC"]],
              ["รถบรรทุก 4/6 ล้อ", "รถบรรทุก 4/6 ล้อ", bucketCounts["รถบรรทุก 4/6 ล้อ"]],
            ].map(([k, label, count]) => {
              const active = transBucket === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setTransBucket(k as string);
                    setTransPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? "bg-[#071a2f] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.2 rounded-full ${
                      active ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-600"
                    }`}
                  >
                    {fmtNum(count as number)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ดรอปดาวน์เลือกเดือนแบบ Checklist (เลือกได้หลายเดือน) */}
          <div className="relative" ref={monthDropdownRef}>
            <button
              type="button"
              onClick={() => setMonthDropdownOpen((v) => !v)}
              aria-expanded={monthDropdownOpen}
              aria-haspopup="listbox"
              aria-label="กรองเที่ยวรถตามเดือน (เลือกได้หลายเดือน)"
              className={`h-9 px-3 rounded-lg border text-xs font-semibold outline-none inline-flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                selectedMonths.length > 0
                  ? "border-[#0284c7] bg-[#f0f9ff] text-[#0369a1] ring-1 ring-[#0284c7]"
                  : "border-slate-200 bg-white text-[#073766] hover:border-slate-300"
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
                        setTransPage(1);
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

          {/* ปุ่มล้างตัวกรอง (1 คลิก) */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="h-9 px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
        </div>

        {/* Dropdown เลือกเรียงลำดับ & สรุปจำนวนรายการที่พบ */}
        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 font-medium">เรียงตาม:</span>
            <select
              aria-label="เรียงลำดับรายการเที่ยวรถ"
              value={`${sortCol}_${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split("_") as [
                  "tsNo" | "status" | "deliverDate" | "customer",
                  "asc" | "desc"
                ];
                setSortCol(col);
                setSortDir(dir);
                setTransPage(1);
              }}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#073766] outline-none focus:border-[#f56a22] focus:ring-1 focus:ring-[#f56a22] cursor-pointer"
            >
              <option value="tsNo_desc">ใหม่สุดก่อน (TS NO)</option>
              <option value="tsNo_asc">เก่าสุดก่อน (TS NO)</option>
              <option value="customer_asc">ชื่อลูกค้า (A-Z / ก-ฮ)</option>
              <option value="deliverDate_desc">วันที่ส่งมอบล่าสุดก่อน</option>
              <option value="deliverDate_asc">วันที่ส่งมอบเก่าสุดก่อน</option>
              {sortCol === "status" && (
                <option value={`status_${sortDir}`}>
                  สถานะ ({sortDir === "asc" ? "กำลังวิ่ง → ยกเลิก" : "ยกเลิก → กำลังวิ่ง"})
                </option>
              )}
              {sortCol === "customer" && sortDir === "desc" && (
                <option value="customer_desc">ชื่อลูกค้า (Z-A / ฮ-ก)</option>
              )}
            </select>
          </div>

          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
            พบ <strong className="text-slate-900 num font-bold">{fmtNum(filteredTransport.length)}</strong> เที่ยวรถ
          </span>
        </div>
      </div>

      {/* --------------------------------------------------------------------
       * TABLE: รายการเที่ยวรถในตารางเดินรถ
       * -------------------------------------------------------------------- */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1080px]">
          <thead>
            <tr className="bg-[#f4f2ee] border-b border-slate-200 text-[12px] font-bold text-slate-700 whitespace-nowrap">
              <th className="py-3.5 px-4">
                <button
                  type="button"
                  onClick={() => handleSort("tsNo")}
                  title="คลิกเพื่อเรียงตามรหัสเที่ยวรถ (ใหม่ไปเก่า / เก่าไปใหม่)"
                  className="inline-flex items-center gap-1.5 text-slate-800 hover:text-[#ea580c] cursor-pointer select-none"
                >
                  <span>รหัสเที่ยวรถ (TS NO)</span>
                  {sortCol === "tsNo" ? (
                    <>
                      <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa]">
                        {sortDir === "desc" ? "ใหม่→เก่า" : "เก่า→ใหม่"}
                      </span>
                      {sortDir === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-[#ea580c]" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-[#ea580c]" />
                      )}
                    </>
                  ) : (
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </th>
              <th className="py-3.5 px-3">Job No ที่ผูก</th>
              <th className="py-3.5 px-4">ลูกค้า & เส้นทาง (Customer & Route)</th>
              <th className="py-3.5 px-3">ประเภทตู้ / รถ</th>
              <th className="py-3.5 px-3">ผู้ให้บริการ / คนขับ / ทะเบียน</th>
              <th className="py-3.5 px-3">
                <button
                  type="button"
                  onClick={() => handleSort("status")}
                  title="คลิกเพื่อเรียงตามสถานะ (กำลังวิ่ง ➔ ส่งมอบแล้ว ➔ ยกเลิก)"
                  className="inline-flex items-center gap-1.5 text-slate-800 hover:text-[#ea580c] cursor-pointer select-none"
                >
                  <span>สถานะ</span>
                  {sortCol === "status" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="w-3.5 h-3.5 text-[#ea580c]" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5 text-[#ea580c]" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </th>
              <th className="py-3.5 px-3">
                <button
                  type="button"
                  onClick={() => handleSort("deliverDate")}
                  title="คลิกเพื่อเรียงตามวันที่ส่งมอบ (ล่าสุดไปเก่าสุด / เก่าสุดไปล่าสุด)"
                  className="inline-flex items-center gap-1.5 text-slate-800 hover:text-[#ea580c] cursor-pointer select-none"
                >
                  <span>วันที่ส่งมอบ (Delivery)</span>
                  {sortCol === "deliverDate" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="w-3.5 h-3.5 text-[#ea580c]" />
                    ) : (
                      <ArrowDown className="w-3.5 h-3.5 text-[#ea580c]" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>
              </th>
              <th className="py-3.5 px-4">POD / สถานะเอกสาร</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[13px] tabular-nums">
            {pagedTransport.map((r, idx) => (
              <tr
                key={`${r.transportNo || r.tripNo}-${idx}`}
                className="hover:bg-slate-50/70 transition-colors"
              >
                {/* รหัสเที่ยวรถ */}
                <td className="py-3 px-4 font-mono font-bold text-[#073766] whitespace-nowrap">
                  {r.transportNo || r.tripNo || "—"}
                </td>

                {/* Job No หลัก */}
                <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">
                  {r.jobNo ? (
                    <button
                      type="button"
                      onClick={() => onSelectJobNo(r.jobNo!)}
                      aria-label={`เปิดดูรายละเอียดงาน ${r.jobNo}`}
                      className="px-2.5 py-0.5 rounded-md border border-[#fed7aa] bg-[#fff7ed] hover:bg-[#ea580c] hover:border-[#ea580c] hover:text-white text-[#c2410c] font-mono text-xs font-semibold transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c] cursor-pointer"
                    >
                      {r.jobNo}
                    </button>
                  ) : (
                    <span className="inline-flex items-center text-slate-400 font-mono text-[11px] bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md">
                      — เที่ยวรถอิสระ
                    </span>
                  )}
                </td>

                {/* ลูกค้า & เส้นทาง */}
                <td className="py-2.5 px-4 max-w-[280px]">
                  <div className="text-slate-900 font-semibold truncate">
                    {r.customer || "—"}
                  </div>
                  {(r.pickupLocation || r.deliveryLocation) && (
                    <div
                      className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 font-mono mt-0.5"
                      title={`${r.pickupLocation || ''} → ${r.deliveryLocation || ''}${r.returnDepot ? ` (คืนตู้: ${r.returnDepot})` : ''}`}
                    >
                      <span className="truncate max-w-[110px] text-slate-700">{r.pickupLocation || 'ต้นทาง'}</span>
                      <span className="text-[#f56a22] font-sans font-bold">→</span>
                      <span className="text-[#073766] font-semibold truncate max-w-[130px]">{r.deliveryLocation || 'ปลายทาง'}</span>
                      {r.returnDepot && (
                        <span className="text-[10px] text-slate-400 font-sans ml-0.5">· คืนตู้ {r.returnDepot}</span>
                      )}
                    </div>
                  )}
                </td>

                {/* ขนาดตู้ / รถ */}
                <td className="py-3 px-3 whitespace-nowrap">
                  {r.container || r.truckType ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-mono font-medium bg-slate-100 text-slate-800 border border-slate-200/70">
                      {r.container || r.truckType}
                    </span>
                  ) : (
                    <span className="text-slate-300 font-mono">—</span>
                  )}
                </td>

                {/* ผู้ให้บริการ / คนขับ / ทะเบียน */}
                <td className="py-2.5 px-3 max-w-[220px]">
                  {r.transporter || r.driverName || r.driver || r.plateNo ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.transporter && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10.5px] font-semibold">
                            {r.transporter}
                          </span>
                        )}
                        {(r.driverName || r.driver) && (
                          <span className="text-xs font-medium text-slate-800 truncate">
                            {r.driverName || r.driver}
                          </span>
                        )}
                      </div>
                      {r.plateNo && (
                        <span className="text-[11px] font-mono text-slate-500 truncate" title={r.plateNo}>
                          ทะเบียน: {r.plateNo}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-300 font-mono text-xs">—</span>
                  )}
                </td>

                {/* สถานะ */}
                <td className="py-3 px-3 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      (r.status || "").toLowerCase().includes("complete") ||
                      (r.status || "").toLowerCase().includes("เสร็จ") ||
                      (r.status || "").toLowerCase().includes("ส่งมอบ")
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200/80"
                        : (r.status || "").toLowerCase().includes("ยกเลิก")
                        ? "bg-rose-50 text-rose-700 border-rose-200/80"
                        : "bg-blue-50 text-blue-700 border-blue-200/80"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        (r.status || "").toLowerCase().includes("complete") ||
                        (r.status || "").toLowerCase().includes("เสร็จ") ||
                        (r.status || "").toLowerCase().includes("ส่งมอบ")
                          ? "bg-emerald-600"
                          : (r.status || "").toLowerCase().includes("ยกเลิก")
                          ? "bg-rose-600"
                          : "bg-blue-600"
                      }`}
                    />
                    <span>{r.status || "กำลังดำเนินงาน"}</span>
                  </span>
                </td>

                {/* วันที่ส่งมอบ */}
                <td className="py-3 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                  {r.deliver || r.deliverDate || <span className="text-slate-300 font-mono">—</span>}
                </td>

                {/* POD / สถานะเอกสาร */}
                <td className="py-3 px-4 text-xs max-w-[240px]">
                  {r.pod ? (
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium truncate max-w-full ${
                        r.pod.includes("ยกเลิก")
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : r.pod.includes("ส่ง") || r.pod.includes("แล้ว") || r.pod.includes("POD")
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                      title={r.pod}
                    >
                      {r.pod}
                    </span>
                  ) : (
                    <span className="text-slate-300 font-mono text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------------------------------------------
       * PAGINATION TOOLBAR: ตัวเลือกสลับหน้า และจำนวนแถวต่อหน้า
       * -------------------------------------------------------------------- */}
      <div className="px-4 py-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span>แสดงแถวต่อหน้า:</span>
          <select
            aria-label="เลือกจำนวนรายการต่อหน้า"
            value={transPageSize}
            onChange={(e) => {
              setTransPageSize(Number(e.target.value));
              setTransPage(1);
            }}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-[#073766] focus:ring-1 focus:ring-[#073766] transition-[border-color,box-shadow]"
          >
            <option value={25}>25 รายการ</option>
            <option value={50}>50 รายการ</option>
            <option value={100}>100 รายการ</option>
            <option value={-1}>ทั้งหมด ({filteredTransport.length})</option>
          </select>
          <span className="ml-2 font-mono">
            หน้า <b className="text-slate-900">{transPage}</b> จาก {transTotalPages}
          </span>
        </div>

        {transPageSize !== -1 && (
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="หน้าก่อนหน้า"
              disabled={transPage <= 1}
              onClick={() => setTransPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073766] cursor-pointer"
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              aria-label="หน้าถัดไป"
              disabled={transPage >= transTotalPages}
              onClick={() => setTransPage((p) => p + 1)}
              className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 transition-[background-color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073766] cursor-pointer"
            >
              ถัดไป
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
