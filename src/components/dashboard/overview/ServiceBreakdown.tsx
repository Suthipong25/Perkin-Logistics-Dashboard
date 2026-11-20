"use client";

import React, { useState } from "react";
import { fmtNum, fmtMonth, pct } from "@/lib/dashboard-helpers";

export interface MatrixRow {
  key: string;
  name: string;
  code: string;
  color: string;
  total: number;
  completed: number;
  control: number;
  waiting: number;
  inProgress?: number;
  booking?: number;
  cancelled?: number;
}

interface ServiceBreakdownProps {
  monthFilter: string;
  stats: {
    matrixTotals: {
      total: number;
      completed: number;
      control: number;
      waiting: number;
    };
    matrixRows: MatrixRow[];
    services: MatrixRow[];
  };
}

export function ServiceBreakdown({ monthFilter, stats }: ServiceBreakdownProps) {
  const [serviceViewMode, setServiceViewMode] = useState<"bars" | "matrix">("bars");

  return (
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
        /* Matrix Table View */
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
        /* Visual Bars View */
        <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-5">
            {stats.services.map((sv) => {
              const inProgress = sv.inProgress ?? sv.control;
              const booking = sv.booking ?? sv.waiting;

              return (
                <div key={sv.key} className="space-y-1.5">
                  <div className="grid grid-cols-[136px_1fr_84px] items-center gap-3.5">
                    <div>
                      <div className="text-[15px] font-bold text-[#102238] leading-tight">
                        {sv.name}
                      </div>
                      <div className="text-[11.5px] text-[#6e7e91] font-mono mt-0.5">
                        {sv.code}
                      </div>
                    </div>

                    <div className="h-3 rounded-full bg-[#eef2f6] flex overflow-hidden shadow-2xs">
                      <div
                        style={{
                          width: `${pct(sv.completed, sv.total)}%`,
                          backgroundColor: "#0d7a5f",
                        }}
                        className="transition-[width] duration-500 ease-out"
                        title={`Completed: ${sv.completed} งาน`}
                      />
                      <div
                        style={{
                          width: `${pct(inProgress, sv.total)}%`,
                          backgroundColor: "#f56a22",
                        }}
                        className="transition-[width] duration-500 ease-out"
                        title={`Control: ${inProgress} งาน`}
                      />
                      <div
                        style={{
                          width: `${pct(booking, sv.total)}%`,
                          backgroundColor: "#073766",
                        }}
                        className="transition-[width] duration-500 ease-out"
                        title={`Waiting: ${booking} งาน`}
                      />
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-[15.5px] font-mono text-[#102238] tabular-nums">
                        {fmtNum(sv.total)}
                      </span>
                      <span className="text-[11.5px] text-[#6e7e91] ml-1">งาน</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11.5px] text-[#6e7e91] pl-[148px] pr-1">
                    <span className="text-[#0d7a5f] font-medium">
                      ✓ {fmtNum(sv.completed)} ปิดงาน
                    </span>
                    <span className="text-[#db5610] font-medium">
                      ⚡ {fmtNum(inProgress)} ดำเนินการ
                    </span>
                    <span className="text-[#073766] font-medium">
                      ⏳ {fmtNum(booking)} รอเอกสาร
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-[#dce2e8] flex flex-wrap items-center justify-between text-xs text-[#526275]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0d7a5f]" />
                <span>เสร็จสิ้น (Completed)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f56a22]" />
                <span>กำลังดำเนินการ (Control)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#073766]" />
                <span>รอเอกสาร / จองเรือ (Waiting)</span>
              </span>
            </div>
            <span className="text-[11px] text-[#6e7e91]">
              ข้อมูลนับตามแถวรายงาน Booking Report ประจำปี 2026
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
