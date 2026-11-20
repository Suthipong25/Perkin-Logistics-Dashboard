"use client";

import React from "react";
import {
  Truck,
  Search,
  Sparkles,
  RotateCw,
  ShieldCheck,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fmtNum } from "@/lib/dashboard-helpers";
import { StagingTransportRecord, TransportFilterType } from "./types";

interface StagingTransportTableProps {
  stagingTransport: StagingTransportRecord[];
  filteredTransportStaging: StagingTransportRecord[];
  pagedTransportStaging: StagingTransportRecord[];
  selectedTransportIds: Set<string>;
  transportFilter: TransportFilterType;
  setTransportFilter: (f: TransportFilterType) => void;
  transportQ: string;
  setTransportQ: (q: string) => void;
  setTransportPage: (p: number | ((p: number) => number)) => void;
  transportPageSize: number;
  setTransportPageSize: (s: number) => void;
  safeCurrentTransportPage: number;
  totalTransportPages: number;
  countNewTransport: number;
  countDateUpdatesTransport: number;
  countUnchangedTransport: number;
  toggleSelectTransport: (id: string) => void;
  handleSelectSafeTransportOnly: () => void;
  handleSelectAllTransport: () => void;
  handleDeselectAllTransport: () => void;
  handleConfirmApplyTransport: () => void;
}

export function StagingTransportTable({
  stagingTransport,
  filteredTransportStaging,
  pagedTransportStaging,
  selectedTransportIds,
  transportFilter,
  setTransportFilter,
  transportQ,
  setTransportQ,
  setTransportPage,
  transportPageSize,
  setTransportPageSize,
  safeCurrentTransportPage,
  totalTransportPages,
  countNewTransport,
  countDateUpdatesTransport,
  countUnchangedTransport,
  toggleSelectTransport,
  handleSelectSafeTransportOnly,
  handleSelectAllTransport,
  handleDeselectAllTransport,
  handleConfirmApplyTransport,
}: StagingTransportTableProps) {
  return (
    <section className="bg-white rounded-[12px] border border-[#dce2e8] shadow-xs overflow-hidden">
      {/* Header Toolbar */}
      <div className="p-4 border-b border-[#dce2e8] flex flex-wrap items-center justify-between gap-3 bg-[#fafbfc]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15.5px] font-bold text-[#102238]">
                ตารางดูและตรวจสอบเที่ยวรถก่อนนำเข้า (Transport Staging Editor)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#073766] text-white">
                {stagingTransport.length} รายการ
              </span>
            </div>
            <p className="text-xs text-[#526275] mt-0.5">
              ตรวจสอบรหัสเที่ยวรถ (TS NO), งานที่ผูก (Job No), ทะเบียน และเส้นทางก่อนยืนยันนำเข้าสู่ระบบเดินรถจริง
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="ค้นหาเที่ยวรถใน Staging"
              placeholder="ค้นหา TS NO, Job, ลูกค้า, ทะเบียน..."
              value={transportQ}
              onChange={(e) => {
                setTransportQ(e.target.value);
                setTransportPage(1);
              }}
              className="w-56 pl-8 pr-3 h-9 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#073766] focus:ring-2 focus:ring-[#073766]/10 transition-[border-color,box-shadow]"
            />
          </div>

          {/* Filter Tabs */}
          <div className="p-0.5 bg-slate-100 rounded-lg border border-slate-200/70 inline-flex items-center gap-1 text-xs">
            <button
              type="button"
              aria-label="แสดงเฉพาะเที่ยวรถใหม่"
              onClick={() => {
                setTransportFilter("new");
                setTransportPage(1);
              }}
              className={`px-2.5 py-1 rounded-[6px] transition-[background-color,color] cursor-pointer ${
                transportFilter === "new"
                  ? "bg-emerald-700 text-white font-semibold"
                  : "text-emerald-700 hover:text-emerald-900"
              }`}
            >
              ✨ เที่ยวใหม่ ({countNewTransport})
            </button>
            <button
              type="button"
              aria-label="แสดงเฉพาะเที่ยวรถที่อัปเดตข้อมูล"
              onClick={() => {
                setTransportFilter("date_updates");
                setTransportPage(1);
              }}
              className={`px-2.5 py-1 rounded-[6px] transition-[background-color,color] cursor-pointer ${
                transportFilter === "date_updates"
                  ? "bg-sky-700 text-white font-semibold"
                  : "text-sky-700 hover:text-sky-900"
              }`}
            >
              🔄 อัปเดตข้อมูล ({countDateUpdatesTransport})
            </button>
            <button
              type="button"
              aria-label="แสดงเฉพาะเที่ยวรถเดิมไม่เปลี่ยน"
              onClick={() => {
                setTransportFilter("existing");
                setTransportPage(1);
              }}
              className={`px-2.5 py-1 rounded-[6px] transition-[background-color,color] cursor-pointer ${
                transportFilter === "existing"
                  ? "bg-[#073766] text-white font-semibold"
                  : "text-[#526275] hover:text-[#102238]"
              }`}
            >
              ⚪ เที่ยวเดิม ({countUnchangedTransport})
            </button>
            <button
              type="button"
              aria-label="แสดงทั้งหมด"
              onClick={() => {
                setTransportFilter("all");
                setTransportPage(1);
              }}
              className={`px-2.5 py-1 rounded-[6px] transition-[background-color,color] cursor-pointer ${
                transportFilter === "all"
                  ? "bg-[#073766] text-white font-semibold"
                  : "text-[#526275] hover:text-[#102238]"
              }`}
            >
              ทั้งหมด ({stagingTransport.length})
            </button>
          </div>

          {/* Confirm Apply Transport Button */}
          <button
            type="button"
            aria-label="ยืนยันนำเข้าเที่ยวรถเข้าสู่ตารางเดินรถในประเทศ"
            onClick={handleConfirmApplyTransport}
            disabled={selectedTransportIds.size === 0}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none cursor-pointer ${
              selectedTransportIds.size > 0
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
            title={
              selectedTransportIds.size === 0
                ? "กรุณาเลือกเที่ยวรถที่ต้องการนำเข้าอย่างน้อย 1 รายการ"
                : `ยืนยันนำเข้าเที่ยวรถ ${selectedTransportIds.size} รายการ`
            }
          >
            <Check className="w-4 h-4" />
            <span>
              {selectedTransportIds.size === 0
                ? "ยังไม่ได้เลือกเที่ยวรถ"
                : `ยืนยันนำเข้าเที่ยวรถ (${selectedTransportIds.size})`}
            </span>
          </button>
        </div>
      </div>

      {/* Quick Selection Bar */}
      <div className="px-4 py-2.5 bg-slate-50/80 border-b border-[#dce2e8] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">
            เลือกแล้ว <b>{selectedTransportIds.size}</b> จาก <b>{stagingTransport.length}</b> เที่ยวรถ
          </span>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            aria-label="เลือกเฉพาะเที่ยวรถใหม่และอัปเดต"
            onClick={handleSelectSafeTransportOnly}
            className="px-2.5 py-1 rounded-md bg-emerald-100/80 hover:bg-emerald-200/80 text-emerald-800 font-semibold border border-emerald-300/80 transition-[background-color] cursor-pointer inline-flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>เลือกเฉพาะเที่ยวใหม่ & อัปเดต ({countNewTransport + countDateUpdatesTransport})</span>
          </button>
          <button
            type="button"
            aria-label="เลือกเที่ยวรถทั้งหมด"
            onClick={handleSelectAllTransport}
            className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-[background-color] cursor-pointer"
          >
            เลือกทั้งหมด
          </button>
          <button
            type="button"
            aria-label="ยกเลิกการเลือกเที่ยวรถทั้งหมด"
            onClick={handleDeselectAllTransport}
            className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 transition-[background-color] cursor-pointer"
          >
            ยกเลิกการเลือก
          </button>
        </div>

        <div className="text-[11.5px] text-slate-500 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>เที่ยวรถเดิมในระบบจะถูกข้ามและไม่เลือกเป็นค่าเริ่มต้น เพื่อป้องกันข้อมูลซ้ำซ้อน</span>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#f0f4f8] text-[#102238] font-bold text-[11.5px] uppercase tracking-wider border-b border-[#dce2e8]">
              <th className="p-3 w-10 text-center">
                <span className="sr-only">เลือก</span>
              </th>
              <th className="p-3 w-28">การกระทำ</th>
              <th className="p-3 w-32">รหัสเที่ยวรถ (TS NO)</th>
              <th className="p-3 w-36">JOB NO ที่ผูก</th>
              <th className="p-3 min-w-[200px]">ลูกค้า & เส้นทาง</th>
              <th className="p-3 w-36">ประเภทตู้ / รถ</th>
              <th className="p-3 min-w-[180px]">ผู้ให้บริการ / ทะเบียน / คนขับ</th>
              <th className="p-3 w-28">วันที่ส่งมอบ</th>
              <th className="p-3 w-28">สถานะ</th>
              <th className="p-3 w-28 text-right">การตรวจสอบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e6ebf0]">
            {pagedTransportStaging.map((t) => {
              const isChecked = selectedTransportIds.has(t.id);
              const isNewTrip = t.isNew || t.actionType === "new";

              return (
                <tr
                  key={t.id}
                  className={`hover:bg-[#fbfcfd] transition-[background-color] ${
                    isChecked ? "bg-emerald-50/20" : ""
                  }`}
                >
                  {/* Checkbox Column */}
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      aria-label={`เลือกเที่ยวรถ ${t.tripNo}`}
                      checked={isChecked}
                      onChange={() => toggleSelectTransport(t.id)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
                    />
                  </td>

                  {/* Action Type Badge */}
                  <td className="p-3">
                    {t.isDateChanged || t.isDriverChanged || t.isPlateChanged ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-300"
                        title={`อัปเดตข้อมูล: ${t.dateChangeDiff || ""} (อัปเดตทับเที่ยวเดิม ไม่บวม)`}
                      >
                        <RotateCw className="w-3 h-3 text-sky-600" />
                        <span>🔄 อัปเดตข้อมูล</span>
                      </span>
                    ) : isNewTrip ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        ✨ เที่ยวใหม่
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        ⚪ เที่ยวเดิมไม่เปลี่ยน
                      </span>
                    )}
                  </td>

                  {/* TS NO */}
                  <td className="p-3">
                    <div className="font-mono font-bold text-[13px] text-[#073766]">
                      {t.tripNo}
                    </div>
                    {t.transportNo && t.transportNo !== t.tripNo && (
                      <div className="text-[10.5px] font-mono text-slate-400">
                        Ref: {t.transportNo}
                      </div>
                    )}
                  </td>

                  {/* Linked Job No */}
                  <td className="p-3">
                    {t.hasLinkedJob && t.jobNo ? (
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-sky-50 text-[#073766] border border-sky-200 inline-block">
                        {t.jobNo}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-mono italic">
                        — เที่ยวรถอิสระ
                      </span>
                    )}
                  </td>

                  {/* Customer & Route */}
                  <td className="p-3">
                    <div
                      className="font-semibold text-[#102238] max-w-[240px] truncate"
                      title={t.customer}
                    >
                      {t.customer || "—"}
                    </div>
                    <div className="text-[11px] text-[#526275] flex items-center gap-1 font-mono mt-0.5">
                      <span
                        className="truncate max-w-[110px]"
                        title={t.pickupLocation}
                      >
                        {t.pickupLocation || "—"}
                      </span>
                      <span className="text-slate-400">➔</span>
                      <span
                        className="truncate max-w-[110px]"
                        title={t.deliveryLocation}
                      >
                        {t.deliveryLocation || "—"}
                      </span>
                    </div>
                  </td>

                  {/* Container / Truck Type */}
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-[#102238] border border-slate-200 inline-block">
                      {t.container || "—"}
                    </span>
                  </td>

                  {/* Transporter / Driver / Plate */}
                  <td className="p-3">
                    <div className="text-xs text-[#102238]">
                      {t.transporter || "—"}
                    </div>
                    <div className="text-[11px] text-[#526275] font-mono mt-0.5">
                      {t.plateNo ? `ทะเบียน ${t.plateNo}` : ""}
                      {t.driverName ? ` · ${t.driverName}` : ""}
                    </div>
                  </td>

                  {/* Delivery Date */}
                  <td className="p-3">
                    <div className="font-mono text-xs text-[#102238]">
                      {t.deliverDate || t.pickupDate || t.deliver || "—"}
                    </div>
                    {t.isDateChanged && t.dateChangeDiff && (
                      <div
                        className="text-[10.5px] font-mono text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200 mt-0.5 inline-block"
                        title={t.dateChangeDiff}
                      >
                        🔄 {t.dateChangeDiff}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="p-3">
                    {t.status?.includes("ยกเลิก") ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        <span>{t.status}</span>
                      </span>
                    ) : t.status?.includes("ส่งมอบ") ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>{t.status}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        <span>{t.status || "รอส่งมอบ"}</span>
                      </span>
                    )}
                  </td>

                  {/* Validation / Status note */}
                  <td className="p-3 text-right">
                    {isNewTrip ? (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center justify-end gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>เที่ยวรถใหม่</span>
                      </span>
                    ) : t.isDateChanged ||
                      t.isDriverChanged ||
                      t.isPlateChanged ? (
                      <span className="text-xs font-semibold text-sky-700 flex items-center justify-end gap-1">
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>พร้อมอัปเดต</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">
                        ⚪ ข้อมูลเดิม
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Pagination Footer */}
      <div className="p-3.5 border-t border-[#dce2e8] bg-[#f8fafc] flex flex-wrap items-center justify-between gap-3 text-xs text-[#526275]">
        <div className="flex items-center gap-2">
          <span>
            แสดง <b>{pagedTransportStaging.length}</b> จาก <b>{fmtNum(filteredTransportStaging.length)}</b> เที่ยวรถ
            {filteredTransportStaging.length !== stagingTransport.length && (
              <span className="text-[#6e7e91]"> (กรองจากทั้งหมด {fmtNum(stagingTransport.length)} เที่ยว)</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Page size selector */}
          <div className="flex items-center gap-1.5">
            <span>แสดงต่อหน้า:</span>
            <select
              aria-label="จำนวนเที่ยวรถที่แสดงต่อหน้า"
              value={transportPageSize}
              onChange={(e) => {
                setTransportPageSize(Number(e.target.value));
                setTransportPage(1);
              }}
              className="h-7 px-2 rounded border border-[#c5cfd9] bg-white text-xs outline-none focus:border-[#f56a22]"
            >
              <option value={25}>25 รายการ</option>
              <option value={50}>50 รายการ</option>
              <option value={100}>100 รายการ</option>
              <option value={10000}>แสดงทั้งหมด</option>
            </select>
          </div>

          {/* Page Navigation Controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTransportPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentTransportPage <= 1}
              className="p-1 rounded border border-[#c5cfd9] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-[#102238] transition-colors"
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-xs font-medium">
              {safeCurrentTransportPage} / {totalTransportPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setTransportPage((p) => Math.min(totalTransportPages, p + 1))
              }
              disabled={safeCurrentTransportPage >= totalTransportPages}
              className="p-1 rounded border border-[#c5cfd9] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-[#102238] transition-colors"
              aria-label="หน้าถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
