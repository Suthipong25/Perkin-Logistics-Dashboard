"use client";

import React from "react";
import { fmtNum, pct } from "@/lib/dashboard-helpers";

interface OverviewKpiCardsProps {
  stats: {
    total: number;
    shipmentCount: number;
    transportCount: number;
    completed: number;
    open: number;
    bookingCount?: number;
    controlCount: number;
    waitingCount: number;
    overdue: number;
    totalWithTransport: number;
    services: Array<{
      key: string;
      name: string;
      color: string;
      total: number;
    }>;
  };
  onNavigateJobs: (overdueOnly?: boolean) => void;
}

export function OverviewKpiCards({ stats, onNavigateJobs }: OverviewKpiCardsProps) {
  return (
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
            <span>
              ชิปเมนท์หลัก{" "}
              <strong className="text-slate-900 font-semibold">
                {fmtNum(stats.shipmentCount)}
              </strong>
            </span>
            <span className="text-slate-300">|</span>
            <span>
              รถขนส่ง{" "}
              <strong className="text-amber-700 font-semibold">
                {fmtNum(stats.transportCount)}
              </strong>
            </span>
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
            <span className="text-[11px] font-mono text-emerald-700 font-semibold">
              DELIVERY
            </span>
          </div>
          <div className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight num text-emerald-700">
            {pct(stats.completed, stats.total).toFixed(1)}
            <span className="text-xl ml-1 font-semibold text-slate-500">%</span>
          </div>
          <div className="mt-1 text-xs text-slate-600">
            ปิดงานสมบูรณ์แล้ว{" "}
            <strong className="text-slate-900 font-semibold">
              {fmtNum(stats.completed)}
            </strong>{" "}
            จาก {fmtNum(stats.total)} งาน
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
            <span className="text-[11px] font-mono text-amber-700 font-semibold">
              ACTIVE
            </span>
          </div>
          <div className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight num text-[#0c2340]">
            {fmtNum(stats.open)}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {stats.bookingCount !== undefined && stats.bookingCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200/80 text-purple-800 text-[11px] font-semibold">
                Booking: {stats.bookingCount}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200/80 text-blue-800 text-[11px] font-semibold">
              Control: {stats.controlCount}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-800 text-[11px] font-semibold">
              Waiting: {stats.waitingCount}
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
      <div
        className={`rounded-xl p-5 shadow-xs flex flex-col justify-between card-hover-lift animate-fade-in-up [animation-delay:180ms] ${
          stats.overdue > 0
            ? "bg-rose-50/60 border border-rose-200 hover:border-rose-300"
            : "bg-white border border-slate-200/90 hover:border-slate-300"
        }`}
      >
        <div>
          <div className="flex items-center justify-between text-xs font-medium">
            <span
              className={
                stats.overdue > 0
                  ? "text-rose-900 font-semibold"
                  : "text-slate-500"
              }
            >
              งานเลยกำหนด ETD
            </span>
            <span
              className={`text-[11px] font-mono font-semibold ${
                stats.overdue > 0 ? "text-rose-700" : "text-slate-400"
              }`}
            >
              {stats.overdue > 0 ? "ATTENTION" : "CLEARED"}
            </span>
          </div>
          <div
            className={`mt-2 text-[38px] font-extrabold leading-tight tracking-tight num ${
              stats.overdue > 0 ? "text-rose-700" : "text-slate-800"
            }`}
          >
            {fmtNum(stats.overdue)}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {stats.overdue > 0 ? (
              <span>
                คิดเป็น{" "}
                <strong className="text-rose-700 font-bold">
                  {pct(stats.overdue, stats.open)}%
                </strong>{" "}
                ของงานเปิดอยู่
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
              className={`h-full rounded-full ${
                stats.overdue > 0 ? "bg-rose-600" : "bg-emerald-600"
              }`}
              style={{
                width: `${
                  stats.overdue > 0 ? pct(stats.overdue, stats.open) : 100
                }%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
