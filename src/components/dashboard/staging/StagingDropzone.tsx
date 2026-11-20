"use client";

import React, { useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { StagingRecord, StagingTransportRecord, UploadSummary } from "./types";

interface StagingDropzoneProps {
  autoApplyOnDrop: boolean;
  setAutoApplyOnDrop: (v: boolean) => void;
  uploadedFilesList: Array<{ name: string; size: number }>;
  uploadProgress: number;
  isProcessing: boolean;
  onFilesDrop: (files: File[]) => void;
  onSyncNow: () => void;
  uploadSummary: UploadSummary | null;
  stagingTransport: StagingTransportRecord[] | null;
  stagingData: StagingRecord[] | null;
  selectedIds: Set<string>;
  selectedTransportIds: Set<string>;
  countNewTransport: number;
  countDateUpdatesTransport: number;
  countUnchangedTransport: number;
  countGenuineNew: number;
  countDateUpdates: number;
  countCustomsUpdates: number;
  countLockedOld: number;
  countUnchanged: number;
  onSmartSyncAll: () => void;
  onClearAll: () => void;
}

export function StagingDropzone({
  autoApplyOnDrop,
  setAutoApplyOnDrop,
  uploadedFilesList,
  uploadProgress,
  isProcessing,
  onFilesDrop,
  onSyncNow,
  uploadSummary,
  stagingTransport,
  stagingData,
  selectedIds,
  selectedTransportIds,
  countNewTransport,
  countDateUpdatesTransport,
  countUnchangedTransport,
  countGenuineNew,
  countDateUpdates,
  countCustomsUpdates,
  countLockedOld,
  countUnchanged,
  onSmartSyncAll,
  onClearAll,
}: StagingDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-8 bg-white rounded-[12px] border border-[#dce2e8] p-6 flex flex-col justify-between shadow-xs">
        <div>
          <div className="border-b border-[#dce2e8] pb-4">
            <h2 className="text-[17px] font-bold text-[#102238] flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[#f56a22]" />
              <span>ทดสอบโยนไฟล์แนบ FWD & รายงานใบขน (Staging Ingestion)</span>
            </h2>
            <p className="text-[13px] text-[#526275] mt-1">
              ทดสอบประมวลผลไฟล์แนบได้อย่างปลอดภัยโดย <b>ไม่กระทบไฟล์หลัก</b> พร้อมตารางตรวจสอบความถูกต้องก่อนกดบันทึก
            </p>
          </div>

          {/* Auto-Apply Toggle */}
          <div className="mt-3 flex items-center justify-between p-3 bg-amber-50/70 rounded-[10px] border border-amber-200/90 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold text-[#102238]">
                  โหมดซิงค์อัตโนมัติ (Auto-Apply on Drop)
                </span>
                <p className="text-[11.5px] text-[#526275]">
                  บันทึกและซิงค์ลงฐานข้อมูลทันทีเมื่อลากไฟล์วาง (ไม่ต้องรอกดยืนยันทีละขั้นตอน)
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoApplyOnDrop}
                onChange={(e) => {
                  setAutoApplyOnDrop(e.target.checked);
                  try {
                    localStorage.setItem(
                      "perkin_auto_apply_upload",
                      e.target.checked ? "true" : "false"
                    );
                  } catch {}
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Drag and Drop Zone */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                onFilesDrop(Array.from(e.dataTransfer.files));
              }
            }}
            className={`mt-3 border-2 border-dashed rounded-[10px] p-6 text-center transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out cursor-pointer flex flex-col items-center justify-center block ${
              isDragOver
                ? "border-[#f56a22] bg-[#fff6f0] scale-[1.01] shadow-md ring-4 ring-[#f56a22]/15"
                : "border-[#c5cfd9] hover:border-[#f56a22] bg-[#f5f6f8]/70 hover:bg-[#fff9f5]"
            }`}
          >
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              aria-label="เลือกไฟล์รายงาน FWD, ใบขนสินค้า หรือขนส่งเพื่ออัปโหลด"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFilesDrop(Array.from(e.target.files));
                }
              }}
            />
            <div
              className={`w-12 h-12 rounded-full bg-[#fff1e8] text-[#f56a22] grid place-items-center shadow-xs transition-transform duration-200 ${
                isDragOver ? "scale-110 animate-bounce" : ""
              }`}
            >
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="mt-3 text-[15px] font-bold text-[#102238]">
              ลากไฟล์รายงานมาวางที่นี่ (รองรับหลายไฟล์พร้อมกัน)
            </h3>
            <p className="text-[12.5px] text-[#526275] mt-1 max-w-[460px]">
              สามารถโยนรายงาน Shipping, Transport, Oversea, และ Air Freight มาพร้อมกันได้เลย ระบบจะแยกหมวดหมู่อัตโนมัติ (.xlsx / .xls / .csv)
            </p>
            <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[6px] bg-[#f56a22] hover:bg-[#e05612] text-white font-medium text-xs shadow-2xs transition-colors">
              <UploadCloud className="w-3.5 h-3.5" />
              <span>เลือกไฟล์จากเครื่อง (เลือกได้หลายไฟล์)</span>
            </div>
          </label>

          {/* แสดงรายการไฟล์ที่อัปโหลด */}
          {uploadedFilesList.length > 0 && (
            <div className="mt-4 p-3.5 rounded-[8px] bg-slate-50 border border-[#dce2e8] space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-[#102238] flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>ไฟล์ที่นำเข้า ({uploadedFilesList.length} ไฟล์):</span>
                </div>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#e6f5f0] text-[#0d7a5f] font-semibold">
                  {uploadProgress === 4 ? "วิเคราะห์สำเร็จ" : "กำลังตรวจสอบ..."}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {uploadedFilesList.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded bg-white border border-slate-200 text-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#0d7a5f] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-medium text-[#102238] truncate"
                        title={f.name}
                      >
                        {f.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {(f.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {isProcessing && (
                <div className="mt-2 w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full animate-shimmer" />
                </div>
              )}
            </div>
          )}

          {/* สรุปผลลัพธ์การอัปเดตและปุ่ม Master Smart Sync */}
          {uploadSummary && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[13.5px] text-emerald-900 flex items-center gap-1.5">
                    <span>
                      ตรวจสอบโครงสร้างไฟล์เรียบร้อย ·{" "}
                      {stagingTransport && stagingData
                        ? "ชุดข้อมูลแบบผสม (ขนส่งในประเทศ + ชิปเมนท์หลัก)"
                        : stagingTransport
                        ? "โหมดตรวจสอบเที่ยวรถขนส่ง (Inland Transport)"
                        : "นโยบายรักษาความถูกต้องเปิดทำงาน"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-700 font-mono mt-1 space-y-1.5">
                    {stagingTransport && (
                      <div className="p-2 rounded bg-white/70 border border-slate-200/60 space-y-1">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-sky-600" />
                          <span>
                            ข้อมูลเที่ยวรถในประเทศ (Inland Transport): {stagingTransport.length} เที่ยว
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11.5px]">
                          {countNewTransport > 0 && (
                            <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                              ✨ {countNewTransport} เที่ยวใหม่
                            </span>
                          )}
                          {countDateUpdatesTransport > 0 && (
                            <span className="text-sky-800 font-bold bg-sky-100/80 px-1.5 py-0.5 rounded border border-sky-300">
                              🔄 {countDateUpdatesTransport} เที่ยวอัปเดต (คนขับ/ทะเบียน/วันส่ง)
                            </span>
                          )}
                          <span className="text-slate-600 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            ⚪ {countUnchangedTransport} เที่ยวเดิม (ข้าม)
                          </span>
                          <span className="text-slate-700">
                            (เลือกแล้ว <b>{selectedTransportIds.size}</b> เที่ยว)
                          </span>
                        </div>
                      </div>
                    )}

                    {stagingData && (
                      <div className="p-2 rounded bg-white/70 border border-slate-200/60 space-y-1">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            ข้อมูลชิปเมนท์หลัก (Shipping / FWD): {stagingData.length} งาน
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11.5px]">
                          {countGenuineNew > 0 && (
                            <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                              ✨ {countGenuineNew} งานใหม่
                            </span>
                          )}
                          {countDateUpdates > 0 && (
                            <span className="text-sky-800 font-bold bg-sky-100/80 px-1.5 py-0.5 rounded border border-sky-300">
                              🔄 {countDateUpdates} งานอัปเดตกำหนดการ
                            </span>
                          )}
                          {countCustomsUpdates > 0 && (
                            <span className="text-indigo-800 font-bold bg-indigo-100/80 px-1.5 py-0.5 rounded border border-indigo-300">
                              🔄 {countCustomsUpdates} งานอัปเดตใบขน
                            </span>
                          )}
                          {countLockedOld > 0 && (
                            <span className="text-amber-800 font-bold bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-300/80">
                              🛡️ {countLockedOld} งานเก่าล็อคไว้
                            </span>
                          )}
                          <span className="text-slate-600 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            ⚪ {countUnchanged} งานเดิม (ข้าม)
                          </span>
                          <span className="text-slate-700">
                            (เลือกแล้ว <b>{selectedIds.size}</b> งาน)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="บันทึกและซิงค์ทั้งหมดทันที"
                  onClick={onSmartSyncAll}
                  disabled={
                    isProcessing ||
                    (selectedIds.size === 0 && selectedTransportIds.size === 0)
                  }
                  className={`px-4 py-2.5 rounded-lg text-xs font-bold shadow-xs flex items-center gap-2 transition-[background-color,color,box-shadow] cursor-pointer ${
                    selectedIds.size > 0 || selectedTransportIds.size > 0
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-700/20"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  title={`บันทึกและซิงค์ข้อมูลที่เลือกทั้งหมด (${
                    selectedIds.size + selectedTransportIds.size
                  } รายการ) ลงระบบทันที`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    ⚡ บันทึกและซิงค์ทั้งหมด ({selectedIds.size + selectedTransportIds.size})
                  </span>
                </button>

                <button
                  type="button"
                  aria-label="ล้างข้อมูลทั้งหมด"
                  onClick={onClearAll}
                  className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-600 font-medium transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none cursor-pointer"
                  title="ล้างข้อมูลทดสอบโดยไม่บันทึก"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-[#dce2e8] flex items-center justify-between text-xs text-[#526275]">
          <button
            onClick={() => onSyncNow()}
            className="font-medium text-[#f56a22] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>ดึงสถานะล่าสุดจาก SharePoint Excel</span>
          </button>
          <span className="text-slate-400">
            ระบบปกป้องไฟล์หลักด้วย Local Snapshot เสมอ
          </span>
        </div>
      </section>

      {/* 4 Steps Pipeline Card */}
      <section className="lg:col-span-4 bg-white rounded-[12px] border border-[#dce2e8] p-6 flex flex-col justify-between shadow-xs">
        <div>
          <h3 className="text-[14.5px] font-bold text-[#102238] border-b border-[#dce2e8] pb-3">
            ขั้นตอน Staging Ingestion 4 ระดับ
          </h3>
          <div className="mt-4 space-y-2.5">
            {[
              {
                step: 1,
                title: "ถอดรหัสคอลัมน์",
                sub: "อ่านโครงสร้างหัวตาราง (Booking List & ใบขน O1O9 - O4O9)",
              },
              {
                step: 2,
                title: "จับคู่ Job No",
                sub: "ตรวจสอบกับฐานข้อมูล เพื่อแยกแยะงานใหม่ หรืองานที่จะอัปเดต",
              },
              {
                step: 3,
                title: "Validate ข้อมูล",
                sub: "ตรวจสอบความถูกต้องของวัน ETD/ETA, เลขที่ใบขน และตู้สินค้า",
              },
              {
                step: 4,
                title: "สรุปผลและแสดง Preview",
                sub: "สร้างตารางดูข้อมูลก่อนอัปเดต เพื่อให้ทีมงานเช็กก่อนตัดสินใจ",
              },
            ].map((st) => {
              const done = uploadProgress >= st.step;
              const active = uploadProgress === st.step - 1;
              return (
                <div
                  key={st.step}
                  className={`p-2.5 rounded-[6px] border text-xs transition-colors ${
                    done
                      ? "bg-[#e6f5f0]/60 border-[#0d7a5f]/30"
                      : active
                      ? "bg-[#fff1e8]/70 border-[#f56a22]/40"
                      : "bg-[#f5f6f8]/60 border-[#dce2e8]"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span
                      className={
                        done
                          ? "text-[#0d7a5f]"
                          : active
                          ? "text-[#f56a22]"
                          : "text-[#102238]"
                      }
                    >
                      {st.step}. {st.title}
                    </span>
                    <span className="font-mono text-[11px]">
                      {done ? "✓ เสร็จ" : active ? "กำลังตรวจ..." : "รอ"}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#526275] mt-0.5">
                    {st.sub}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-[#dce2e8] text-[11.5px] text-[#6e7e91] leading-relaxed">
          💡 <b>คำแนะนำ:</b> ตารางด้านล่างจะเปิดให้ดูข้อมูลที่อ่านได้ทั้งหมด คุณสามารถค้นหาและตรวจสอบได้ก่อนกดยืนยัน
        </div>
      </section>
    </div>
  );
}
