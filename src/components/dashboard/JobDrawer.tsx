"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — JOB DRAWER COMPONENT
 * ============================================================================
 * หน้าต่างสไลด์ (Slide-over Drawer) สำหรับตรวจสอบรายละเอียดงานและแก้ไขข้อมูล
 * 
 * ความสามารถหลัก:
 * 1. ตรวจสอบข้อมูลใบขนสินค้าศุลกากร (e-Customs 0409) และประวัติสถานะ 0109 -> 0409
 * 2. ตรวจสอบข้อมูล Booking List, MBL/HBL, ชนิดตู้, ผู้ดูแลงาน CS
 * 3. ไทม์ไลน์ 5 ขั้นตอน (Draft ใบขน -> ยิงใบขน -> แลก DO -> ปล่อยสินค้า -> ปิดงาน)
 * 4. การแก้ไขข้อความอัปเดตสถานะแบบด่วน (Quick Edit UPDATE STATUS)
 * 5. ฟอร์มแก้ไขข้อมูลเต็มรูปแบบ (Web-to-Excel Two-Way Sync ผ่าน Graph API)
 * 
 * จุดที่เชื่อมต่อกับระบบภายนอก:
 * - ส่ง PATCH ไปยัง `/api/jobs/[jobNo]` เพื่อเขียนข้อมูลลงแถวของ Excel บน SharePoint
 *   และฐานข้อมูลพร้อมกัน
 * ============================================================================
 */

import React, { useState, useEffect } from "react";
import { JobRecord } from "@/types/dashboard";
import {
  fmtNum,
  fmtDate,
  statusMeta,
  serviceMeta,
  computeNextAction,
} from "@/lib/dashboard-helpers";
import { X, Edit3, Check, FileSpreadsheet } from "lucide-react";

/* ============================================================================
 * PROPS INTERFACE
 * ============================================================================ */
export interface JobDrawerProps {
  /** งานที่ถูกเลือกเปิดดู (null หากไม่ได้เปิด) */
  selectedJob: JobRecord | null;
  /** ฟังก์ชันปิด Drawer */
  onClose: () => void;
  /** ฟังก์ชันแจ้งเตือนเมื่อข้อมูลงานถูกแก้ไขสำเร็จเพื่ออัปเดต State หลัก */
  onJobUpdated: (updatedJob: JobRecord) => void;
  /** ฟังก์ชันแสดง Toast แจ้งเตือนสถานะ */
  showToast: (msg: string) => void;
}

export default function JobDrawer({
  selectedJob,
  onClose,
  onJobUpdated,
  showToast,
}: JobDrawerProps) {
  /* ==========================================================================
   * 1. LOCAL STATE
   * ========================================================================== */
  // สลับโหมดดูข้อมูล (false) หรือแก้ไขข้อมูลเต็มรูปแบบ (true)
  const [editing, setEditing] = useState(false);
  // สถานะกำลังบันทึกข้อมูลฟอร์มเต็มรูปแบบ
  const [saving, setSaving] = useState(false);

  // สถานะการแก้ไขข้อความ UPDATE STATUS แบบด่วน
  const [inlineEditingStatus, setInlineEditingStatus] = useState(false);
  const [statusTextDraft, setStatusTextDraft] = useState("");
  const [savingStatusText, setSavingStatusText] = useState(false);

  /* เมื่อเปลี่ยน Job ให้รีเซ็ตค่า Draft ข้อความและโหมดแก้ไขกลับเป็นค่าเริ่มต้น */
  useEffect(() => {
    if (selectedJob) {
      setStatusTextDraft(selectedJob.updateStatus || "");
      setInlineEditingStatus(false);
      setEditing(false);
    }
  }, [selectedJob?.jobNo]);

  // หากไม่มีงานถูกเลือก ไม่ต้องเรนเดอร์อะไร
  if (!selectedJob) return null;

  /* ==========================================================================
   * 2. EVENT HANDLERS — FULL FORM SAVE
   * บันทึกข้อมูลฟอร์มเต็มรูปแบบลง Excel ผ่าน API Route
   * ========================================================================== */
  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedJob) return;

    const fd = new FormData(e.currentTarget);
    const statusVal = String(fd.get("status") || "Control");
    const rawStatus =
      statusVal === "Completed"
        ? "Job Complete"
        : statusVal === "Waiting"
        ? "Job Waiting"
        : statusVal === "Cancelled"
        ? "Job Cancelled"
        : "Job Control";

    // สร้าง Patch Payload สำหรับส่งไป API
    const patch: Partial<JobRecord> & { expectedVersion?: number } = {
      status: (statusVal === "Completed"
        ? "Completed"
        : statusVal === "Cancelled"
        ? "Cancelled"
        : "In Progress") as JobRecord["status"],
      statusDetail: statusVal,
      statusRaw: rawStatus,
      etd: String(fd.get("etd") || "") || null,
      eta: String(fd.get("eta") || "") || null,
      draftDate: String(fd.get("draftDate") || "") || null,
      customsDate: String(fd.get("customsDate") || "") || null,
      doDate: String(fd.get("doDate") || "") || null,
      clearDate: String(fd.get("clearDate") || "") || null,
      updateStatus: String(fd.get("updateStatus") || "").trim(),
      remark: String(fd.get("remark") || "").trim(),
      draftCustoms: Boolean(fd.get("draftDate")),
      customsFiled: Boolean(fd.get("customsDate")),
      doReleased: Boolean(fd.get("doDate")),
      cleared: Boolean(fd.get("clearDate")),
      expectedVersion: selectedJob.version || 1,
    };

    setSaving(true);
    try {
      const resp = await fetch(`/api/jobs/${encodeURIComponent(selectedJob.jobNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const resData = await resp.json().catch(() => ({}));
      if (!resp.ok || !resData.ok) {
        throw new Error(resData.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }

      const returnedJob = resData.job || {
        ...selectedJob,
        ...patch,
        version: (selectedJob.version || 1) + 1,
      };
      returnedJob.nextAction = computeNextAction(returnedJob);
      onJobUpdated(returnedJob);
      setEditing(false);
      showToast(`บันทึก ${selectedJob.jobNo} สำเร็จเรียบร้อย`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`บันทึกไม่สำเร็จ: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  /* ==========================================================================
   * 3. EVENT HANDLERS — QUICK UPDATE STATUS SAVE
   * บันทึกข้อความ UPDATE STATUS ด่วนจากแบนเนอร์ด้านบน
   * ========================================================================== */
  async function handleSaveStatusText() {
    if (!selectedJob) return;
    setSavingStatusText(true);
    try {
      const resp = await fetch(`/api/jobs/${encodeURIComponent(selectedJob.jobNo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateStatus: statusTextDraft,
          expectedVersion: selectedJob.version || 1,
        }),
      });
      const resData = await resp.json().catch(() => ({}));
      if (!resp.ok || !resData.ok) {
        throw new Error(resData.error || "เกิดข้อผิดพลาดในการบันทึกข้อความสถานะ");
      }
      const updated: JobRecord = resData.job || {
        ...selectedJob,
        updateStatus: statusTextDraft,
        version: (selectedJob.version || 1) + 1,
      };
      onJobUpdated(updated);
      setInlineEditingStatus(false);
      showToast(`อัปเดตข้อความสถานะ ${selectedJob.jobNo} สำเร็จ`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`บันทึกข้อความสถานะไม่สำเร็จ: ${msg}`);
    } finally {
      setSavingStatusText(false);
    }
  }

  /* ==========================================================================
   * 4. RENDER UI
   * ========================================================================== */
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#071a2f]/40 backdrop-blur-[2px] animate-backdrop-in">
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawerJobTitle"
        className="w-full max-w-[560px] bg-white h-full flex flex-col shadow-2xl border-l border-[#dce2e8] animate-slide-in-right will-change-transform"
      >
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#dce2e8] flex items-start justify-between gap-4 bg-[#f5f6f8]">
          <div>
            <h2
              id="drawerJobTitle"
              className="text-[22px] font-bold font-mono text-[#073766]"
            >
              {selectedJob.jobNo}
            </h2>
            <p className="text-[14px] font-medium text-[#102238] mt-0.5">
              {selectedJob.customer || "ไม่ระบุชื่อลูกค้า"}
            </p>
          </div>
          <button
            onClick={() => {
              onClose();
              setEditing(false);
            }}
            className="p-2 rounded-[6px] hover:bg-slate-200/70 text-[#526275]"
            aria-label="ปิดหน้าต่างรายละเอียด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!editing ? (
            /* VIEW MODE: แสดงข้อมูลชิปเมนท์อย่างละเอียด */
            <>
              {/* Status Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1 rounded border ${
                    statusMeta(selectedJob).badge
                  }`}
                >
                  <i
                    className={`w-2 h-2 rounded-full ${
                      statusMeta(selectedJob).dot
                    }`}
                  />
                  {statusMeta(selectedJob).label}
                </span>
                <span className="font-mono text-xs px-2.5 py-1 rounded border border-[#c5cfd9] bg-white font-semibold">
                  {serviceMeta(selectedJob.service).code}
                </span>
                <span className="font-mono text-xs px-2.5 py-1 rounded bg-[#eaf4fc] text-[#073766]">
                  ชีต {selectedJob.service} · แถว {selectedJob.sourceRow}
                </span>
              </div>

              {/* Operational Update Status Banner (แก้ไขข้อความได้โดยตรง) */}
              <div className="p-4 rounded-[8px] bg-[#eaf4fc] border border-[#073766]/25 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#073766] uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-[#f56a22] animate-pulse" />
                    <span>อัปเดตสถานะ (UPDATE STATUS)</span>
                  </div>
                  {!inlineEditingStatus ? (
                    <button
                      onClick={() => {
                        setInlineEditingStatus(true);
                        setStatusTextDraft(selectedJob.updateStatus || "");
                      }}
                      className="text-xs text-[#f56a22] hover:text-[#e05612] font-semibold inline-flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-white/80 border border-[#f56a22]/30 shadow-xs"
                      title="คลิกเพื่อแก้ไขข้อความอัปเดตสถานะ"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>แก้ไขข้อความ</span>
                    </button>
                  ) : null}
                </div>

                {!inlineEditingStatus ? (
                  <div className="text-[13.5px] font-medium text-[#102238] whitespace-pre-line leading-relaxed bg-white/80 p-3 rounded-[6px] border border-[#073766]/10 min-h-[50px]">
                    {selectedJob.updateStatus || (
                      <span className="text-[#6e7e91] italic text-xs">
                        ยังไม่มีข้อมูลอัปเดตสถานะ (คลิก &quot;แก้ไขข้อความ&quot; ด้านบนเพื่อเพิ่มสถานะ)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <textarea
                      value={statusTextDraft}
                      onChange={(e) => setStatusTextDraft(e.target.value)}
                      rows={4}
                      placeholder="พิมพ์ข้อความอัปเดตสถานะ เช่น SI amendment/update in e-Booking system → Cargo gate-in..."
                      className="w-full p-3 rounded-[6px] border border-[#073766]/30 text-[13.5px] font-medium text-[#102238] bg-white focus:outline-none focus:border-[#f56a22] leading-relaxed"
                      autoFocus
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setInlineEditingStatus(false)}
                        className="px-3 py-1.5 rounded-[6px] border border-[#c5cfd9] bg-white text-xs font-semibold text-[#526275] hover:bg-slate-50"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveStatusText}
                        disabled={savingStatusText}
                        className="px-4 py-1.5 rounded-[6px] bg-[#f56a22] hover:bg-[#e05612] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{savingStatusText ? "กำลังบันทึก..." : "บันทึกอัปเดตสถานะ"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 1. ข้อมูลเอกสารชิปเมนท์และ B/L */}
              <div className="p-4 rounded-[8px] bg-[#f7f5ef] border border-[#dce2e8] space-y-3">
                <div className="flex items-center justify-between border-b border-[#dce2e8] pb-2">
                  <h3 className="text-[13.5px] font-bold text-[#071a2f]">
                    ข้อมูลเอกสารชิปเมนท์และ B/L (Shipment &amp; Documents)
                  </h3>
                  <span
                    className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded ${
                      selectedJob.status === "Completed"
                        ? "bg-[#e6f5f0] text-[#0d7a5f]"
                        : "bg-[#e0f2fe] text-[#0369a1]"
                    }`}
                  >
                    {selectedJob.statusDetail || selectedJob.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <div className="text-xs text-[#526275]">B/L NO. (MBL / HBL)</div>
                    <div className="font-mono font-bold text-[#073766] mt-0.5">
                      {selectedJob.mbl || selectedJob.bl || selectedJob.hbl || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#526275]">JOIN NO. / REF NO.</div>
                    <div className="font-mono font-semibold text-[#102238] mt-0.5">
                      {selectedJob.joinNo || selectedJob.referenceNo || "—"}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-[#526275]">
                      ลูกค้า / ผู้นำเข้า-ส่งออก (Customer / Consignee)
                    </div>
                    <div className="font-semibold text-[#102238] mt-0.5">
                      {selectedJob.consignee || selectedJob.customer || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#526275]">Invoice No</div>
                    <div className="font-mono font-semibold text-[#102238] mt-0.5 break-all">
                      {selectedJob.invoiceNo || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#526275]">ETD / ETA</div>
                    <div className="font-mono font-semibold text-[#102238] mt-0.5">
                      {fmtDate(selectedJob.etd)} {selectedJob.eta ? `→ ${fmtDate(selectedJob.eta)}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#526275]">ท่าเรือ / เส้นทาง (Port / Route)</div>
                    <div className="font-mono text-[#102238] mt-0.5">
                      {(selectedJob.pol || selectedJob.pod)
                        ? `${selectedJob.pol || ""}${selectedJob.pol && selectedJob.pod ? " → " : ""}${selectedJob.pod || ""}`
                        : selectedJob.placeOfDelivery || "—"}
                    </div>
                  </div>
                  {selectedJob.declarationNo && (
                    <div className="col-span-2 pt-1 border-t border-[#dce2e8]">
                      <span className="text-xs text-[#526275]">เลขที่ใบขน: </span>
                      <span className="font-mono font-semibold text-[#0d7a5f]">{selectedJob.declarationNo}</span>
                    </div>
                  )}
                </div>

                {/* ลำดับเวลาสถานะกรมศุลกากร (0109 -> 0209 -> 0309 -> 0409) */}
                {(selectedJob.o109 ||
                  selectedJob.o209 ||
                  selectedJob.o309 ||
                  selectedJob.o409) && (
                  <div className="pt-2 border-t border-[#dce2e8]">
                    <div className="text-[11.5px] font-semibold text-[#526275] mb-1.5">
                      ลำดับเวลาสถานะกรมศุลกากร (0109 → 0209 → 0309 → 0409)
                    </div>
                    <div className="grid grid-cols-2 gap-2 font-mono text-[11.5px]">
                      {[
                        { code: "0109", val: selectedJob.o109 },
                        { code: "0209", val: selectedJob.o209 },
                        { code: "0309", val: selectedJob.o309 },
                        { code: "0409", val: selectedJob.o409 },
                      ].map((st) => (
                        <div
                          key={st.code}
                          className={`px-2.5 py-1.5 rounded border ${
                            st.val
                              ? "bg-white border-[#0d7a5f]/30 text-[#0d7a5f] font-semibold"
                              : "bg-slate-100 border-[#dce2e8] text-[#6e7e91]"
                          }`}
                        >
                          {st.val || `${st.code} —`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. รายละเอียดสินค้าและเส้นทาง Booking List */}
              <div className="grid grid-cols-2 gap-3.5 p-4 rounded-[8px] bg-[#f5f6f8] border border-[#dce2e8] text-[13px]">
                <div>
                  <div className="text-xs text-[#526275]">MBL / HBL</div>
                  <div className="font-mono font-semibold text-[#102238] mt-0.5 break-all">
                    {selectedJob.mbl || "—"} / {selectedJob.hbl || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#526275]">CS ผู้รับผิดชอบ / ประเภทใบขน</div>
                  <div className="font-mono font-semibold text-[#073766] mt-0.5">
                    {selectedJob.csName || "—"} · {selectedJob.declarationType || "Normal"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#526275]">ETD (วันเรือ/เครื่องออก)</div>
                  <div className="num font-semibold text-[#102238] mt-0.5">
                    {fmtDate(selectedJob.etd)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#526275]">ETA / วันตรวจปล่อย (Clear Date)</div>
                  <div className="num font-semibold text-[#102238] mt-0.5">
                    {fmtDate(selectedJob.eta)} (Clear: {fmtDate(selectedJob.clearDate)})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#526275]">ตู้คอนเทนเนอร์ / การขนส่ง</div>
                  <div className="font-mono font-semibold text-[#102238] mt-0.5">
                    {selectedJob.containerType || "—"} {selectedJob.shippingType ? `(${selectedJob.shippingType})` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#526275]">ท่า Depo / ปลายทาง (Delivery)</div>
                  <div className="font-mono text-xs font-semibold text-[#102238] mt-0.5">
                    {selectedJob.depoPort || "—"} → {selectedJob.placeOfDelivery || "—"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-[#526275]">รายละเอียดสินค้า (Commodity &amp; น้ำหนัก/ปริมาตร)</div>
                  <div className="font-medium text-[#102238] mt-0.5">
                    {selectedJob.commodity || "—"}{" "}
                    {(selectedJob.packages || selectedJob.grossWeight) && (
                      <span className="font-mono text-xs text-[#526275]">
                        ({selectedJob.packages || "—"} · G.W. {fmtNum(selectedJob.grossWeight)} kg · {selectedJob.cbm || 0} M3)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2.5 ข้อมูลการเดินเรือ / สายการบิน & เส้นทางท่าเรือ (Carrier, Vessel & Routing) */}
              <div className="p-4 rounded-[8px] bg-[#f0f7ff] border border-[#bcd7f5] space-y-3">
                <div className="flex items-center justify-between border-b border-[#bcd7f5] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{selectedJob.service?.includes("AIR") ? "✈️" : "🚢"}</span>
                    <h3 className="text-[13.5px] font-bold text-[#073766]">
                      {selectedJob.service?.includes("AIR")
                        ? "ข้อมูลสายการบิน & เที่ยวบิน (Air Freight Details)"
                        : "ข้อมูลการเดินเรือ & สายเรือ (Ocean Carrier Details)"}
                    </h3>
                  </div>
                  {selectedJob.carrier && (
                    <span className="px-2.5 py-0.5 rounded-full font-bold text-xs bg-[#073766] text-white">
                      {selectedJob.carrier}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <div className="text-xs text-[#526275]">
                      {selectedJob.service?.includes("AIR") ? "สายการบิน (Airline)" : "สายเรือ (Carrier / Liner)"}
                    </div>
                    <div className="font-semibold text-[#102238] mt-0.5">
                      {selectedJob.carrier || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-[#526275]">
                      {selectedJob.service?.includes("AIR") ? "เที่ยวบิน & เวลา (Flight & Time)" : "ชื่อเรือ (Vessel / Feeder)"}
                    </div>
                    <div className="font-mono font-semibold text-[#073766] mt-0.5">
                      {selectedJob.service?.includes("AIR")
                        ? (selectedJob.flightNo ? `${selectedJob.flightNo}${selectedJob.flightTime ? ` (${selectedJob.flightTime})` : ''}` : "—")
                        : (selectedJob.vessel || selectedJob.feeder || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-[#526275]">เลขบุ๊กกิ้งสายเรือ (Liner Booking No.)</div>
                    <div className="font-mono font-semibold text-[#102238] mt-0.5 break-all">
                      {selectedJob.linerBooking || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-[#526275]">วันเข้าโหลดตู้ (Loading Date)</div>
                    <div className="font-mono font-semibold text-[#102238] mt-0.5">
                      {fmtDate(selectedJob.loadingDate)}
                    </div>
                  </div>

                  <div className="col-span-2 pt-2 border-t border-[#bcd7f5]/60">
                    <div className="text-xs text-[#526275] mb-1">
                      {selectedJob.service?.includes("AIR") ? "สนามบินต้นทาง → ปลายทาง" : "ท่าเรือต้นทาง (POL) → ท่าเรือปลายทาง (POD)"}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[12.5px] font-semibold text-[#073766] bg-white p-2.5 rounded border border-[#bcd7f5]">
                      <span className="truncate">{selectedJob.pol || "ต้นทาง (POL)"}</span>
                      <span className="text-[#f56a22] font-bold">→</span>
                      <span className="truncate">{selectedJob.pod || selectedJob.placeOfDelivery || "ปลายทาง (POD)"}</span>
                    </div>
                  </div>

                  {(selectedJob.terminal || selectedJob.shed || selectedJob.depoPort) && (
                    <div className="col-span-2 grid grid-cols-3 gap-2 pt-1 text-xs">
                      <div>
                        <span className="text-[#526275]">ท่า Depo:</span>{" "}
                        <span className="font-semibold text-[#102238]">{selectedJob.depoPort || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[#526275]">Terminal:</span>{" "}
                        <span className="font-semibold text-[#102238]">{selectedJob.terminal || "—"}</span>
                      </div>
                      <div>
                        <span className="text-[#526275]">Shed / โรงพัก:</span>{" "}
                        <span className="font-semibold text-[#102238]">{selectedJob.shed || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. ไทม์ไลน์สถานะการดำเนินงาน (Shipment Milestones) */}
              <div>
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#526275] mb-3">
                  {selectedJob.customsStatus
                    ? "สถานะการดำเนินงาน 5 ขั้นตอน (Customs & Delivery Milestones)"
                    : "สถานะการดำเนินงาน (FWD Shipment Milestones)"}
                </h3>
                <div className="space-y-3 border-l-2 border-[#dce2e8] ml-2.5 pl-4">
                  {(selectedJob.customsStatus
                    ? [
                        {
                          done: selectedJob.draftCustoms,
                          date: selectedJob.draftDate,
                          name: "1. ออก Draft ใบขนสินค้า (0109 / Reference No)",
                        },
                        {
                          done: selectedJob.customsFiled,
                          date: selectedJob.customsDate,
                          name: "2. ยิงใบขนจริง (0209 / SUBMIT DD)",
                        },
                        {
                          done: selectedJob.doReleased,
                          date: selectedJob.doDate,
                          name: "3. ชำระภาษี / ตัดบัญชี / แลก DO (0309)",
                        },
                        {
                          done: selectedJob.cleared,
                          date: selectedJob.clearDate,
                          name: "4. ตรวจปล่อยออกจากอารักขา (0409 / Clear Date)",
                        },
                        {
                          done: selectedJob.advanceDoc,
                          date: selectedJob.advanceDate,
                          name: "5. ส่งมอบและปิดชุดงาน (Job Complete)",
                        },
                      ]
                    : [
                        {
                          done: true,
                          date: selectedJob.jobDate,
                          name: "1. Job Booking Request (คำขอเปิดงาน / จองระวาง)",
                        },
                        {
                          done: selectedJob.status !== "Booking",
                          date: selectedJob.etd,
                          name: "2. Job Control (ควบคุมงานขนส่ง / กำหนดออกเดินทาง ETD)",
                        },
                        {
                          done:
                            selectedJob.status === "Completed" ||
                            (selectedJob.statusDetail || "").includes("Wait") ||
                            Boolean(
                              selectedJob.eta &&
                                new Date(selectedJob.eta) <= new Date()
                            ),
                          date: selectedJob.eta,
                          name: "3. Job Waiting (รอเอกสาร / สินค้าถึงปลายทาง ETA)",
                        },
                        {
                          done: selectedJob.status === "Completed",
                          date: selectedJob.clearDate || selectedJob.eta || selectedJob.etd,
                          name: "4. Job Complete (ปิดงานสมบูรณ์)",
                        },
                      ]
                  ).map((step) => (
                    <div key={step.name} className="relative">
                      <span
                        className={`w-3 h-3 rounded-full absolute -left-[23px] top-1.5 border-2 border-white ${
                          step.done ? "bg-[#0d7a5f]" : "bg-[#f56a22]"
                        }`}
                      />
                      <div className="text-[14px] font-semibold text-[#102238]">
                        {step.name}
                      </div>
                      <div className="text-[12.5px] font-mono text-[#526275]">
                        {step.done
                          ? step.date
                            ? `${fmtDate(step.date)}`
                            : "เสร็จสิ้น"
                          : "รอดำเนินการ"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* EDIT MODE: ฟอร์มแก้ไขข้อมูลเพื่อส่งซิงก์กลับไปยัง Excel */
            <form
              id="jobEditForm"
              onSubmit={handleSaveEdit}
              className="space-y-4"
            >
              <div className="p-3.5 rounded-[6px] bg-[#fff1e8] border border-[#f56a22]/30 text-[13px] text-[#b45309] flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-[#f56a22] shrink-0" />
                <span>
                  เมื่อกดบันทึก ระบบจะเขียนลง{" "}
                  <b>Excel บน OneDrive (แถว {selectedJob.sourceRow})</b>{" "}
                  ก่อน แล้วจึงอัปเดตฐานข้อมูลเว็บ
                </span>
              </div>

              <div>
                <label htmlFor="field-status" className="block text-[13px] font-semibold text-[#102238] mb-1">
                  สถานะงาน (Job Status)
                </label>
                <select
                  id="field-status"
                  name="status"
                  defaultValue={statusMeta(selectedJob).key}
                  className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] text-[14px]"
                >
                  <option value="Control">กำลังดำเนินการ (Job Control)</option>
                  <option value="Waiting">รอเอกสาร (Job Waiting)</option>
                  <option value="Completed">เสร็จสิ้น (Job Complete)</option>
                  <option value="Cancelled">ยกเลิก (Job Cancelled)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="field-etd" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                    ETD
                  </label>
                  <input
                    id="field-etd"
                    type="date"
                    name="etd"
                    defaultValue={selectedJob.etd || ""}
                    className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] num text-[13.5px]"
                  />
                </div>
                <div>
                  <label htmlFor="field-eta" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                    ETA
                  </label>
                  <input
                    id="field-eta"
                    type="date"
                    name="eta"
                    defaultValue={selectedJob.eta || ""}
                    className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] num text-[13.5px]"
                  />
                </div>
                <div>
                  <label htmlFor="field-draftDate" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                    วันที่ออก Draft ใบขน
                  </label>
                  <input
                    id="field-draftDate"
                    type="date"
                    name="draftDate"
                    defaultValue={selectedJob.draftDate || ""}
                    className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] num text-[13.5px]"
                  />
                </div>
                <div>
                  <label htmlFor="field-customsDate" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                    วันที่ยิงใบขนจริง
                  </label>
                  <input
                    id="field-customsDate"
                    type="date"
                    name="customsDate"
                    defaultValue={selectedJob.customsDate || ""}
                    className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] num text-[13.5px]"
                  />
                </div>
                <div>
                  <label htmlFor="field-doDate" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                    วันที่แลก DO
                  </label>
                  <input
                    id="field-doDate"
                    type="date"
                    name="doDate"
                    defaultValue={selectedJob.doDate || ""}
                    className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] num text-[13.5px]"
                  />
                </div>
                <div>
                  <label htmlFor="field-clearDate" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                    วันที่ Clear &amp; Pickup
                  </label>
                  <input
                    id="field-clearDate"
                    type="date"
                    name="clearDate"
                    defaultValue={selectedJob.clearDate || ""}
                    className="w-full h-10 px-3 rounded-[6px] border border-[#c5cfd9] num text-[13.5px]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="field-updateStatus" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                  อัปเดตสถานะงาน (Update Status ใน Excel)
                </label>
                <textarea
                  id="field-updateStatus"
                  name="updateStatus"
                  defaultValue={selectedJob.updateStatus || ""}
                  placeholder="เช่น SI amendment/update in e-Booking system → Cargo gate-in..."
                  className="w-full h-24 p-3 rounded-[6px] border border-[#c5cfd9] text-[13.5px] font-medium text-[#102238] bg-white leading-relaxed"
                />
              </div>

              <div>
                <label htmlFor="field-remark" className="block text-[12.5px] font-semibold text-[#526275] mb-1">
                  หมายเหตุ (Remark ใน Excel)
                </label>
                <textarea
                  id="field-remark"
                  name="remark"
                  defaultValue={selectedJob.remark || ""}
                  placeholder="เช่น ปิดชุดบัญชีแล้ว / รอใบเสร็จท่าเรือ"
                  className="w-full h-20 p-3 rounded-[6px] border border-[#c5cfd9] text-[13.5px]"
                />
              </div>
            </form>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="px-6 py-4 border-t border-[#dce2e8] bg-[#f5f6f8] flex items-center justify-between">
          {!editing ? (
            <>
              <button
                onClick={() => {
                  onClose();
                  setEditing(false);
                }}
                className="h-10 px-4 rounded-[6px] border border-[#c5cfd9] bg-white font-semibold text-[13.5px] text-[#102238]"
              >
                ปิดหน้าต่าง
              </button>
              <button
                onClick={() => setEditing(true)}
                className="h-10 px-5 rounded-[6px] bg-[#f56a22] hover:bg-[#e05612] text-white font-semibold text-[13.5px] inline-flex items-center gap-2 shadow-xs"
              >
                <Edit3 className="w-4 h-4" />
                <span>แก้ไขข้อมูลงาน</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-10 px-4 rounded-[6px] border border-[#c5cfd9] bg-white font-semibold text-[13.5px] text-[#102238]"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                form="jobEditForm"
                disabled={saving}
                className="h-10 px-5 rounded-[6px] bg-[#f56a22] hover:bg-[#e05612] text-white font-semibold text-[13.5px] disabled:opacity-50 shadow-xs"
              >
                {saving
                  ? "กำลังเขียนลง Excel…"
                  : "บันทึก → Excel + Web"}
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
