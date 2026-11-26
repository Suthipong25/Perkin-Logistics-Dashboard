"use client";

import React from "react";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { JobRecord } from "@/types/dashboard";
import {
  fmtNum,
  fmtDate,
  fmtMonth,
  serviceMeta,
  daysOpen,
  parseUpdateStatus,
} from "@/lib/dashboard-helpers";

interface OverdueJobsTableProps {
  monthFilter: string;
  setMonthFilter: (m: string) => void;
  stats: {
    exceptions: JobRecord[];
    isShowingAllFallback: boolean;
    allOverdueCount: number;
    overdue: number;
  };
  onSelectJobNo: (jobNo: string) => void;
  onNavigateJobs: (overdueOnly?: boolean) => void;
}

export function OverdueJobsTable({
  monthFilter,
  setMonthFilter,
  stats,
  onSelectJobNo,
  onNavigateJobs,
}: OverdueJobsTableProps) {
  return (
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
              `รายการงานสถานะ Booking, Control และ Waiting ที่ผ่านกำหนด ETA/ETD แล้ว (${stats.overdue} งาน)`
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
              <th className="py-3 px-4">สาเหตุ / สถานะติดตาม (Update Status)</th>
              <th className="py-3 px-3 text-right">เกินกำหนด</th>
              <th className="py-3 px-4 text-center">สถานะ FWD System</th>
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
                const isExport =
                  j.service.includes("Export") ||
                  j.jobNo.startsWith("SE") ||
                  j.jobNo.startsWith("AE");
                const displayDate = !isExport && j.eta ? j.eta : j.etd;
                const dateLabel = !isExport && j.eta ? "ETA" : "ETD";
                const age = daysOpen(j);

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
                    className="hover:bg-[#f8fafc] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[#073766] group-hover:text-[#f56a22] whitespace-nowrap">
                      {j.jobNo}
                      {j.joinNo && (
                        <span className="block text-[11px] text-[#526275] font-normal">
                          Join: {j.joinNo}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[11.5px] font-semibold text-white font-mono"
                        style={{ backgroundColor: sm.color }}
                      >
                        {sm.code}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 max-w-[220px] truncate text-[#102238]"
                      title={j.customer}
                    >
                      {j.customer || "—"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-xs">
                      {displayDate ? (
                        <div>
                          <span className="text-[#526275] text-[11px] mr-1">
                            {dateLabel}:
                          </span>
                          <span>{fmtDate(displayDate)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className="py-3 px-4 max-w-[240px] truncate text-xs text-[#526275]"
                      title={parseUpdateStatus(j.updateStatus).text || j.remark || "คลิกเพื่อเปิด Drawer ระบุสถานะ/หมายเหตุ"}
                    >
                      {(() => {
                        const upd = parseUpdateStatus(j.updateStatus);
                        const txt = upd.text || j.remark;
                        return txt ? (
                          <span className={`inline-block px-2 py-0.5 rounded border font-medium truncate max-w-full ${upd.meta.cellClass}`}>
                            {txt}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {age !== null && age > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#fff1e8] text-[#f56a22] border border-[#fed7aa]">
                          +{age} วัน
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          (j.statusDetail || "").includes("Booking") || j.status === "Booking"
                            ? "bg-[#ede9fe] text-[#6d28d9] border border-[#ddd6fe]"
                            : (j.statusDetail || "").includes("Wait")
                            ? "bg-[#fff1e8] text-[#c2410c] border border-[#fed7aa]"
                            : "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            (j.statusDetail || "").includes("Booking") || j.status === "Booking"
                              ? "bg-[#8b5cf6]"
                              : (j.statusDetail || "").includes("Wait")
                              ? "bg-[#f56a22]"
                              : "bg-[#0284c7]"
                          }`}
                        />
                        {j.statusDetail || j.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
