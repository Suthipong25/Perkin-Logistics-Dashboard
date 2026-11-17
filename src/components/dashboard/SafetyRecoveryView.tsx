"use client";

/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — DATA SAFETY & RECOVERY VIEW
 * ============================================================================
 * คอมโพเนนต์ด้านความปลอดภัยของข้อมูล และการสำรองกู้คืน (Daily Snapshots Archive)
 * 
 * ความสามารถหลัก:
 * 1. โหมดสถาปัตยกรรม Read-Only ไม่แก้ไขสูตรหรือชีทของพนักงาน
 * 2. บันทึกสำเนา Snapshot ฉบับเต็มของไฟล์ Excel ในเซิร์ฟเวอร์แบบ Versioning
 * 3. ดาวน์โหลดไฟล์ .xlsx ฉบับสมบูรณ์ย้อนหลังเพื่อกู้คืนได้ 100%
 * 4. ปุ่มคลิกสั่งสำรองข้อมูลชุดใหม่ทันที (Backup Now)
 * ============================================================================
 */

import React from "react";
import {
  ShieldCheck,
  History,
  RefreshCw,
  Download,
} from "lucide-react";
import {
  SnapshotManifestEntry,
  QualityAlertsReport,
} from "@/types/dashboard";
import { fmtNum } from "@/lib/dashboard-helpers";

/* ============================================================================
 * PROPS INTERFACE
 * ============================================================================ */
export interface SafetyRecoveryViewProps {
  /** ประวัติ Snapshot ทั้งหมดที่บันทึกไว้ในระบบ */
  snapshots: SnapshotManifestEntry[];
  /** รายงานข้อผิดพลาดของข้อมูล (ถ้ามี) */
  qualityAlerts?: QualityAlertsReport;
  /** สถานะว่ากำลังซิงก์หรือสำรองข้อมูลอยู่หรือไม่ */
  isSyncing: boolean;
  /** ฟังก์ชันสั่งซิงก์และสำรองข้อมูลใหม่ทันที */
  onSyncNow: () => void;
  /** ฟังก์ชันเมื่อคลิกเลือก Job No เพื่อเปิดดูใน Drawer */
  onSelectJobNo?: (jobNo: string) => void;
}

export default function SafetyRecoveryView({
  snapshots,
  isSyncing,
  onSyncNow,
}: SafetyRecoveryViewProps) {
  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------------------
       * TOP KPI CARD: ประวัติ Snapshot
       * -------------------------------------------------------------------- */}
      <div className="bg-white rounded-[8px] border border-[#dce2e8] p-5 flex items-start gap-4 shadow-sm">
        <div className="w-12 h-12 rounded-[8px] bg-[#eaf4fc] text-[#073766] grid place-items-center shrink-0">
          <History className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[#eaf4fc] text-[#073766] border border-[#073766]/20">
              {snapshots.length} สแนปช็อต
            </span>
          </div>
          <div className="text-[17px] font-bold text-[#102238] mt-1.5 truncate">
            {snapshots[0]?.displayTime || "พร้อมใช้งาน"}
          </div>
          <p className="text-[12.5px] text-[#526275] mt-1 leading-relaxed truncate">
            {snapshots[0]
              ? `${fmtNum(snapshots[0].totalJobs)} งาน · ${fmtNum(snapshots[0].totalTransport)} รถ (${(snapshots[0].fileSize / (1024 * 1024)).toFixed(2)} MB)`
              : "ระบบเก็บประวัติไฟล์ย้อนหลังทุกเวอร์ชัน"}
          </p>
        </div>
      </div>

      {/* --------------------------------------------------------------------
       * MAIN CONTAINER: ประวัติสำรองข้อมูล & กู้คืน (Daily Snapshots Archive)
       * -------------------------------------------------------------------- */}
      <div className="bg-white rounded-[8px] border border-[#dce2e8] overflow-hidden shadow-sm">
        {/* Header with Title and Backup Action */}
        <div className="border-b border-[#dce2e8] px-5 py-4 bg-[#fafbfc] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-[#f56a22]" />
            <div>
              <h2 className="text-[15px] font-bold text-[#102238]">
                ประวัติสำรองข้อมูล & กู้คืน (Daily Snapshots Archive)
              </h2>
              <p className="text-[12px] text-[#526275]">
                ระบบจัดเก็บสำเนาไฟล์ย้อนหลัง {snapshots.length} เวอร์ชัน สามารถดาวน์โหลดไฟล์ต้นฉบับไปกู้คืนได้ทุกช่วงเวลา
              </p>
            </div>
          </div>

          <button
            onClick={onSyncNow}
            disabled={isSyncing}
            className="h-8 px-3.5 rounded-[6px] bg-[#073766] hover:bg-[#0c2948] disabled:opacity-60 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            title="ซิงก์และสร้าง Snapshot สำรองข้อมูลชุดใหม่ทันที"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "กำลังบันทึก..." : "สำรองข้อมูลเดี๋ยวนี้ (Backup Now)"}</span>
          </button>
        </div>

        {/* Snapshot Table */}
        <div className="p-5">
          <div className="p-4 rounded-[8px] bg-[#eaf4fc] border border-[#073766]/20 flex items-start gap-3 mb-5">
            <ShieldCheck className="w-5 h-5 text-[#073766] shrink-0 mt-0.5" />
            <div className="text-[13px] text-[#073766] leading-relaxed">
              <b>ระบบสำรองข้อมูลอัตโนมัติ (Automated Snapshot Archiving):</b> ทุกครั้งที่มีการซิงก์ข้อมูล ระบบจะเก็บสำเนา Snapshot ฉบับเต็มของไฟล์ Excel ในเซิร์ฟเวอร์แบบ Versioning ทันที หากเกิดเหตุการณ์ไฟล์ใน SharePoint ถูกลบ ชีทหาย หรือสูตรพัง สามารถคลิกปุ่ม <b>&quot;ดาวน์โหลด .xlsx เพื่อกู้คืน&quot;</b> ในตารางด้านล่าง เพื่อนำไฟล์ฉบับสมบูรณ์กลับไปกู้คืนได้ 100%
            </div>
          </div>

          <div className="border border-[#dce2e8] rounded-[6px] overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#f5f6f8] text-[#526275] font-mono text-[11px] uppercase border-b border-[#dce2e8]">
                  <th className="py-2.5 px-4 font-semibold">เวลาบันทึก (Timestamp)</th>
                  <th className="py-2.5 px-4 font-semibold">ชื่อไฟล์สำรอง (Snapshot File)</th>
                  <th className="py-2.5 px-4 font-semibold">ขนาดไฟล์</th>
                  <th className="py-2.5 px-4 font-semibold">ข้อมูลที่สำรอง</th>
                  <th className="py-2.5 px-4 font-semibold">ความสมบูรณ์ (SHA-256)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">ดาวน์โหลดกู้คืน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dce2e8]">
                {snapshots.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#526275]">
                      ยังไม่มีประวัติ Snapshot ในระบบ
                    </td>
                  </tr>
                ) : (
                  snapshots.map((s, idx) => (
                    <tr key={s.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-[#102238] whitespace-nowrap">
                        {s.displayTime || s.timestamp}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#073766] font-medium whitespace-nowrap">
                        {s.filename}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#526275] whitespace-nowrap">
                        {(s.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </td>
                      <td className="py-3 px-4 text-[#102238] whitespace-nowrap">
                        <span className="font-semibold">{fmtNum(s.totalJobs)}</span> งาน /{" "}
                        <span className="font-semibold">{fmtNum(s.totalTransport)}</span> รถ
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#526275] whitespace-nowrap" title={s.sha256}>
                        {s.sha256 ? `${s.sha256.substring(0, 10)}...` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <a
                          href={`/api/backups/${encodeURIComponent(s.filename)}`}
                          download={s.filename}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] bg-[#0d7a5f] hover:bg-[#0b634d] text-white text-xs font-semibold shadow-sm transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ดาวน์โหลด .xlsx เพื่อกู้คืน</span>
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
