"use client";

import React from "react";
import {
  FileSpreadsheet,
  Search,
  Sparkles,
  RotateCw,
  FileText,
  ShieldCheck,
  Plus,
  Check,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fmtNum, fmtDate } from "@/lib/dashboard-helpers";
import { StagingRecord, StagingFilterType, isSelectable } from "./types";

interface StagingJobsTableProps {
  stagingData: StagingRecord[];
  filteredStaging: StagingRecord[];
  pagedStaging: StagingRecord[];
  selectedIds: Set<string>;
  previewFilter: StagingFilterType;
  setPreviewFilter: (f: StagingFilterType) => void;
  previewQ: string;
  setPreviewQ: (q: string) => void;
  editingId: string | null;
  editForm: Partial<StagingRecord>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<StagingRecord>>>;
  currentPage: number;
  setCurrentPage: (p: number | ((p: number) => number)) => void;
  pageSize: number;
  setPageSize: (s: number) => void;
  safeCurrentPage: number;
  totalPages: number;
  countGenuineNew: number;
  countDateUpdates: number;
  countCustomsUpdates: number;
  countUnchanged: number;
  countLockedOld: number;
  countActionable: number;
  selNewCount: number;
  selUpdateCount: number;
  selCustomsUpdateCount: number;
  selDateUpdateCount: number;
  toggleSelectRow: (id: string) => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  handleSelectSafeOnly: () => void;
  handleDeselectAll: () => void;
  handleAddNewRow: () => void;
  handleConfirmApply: () => void;
  handleStartEdit: (r: StagingRecord) => void;
  handleCancelEdit: () => void;
  handleSaveEdit: (id: string) => void;
  handleDeleteRow: (id: string) => void;
}

export function StagingJobsTable({
  stagingData,
  filteredStaging,
  pagedStaging,
  selectedIds,
  previewFilter,
  setPreviewFilter,
  previewQ,
  setPreviewQ,
  editingId,
  editForm,
  setEditForm,
  setCurrentPage,
  pageSize,
  setPageSize,
  safeCurrentPage,
  totalPages,
  countGenuineNew,
  countDateUpdates,
  countCustomsUpdates,
  countUnchanged,
  countLockedOld,
  countActionable,
  selNewCount,
  selUpdateCount,
  selCustomsUpdateCount,
  selDateUpdateCount,
  toggleSelectRow,
  setSelectedIds,
  handleSelectSafeOnly,
  handleDeselectAll,
  handleAddNewRow,
  handleConfirmApply,
  handleStartEdit,
  handleCancelEdit,
  handleSaveEdit,
  handleDeleteRow,
}: StagingJobsTableProps) {
  return (
    <section className="bg-white rounded-[12px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Header Toolbar */}
      <div className="p-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 bg-[#fafbfc]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-50 text-[#073766] border border-sky-200/70">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 tracking-tight">
            ตารางดูและแก้ไขข้อมูลก่อนนำเข้า (Staging Editor)
          </h3>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#071a2f] text-white font-mono font-semibold">
            {fmtNum(filteredStaging.length)} รายการ
          </span>
          {editingId && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-medium animate-pulse">
              กำลังแก้ไข 1 รายการ
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search box */}
          <div className="relative w-full sm:w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="ค้นหาตาม Job No, ลูกค้า หรือเลขที่ใบขน"
              value={previewQ}
              onChange={(e) => {
                setPreviewQ(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหา Job, ลูกค้า, ใบขน..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#073766] focus:ring-2 focus:ring-[#073766]/10 transition-[border-color,box-shadow]"
            />
          </div>

          {/* Segmented Filter Control */}
          <div className="p-0.5 bg-slate-100 rounded-lg border border-slate-200/70 inline-flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setPreviewFilter("new");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-[6px] font-semibold transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 ${
                previewFilter === "new"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50/60"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>งานใหม่ ({countGenuineNew})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewFilter("date_updates");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-[6px] font-medium transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 ${
                previewFilter === "date_updates"
                  ? "bg-sky-700 text-white shadow-xs font-semibold"
                  : "text-sky-800 hover:text-sky-950 hover:bg-sky-50/60"
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>อัปเดตกำหนดการ ({countDateUpdates})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewFilter("customs_updates");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-[6px] font-medium transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 ${
                previewFilter === "customs_updates"
                  ? "bg-indigo-700 text-white shadow-xs font-semibold"
                  : "text-indigo-800 hover:text-indigo-950 hover:bg-indigo-50/60"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>อัปเดตใบขน ({countCustomsUpdates})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewFilter("unchanged");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-[6px] font-medium transition-[background-color,color,box-shadow] duration-150 cursor-pointer ${
                previewFilter === "unchanged"
                  ? "bg-[#071a2f] text-white shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <span>ไม่เปลี่ยน ({countUnchanged})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewFilter("locked_old");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-[6px] font-medium transition-[background-color,color,box-shadow] duration-150 cursor-pointer flex items-center gap-1.5 ${
                previewFilter === "locked_old"
                  ? "bg-[#071a2f] text-white shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>ล็อคงานเก่า ({countLockedOld})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewFilter("all");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-[6px] font-medium transition-[background-color,color,box-shadow] duration-150 cursor-pointer ${
                previewFilter === "all"
                  ? "bg-[#071a2f] text-white shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              ทั้งหมด ({stagingData.length})
            </button>
          </div>

          {/* Add New Row Button */}
          <button
            type="button"
            onClick={handleAddNewRow}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            title="เพิ่มรายการใหม่ในตาราง Staging ด้วยตนเอง"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>เพิ่มงานใหม่</span>
          </button>

          {/* Confirm Apply Button */}
          <button
            type="button"
            onClick={handleConfirmApply}
            disabled={countActionable === 0 || selectedIds.size === 0}
            className={`h-9 px-3.5 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-[background-color,color] duration-150 cursor-pointer ${
              countActionable > 0 && selectedIds.size > 0
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
            title={
              countActionable === 0
                ? "ไม่มีงานใหม่หรือข้อมูลใบขน/กำหนดการที่เปลี่ยนแปลง"
                : `บันทึกข้อมูลที่เลือก ${selectedIds.size} รายการ`
            }
          >
            <Check className="w-4 h-4" />
            <span>
              {countActionable === 0
                ? "ไม่มีรายการนำเข้า"
                : selNewCount > 0 && selUpdateCount > 0
                ? `บันทึก (${selNewCount} ใหม่ + ${selUpdateCount} อัปเดต)`
                : selCustomsUpdateCount > 0
                ? `บันทึกอัปเดตใบขน (${selCustomsUpdateCount} งาน)`
                : selDateUpdateCount > 0
                ? `บันทึกอัปเดตกำหนดการ (${selDateUpdateCount} งาน)`
                : `นำเข้า Master (${selNewCount} งาน)`}
            </span>
          </button>
        </div>
      </div>

      {/* Smart Selective Upload Bar (แถบความปลอดภัย Anti-Bloat Guard) */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>นโยบายรักษาความถูกต้อง:</span>
          </span>
          <span className="font-medium text-slate-600">
            เลือกนำเข้า <strong className="text-emerald-700 font-bold font-mono">{selectedIds.size}</strong> จาก {stagingData.length} รายการ
          </span>
          <span
            className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium"
            title="ระบบข้ามรายการเดิมที่ไม่มีข้อมูลใบขนหรือกำหนดการเปลี่ยนแปลง"
          >
            ⚪ ไม่มีข้อมูลเปลี่ยนแปลง {countUnchanged} รายการ
          </span>
          {countLockedOld > 0 && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 font-medium"
              title="ระบบล็อคอัตโนมัติ ป้องกันการเผลอนำเข้างานเดือนเก่าเพื่อไม่ให้ยอดเดือนก่อนหน้าบวม"
            >
              🛡️ ล็อคงานเก่า {countLockedOld} รายการ
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={handleSelectSafeOnly}
            className="px-2.5 py-1 rounded-md bg-emerald-100/80 hover:bg-emerald-200/80 text-emerald-800 font-semibold text-xs border border-emerald-300/80 transition-colors cursor-pointer flex items-center gap-1"
            title="เลือกเฉพาะงานใหม่ประจำงวดปัจจุบัน (พ.ย. 26) ที่มีข้อมูลสินค้าจริง ไม่เอางานเก่าและงานเดิม"
          >
            <Sparkles className="w-3 h-3" />
            <span>✨ เลือกเฉพาะงานใหม่ ({countGenuineNew})</span>
          </button>
          <button
            type="button"
            onClick={handleDeselectAll}
            className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-600 font-medium text-xs transition-colors cursor-pointer"
          >
            <span>ยกเลิกการเลือก</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1080px]">
          <thead>
            <tr className="bg-[#f0f4f8] border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap">
              <th className="py-2.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="เลือก/ยกเลิกเฉพาะงานใหม่ในหน้านี้"
                  checked={
                    pagedStaging.filter(isSelectable).length > 0 &&
                    pagedStaging
                      .filter(isSelectable)
                      .every((r) => selectedIds.has(r.id))
                  }
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      pagedStaging.forEach((r) => {
                        if (isSelectable(r)) {
                          if (checked) next.add(r.id);
                          else next.delete(r.id);
                        }
                      });
                      return next;
                    });
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3">การกระทำ</th>
              <th className="py-2.5 px-3">Job No</th>
              <th className="py-2.5 px-3">ลูกค้า / ผู้นำเข้า-ส่งออก</th>
              <th className="py-2.5 px-3">เลขที่ใบขน</th>
              <th className="py-2.5 px-3">Invoice No</th>
              <th className="py-2.5 px-3">สถานะศุลกากร</th>
              <th className="py-2.5 px-3">รายละเอียด FWD / ตู้สินค้า</th>
              <th className="py-2.5 px-3">วันที่ (ETD / Submit)</th>
              <th className="py-2.5 px-3">การตรวจสอบ</th>
              <th className="py-2.5 px-3 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[13px] tabular-nums">
            {pagedStaging.map((r, idx) => {
              const isEditing = editingId === r.id;
              return (
                <tr
                  key={r.id || idx}
                  className={
                    isEditing
                      ? "bg-[#fff8f2] border-y-2 border-[#f56a22]/50 transition-colors"
                      : selectedIds.has(r.id)
                      ? "hover:bg-[#f8fafc] transition-colors"
                      : "opacity-60 bg-slate-50/50 hover:bg-slate-100/50 transition-colors"
                  }
                >
                  {/* 0. Checkbox Column */}
                  <td className="py-2.5 px-3 text-center align-middle">
                    {isSelectable(r) ? (
                      <input
                        type="checkbox"
                        aria-label={`เลือกอัปเดต ${r.jobNo}`}
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelectRow(r.id)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    ) : r.actionType === "update" ? (
                      <span
                        className="inline-block text-[11px] font-mono text-slate-400 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/70 cursor-not-allowed select-none"
                        title="งานนี้มีในระบบแล้วและไม่มีข้อมูลใบขนหรือกำหนดการเปลี่ยนแปลง"
                      >
                        ข้าม
                      </span>
                    ) : r.isPastOrOld ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300/80 cursor-not-allowed select-none"
                        title={`ระบบล็อคอัตโนมัติ: งานย้อนหลังเดือนเก่า (${
                          r.etd?.slice(0, 7) ||
                          r.submitDate?.slice(0, 7) ||
                          "อดีต"
                        }) ไม่อนุญาตให้นำเข้า เพื่อป้องกันยอดเดือนเก่าบวม`}
                      >
                        🛡️ ล็อค
                      </span>
                    ) : (
                      <span
                        className="inline-block text-[11px] font-mono text-slate-400 bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/70 cursor-not-allowed select-none"
                        title="งานว่างเปล่า ไม่มีข้อมูลตู้/สินค้า — ข้ามอัตโนมัติ"
                      >
                        ข้าม
                      </span>
                    )}
                  </td>

                  {/* 1. Action Badge */}
                  <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                    {r.actionType === "update" && r.isCustomsChanged ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200"
                        title={r.customsChangeDiff}
                      >
                        <span>🔄 อัปเดตใบขน</span>
                      </span>
                    ) : r.actionType === "update" && r.isDateChanged ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200"
                        title={r.dateChangeDiff}
                      >
                        <span>🔄 อัปเดตกำหนดการ</span>
                      </span>
                    ) : r.actionType === "update" ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                        title="มีงานนี้อยู่ในระบบแล้ว — ไม่มีข้อมูลเปลี่ยนแปลง"
                      >
                        <span>⚪ มีในระบบแล้ว</span>
                      </span>
                    ) : r.isPastOrOld ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300"
                        title={`งานย้อนหลังเดือนเก่า (${
                          r.etd?.slice(0, 7) ||
                          r.submitDate?.slice(0, 7) ||
                          "อดีต"
                        }) — ล็อคป้องกันยอดบวม`}
                      >
                        <span>
                          🛡️ ล็อค: งานเก่า (
                          {r.etd?.slice(0, 7) ||
                            r.submitDate?.slice(0, 7) ||
                            "อดีต"}
                          )
                        </span>
                      </span>
                    ) : r.isBlankDummy ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200"
                        title="งานว่างเปล่า (ไม่มีตู้/สินค้า/B/L)"
                      >
                        <span>⚪ งานว่างเปล่า (ข้าม)</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300"
                        title="งานใหม่แท้ประจำงวดปัจจุบัน — พร้อมนำเข้าสู่ระบบ"
                      >
                        <span>
                          ✨ งานใหม่ประจำงวด (
                          {r.etd?.slice(0, 7) ||
                            r.submitDate?.slice(0, 7) ||
                            "พ.ย. 26"}
                          )
                        </span>
                      </span>
                    )}
                  </td>

                  {/* 2. Job No */}
                  <td className="py-2.5 px-3 font-mono font-semibold text-[#073766] whitespace-nowrap align-middle">
                    {isEditing ? (
                      <input
                        type="text"
                        aria-label={`แก้ไข Job No สำหรับแถว ${r.id}`}
                        value={editForm.jobNo || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            jobNo: e.target.value.toUpperCase(),
                          }))
                        }
                        className="w-28 h-8 px-2 rounded border border-[#f56a22] font-mono text-xs font-bold uppercase focus:ring-2 focus:ring-[#f56a22]/20 outline-none bg-white"
                        placeholder="เช่น SI26100013"
                      />
                    ) : (
                      <div>
                        <div>
                          {r.jobNo || (
                            <span className="text-red-500 font-normal">
                              ไม่มี Job No
                            </span>
                          )}
                        </div>
                        {r.joinNo && (
                          <div className="text-[10.5px] font-normal text-[#6e7e91]">
                            Join: {r.joinNo}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 3. Customer */}
                  <td className="py-2.5 px-3 align-middle max-w-[220px]">
                    {isEditing ? (
                      <input
                        type="text"
                        aria-label={`แก้ไขชื่อลูกค้าสำหรับ ${r.jobNo}`}
                        value={editForm.customer || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            customer: e.target.value,
                          }))
                        }
                        className="w-full h-8 px-2 rounded border border-[#c5cfd9] text-xs focus:border-[#f56a22] focus:ring-2 focus:ring-[#f56a22]/20 outline-none bg-white"
                        placeholder="ชื่อบริษัทลูกค้า..."
                      />
                    ) : (
                      <span
                        className="truncate block font-semibold text-slate-900"
                        title={r.customer}
                      >
                        {r.customer || "—"}
                      </span>
                    )}
                  </td>

                  {/* 4. Declaration No */}
                  <td className="py-2.5 px-3 font-mono align-middle whitespace-nowrap">
                    {isEditing ? (
                      <input
                        type="text"
                        aria-label={`แก้ไขเลขที่ใบขนสำหรับ ${r.jobNo}`}
                        value={editForm.declarationNo || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            declarationNo: e.target.value.toUpperCase(),
                          }))
                        }
                        className="w-32 h-8 px-2 rounded border border-[#c5cfd9] font-mono text-xs uppercase focus:border-[#f56a22] focus:ring-2 focus:ring-[#f56a22]/20 outline-none bg-white"
                        placeholder="A0..."
                      />
                    ) : r.declarationNo ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-800 font-semibold text-[11px] font-mono">
                          {r.declarationNo}
                        </span>
                        {r.customsChangeDiff && (
                          <span
                            className="text-[10px] font-sans font-medium text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200"
                            title={r.customsChangeDiff}
                          >
                            🔄 มีข้อมูลใบขนเปลี่ยน
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>

                  {/* 5. Invoice No */}
                  <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-[#526275] align-middle">
                    {isEditing ? (
                      <input
                        type="text"
                        aria-label={`แก้ไข Invoice No สำหรับ ${r.jobNo}`}
                        value={editForm.invoiceNo || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            invoiceNo: e.target.value,
                          }))
                        }
                        className="w-28 h-8 px-2 rounded border border-[#c5cfd9] font-mono text-xs focus:border-[#f56a22] focus:ring-2 focus:ring-[#f56a22]/20 outline-none bg-white"
                        placeholder="INV..."
                      />
                    ) : (
                      r.invoiceNo || "—"
                    )}
                  </td>

                  {/* 6. Customs Status */}
                  <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                    {isEditing ? (
                      <select
                        aria-label={`เลือกสถานะศุลกากรสำหรับ ${r.jobNo}`}
                        value={editForm.customsStatus || ""}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            customsStatus: e.target.value || null,
                          }))
                        }
                        className="h-8 px-2 rounded border border-[#c5cfd9] text-xs bg-white focus:border-[#f56a22] focus:ring-2 focus:ring-[#f56a22]/20 outline-none"
                      >
                        <option value="">— ไม่มีสถานะ —</option>
                        <option value="0109">0109 · ร่างใบขน</option>
                        <option value="0209">0209 · ยิงใบขนแล้ว</option>
                        <option value="0309">0309 · ชำระภาษีแล้ว</option>
                        <option value="0409">0409 · ตรวจปล่อยสมบูรณ์</option>
                      </select>
                    ) : r.customsStatus ? (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          r.customsStatus === "0409"
                            ? "bg-[#e6f5f0] text-[#0d7a5f]"
                            : r.customsStatus === "0309"
                            ? "bg-[#e0e7ff] text-[#4338ca]"
                            : r.customsStatus === "0209"
                            ? "bg-[#e0f2fe] text-[#0369a1]"
                            : "bg-[#fff1e8] text-[#db5610]"
                        }`}
                      >
                        {r.customsStatus === "0409"
                          ? "0409 · ตรวจปล่อยแล้ว"
                          : r.customsStatus === "0309"
                          ? "0309 · ชำระภาษีแล้ว"
                          : r.customsStatus === "0209"
                          ? "0209 · ยิงใบขนแล้ว"
                          : "0109 · ร่างใบขน"}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>

                  {/* 7. FWD Details */}
                  <td className="py-2.5 px-3 text-[11.5px] text-[#526275] align-middle min-w-[200px]">
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          aria-label="ประเภทตู้"
                          value={editForm.containerType || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              containerType: e.target.value,
                            }))
                          }
                          placeholder="ตู้สินค้า..."
                          className="h-7 px-1.5 rounded border border-[#c5cfd9] text-[11px] bg-white outline-none focus:border-[#f56a22]"
                        />
                        <input
                          type="text"
                          aria-label="ชื่อ CS ผู้รับผิดชอบ"
                          value={editForm.csName || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              csName: e.target.value,
                            }))
                          }
                          placeholder="CS..."
                          className="h-7 px-1.5 rounded border border-[#c5cfd9] text-[11px] bg-white outline-none focus:border-[#f56a22]"
                        />
                        <input
                          type="number"
                          step="any"
                          aria-label="น้ำหนักสินค้า G.W. (กก.)"
                          value={editForm.grossWeight ?? ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              grossWeight: e.target.value
                                ? parseFloat(e.target.value)
                                : null,
                            }))
                          }
                          placeholder="G.W. (kg)"
                          className="h-7 px-1.5 rounded border border-[#c5cfd9] text-[11px] bg-white outline-none focus:border-[#f56a22]"
                        />
                        <input
                          type="number"
                          step="any"
                          aria-label="ปริมาตรสินค้า CBM"
                          value={editForm.cbm ?? ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              cbm: e.target.value
                                ? parseFloat(e.target.value)
                                : null,
                            }))
                          }
                          placeholder="CBM"
                          className="h-7 px-1.5 rounded border border-[#c5cfd9] text-[11px] bg-white outline-none focus:border-[#f56a22]"
                        />
                      </div>
                    ) : r.containerType ||
                      r.grossWeight ||
                      r.cbm ||
                      r.csName ? (
                      <div>
                        {r.containerType && (
                          <span className="font-semibold text-slate-900 font-mono">
                            {r.containerType}{" "}
                          </span>
                        )}
                        {r.grossWeight ? (
                          <span>{fmtNum(r.grossWeight)} kg </span>
                        ) : null}
                        {r.cbm ? <span>({r.cbm} CBM) </span> : null}
                        {r.csName && (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60 ml-1">
                            CS: {r.csName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 font-mono">—</span>
                    )}
                  </td>

                  {/* 8. Dates (ETD / ETA / Schedule) */}
                  <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-[#526275] align-middle">
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <input
                          type="date"
                          aria-label={`แก้ไข ETD สำหรับ ${r.jobNo}`}
                          value={editForm.etd || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              etd: e.target.value,
                            }))
                          }
                          className="h-7 px-2 rounded border border-[#c5cfd9] text-xs font-mono bg-white outline-none focus:border-[#f56a22]"
                        />
                        <input
                          type="date"
                          aria-label={`แก้ไข ETA สำหรับ ${r.jobNo}`}
                          value={editForm.eta || ""}
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              eta: e.target.value,
                            }))
                          }
                          className="h-7 px-2 rounded border border-[#c5cfd9] text-xs font-mono bg-white outline-none focus:border-[#f56a22]"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {r.etd && (
                            <span
                              className={
                                r.isDateChanged &&
                                r.dateChangeDiff?.includes("ETD")
                                  ? "font-bold text-sky-800 bg-sky-50 px-1 rounded border border-sky-200"
                                  : ""
                              }
                            >
                              ETD: {fmtDate(r.etd)}
                            </span>
                          )}
                          {r.eta && (
                            <span
                              className={
                                r.isDateChanged &&
                                r.dateChangeDiff?.includes("ETA")
                                  ? "font-bold text-sky-800 bg-sky-50 px-1 rounded border border-sky-200"
                                  : ""
                              }
                            >
                              ETA: {fmtDate(r.eta)}
                            </span>
                          )}
                          {!r.etd && !r.eta && (
                            <span>
                              {r.submitDate ? fmtDate(r.submitDate) : "—"}
                            </span>
                          )}
                        </div>
                        {r.isDateChanged && r.dateChangeDiff && (
                          <span
                            className="text-[10.5px] font-mono text-sky-700 bg-sky-50/90 px-1.5 py-0.2 rounded border border-sky-200/80 inline-flex items-center gap-1"
                            title={r.dateChangeDiff}
                          >
                            <span>🔄 {r.dateChangeDiff}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* 9. Validation */}
                  <td className="py-2.5 px-3 whitespace-nowrap align-middle">
                    {isEditing ? (
                      <span className="text-[#f56a22] text-[11px] font-semibold">
                        กำลังแก้ไข
                      </span>
                    ) : r.validationStatus === "valid" ? (
                      <span className="text-[#0d7a5f] text-[11px] font-medium flex items-center gap-1">
                        <Check className="w-3 h-3 text-[#0d7a5f]" />
                        <span>ผ่าน</span>
                      </span>
                    ) : (
                      <span
                        className="text-[#b45309] text-[11px] font-medium"
                        title={r.validationNote}
                      >
                        ⚠️ {r.validationNote || "ตรวจเช็ก"}
                      </span>
                    )}
                  </td>

                  {/* 10. Actions (จัดการ) */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap align-middle">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(r.id)}
                          className="px-2.5 py-1.5 rounded-[5px] bg-[#0d7a5f] hover:bg-[#0a614b] text-white text-xs font-semibold inline-flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="บันทึกการแก้ไขของแถวนี้"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>บันทึก</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-2 py-1.5 rounded-[5px] border border-[#c5cfd9] bg-white hover:bg-slate-100 text-[#526275] text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="ยกเลิกการแก้ไข"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>ยกเลิก</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(r)}
                          className="px-2 py-1 rounded-[5px] border border-[#c5cfd9] bg-white hover:bg-[#f5f6f8] text-[#073766] hover:text-[#f56a22] text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="แก้ไขข้อมูลแถวนี้"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(r.id)}
                          className="p-1 rounded-[5px] border border-[#c5cfd9] bg-white hover:bg-red-50 text-[#6e7e91] hover:text-red-600 transition-colors cursor-pointer"
                          title="ลบแถวนี้ออกจาก Staging"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
            แสดง <b>{pagedStaging.length}</b> จาก <b>{fmtNum(filteredStaging.length)}</b> รายการ
            {filteredStaging.length !== stagingData.length && (
              <span className="text-[#6e7e91]"> (กรองจากทั้งหมด {fmtNum(stagingData.length)} งาน)</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Page size selector */}
          <div className="flex items-center gap-1.5">
            <span>แสดงต่อหน้า:</span>
            <select
              aria-label="จำนวนแถวที่แสดงต่อหน้า"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
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
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              className="p-1 rounded border border-[#c5cfd9] bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-[#102238] transition-colors"
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-xs font-medium">
              {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
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
