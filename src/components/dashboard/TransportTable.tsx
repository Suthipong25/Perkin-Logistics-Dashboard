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

import React, { useState, useMemo } from "react";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import { TransportRecord } from "@/types/dashboard";
import { fmtNum, classifyContainer } from "@/lib/dashboard-helpers";

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
  // หน้าปัจจุบัน
  const [transPage, setTransPage] = useState(1);
  // ขนาดต่อหน้า (-1 หมายถึงแสดงทั้งหมด)
  const [transPageSize, setTransPageSize] = useState<number>(25);
  // ทิศทางการเรียงลำดับเที่ยวรถ ("desc" = ใหม่ไปเก่า ค่าเริ่มต้น | "asc" = เก่าไปใหม่)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /* ==========================================================================
   * 2. FILTERED TRANSPORT RECORDS (MEMOIZED)
   * กรองข้อมูลเที่ยวรถตามแท็บขนาดตู้และคำค้นหา พร้อมเรียงลำดับใหม่ไปเก่า
   * ========================================================================== */
  const filteredTransport = useMemo(() => {
    const trimmedQ = transQ.trim();
    const low = trimmedQ.toLowerCase();
    const compactLow = low.replace(/\s+/g, "");

    const list = transport.filter((r) => {
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
    list.sort((a, b) => {
      const pa = parseTripNo(a.transportNo || a.tripNo);
      const pb = parseTripNo(b.transportNo || b.tripNo);
      if (pa.year !== pb.year) return (pa.year - pb.year) * dir;
      if (pa.month !== pb.month) return (pa.month - pb.month) * dir;
      if (pa.seq !== pb.seq) return (pa.seq - pb.seq) * dir;
      return pa.raw.localeCompare(pb.raw) * dir;
    });

    return list;
  }, [transport, transBucket, transQ, sortDir]);

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

  // สรุปยอดตามขนาดตู้คอนเทนเนอร์สำหรับแสดงตัวเลขบนแท็บ
  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: transport.length,
      "40' HQ/HC": 0,
      "40' DC": 0,
      "20' DC": 0,
      "รถบรรทุก 4/6 ล้อ": 0,
    };
    for (const r of transport) {
      const b = classifyContainer(r.container);
      counts[b] = (counts[b] || 0) + 1;
    }
    return counts;
  }, [transport]);

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
        </div>

        {/* สรุปจำนวนรายการที่พบ */}
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
          พบ <strong className="text-slate-900 num font-bold">{fmtNum(filteredTransport.length)}</strong> เที่ยวรถ
        </span>
      </div>

      {/* --------------------------------------------------------------------
       * TABLE: รายการเที่ยวรถในตารางเดินรถ
       * -------------------------------------------------------------------- */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1080px]">
          <thead>
            <tr className="bg-[#f0f4f8] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <th className="py-3 px-4">
                <button
                  type="button"
                  onClick={() => {
                    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    setTransPage(1);
                  }}
                  title={
                    sortDir === "desc"
                      ? "กำลังเรียง: ใหม่ไปเก่า (คลิกเพื่อเรียงเก่าไปใหม่)"
                      : "กำลังเรียง: เก่าไปใหม่ (คลิกเพื่อเรียงใหม่ไปเก่า)"
                  }
                  className="inline-flex items-center gap-1.5 uppercase tracking-wider text-slate-700 hover:text-[#073766] cursor-pointer select-none"
                >
                  <span>รหัสเที่ยวรถ (TS NO)</span>
                  {sortDir === "asc" ? (
                    <ArrowUp className="w-3.5 h-3.5 text-[#0284c7]" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-[#0284c7]" />
                  )}
                </button>
              </th>
              <th className="py-3 px-3">Job No ที่ผูก</th>
              <th className="py-3 px-4">ลูกค้า & เส้นทาง (Customer & Route)</th>
              <th className="py-3 px-3">ประเภทตู้ / รถ</th>
              <th className="py-3 px-3">ผู้ให้บริการ / คนขับ / ทะเบียน</th>
              <th className="py-3 px-3">สถานะ</th>
              <th className="py-3 px-3">วันที่ส่งมอบ (Delivery)</th>
              <th className="py-3 px-4">POD / สถานะเอกสาร</th>
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
                      className="px-2.5 py-0.5 rounded-md border border-sky-200 bg-sky-50 hover:bg-[#073766] hover:text-white text-[#073766] font-mono text-xs font-semibold transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#073766] cursor-pointer"
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
