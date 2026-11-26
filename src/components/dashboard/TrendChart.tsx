"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — MULTI-SERVICE & DAILY TREND CHART (SVG)
 * ============================================================================
 * กราฟแสดงปริมาณงานและแนวโน้มการขนส่ง (Shipment & Transport Volume Trend)
 * 
 * ความสามารถหลัก:
 * 1. แสดงภาพรวม Total 12 เดือน (ม.ค. - ธ.ค. 2026) เป็นเส้นแนวโน้ม (Line Chart) ขนาดใหญ่ ชัดเจน
 * 2. เมื่อเลือกเดือนใดเดือนหนึ่ง จะแสดงเป็น "แผนภูมิแท่ง (Stacked Bar Chart)" รายวัน (วันที่ 1 - 31)
 *    แยกตามประเภทบริการเรียงตามลำดับที่ผู้ใช้กำหนด:
 *    - SEA Import (เรือขาเข้า) - #0284c7
 *    - SEA Export (เรือขาออก) - #059669
 *    - AIR Import (แอร์ขาเข้า) - #8b5cf6
 *    - AIR Export (แอร์ขาออก) - #f56a22
 *    - Transport (งานรถขนส่ง) - #d97706
 *    - Freight (เฟรท) - #c07d53
 *    - งานรวมทั้งหมด (Total) - #071a2f
 * 3. แสดงตัวเลขจำนวนงานบนยอดแท่ง/เส้น (Data Labels) อ่านง่าย มีขอบขาวป้องกันการกลืน
 * 4. สเกลขยายเต็มความกว้างหน้าจอ (Full Width) กว้าง 1,120px x สูง 440px อ่านค่าได้สบายตา
 * 5. Interactive Legend: คลิกเปิด/ปิดเส้นหรือแท่งแต่ละประเภทงานได้อิสระ
 * ============================================================================
 */

import React, { useState, useMemo, useEffect } from "react";
import { BarChart2, TrendingUp, Hash, Info } from "lucide-react";
import { fmtNum } from "@/lib/dashboard-helpers";

/* ============================================================================
 * TYPE DEFINITIONS
 * ============================================================================ */
export interface TrendDataPoint {
  key: string;       // เช่น "2026-01" หรือ "2026-09-01"
  label: string;     // เช่น "ม.ค." หรือ "1"
  fullLabel: string; // เช่น "มกราคม 2026" หรือ "1 ก.ย. 2026"
  total: number;
  seaImport: number;
  seaExport: number;
  airImport: number;
  airExport: number;
  transport: number;
  freight: number;
  completed?: number;
}

export interface TrendChartProps {
  /** ข้อมูลรวม 12 เดือน */
  monthsData: TrendDataPoint[];
  /** ข้อมูลรายวัน (วันที่ 1 - 31) ของเดือนที่เลือก */
  dailyData: TrendDataPoint[];
  /** รหัสเดือนปัจจุบันที่เลือก เช่น "all", "2026-09", "2026-10" */
  activeMonth: string;
  /** ฟังก์ชันเปลี่ยนเดือนที่เลือก */
  onSelectMonth: (m: string) => void;
  /** โหมดกราฟเล็ก: ซ่อนแถบควบคุม/legend และแสดงเป็นแผนภูมิแท่งเสมอ */
  compact?: boolean;
  /** โหมดเริ่มต้น ("months" | "daily") */
  defaultViewMode?: "months" | "daily";
  /** หัวข้อกราฟ (ใช้ในโหมด compact) */
  title?: string;
  /** สีประจำกราฟ (ใช้ในโหมด compact) */
  accent?: string;
}

export type SeriesKey =
  | "seaImport"
  | "seaExport"
  | "airImport"
  | "airExport"
  | "transport"
  | "freight"
  | "total";

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  sub: string;
  color: string;
  strokeWidth: number;
  dash?: string;
  labelOffsetY: number;
}

/**
 * เรียงลำดับตามที่ผู้ใช้กำหนด:
 * 1. SEA Import
 * 2. SEA Export
 * 3. AIR Import
 * 4. AIR Export
 * 5. Transport
 * 6. Freight
 * และตามด้วย งานรวมทั้งหมด (Total)
 */
export const SERIES_LIST: SeriesMeta[] = [
  { key: "seaImport", label: "SEA Import", sub: "เรือขาเข้า", color: "#0284c7", strokeWidth: 2.4, labelOffsetY: -8 },
  { key: "seaExport", label: "SEA Export", sub: "เรือขาออก", color: "#059669", strokeWidth: 2.4, labelOffsetY: 14 },
  { key: "airImport", label: "AIR Import", sub: "แอร์ขาเข้า", color: "#8b5cf6", strokeWidth: 2.4, labelOffsetY: -8 },
  { key: "airExport", label: "AIR Export", sub: "แอร์ขาออก", color: "#f56a22", strokeWidth: 2.4, labelOffsetY: 14 },
  { key: "transport", label: "Transport",  sub: "เที่ยวรถ",   color: "#d97706", strokeWidth: 2.4, dash: "4 3", labelOffsetY: -8 },
  { key: "freight",   label: "Freight",    sub: "เฟรท",       color: "#c07d53", strokeWidth: 2.2, labelOffsetY: 14 },
  { key: "total",     label: "งานชิปเมนท์รวม", sub: "Total",  color: "#071a2f", strokeWidth: 3.0, labelOffsetY: -12 },
];

export default function TrendChart({
  monthsData,
  dailyData,
  activeMonth,
  onSelectMonth,
  compact = false,
  defaultViewMode,
  title,
  accent = "#0c2340",
}: TrendChartProps) {
  // โหมดการแสดงผล: "months" = กราฟเส้นรวม 12 เดือน, "daily" = แผนภูมิแท่งรายวัน วันที่ 1 - 31
  const [viewMode, setViewMode] = useState<"months" | "daily">(
    defaultViewMode ?? (activeMonth && activeMonth !== "all" ? "daily" : "months")
  );

  // สลับมุมมองอัตโนมัติเมื่อ activeMonth เปลี่ยน
  useEffect(() => {
    if (activeMonth === "all") {
      setViewMode(defaultViewMode ?? "months");
    } else if (activeMonth) {
      setViewMode("daily");
    }
  }, [activeMonth, defaultViewMode]);

  // เปิด/ปิดการแสดงตัวเลขจำนวนงานบนแท่ง/เส้น
  const [showDataLabels, setShowDataLabels] = useState<boolean>(true);

  // สลับการแสดงแท่ง/เส้นกราฟของแต่ละประเภทงาน (เปิดหมดทุกอันเป็นค่าเริ่มต้น)
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    seaImport: true,
    seaExport: true,
    airImport: true,
    airExport: true,
    transport: true,
    freight: true,
    total: true,
  });

  // Hover point/column index
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // ชุดข้อมูลที่กำลังเรนเดอร์ในกราฟ
  const currentData = viewMode === "months" ? monthsData : dailyData;

  // Toggle series
  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /* ==========================================================================
   * COORDINATE SYSTEM & DIMENSIONS
   * ==========================================================================
   * W = 1120, H = 420
   * pad.l = 56: แกน Y ตัวเลขจำนวนงาน (Jobs Count) ด้านซ้ายตามมาตรฐาน
   * pad.r = 24: ระยะขอบขวา
   * iw = 1040: พื้นที่กราฟกว้างขวาง แสดงผลคมชัด
   * ========================================================================== */
  const W = compact ? 560 : 1120;
  const H = compact ? 260 : 420;
  const pad = compact ? { l: 36, r: 8, t: 20, b: 28 } : { l: 56, r: 24, t: 36, b: 38 };
  // โหมด compact ใช้แผนภูมิแท่งทั้งรายเดือนและรายวัน (อ่านง่ายกว่าเส้นหลายเส้น)
  const useBars = viewMode === "daily" || compact;

  const iw = W - pad.l - pad.r; // 1040
  const ih = H - pad.t - pad.b; // 346

  const activeSeriesKeys = (Object.keys(visibleSeries) as SeriesKey[]).filter((k) => visibleSeries[k]);
  const stackKeys = activeSeriesKeys.filter((k) => k !== "total");

  // หาค่ายอดสูงสุดในชุดข้อมูล
  // ในโหมด Bar Chart รายวัน: สเกลคำนวณจากยอดสะสม (Stacked Sum) ของแต่ละวัน
  // ในโหมด Line Chart 12 เดือน: สเกลคำนวณจากค่ายอดสูงสุดของแต่ละเส้น
  const maxValInSeries = useMemo(() => {
    if (useBars) {
      return Math.max(
        1,
        ...currentData.map((d) => {
          if (stackKeys.length > 0) {
            return stackKeys.reduce((acc, k) => acc + ((d[k] as number) || 0), 0);
          }
          return (d.total as number) || 0;
        })
      );
    }
    return Math.max(
      1,
      ...currentData.flatMap((d) => activeSeriesKeys.map((k) => (d[k] as number) || 0))
    );
  }, [useBars, currentData, activeSeriesKeys, stackKeys]);

  // คำนวณ step สเกลแกน Y ให้เป็นเลขกลมสวยงาม
  const step = useMemo(() => {
    if (maxValInSeries > 500) return 100;
    if (maxValInSeries > 200) return 50;
    if (maxValInSeries > 80) return 20;
    if (maxValInSeries > 35) return 10;
    if (maxValInSeries > 15) return 5;
    if (maxValInSeries > 6) return 2;
    return 1;
  }, [maxValInSeries]);

  const max = Math.max(step * 4, Math.ceil((maxValInSeries * 1.15) / step) * step);

  // พิกัด X สำหรับ Line Chart (12 เดือน)
  const getLineX = (i: number) => {
    if (currentData.length <= 1) return pad.l + iw / 2;
    return pad.l + (iw * i) / (currentData.length - 1);
  };

  // พิกัด X และความกว้างสำหรับ Bar Chart (รายวัน 1 - 31)
  const colW = iw / Math.max(1, currentData.length);
  const barW = Math.max(12, Math.min(22, colW * 0.65));
  const getBarX = (i: number) => pad.l + colW * i + (colW - barW) / 2;
  const getBarCenterX = (i: number) => pad.l + colW * i + colW / 2;

  // พิกัด Y
  const getY = (v: number) => {
    return pad.t + ih * (1 - Math.min(v, max) / max);
  };

  const toPath = (pts: number[][]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  // ยอดรวมแต่ละซีรีส์ในมุมมองปัจจุบัน
  const seriesTotals = useMemo(() => {
    const sums: Record<SeriesKey, number> = {
      seaImport: 0,
      seaExport: 0,
      airImport: 0,
      airExport: 0,
      transport: 0,
      freight: 0,
      total: 0,
    };
    for (const d of currentData) {
      for (const s of SERIES_LIST) {
        sums[s.key] += (d[s.key] as number) || 0;
      }
    }
    return sums;
  }, [currentData]);

  // จุดข้อมูลสำหรับ hover tooltip
  const hoveredPoint = hoverIndex !== null && currentData[hoverIndex] ? currentData[hoverIndex] : null;

  // ชื่อเดือนที่กำลังเลือก
  const selectedMonthLabel = useMemo(() => {
    if (activeMonth === "all") return "ภาพรวม 12 เดือน (2026)";
    const found = monthsData.find((m) => m.key === activeMonth);
    return found ? found.fullLabel : activeMonth;
  }, [activeMonth, monthsData]);

  return (
    <div className={`flex flex-col h-full justify-between ${compact ? "gap-2" : "gap-4"}`}>
      {compact ? (
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
            <h3 className="text-[14px] font-bold text-[#0c2340]">{title}</h3>
          </div>
          <div className="text-xs text-slate-500">
            <span className="font-mono font-bold text-[16px] text-[#0c2340] tabular-nums">
              {fmtNum(seriesTotals.total + seriesTotals.transport)}
            </span>{" "}
            งาน
          </div>
        </div>
      ) : (
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#dce2e8]">
        {/* Toggle Mode Segmented Buttons */}
        <div className="inline-flex rounded-[8px] border border-[#c5cfd9] bg-[#f8fafc] p-0.5 text-xs font-semibold shadow-2xs">
          <button
            type="button"
            onClick={() => {
              setViewMode("months");
              setHoverIndex(null);
              onSelectMonth("all");
            }}
            className={`px-3.5 py-1.5 rounded-[6px] transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-2 ${
              viewMode === "months"
                ? "bg-[#071a2f] text-white shadow-xs"
                : "text-[#526275] hover:text-[#102238]"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>ภาพรวม 12 เดือน</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("daily");
              setHoverIndex(null);
              if (activeMonth === "all") {
                onSelectMonth("2026-11");
              }
            }}
            className={`px-3.5 py-1.5 rounded-[6px] transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-2 ${
              viewMode === "daily"
                ? "bg-[#071a2f] text-white shadow-xs"
                : "text-[#526275] hover:text-[#102238]"
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>แผนภูมิรายวัน (1 - 31)</span>
          </button>
        </div>

        {/* Right side controls: Data Labels Toggle & Month Selector */}
        <div className="flex items-center gap-2.5">
          {/* Data labels toggle button */}
          <button
            type="button"
            onClick={() => setShowDataLabels((v) => !v)}
            className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold border transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
              showDataLabels
                ? "bg-[#eaf4fc] border-[#073766]/30 text-[#073766]"
                : "bg-white border-[#dce2e8] text-[#64748b] hover:text-[#102238]"
            }`}
            title="คลิกเพื่อเปิด/ปิดการแสดงตัวเลขจำนวนงานบนแผนภูมิ"
          >
            <Hash className="w-3.5 h-3.5" />
            <span>{showDataLabels ? "ซ่อนตัวเลข" : "แสดงตัวเลข"}</span>
          </button>

          {/* Month Selector for Daily Bar Chart */}
          {viewMode === "daily" && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[#526275] font-medium hidden sm:inline">เดือน:</span>
              <select
                aria-label="เลือกเดือนสำหรับดูแผนภูมิแท่งรายวัน"
                value={activeMonth === "all" ? "2026-11" : activeMonth}
                onChange={(e) => {
                  onSelectMonth(e.target.value);
                  setHoverIndex(null);
                }}
                className="h-8 px-2.5 rounded-[6px] border border-[#c5cfd9] bg-white text-xs font-semibold text-[#073766] outline-none focus:border-[#f56a22] cursor-pointer shadow-2xs"
              >
                {monthsData.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.fullLabel}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      )}

      {/* --------------------------------------------------------------------
       * SVG CHART AREA
       * -------------------------------------------------------------------- */}
      <div className="relative my-auto select-none flex-1 flex items-center justify-center w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`w-full h-auto overflow-visible ${compact ? "" : "min-h-[380px] max-h-[520px]"}`}
          role="img"
          aria-label={
            useBars
              ? `แผนภูมิแท่งแสดงปริมาณงาน${title ? ` ${title}` : ""} ${viewMode === "daily" ? `รายวัน เดือน ${selectedMonthLabel}` : "รายเดือน"}`
              : "กราฟแนวโน้มปริมาณงานและรถขนส่งภาพรวม 12 เดือน"
          }
          onMouseLeave={() => setHoverIndex(null)}
        >
          {!compact && (
          <text
            x={pad.l}
            y={pad.t - 14}
            fontSize="11"
            fontWeight="700"
            fill="#475569"
            className="tracking-tight"
          >
            จำนวนงาน (Jobs)
          </text>
          )}

          {/* เส้นขอบแกนซ้าย */}
          <line
            x1={pad.l}
            y1={pad.t}
            x2={pad.l}
            y2={H - pad.b}
            stroke="#cbd5e1"
            strokeWidth="1"
            aria-hidden="true"
          />

          {/* Gridlines & ตัวเลขสเกลด้านซ้าย */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const val = Math.round(max * ratio);
            const yy = getY(val);
            return (
              <g key={idx}>
                {/* Horizontal Gridline */}
                <line
                  x1={pad.l}
                  y1={yy}
                  x2={W - pad.r}
                  y2={yy}
                  stroke="#e2e8f0"
                  strokeDasharray={idx === 0 ? "0" : "3 4"}
                  aria-hidden="true"
                />
                {/* Tick mark */}
                <line
                  x1={pad.l - 5}
                  y1={yy}
                  x2={pad.l}
                  y2={yy}
                  stroke="#94a3b8"
                  strokeWidth="1"
                  aria-hidden="true"
                />
                {/* Scale Number on Left */}
                <text
                  x={pad.l - 9}
                  y={yy + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                  fill="#64748b"
                >
                  {fmtNum(val)}
                </text>
              </g>
            );
          })}

          {/* เส้นขอบแกนล่าง (X-Axis Baseline) */}
          <line
            x1={pad.l}
            y1={H - pad.b}
            x2={W - pad.r}
            y2={H - pad.b}
            stroke="#cbd5e1"
            strokeWidth="1"
            aria-hidden="true"
          />

          {/* ------------------------------------------------------------------
           * MODE 1: BAR CHART (แผนภูมิแท่ง) — แสดงเมื่อเลือกเดือนเฉพาะ (กว้างและใหญ่ขึ้น)
           * ------------------------------------------------------------------ */}
          {useBars && (
            <g id="daily-bar-chart-group">
              {currentData.map((d, i) => {
                const barX = getBarX(i);
                const cx = getBarCenterX(i);
                const isHovered = hoverIndex === i;

                // คำนวณความสูงของแต่ละแท่งย่อย (Stacked segments) จากล่างขึ้นบน
                const segments: { key: SeriesKey; color: string; val: number; y: number; h: number; isTop: boolean }[] = [];
                let currentY = H - pad.b;

                // เรียงบริการจากล่างขึ้นบน: SEA Import, SEA Export, AIR Import, AIR Export, Transport, Freight
                const activeNonTotal = SERIES_LIST.filter((s) => s.key !== "total" && visibleSeries[s.key]);

                for (const s of activeNonTotal) {
                  const val = (d[s.key] as number) || 0;
                  if (val > 0) {
                    const h = (val / max) * ih;
                    currentY -= h;
                    segments.push({
                      key: s.key,
                      color: s.color,
                      val,
                      y: currentY,
                      h,
                      isTop: false,
                    });
                  }
                }

                if (segments.length > 0) {
                  segments[segments.length - 1].isTop = true;
                }

                // ยอดรวมประจำวัน
                const dayTotal = segments.reduce((sum, seg) => sum + seg.val, 0);

                return (
                  <g
                    key={`bar-col-${d.key || i}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIndex(i)}
                    onClick={() => {
                      // รายเดือน: คลิกแท่งเพื่อเจาะดูรายวันของเดือนนั้น
                      if (viewMode === "months") onSelectMonth(d.key);
                    }}
                  >
                    {/* Hover Column Background Pillar */}
                    <rect
                      x={pad.l + colW * i}
                      y={pad.t}
                      width={colW}
                      height={ih}
                      rx="5"
                      fill={isHovered ? "rgba(7, 55, 102, 0.08)" : "transparent"}
                      className="transition-colors duration-150 pointer-events-none"
                    />

                    {/* Stacked Bar Segments (ขนาดใหญ่ 18-22px ปลายมนสวยงาม) */}
                    {segments.map((seg) => (
                      <rect
                        key={`bar-seg-${seg.key}-${i}`}
                        x={barX}
                        y={seg.y}
                        width={barW}
                        height={Math.max(1.5, seg.h)}
                        rx={seg.isTop ? 4 : 0}
                        ry={seg.isTop ? 4 : 0}
                        fill={seg.color}
                        opacity={isHovered ? 1 : 0.92}
                        className="transition-all duration-150 pointer-events-none"
                      />
                    ))}

                    {/* วันที่ไม่มีงาน: แสดงเส้นขีดบางๆ ที่ฐาน */}
                    {dayTotal === 0 && (
                      <line
                        x1={barX}
                        y1={H - pad.b - 1}
                        x2={barX + barW}
                        y2={H - pad.b - 1}
                        stroke="#cbd5e1"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="pointer-events-none"
                      />
                    )}

                    {/* Total Number Label on Top of Stacked Bar */}
                    {showDataLabels && dayTotal > 0 && (
                      <text
                        x={cx}
                        y={currentY - 5}
                        textAnchor="middle"
                        fontSize={isHovered ? "11" : "10"}
                        fontWeight="700"
                        fontFamily="IBM Plex Mono, monospace"
                        fill="#0c2340"
                        className="pointer-events-none select-none"
                      >
                        {fmtNum(dayTotal)}
                      </text>
                    )}

                    {/* X-Axis Day Number */}
                    <text
                      x={cx}
                      y={H - pad.b + 18}
                      textAnchor="middle"
                      fontSize={isHovered ? "11" : "9.5"}
                      fontWeight={isHovered ? "700" : (i % 2 === 0 ? "600" : "500")}
                      fontFamily="IBM Plex Mono, monospace"
                      fill={isHovered ? "#f56a22" : (i % 2 === 0 ? "#1e293b" : "#64748b")}
                      className="pointer-events-none select-none"
                    >
                      {d.label}
                    </text>

                    {/* Interactive Hit Area across full column */}
                    <rect
                      x={pad.l + colW * i}
                      y={pad.t}
                      width={colW}
                      height={ih + 28}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            </g>
          )}

          {/* ------------------------------------------------------------------
           * MODE 2: LINE CHART (กราฟเส้น) — แสดงเมื่อดูภาพรวม 12 เดือน (ขนาดใหญ่ กว้าง)
           * ------------------------------------------------------------------ */}
          {!useBars && (
            <g id="months-line-chart-group">
              {/* Hover Column Guide Line */}
              {hoverIndex !== null && (
                <line
                  x1={getLineX(hoverIndex)}
                  y1={pad.t}
                  x2={getLineX(hoverIndex)}
                  y2={H - pad.b}
                  stroke="#94a3b8"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  aria-hidden="true"
                />
              )}

              {/* Lines for each active Service */}
              {SERIES_LIST.map((s) => {
                if (!visibleSeries[s.key]) return null;
                const pts = currentData.map((d, i) => [getLineX(i), getY((d[s.key] as number) || 0)]);
                if (pts.length < 2) return null;

                return (
                  <g key={s.key}>
                    <path
                      d={toPath(pts)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.strokeWidth}
                      strokeDasharray={s.dash || "none"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-[d,stroke] duration-200"
                    />
                  </g>
                );
              })}

              {/* Circles and Data Points */}
              {currentData.map((d, i) => {
                const cx = getLineX(i);
                const isHovered = hoverIndex === i;

                return (
                  <g
                    key={d.key || i}
                    onMouseEnter={() => setHoverIndex(i)}
                    onClick={() => {
                      onSelectMonth(d.key);
                      setViewMode("daily");
                    }}
                    className="cursor-pointer"
                  >
                    {/* Invisible wider hit area */}
                    <rect
                      x={cx - (iw / currentData.length) / 2}
                      y={pad.t}
                      width={iw / currentData.length}
                      height={ih}
                      fill="transparent"
                    />

                    {/* Circles for each active series */}
                    {SERIES_LIST.map((s) => {
                      if (!visibleSeries[s.key]) return null;
                      const val = (d[s.key] as number) || 0;
                      const cy = getY(val);

                      return (
                        <circle
                          key={s.key}
                          cx={cx}
                          cy={cy}
                          r={isHovered ? (s.key === "total" ? 6 : 5) : (s.key === "total" ? 4.5 : 3.5)}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? 2.2 : 1.5}
                          className="transition-all duration-150"
                        />
                      );
                    })}

                    {/* X-Axis Month Tick */}
                    <text
                      x={cx}
                      y={H - 14}
                      textAnchor="middle"
                      fontSize="11.5"
                      fontWeight={isHovered ? "700" : "600"}
                      fontFamily="IBM Plex Mono, monospace"
                      fill={isHovered ? "#f56a22" : "#334155"}
                    >
                      {d.label}
                    </text>
                  </g>
                );
              })}

              {/* Data Labels for Line Chart */}
              {showDataLabels && (
                <g className="pointer-events-none select-none">
                  {visibleSeries.total &&
                    currentData.map((d, i) => {
                      const val = d.total || 0;
                      if (val === 0) return null;
                      const cx = getLineX(i);
                      const cy = getY(val);
                      const isHovered = hoverIndex === i;
                      return (
                        <text
                          key={`lbl-tot-${i}`}
                          x={cx}
                          y={cy - 12}
                          textAnchor="middle"
                          fontSize={isHovered ? "12" : "10.5"}
                          fontWeight="800"
                          fontFamily="IBM Plex Mono, monospace"
                          fill="#071a2f"
                          stroke="#ffffff"
                          strokeWidth="3.5"
                          paintOrder="stroke fill"
                          strokeLinejoin="round"
                        >
                          {fmtNum(val)}
                        </text>
                      );
                    })}

                  {!visibleSeries.total &&
                    activeSeriesKeys.length <= 2 &&
                    SERIES_LIST.filter((s) => s.key !== "total" && visibleSeries[s.key]).map((s) =>
                      currentData.map((d, i) => {
                        const val = (d[s.key] as number) || 0;
                        if (val === 0) return null;
                        const cx = getLineX(i);
                        const cy = getY(val);
                        const isHovered = hoverIndex === i;
                        return (
                          <text
                            key={`lbl-${s.key}-${i}`}
                            x={cx}
                            y={cy + s.labelOffsetY}
                            textAnchor="middle"
                            fontSize={isHovered ? "11.5" : "10"}
                            fontWeight="700"
                            fontFamily="IBM Plex Mono, monospace"
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth="3.5"
                            paintOrder="stroke fill"
                            strokeLinejoin="round"
                          >
                            {fmtNum(val)}
                          </text>
                        );
                      })
                    )}
                </g>
              )}
            </g>
          )}
        </svg>

        {/* ------------------------------------------------------------------
         * FLOATING HOVER TOOLTIP CARD
         * ------------------------------------------------------------------ */}
        {hoveredPoint && hoverIndex !== null && (
          <div
            className="absolute top-2 -translate-x-1/2 pointer-events-none z-30 bg-[#071a2f]/95 backdrop-blur-md text-white p-3.5 rounded-[9px] shadow-2xl border border-white/15 text-xs font-sans min-w-[200px]"
            style={{
              // ตำแหน่งเป็น % ของความกว้างกราฟ เพื่อให้ตรงทั้งกราฟใหญ่และกราฟเล็ก
              left: `${Math.min(
                Math.max(((useBars ? getBarCenterX(hoverIndex) : getLineX(hoverIndex)) / W) * 100, 22),
                78
              )}%`,
            }}
          >
            <div className="font-bold text-[13.5px] border-b border-white/15 pb-1.5 flex items-center justify-between text-[#fed7aa]">
              <span>{hoveredPoint.fullLabel}</span>
              {viewMode === "months" && (
                <span className="text-[10px] text-white/60 font-normal">คลิกเพื่อดูแผนภูมิแท่ง</span>
              )}
            </div>
            <div className="mt-2.5 space-y-1.5 font-variant-numeric:tabular-nums">
              {SERIES_LIST.map((s) => {
                if (!visibleSeries[s.key]) return null;
                const val = (hoveredPoint[s.key] as number) || 0;
                return (
                  <div key={s.key} className="flex items-center justify-between text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-slate-200">{s.label}</span>
                    </div>
                    <span className="font-mono font-bold" style={{ color: s.color === "#071a2f" ? "#ffffff" : s.color }}>
                      {fmtNum(val)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------
       * BOTTOM INTERACTIVE LEGEND
       * -------------------------------------------------------------------- */}
      {!compact && (
      <div className="pt-3.5 border-t border-[#dce2e8] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {SERIES_LIST.map((s) => {
            const isVisible = visibleSeries[s.key];
            const sumVal = seriesTotals[s.key];
            const isTotal = s.key === "total";

            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleSeries(s.key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[7px] border text-xs font-medium transition-all duration-150 cursor-pointer ${
                  isVisible
                    ? isTotal
                      ? "bg-[#071a2f] border-[#071a2f] text-white shadow-xs"
                      : "bg-white border-[#c5cfd9] text-[#102238] shadow-2xs hover:bg-slate-50"
                    : "bg-[#f5f6f8] border-[#e2e8f0] text-[#94a3b8] opacity-60 line-through"
                }`}
                title={`คลิกเพื่อ${isVisible ? "ซ่อน" : "แสดง"} ${s.label}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: isVisible ? (isTotal ? "#fed7aa" : s.color) : "#94a3b8",
                  }}
                />
                <span className="font-semibold">{s.label}:</span>
                <span className={`font-mono font-bold ${isTotal ? "text-[#fed7aa]" : "text-[#073766]"}`}>
                  {fmtNum(sumVal)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[12px] text-[#64748b] flex items-center gap-1.5 font-normal">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{viewMode === "daily" ? "คลิกป้ายกำกับเพื่อเปิด/ปิดประเภทงาน หรือชี้แท่งกราฟเพื่อดูรายละเอียด" : "คลิกจุดบนกราฟเพื่อเจาะลึกเป็นแผนภูมิแท่งรายวัน"}</span>
        </div>
      </div>
      )}
    </div>
  );
}
