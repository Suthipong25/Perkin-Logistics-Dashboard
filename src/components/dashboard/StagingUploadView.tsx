"use client";

import React, { useState, useMemo } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  Search,
  Check,
  RotateCcw,
  RotateCw,
  Sparkles,
  FileText,
  Pencil,
  Trash2,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Lock,
  AlertTriangle,
  Truck,
} from "lucide-react";
import { JobRecord, TransportRecord } from "@/types/dashboard";
import { fmtNum, fmtDate } from "@/lib/dashboard-helpers";

export interface StagingRecord {
  id: string;
  actionType: "update" | "new";
  jobNo: string;
  joinNo?: string;
  fileType: "customs" | "fwd";
  customer: string;
  declarationNo?: string;
  invoiceNo?: string;
  status: string;
  statusDetail?: string;
  statusRaw?: string;
  hasExplicitStatus?: boolean;
  clearDate?: string | null;
  customsStatus?: string | null;
  etd?: string | null;
  eta?: string | null;
  submitDate?: string | null;
  containerType?: string;
  grossWeight?: number | null;
  cbm?: number | null;
  csName?: string;
  bl?: string;
  commodity?: string;
  carrier?: string;
  vessel?: string;
  feeder?: string;
  flightNo?: string;
  flightTime?: string;
  linerBooking?: string;
  pol?: string;
  pod?: string;
  terminal?: string;
  shed?: string;
  depoPort?: string;
  placeOfDelivery?: string;
  loadingDate?: string;
  isPastOrOld?: boolean;
  isBlankDummy?: boolean;
  isGenuineNew?: boolean;
  isDateChanged?: boolean;
  isCustomsChanged?: boolean;
  isStatusChanged?: boolean;
  oldEtd?: string | null;
  oldEta?: string | null;
  oldFlightTime?: string | null;
  oldStatus?: string | null;
  dateChangeDiff?: string;
  customsChangeDiff?: string;
  statusChangeDiff?: string;
  validationStatus: "valid" | "warning";
  validationNote?: string;
}

export interface StagingTransportRecord {
  id: string;
  tripNo: string;
  transportNo: string;
  jobNo: string | null;
  customer: string;
  status: string;
  container: string;
  truckType?: string;
  driver?: string;
  driverName?: string;
  transporter?: string;
  plateNo?: string;
  pickupLocation?: string;
  pickupDate?: string | null;
  deliveryLocation?: string;
  returnDepot?: string;
  deliver: string | null;
  deliverDate?: string | null;
  pod?: string;
  actionType: "new" | "update";
  isNew: boolean;
  isDateChanged?: boolean;
  oldDeliverDate?: string | null;
  dateChangeDiff?: string;
  hasLinkedJob: boolean;
  validationStatus: "valid" | "warning";
  validationNote?: string;
}

/** ลำดับขั้นพิธีการศุลกากร (ใช้ตรวจว่าสถานะใบขนขยับไปข้างหน้าหรือไม่) */
const customsRank = (s?: string | null) => ["0109", "0209", "0309", "0409"].indexOf(s || "");

interface StagingUploadViewProps {
  jobs: JobRecord[];
  transport?: TransportRecord[];
  onApplyUpload: (newJobsList: JobRecord[], summaryText: string) => void;
  onApplyTransportUpload?: (newTransportList: TransportRecord[], summaryText: string) => void;
  onSyncNow: () => void;
  showToast: (msg: string) => void;
}

export function StagingUploadView({
  jobs,
  transport = [],
  onApplyUpload,
  onApplyTransportUpload,
  onSyncNow,
  showToast,
}: StagingUploadViewProps) {
  const [uploadFile, setUploadFile] = useState<{ name: string; size: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [stagingData, setStagingData] = useState<StagingRecord[] | null>(null);
  const [previewFilter, setPreviewFilter] = useState<"all" | "new" | "date_updates" | "customs_updates" | "unchanged" | "locked_old" | "existing">("new");
  const [previewQ, setPreviewQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StagingRecord>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Transport Staging State (สำหรับตรวจสอบและดูข้อมูลเที่ยวรถก่อนนำเข้า)
  const [stagingTransport, setStagingTransport] = useState<StagingTransportRecord[] | null>(null);
  const [selectedTransportIds, setSelectedTransportIds] = useState<Set<string>>(new Set());
  const [transportFilter, setTransportFilter] = useState<"new" | "date_updates" | "existing" | "all">("new");
  const [transportQ, setTransportQ] = useState("");
  const [transportPage, setTransportPage] = useState<number>(1);
  const [transportPageSize, setTransportPageSize] = useState<number>(25);

  const [uploadSummary, setUploadSummary] = useState<{
    fileName: string;
    fileType: string;
    rows: number;
    newJobs: number;
    updatedJobs: number;
  } | null>(null);

  // Selection state for selective upload (เลือกเฉพาะงานใหม่ประจำงวดที่ต้องการนำเข้า)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Keep old jobs locked against re-import while allowing in-place updates to existing jobs.
  const isSelectable = (r: StagingRecord) => {
    // 1. Genuine new jobs (>= Nov 2026, complete info)
    if (r.isGenuineNew && r.actionType === "new" && !r.isPastOrOld && !r.isBlankDummy) {
      return true;
    }
    // Existing jobs may be updated by changed schedules, customs data, or explicit status changes.
    if (r.actionType === "update" && (r.isDateChanged || r.isCustomsChanged || r.isStatusChanged)) {
      return true;
    }
    return false;
  };

  // คำนวณเฉพาะงานใหม่แท้ประจำงวดปัจจุบัน (พ.ย. 2026) โดยข้ามงานเดิมและล็อคงานเก่า
  const computeSafeSelection = (records: StagingRecord[]) => {
    const set = new Set<string>();
    for (const r of records) {
      if (isSelectable(r)) {
        set.add(r.id);
      }
    }
    return set;
  };

  const toggleSelectRow = (id: string) => {
    const target = stagingData?.find((r) => r.id === id);
        if (target && !isSelectable(target)) {
      if (target.actionType === "update" && !target.isDateChanged && !target.isCustomsChanged && !target.isStatusChanged) {
        showToast("⚪ งานเดิมในระบบแล้ว (วันเวลาและสถานะไม่เปลี่ยน) • ข้ามเพื่อไม่ให้งานบวม");
      } else if (target.isPastOrOld) {
        showToast("🛡️ ล็อคงานเก่า: ข้อมูลก่อน พ.ย. 2026 เพื่อไม่ให้จำนวนงานเดิมบวม");
      } else {
        showToast("⚠️ ข้อมูลไม่สมบูรณ์ (ไม่มีตู้/น้ำหนัก/BL) ข้ามเพื่อความถูกต้อง");
      }
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectSafeOnly = () => {
    if (stagingData) {
      const safe = computeSafeSelection(stagingData);
      setSelectedIds(safe);
      showToast(`เลือกเฉพาะงานใหม่ประจำงวดแล้ว (${safe.size} รายการ) · ป้องกันยอดเดือนเก่าบวม`);
    }
  };

  const handleSelectAll = () => {
    if (stagingData) {
      const safe = computeSafeSelection(stagingData);
      setSelectedIds(safe);
      showToast(`เลือกเฉพาะงานใหม่ที่ปลอดภัยทั้งหมด (${safe.size} รายการ) · ป้องกันยอดบวม`);
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    showToast("ยกเลิกการเลือกทั้งหมดแล้ว");
  };

  // Transport Selective Helpers (เลือกเฉพาะเที่ยวรถใหม่ หรือจัดการเลือกทั้งหมด)
  const toggleSelectTransport = (id: string) => {
    setSelectedTransportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

    const handleSelectSafeTransportOnly = () => {
    if (stagingTransport) {
      const safeIds = new Set<string>();
      for (const t of stagingTransport) {
        if (t.isNew || t.actionType === "new" || t.isDateChanged) {
          safeIds.add(t.id);
        }
      }
      setSelectedTransportIds(safeIds);
      showToast(`เลือกเฉพาะเที่ยวใหม่และอัปเดตวันส่งมอบแล้ว (${safeIds.size} เที่ยว) • ข้ามเที่ยวเดิม`);
    }
  };

  // Helper map: Exact Job No & Join No index (NO SH prefix stripping — SHSI26110009 and SI26110009 are different shipments!)
  const existingJobMap = useMemo(() => {
    const map = new Map<string, JobRecord>();
    for (const j of jobs) {
      if (j.jobNo) {
        const jno = j.jobNo.trim().toUpperCase();
        map.set(jno, j);
      }
      if (j.joinNo) {
        const jjoin = j.joinNo.trim().toUpperCase().replace(/\s*\((SEA|AIR)\)\s*$/i, "").trim();
        if (jjoin && !map.has(jjoin)) {
          map.set(jjoin, j);
        }
      }
    }
    return map;
  }, [jobs]);

  const handleSelectAllTransport = () => {
    if (stagingTransport) {
      setSelectedTransportIds(new Set(stagingTransport.map((t) => t.id)));
      showToast(`เลือกเที่ยวรถทั้งหมดแล้ว (${stagingTransport.length} เที่ยว)`);
    }
  };

  const handleDeselectAllTransport = () => {
    setSelectedTransportIds(new Set());
    showToast("ยกเลิกการเลือกเที่ยวรถทั้งหมด");
  };

  /* ==========================================================================
   * 1. PARSER: อ่านและแยกโครงสร้างข้อมูล CSV
   * ========================================================================== */
  const parseCSVText = (csvContent: string, fileName: string) => {
    const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    setIsProcessing(true);
    setUploadProgress(1);

    const isCustoms = fileName.toLowerCase().includes("customs") || fileName.includes("ใบขน");
    const fileType = isCustoms ? "customs" : "fwd";

    setTimeout(() => {
      setUploadProgress(4);
      setIsProcessing(false);

      const parsed: StagingRecord[] = [];
      let headerIdx = -1;

      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const upper = lines[i].toUpperCase();
        if (upper.includes("JOB NO") || upper.includes("JOB NO.")) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) headerIdx = 0;

      const headerCols = lines[headerIdx]
        .split(",")
        .map((c) => c.replace(/^["']|["']$/g, "").trim().toUpperCase());

      const colIdx = (name: string) => headerCols.findIndex((h) => h.includes(name));

      const idxJob = colIdx("JOB NO");
      const idxJoin = colIdx("JOIN NO");
      const idxCustomer = colIdx("IMPORTER") !== -1 ? colIdx("IMPORTER") : (colIdx("EXPORTER") !== -1 ? colIdx("EXPORTER") : colIdx("CUSTOMER"));
      const idxDecl = colIdx("DECLARATION");
      const idxInv = colIdx("INVOICE") !== -1 ? colIdx("INVOICE") : colIdx("INVOIVE");
      const idxSubmit = colIdx("SUBMIT");
      const idxStatus = colIdx("STATUS");
      const idxO409 = colIdx("O4O9");
      const idxO309 = colIdx("O3O9");
      const idxO209 = colIdx("O2O9");
      const idxO109 = colIdx("O1O9");
      const idxETD = colIdx("ETD");
      const idxETA = colIdx("ETA");
      const idxGW = colIdx("G.W.");
      const idxCBM = colIdx("MEASUREMENT");
      const idxCntr = colIdx("CONTAINER");
      const idxCS = colIdx("CS NAME");
      const idxMBL = colIdx("MBL");
      const idxCommodity = colIdx("COMMODITY");

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.startsWith(",,") || line.toUpperCase().startsWith("TOTAL")) continue;

        const cols: string[] = [];
        let insideQuote = false;
        let currentToken = "";
        for (let c = 0; c < line.length; c++) {
          const char = line[c];
          if (char === '"' || char === "'") {
            insideQuote = !insideQuote;
          } else if (char === "," && !insideQuote) {
            cols.push(currentToken.trim());
            currentToken = "";
          } else {
            currentToken += char;
          }
        }
        cols.push(currentToken.trim());

        const clean = (val: string | undefined) => (val ? val.replace(/^["']|["']$/g, "").trim() : "");

        const rawJob = clean(cols[idxJob]);
        const rawJoin = idxJoin !== -1 ? clean(cols[idxJoin]) : "";
        const jobNo = rawJob.replace(/\s*\((SEA|AIR)\)\s*$/i, "").toUpperCase();

        if (!jobNo && !rawJoin) continue;
        const effectiveKey = (jobNo || rawJoin).replace(/\s*\((SEA|AIR)\)\s*$/i, "").toUpperCase();

        const customer = clean(cols[idxCustomer]);
        const declarationNo = idxDecl !== -1 ? clean(cols[idxDecl]) : "";
        const invoiceNo = idxInv !== -1 ? clean(cols[idxInv]) : "";
        const submitDate = idxSubmit !== -1 ? clean(cols[idxSubmit]) : "";
        const etd = idxETD !== -1 ? clean(cols[idxETD]) : "";
        const eta = idxETA !== -1 ? clean(cols[idxETA]) : "";
        const rawStatus = idxStatus !== -1 ? clean(cols[idxStatus]) : "";
        const o409 = idxO409 !== -1 ? clean(cols[idxO409]) : "";
        const o309 = idxO309 !== -1 ? clean(cols[idxO309]) : "";
        const o209 = idxO209 !== -1 ? clean(cols[idxO209]) : "";
        const o109 = idxO109 !== -1 ? clean(cols[idxO109]) : "";

        let cStatus: string | null = null;
        if (rawStatus.includes("0409") || o409) cStatus = "0409";
        else if (rawStatus.includes("0309") || o309) cStatus = "0309";
        else if (rawStatus.includes("0209") || o209) cStatus = "0209";
        else if (rawStatus.includes("0109") || o109) cStatus = "0109";

        const existing = existingJobMap.get(effectiveKey);
        const existsInMaster = Boolean(existing);
        const actionType: "update" | "new" = existsInMaster ? "update" : "new";

        const gwVal = idxGW !== -1 && cols[idxGW] ? parseFloat(cols[idxGW]) : null;
        const cbmVal = idxCBM !== -1 && cols[idxCBM] ? parseFloat(cols[idxCBM]) : null;

        const isExpJob = /^(SH)?(SE|AE)/i.test(effectiveKey);
        const opDate = isExpJob ? (etd || submitDate || eta || "") : (eta || submitDate || etd || "");
        const isPastOrOld = !existsInMaster && Boolean(opDate && opDate < "2026-11-01");
        const isBlankDummy = !existsInMaster && !clean(cols[idxCntr]) && isNaN(gwVal as number) && !clean(cols[idxMBL]) && !clean(cols[idxCommodity]);
        const isGenuineNew = !existsInMaster && !isPastOrOld && !isBlankDummy;

        const normDate = (d?: string | null) => (d ? String(d).trim().slice(0, 10) : "");
        const incEtd = normDate(etd || (!isCustoms ? submitDate : ""));
        const incEta = normDate(eta);
        const exEtd = normDate(existing?.etd || existing?.submitDate);
        const exEta = normDate(existing?.eta);

        const diffs: string[] = [];
        if (incEtd && incEtd !== exEtd) diffs.push(`ETD: ${exEtd || "-"} ➔ ${incEtd}`);
        if (incEta && incEta !== exEta) diffs.push(`ETA: ${exEta || "-"} ➔ ${incEta}`);
        const isDateChanged = existsInMaster && diffs.length > 0;
        const dateChangeDiff = diffs.join(" • ");
        const customsDiffs: string[] = [];
        if (isCustoms && declarationNo && declarationNo !== existing?.declarationNo?.trim()) {
          customsDiffs.push(`เลขใบขน: ${existing?.declarationNo || "-"} ➔ ${declarationNo}`);
        }
        const incomingCustomsDate = isCustoms ? submitDate : "";
        const existingCustomsDate = existing?.customsDate?.trim() || "";
        if (incomingCustomsDate && incomingCustomsDate !== existingCustomsDate) {
          customsDiffs.push(`วันที่ยื่นใบขน: ${existingCustomsDate || "-"} ➔ ${incomingCustomsDate}`);
        }
        if (isCustoms && existing && cStatus && customsRank(cStatus) > customsRank(existing.customsStatus)) {
          customsDiffs.push(`สถานะใบขน: ${existing.customsStatus || "-"} ➔ ${cStatus}`);
        }
        const isCustomsChanged = existsInMaster && customsDiffs.length > 0;
        const customsChangeDiff = customsDiffs.join(" • ");

        let note = !effectiveKey ? "ไม่ระบุ Job No" : undefined;
        let vStatus: "valid" | "warning" = (declarationNo || etd || effectiveKey ? "valid" : "warning");

        if (existsInMaster) {
          if (isDateChanged || isCustomsChanged) {
            vStatus = "valid";
            note = `🔄 อัปเดต: ${[dateChangeDiff, customsChangeDiff].filter(Boolean).join(" • ")} (อัปเดตทับงานเดิม ไม่เพิ่มแถวใหม่)`;
          } else {
            note = "⚪ งานเดิมในระบบแล้ว (วันเวลาไม่เปลี่ยน • ข้ามเพื่อไม่ให้งานบวม)";
          }
        } else {
          if (isPastOrOld) {
            vStatus = "warning";
            note = `งานเก่าก่อน พ.ย. 26 (${opDate.slice(0, 7)}) • ล็อคเพื่อป้องกันงานเดิมบวม`;
          } else if (isBlankDummy) {
            vStatus = "warning";
            note = `แถวว่าง/ขยะ (ไม่มีตู้/น้ำหนัก/BL) • ข้ามเพื่อความถูกต้อง`;
          } else {
            note = `งานใหม่เดือนนี้ (${opDate.slice(0, 7) || "2026-11"})`;
          }
        }

        parsed.push({
          id: `csv-${i}-${effectiveKey}`,
          jobNo: effectiveKey,
          joinNo: rawJoin || undefined,
          actionType,
          fileType,
          customer: customer || (existsInMaster ? existing?.customer || "—" : "ลูกค้าทั่วไป"),
          declarationNo: declarationNo || undefined,
          invoiceNo: invoiceNo || undefined,
          status: cStatus === "0409" ? "Completed" : "In Progress",
          customsStatus: cStatus,
          etd: etd || (!isCustoms ? submitDate : "") || null,
          eta: eta || null,
          submitDate: submitDate || null,
          containerType: clean(cols[idxCntr]) || undefined,
          grossWeight: gwVal,
          cbm: cbmVal,
          csName: clean(cols[idxCS]) || undefined,
          bl: clean(cols[idxMBL]) || undefined,
          commodity: clean(cols[idxCommodity]) || undefined,
          isPastOrOld,
          isBlankDummy,
          isGenuineNew,
          isDateChanged,
          isCustomsChanged,
          customsChangeDiff,
          oldEtd: exEtd || null,
          oldEta: exEta || null,
          dateChangeDiff,
          validationStatus: vStatus,
          validationNote: note,
        });
      }

      setStagingData(parsed);
      const safe = computeSafeSelection(parsed);
      setSelectedIds(safe);
      setPreviewFilter(
        isCustoms && parsed.some((r) => r.isCustomsChanged)
          ? "customs_updates"
          : safe.size > 0
          ? "new"
          : "all"
      );
      setUploadSummary({
        fileName,
        fileType: isCustoms ? "ใบขนสินค้า e-Customs" : "FWD Booking Report",
        rows: parsed.length,
        newJobs: parsed.filter((p) => p.isGenuineNew).length,
        updatedJobs: parsed.filter((p) => p.actionType === "update").length,
      });
      showToast(`โหลดไฟล์ ${fileName} สำเร็จ (${parsed.length} รายการ)`);
    }, 400);
  };

  const handleLoadSample = async (samplePath: string, fileName: string) => {
    try {
      setIsProcessing(true);
      const res = await fetch(samplePath);
      const text = await res.text();
      parseCSVText(text, fileName);
    } catch {
      showToast("ไม่สามารถโหลดไฟล์ตัวอย่างได้");
      setIsProcessing(false);
    }
  };

  /* ==========================================================================
   * 3. HANDLE FILE DROP / INPUT (รองรับทั้ง .xlsx, .xls, .csv ผ่าน Server Parser)
   * ========================================================================== */
  const handleNativeFileUpload = async (file: File) => {
    setUploadFile({ name: file.name, size: file.size });
    setIsProcessing(true);
    setUploadProgress(0);
    setStagingData(null);
    setUploadSummary(null);

    // ขั้นที่ 1: ตรวจสอบและส่งไฟล์ไปยัง API Staging Parser
    setUploadProgress(1);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // ขั้นที่ 2: ถอดรหัสโครงสร้างไฟล์ Excel (.xlsx) / CSV
      setUploadProgress(2);

      const resp = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      // ขั้นที่ 3: ตรวจสอบความถูกต้องและจับคู่ Job No กับฐาน 1,129 งาน
      setUploadProgress(3);

      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "ไม่สามารถอ่านไฟล์ได้");
      }

      // ตรวจพบไฟล์การจองรถขนส่ง (Inland Transport) -> แสดงผลตาราง Transport Staging ให้ตรวจเช็กก่อนนำเข้า
      if (data.isTransport && Array.isArray(data.transportTrips)) {
        setUploadProgress(4);
        setIsProcessing(false);
        setStagingData(null);
        setStagingTransport(data.transportTrips);

        // ติ๊กเลือกเฉพาะเที่ยวรถใหม่เป็นค่าเริ่มต้น (ไม่เลือกเที่ยวเดิมซ้ำ)
        const newIds = new Set<string>();
        for (const t of data.transportTrips) {
          if (t.isNew || t.actionType === "new") {
            newIds.add(t.id);
          }
        }
        setSelectedTransportIds(newIds);
        setTransportFilter(newIds.size > 0 ? "new" : "all");
        setTransportPage(1);

        setUploadSummary({
          fileName: file.name,
          fileType: "รายงานการจองรถขนส่งในประเทศ (Inland Transport)",
          rows: data.transportTrips.length,
          newJobs: data.newTripsCount || newIds.size,
          updatedJobs: data.existingTripsCount || (data.transportTrips.length - newIds.size),
        });

        showToast(
          `ตรวจพบรายงานการจองรถ ${data.transportTrips.length} เที่ยวรถ · แสดงตารางตรวจสอบเที่ยวรถก่อนนำเข้า`
        );
        return;
      }

      // หากเป็นไฟล์ Master Booking Report ก้อนใหญ่ ให้อัปเดตและแสดงผลทันที
      if (data.directApplied && Array.isArray(data.jobs)) {
        setUploadProgress(4);
        setIsProcessing(false);
        const msg = data.message || `อัปเดตข้อมูล Master สำเร็จ (${data.totalJobs} งาน)`;
        onApplyUpload(data.jobs || jobs, msg);
        showToast(msg);
        return;
      }

      interface ApiRow {
        id?: string;
        jobNo?: string;
        joinNo?: string;
        customer?: string;
        declarationNo?: string;
        invoiceNo?: string;
        referenceNo?: string;
        status?: string;
        statusDetail?: string;
        statusRaw?: string;
        hasExplicitStatus?: boolean;
        clearDate?: string | null;
        customsStatus?: string | null;
        etd?: string | null;
        eta?: string | null;
        submitDate?: string | null;
        containerType?: string;
        grossWeight?: number | null;
        cbm?: number | null;
        csName?: string;
        bl?: string;
        commodity?: string;
        carrier?: string;
        vessel?: string;
        feeder?: string;
        flightNo?: string;
        flightTime?: string;
        linerBooking?: string;
        pol?: string;
        pod?: string;
        terminal?: string;
        shed?: string;
        depoPort?: string;
        placeOfDelivery?: string;
        loadingDate?: string;
        validationStatus?: "valid" | "warning";
        validationNote?: string;
      }

      const rows: ApiRow[] = data.rows || [];
      const isCustomsFile = data.fileType === "customs";
      const parsed: StagingRecord[] = rows.map((r: ApiRow, idx: number) => {
        const effectiveKey = (r.jobNo || r.joinNo || "").replace(/\s*\((SEA|AIR)\)\s*$/i, "").toUpperCase();
        const existing = existingJobMap.get(effectiveKey);
        const existsInMaster = Boolean(existing);
        
        // Business Rule: Export uses ETD, Import uses ETA (so Oct-ETD / Nov-ETA Import jobs belong to Nov!)
        const isExportJob = /^(SH)?(SE|AE)/i.test(effectiveKey);
        const opDate = isExportJob
          ? (r.etd || r.submitDate || r.eta || "")
          : (r.eta || r.submitDate || r.etd || "");
        const isPastOrOld = !existsInMaster && Boolean(opDate && opDate < "2026-11-01");
        const isBlankDummy = !existsInMaster && !r.containerType && !r.grossWeight && !r.bl && !r.commodity;
        const isGenuineNew = !existsInMaster && !isPastOrOld && !isBlankDummy;

        // Date Change Detection (ETD / ETA / Flight Time update on existing job)
        const normDate = (d?: string | null) => (d ? String(d).trim().slice(0, 10) : "");
        const normTime = (t?: string | null) => (t && t.trim() !== "00:00" ? t.trim() : "");

        const incEtd = normDate(r.etd || (isCustomsFile ? null : r.submitDate));
        const incEta = normDate(r.eta);
        const incTime = normTime(r.flightTime);

        const exEtd = normDate(existing?.etd || existing?.submitDate);
        const exEta = normDate(existing?.eta);
        const exTime = normTime(existing?.flightTime);

        const dateDiffs: string[] = [];
        if (incEtd && incEtd !== exEtd) dateDiffs.push(`ETD: ${exEtd || "-"} ➔ ${incEtd}`);
        if (incEta && incEta !== exEta) dateDiffs.push(`ETA: ${exEta || "-"} ➔ ${incEta}`);
        if (incTime && incTime !== exTime) dateDiffs.push(`เวลา: ${exTime || "-"} ➔ ${incTime}`);
        const isDateChanged = existsInMaster && dateDiffs.length > 0;
        const dateChangeDiff = dateDiffs.join(" • ");

        const customsDiffs: string[] = [];
        const incomingDeclaration = r.declarationNo?.trim();
        const existingDeclaration = existing?.declarationNo?.trim();
        if (isCustomsFile && incomingDeclaration && incomingDeclaration !== existingDeclaration) {
          customsDiffs.push(`เลขใบขน: ${existingDeclaration || "-"} ➔ ${incomingDeclaration}`);
        }
        const incomingCustomsDate = isCustomsFile ? r.submitDate?.trim() : "";
        const existingCustomsDate = existing?.customsDate?.trim() || "";
        if (incomingCustomsDate && incomingCustomsDate !== existingCustomsDate) {
          customsDiffs.push(`วันที่ยื่นใบขน: ${existingCustomsDate || "-"} ➔ ${incomingCustomsDate}`);
        }
        // Only move the customs pipeline forward; never downgrade an existing status.
        if (
          isCustomsFile &&
          existing &&
          r.customsStatus &&
          customsRank(r.customsStatus) > customsRank(existing.customsStatus)
        ) {
          customsDiffs.push(`สถานะใบขน: ${existing.customsStatus || "-"} ➔ ${r.customsStatus}`);
        }
        const isCustomsChanged = existsInMaster && customsDiffs.length > 0;
        const customsChangeDiff = customsDiffs.join(" • ");

        // Explicit STATUS JOB change detection (e.g. Shipping report Job Control -> Job Complete)
        const incStatus = r.status || "";
        const incStatusDetail = r.statusDetail || "";
        const exStatus = existing?.status || "";
        const exStatusDetail = existing?.statusDetail || "";
        const isStatusChanged = Boolean(
          existsInMaster &&
          r.hasExplicitStatus &&
          incStatus &&
          (incStatus !== exStatus || (incStatusDetail && incStatusDetail !== exStatusDetail))
        );
        const statusChangeDiff = isStatusChanged
          ? `สถานะ: ${exStatusDetail || exStatus || "-"} ➔ ${incStatusDetail || incStatus}`
          : "";

        let note = r.validationNote || (!effectiveKey ? "ไม่มีเลข Job No" : undefined);
        let vStatus: "valid" | "warning" = (r.declarationNo || r.etd || r.eta || effectiveKey ? "valid" : "warning");

        if (existsInMaster) {
          if (isDateChanged || isCustomsChanged || isStatusChanged) {
            vStatus = "valid";
            note = `🔄 อัปเดต: ${[statusChangeDiff, dateChangeDiff, customsChangeDiff].filter(Boolean).join(" • ")} (อัปเดตทับงานเดิม ไม่เพิ่มแถวใหม่)`;
          } else {
            note = "⚪ งานเดิมในระบบแล้ว (ไม่มีข้อมูลใบขน สถานะ หรือกำหนดการเปลี่ยนแปลง)";
          }
        } else {
          if (isPastOrOld) {
            vStatus = "warning";
            note = `งานย้อนหลังเดือนเก่า (${opDate.slice(0, 7)}) — ปลดเลือกอัตโนมัติเพื่อป้องกันยอดเดือนเก่าบวม`;
          } else if (isBlankDummy) {
            vStatus = "warning";
            note = `งานว่างเปล่า (ไม่มีตู้/สินค้า/BL) — ปลดเลือกอัตโนมัติ`;
          } else {
            note = `งานใหม่ประจำงวด (${opDate.slice(0, 7) || "2026-11"})`;
          }
        }

        return {
          id: r.id || `row-${idx}-${effectiveKey}`,
          jobNo: effectiveKey,
          joinNo: r.joinNo || undefined,
          actionType: existsInMaster ? "update" : "new",
          fileType: (data.fileType === "customs" ? "customs" : "fwd") as "customs" | "fwd",
          customer: r.customer && r.customer !== "—" ? r.customer : (existsInMaster ? existingJobMap.get(effectiveKey)?.customer || "—" : "ลูกค้าใหม่"),
          declarationNo:
            r.declarationNo && !["NORMAL", "GENERAL", "IMPORT", "EXPORT", "RE-EXPORT", "TRANSIT"].includes(r.declarationNo.trim().toUpperCase())
              ? r.declarationNo
              : undefined,
          invoiceNo: r.invoiceNo || undefined,
          status: r.status || (r.customsStatus === "0409" ? "Completed" : "In Progress"),
          statusDetail: r.statusDetail || undefined,
          statusRaw: r.statusRaw || undefined,
          hasExplicitStatus: Boolean(r.hasExplicitStatus),
          clearDate: r.clearDate || null,
          customsStatus: r.customsStatus || null,
          etd: r.etd || (isCustomsFile ? null : r.submitDate) || null,
          eta: r.eta || null,
          submitDate: r.submitDate || null,
          containerType: r.containerType || undefined,
          grossWeight: r.grossWeight ?? null,
          cbm: r.cbm ?? null,
          csName: r.csName || undefined,
          bl: r.bl || undefined,
          commodity: r.commodity || undefined,
          carrier: r.carrier || undefined,
          vessel: r.vessel || r.feeder || undefined,
          feeder: r.feeder || r.vessel || undefined,
          flightNo: r.flightNo || undefined,
          flightTime: r.flightTime || undefined,
          linerBooking: r.linerBooking || undefined,
          pol: r.pol || undefined,
          pod: r.pod || undefined,
          terminal: r.terminal || undefined,
          shed: r.shed || undefined,
          depoPort: r.depoPort || undefined,
          placeOfDelivery: r.placeOfDelivery || undefined,
          loadingDate: r.loadingDate || undefined,
          isPastOrOld,
          isBlankDummy,
          isGenuineNew,
          isDateChanged,
          isCustomsChanged,
          isStatusChanged,
          oldStatus: exStatusDetail || exStatus || null,
          statusChangeDiff,
          customsChangeDiff,
          oldEtd: exEtd || null,
          oldEta: exEta || null,
          oldFlightTime: exTime || null,
          dateChangeDiff,
          validationStatus: vStatus,
          validationNote: note,
        };
      });

      const newCount = parsed.filter((p) => p.actionType === "new").length;
      const updateCount = parsed.filter((p) => p.actionType === "update").length;

      // ขั้นที่ 4: สรุปผลลัพธ์
      setUploadProgress(4);
      setIsProcessing(false);
      const safe = computeSafeSelection(parsed);
      setStagingData(parsed);
      setSelectedIds(safe);
      setPreviewFilter(
        isCustomsFile && parsed.some((r) => r.isCustomsChanged)
          ? "customs_updates"
          : safe.size > 0
          ? "new"
          : "all"
      );
      setUploadSummary({
        fileName: file.name,
        fileType: data.fileTypeLabel || (data.fileType === "customs" ? "รายงานใบขนสินค้า e-Customs" : "รายงาน FWD Booking Report"),
        rows: parsed.length,
        newJobs: newCount,
        updatedJobs: updateCount,
      });

      if (parsed.length > 0) {
        showToast(`อ่านไฟล์ ${file.name} สำเร็จ (${parsed.length} รายการ) · แสดงผลตาราง Preview เพื่อตรวจสอบ`);
      } else {
        showToast(`ไฟล์ ${file.name} ไม่มีข้อมูลงานที่จับคู่ได้`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", err);
      setIsProcessing(false);
      setUploadProgress(-1);
      // Fallback: If it's a CSV, try client-side parse
      if (file.name.toLowerCase().endsWith(".csv")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) parseCSVText(content, file.name);
        };
        reader.readAsText(file);
      } else {
        showToast(`เกิดข้อผิดพลาดในการอ่านไฟล์ Excel: ${msg}`);
      }
    }
  };

  /* ==========================================================================
   * 4. CONFIRM & APPLY TO MASTER (กดยืนยันนำเข้าเฉพาะงานใหม่จริงประจำงวด)
   * Existing jobs update in place; old unmatched jobs remain blocked to prevent duplicate imports.
   * ========================================================================== */
  const handleConfirmApply = async () => {
    if (!stagingData || stagingData.length === 0) return;

    // กรองเฉพาะรายการที่เลือก และเข้าเงื่อนไข isSelectable
    const recordsToApply = stagingData.filter((r) => selectedIds.has(r.id) && isSelectable(r));
    if (recordsToApply.length === 0) {
      showToast("⚠️ ไม่มีรายการที่จะบันทึก (งานเดิมที่ไม่เปลี่ยนวันเวลาถูกข้ามเพื่อไม่ให้งานบวม)");
      return;
    }

    const updatedJobsList = [...jobs];
    let applyNew = 0;
    let dateUpdatedCount = 0;
    let skippedDuplicates = 0;
    let blockedOld = 0;

    // Index existing jobs strictly by exact Job No & Join No (no SH prefix stripping!)
    const jobIndexMap = new Map<string, number>();
    updatedJobsList.forEach((j, idx) => {
      if (j.jobNo) {
        const jn = j.jobNo.trim().toUpperCase();
        jobIndexMap.set(jn, idx);
      }
      if (j.joinNo) {
        const jjn = j.joinNo.trim().toUpperCase().replace(/\s*\((SEA|AIR)\)\s*$/i, "").trim();
        if (jjn && !jobIndexMap.has(jjn)) {
          jobIndexMap.set(jjn, idx);
        }
      }
    });

    for (const stg of recordsToApply) {
      const stgKey = stg.jobNo.trim().toUpperCase();
      const stgJoin = (stg.joinNo || "").trim().toUpperCase().replace(/\s*\((SEA|AIR)\)\s*$/i, "").trim();

      const existingIdx = jobIndexMap.get(stgKey) ?? (stgJoin ? jobIndexMap.get(stgJoin) : undefined);

      // 1. Existing Job Match
      if (existingIdx !== undefined) {
        if (stg.isDateChanged || stg.isCustomsChanged || stg.isStatusChanged) {
          // UPDATE IN PLACE (Anti-Bloat: in-place update on existing job, no new rows added!)
          const target = { ...updatedJobsList[existingIdx] };
          if (stg.etd) target.etd = stg.etd;
          if (stg.eta) target.eta = stg.eta;
          if (stg.clearDate) target.clearDate = stg.clearDate;
          if (stg.flightTime) target.flightTime = stg.flightTime;
          if (stg.vessel) target.vessel = stg.vessel;
          if (stg.feeder) target.feeder = stg.feeder;
          if (stg.flightNo) target.flightNo = stg.flightNo;
          if (stg.carrier && !target.carrier) target.carrier = stg.carrier;
          if (stg.bl && !target.bl) target.bl = stg.bl;
          if (stg.isStatusChanged && stg.hasExplicitStatus && stg.status) {
            target.status = stg.status as JobRecord["status"];
            if (stg.statusDetail) target.statusDetail = stg.statusDetail;
            if (stg.statusRaw) target.statusRaw = stg.statusRaw;
            if (stg.status === "Completed") {
              target.cleared = true;
              target.doReleased = true;
              target.draftCustoms = true;
              target.customsFiled = true;
              target.nextAction = "นำส่งสินค้าเรียบร้อย";
            }
          }
          // Update declaration numbers independently of status; only advance status, never downgrade.
          if (stg.fileType === "customs") {
            if (stg.declarationNo) {
              target.declarationNo = stg.declarationNo;
              target.customsFiled = true;
            }
            if (stg.submitDate) target.customsDate = stg.submitDate;
          }
          if (stg.customsStatus && customsRank(stg.customsStatus) > customsRank(target.customsStatus)) {
            target.customsStatus = stg.customsStatus;
            if (stg.customsStatus === "0409") {
              target.status = "Completed";
              target.statusDetail = "Job Complete";
              target.nextAction = "นำส่งสินค้าเรียบร้อย";
              target.cleared = true;
              target.doReleased = true;
            }
          }

          if (stg.isDateChanged) {
            const isExp = target.jobNo?.startsWith("SE") || target.jobNo?.startsWith("SHSE") || target.jobNo?.startsWith("AE") || target.jobNo?.startsWith("SHAE");
            const finalOpDate = isExp ? (target.etd || target.submitDate || target.eta) : (target.eta || target.submitDate || target.etd);
            if (finalOpDate) {
              target.jobDate = finalOpDate;
              target.month = finalOpDate.slice(0, 7);
            }
          }
          if (stg.customsStatus === "0409") {
            target.status = "Completed";
            target.statusDetail = "Job Complete";
            target.nextAction = "นำส่งสินค้าเรียบร้อย";
          }
          updatedJobsList[existingIdx] = target;
          dateUpdatedCount++;
        } else {
          skippedDuplicates++;
        }
        continue;
      }

      // 2. Lock old past jobs (< 2026-11-01) using Export=ETD, Import=ETA rule
      const isExp =
        stg.jobNo.startsWith("SE") ||
        stg.jobNo.startsWith("SHSE") ||
        stg.jobNo.startsWith("AE") ||
        stg.jobNo.startsWith("SHAE");
      const opDate = isExp
        ? (stg.etd || stg.submitDate || stg.eta || "")
        : (stg.eta || stg.submitDate || stg.etd || "");
      if (opDate && opDate < "2026-11-01") {
        blockedOld++;
        continue;
      }

      // 3. Skip blank dummy rows
      if (stg.isBlankDummy) {
        continue;
      }

      // 4. Genuine New Job -> push new row
      applyNew++;
      const svc = (
        stg.jobNo.startsWith("SI") || stg.jobNo.startsWith("SHSI")
          ? "SEA Import"
          : stg.jobNo.startsWith("SE") || stg.jobNo.startsWith("SHSE")
          ? "SEA Export"
          : stg.jobNo.startsWith("AI") || stg.jobNo.startsWith("SHAI")
          ? "AIR Import"
          : stg.jobNo.startsWith("AE") || stg.jobNo.startsWith("SHAE")
          ? "AIR Export"
          : stg.jobNo.startsWith("TS") || stg.jobNo.startsWith("SHT")
          ? "Transport"
          : "Freight"
      ) as JobRecord["service"];

      const finalOpDate = isExp
        ? stg.etd || stg.submitDate || stg.eta
        : stg.eta || stg.submitDate || stg.etd;
      const opMonth = finalOpDate ? finalOpDate.slice(0, 7) : "2026-11";
      const resolvedStatus = (
        stg.hasExplicitStatus && stg.status
          ? stg.status
          : stg.customsStatus === "0409"
          ? "Completed"
          : "In Progress"
      ) as JobRecord["status"];
      const resolvedDetail =
        stg.statusDetail ||
        (resolvedStatus === "Completed"
          ? "Job Complete"
          : resolvedStatus === "Booking"
          ? "Job Booking"
          : resolvedStatus === "Cancelled"
          ? "Job Cancelled"
          : "Job Control");
      const isDone = resolvedStatus === "Completed";

      updatedJobsList.push({
        id: `Upload_${opMonth}_${stg.jobNo}`,
        jobNo: stg.jobNo,
        joinNo: stg.joinNo || undefined,
        service: svc,
        serviceLabel: svc,
        status: resolvedStatus,
        statusDetail: resolvedDetail,
        statusRaw: stg.statusRaw || resolvedDetail,
        customer: stg.customer,
        consignee: "",
        bl: stg.bl || "",
        invoiceNo: stg.invoiceNo || "",
        declarationNo: stg.declarationNo || "",
        etd: stg.etd || null,
        eta: stg.eta || null,
        month: opMonth,
        year: 2026,
        ageDays: null,
        flags: [],
        jobDate: finalOpDate || null,
        draftCustoms: isDone,
        customsFiled: isDone || Boolean(stg.declarationNo),
        doReleased: isDone,
        cleared: isDone,
        advanceDoc: false,
        draftDate: null,
        customsDate: stg.fileType === "customs" ? stg.submitDate || null : null,
        doDate: null,
        clearDate: stg.clearDate || null,
        advanceDate: null,
        sourceRow: updatedJobsList.length + 1,
        customsStatus: stg.customsStatus || (isDone ? "0409" : "0109"),
        csName: stg.csName || "",
        containerType: stg.containerType || undefined,
        grossWeight: stg.grossWeight ?? undefined,
        cbm: stg.cbm ?? undefined,
        commodity: stg.commodity || undefined,
        nextAction: isDone ? "นำส่งสินค้าเรียบร้อย" : "ตรวจปล่อยสินค้า",
      });

      const newIdx = updatedJobsList.length - 1;
      jobIndexMap.set(stgKey, newIdx);
      if (stgJoin && !jobIndexMap.has(stgJoin)) jobIndexMap.set(stgJoin, newIdx);
    }

    if (applyNew === 0 && dateUpdatedCount === 0) {
      showToast(
        `🛡️ ปลอดภัย: ไม่พบงานใหม่หรือข้อมูลที่เปลี่ยนแปลง (ข้ามงานเดิม ${skippedDuplicates} รายการ, บล็อคงานเก่า ${blockedOld} รายการ ไม่ให้งานบวม)`
      );
      return;
    }

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", jobs: updatedJobsList }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "ไม่สามารถบันทึกข้อมูลลงระบบได้");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`บันทึกข้อมูลไม่สำเร็จ: ${msg}`);
      return;
    }

    const summaryParts: string[] = [];
    if (applyNew > 0) summaryParts.push(`✨ เพิ่มงานใหม่ ${applyNew} งาน`);
    if (dateUpdatedCount > 0) summaryParts.push(`🔄 อัปเดตกำหนดการ/ข้อมูลใบขน ${dateUpdatedCount} งาน (ไม่บวม)`);
    if (skippedDuplicates > 0) summaryParts.push(`⚪ ข้ามงานเดิม ${skippedDuplicates} งาน`);
    if (blockedOld > 0) summaryParts.push(`🛡️ ล็อคงานเก่า ${blockedOld} งาน`);

    const summaryText = summaryParts.join(" • ") || `บันทึกเรียบร้อย (${updatedJobsList.length} งาน)`;
    onApplyUpload(updatedJobsList, summaryText);
    showToast(summaryText);
    setStagingData(null);
    setUploadFile(null);
    setUploadProgress(-1);
    setUploadSummary(null);
  };

  /* ==========================================================================
   * 4.1 CONFIRM & APPLY TRANSPORT (กดยืนยันนำเข้าเที่ยวรถเข้าสู่ระบบ)
   * ========================================================================== */
  const handleConfirmApplyTransport = async () => {
    if (!stagingTransport || stagingTransport.length === 0) return;

    // กรองเฉพาะเที่ยวรถที่ผู้ใช้ติ๊กเลือก
    const tripsToApply = stagingTransport.filter((t) => selectedTransportIds.has(t.id));
    if (tripsToApply.length === 0) {
      showToast("กรุณาเลือกเที่ยวรถที่ต้องการนำเข้าอย่างน้อย 1 รายการ");
      return;
    }

    try {
      const resp = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_transport",
          trips: tripsToApply,
        }),
      });
      const res = await resp.json();
      if (!resp.ok || !res.ok) {
        throw new Error(res.error || "ไม่สามารถบันทึกเที่ยวรถได้");
      }

      const summaryText =
        res.message ||
        `✨ นำเข้าเที่ยวรถสำเร็จ ${tripsToApply.length} เที่ยวรถ (บันทึกลงตารางเดินรถในประเทศแล้ว)`;
      if (onApplyTransportUpload && Array.isArray(res.transport)) {
        onApplyTransportUpload(res.transport, summaryText);
      } else {
        showToast(summaryText);
        onSyncNow();
      }

      setStagingTransport(null);
      setUploadFile(null);
      setUploadProgress(-1);
      setUploadSummary(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`เกิดข้อผิดพลาดในการบันทึกเที่ยวรถ: ${msg}`);
    }
  };

  /* ==========================================================================
   * 4.1 EDIT & MANAGE ROW IN STAGING TABLE (แก้ไขเนื้อหาในตารางก่อนกดยืนยัน)
   * ========================================================================== */
  const handleStartEdit = (record: StagingRecord) => {
    setEditingId(record.id);
    setEditForm({ ...record });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = (id: string) => {
    if (!stagingData) return;
    const cleanJobNo = (editForm.jobNo || "").trim().toUpperCase();
    if (!cleanJobNo) {
      showToast("กรุณาระบุเลข Job No ก่อนบันทึก");
      return;
    }
    const existsInMaster = existingJobMap.has(cleanJobNo);
    const updated = stagingData.map((r) => {
      if (r.id !== id) return r;
      const merged: StagingRecord = {
        ...r,
        ...editForm,
        jobNo: cleanJobNo,
        actionType: existsInMaster ? "update" : "new",
        customer:
          (editForm.customer || "").trim() ||
          (existsInMaster ? existingJobMap.get(cleanJobNo)?.customer || "—" : "ลูกค้าใหม่"),
        validationStatus: "valid",
        validationNote: undefined,
      };
      return merged;
    });

    setStagingData(updated);
    setEditingId(null);
    setEditForm({});

    if (uploadSummary) {
      const newCount = updated.filter((r) => r.actionType === "new").length;
      const updateCount = updated.filter((r) => r.actionType === "update").length;
      setUploadSummary({
        ...uploadSummary,
        rows: updated.length,
        newJobs: newCount,
        updatedJobs: updateCount,
      });
    }

    showToast(`บันทึกการแก้ไข Job: ${cleanJobNo} ในตารางเรียบร้อย`);
  };

  const handleDeleteRow = (id: string) => {
    if (!stagingData) return;
    const target = stagingData.find((r) => r.id === id);
    const updated = stagingData.filter((r) => r.id !== id);
    setStagingData(updated);
    if (editingId === id) {
      setEditingId(null);
      setEditForm({});
    }
    if (uploadSummary) {
      const newCount = updated.filter((r) => r.actionType === "new").length;
      const updateCount = updated.filter((r) => r.actionType === "update").length;
      setUploadSummary({
        ...uploadSummary,
        rows: updated.length,
        newJobs: newCount,
        updatedJobs: updateCount,
      });
    }
    showToast(`ลบ Job ${target?.jobNo || ""} ออกจากตาราง Staging เรียบร้อย`);
  };

  const handleAddNewRow = () => {
    const newId = `manual-${Date.now()}`;
    const newRecord: StagingRecord = {
      id: newId,
      actionType: "new",
      jobNo: "",
      customer: "",
      fileType: uploadSummary?.fileType?.includes("ใบขน") ? "customs" : "fwd",
      status: "In Progress",
      customsStatus: "0109",
      etd: new Date().toISOString().slice(0, 10),
      validationStatus: "warning",
      validationNote: "ระบุ Job No",
    };
    const updated = [newRecord, ...(stagingData || [])];
    setStagingData(updated);
    setEditingId(newId);
    setEditForm({ ...newRecord });
    setCurrentPage(1);
    if (uploadSummary) {
      setUploadSummary({
        ...uploadSummary,
        rows: updated.length,
        newJobs: updated.filter((r) => r.actionType === "new").length,
        updatedJobs: updated.filter((r) => r.actionType === "update").length,
      });
    }
    showToast("เพิ่มแถวว่างใหม่แล้ว กรอกข้อมูลและกดบันทึกเพื่อบรรจุลงตาราง");
  };

  /* ==========================================================================
   * 5. FILTER & PAGINATION FOR PREVIEW TABLE
   * ========================================================================== */
  const countGenuineNew = useMemo(
    () => stagingData?.filter((r) => r.isGenuineNew && r.actionType === "new").length || 0,
    [stagingData]
  );
  const countDateUpdates = useMemo(
    () => stagingData?.filter((r) => r.actionType === "update" && (r.isDateChanged || r.isStatusChanged)).length || 0,
    [stagingData]
  );
  const countCustomsUpdates = useMemo(
    () => stagingData?.filter((r) => r.actionType === "update" && r.isCustomsChanged).length || 0,
    [stagingData]
  );
  const countUnchanged = useMemo(
    () => stagingData?.filter((r) => r.actionType === "update" && !r.isDateChanged && !r.isCustomsChanged && !r.isStatusChanged).length || 0,
    [stagingData]
  );
  const countLockedOld = useMemo(
    () =>
      stagingData?.filter(
        (r) => (r.isPastOrOld || r.isBlankDummy) && r.actionType === "new"
      ).length || 0,
    [stagingData]
  );
  const selNewCount = useMemo(
    () => stagingData?.filter((r) => selectedIds.has(r.id) && r.isGenuineNew && r.actionType === "new").length || 0,
    [stagingData, selectedIds]
  );
  const selDateUpdateCount = useMemo(
    () => stagingData?.filter((r) => selectedIds.has(r.id) && r.actionType === "update" && (r.isDateChanged || r.isStatusChanged)).length || 0,
    [stagingData, selectedIds]
  );
  const selCustomsUpdateCount = useMemo(
    () => stagingData?.filter((r) => selectedIds.has(r.id) && r.actionType === "update" && r.isCustomsChanged).length || 0,
    [stagingData, selectedIds]
  );
  const countActionable =
    countGenuineNew +
    (stagingData?.filter(
      (r) => r.actionType === "update" && (r.isDateChanged || r.isCustomsChanged || r.isStatusChanged)
    ).length || 0);
  const selUpdateCount =
    stagingData?.filter(
      (r) =>
        selectedIds.has(r.id) &&
        r.actionType === "update" &&
        (r.isDateChanged || r.isCustomsChanged || r.isStatusChanged)
    ).length || 0;

  const filteredStaging = useMemo(() => {
    if (!stagingData) return [];
    let list = [...stagingData];
    if (previewFilter === "new") {
      list = list.filter((r) => r.isGenuineNew && r.actionType === "new");
    } else if (previewFilter === "date_updates") {
      list = list.filter((r) => r.actionType === "update" && (r.isDateChanged || r.isStatusChanged));
    } else if (previewFilter === "customs_updates") {
      list = list.filter((r) => r.actionType === "update" && r.isCustomsChanged);
    } else if (previewFilter === "unchanged") {
      list = list.filter((r) => r.actionType === "update" && !r.isDateChanged && !r.isCustomsChanged && !r.isStatusChanged);
    } else if (previewFilter === "locked_old") {
      list = list.filter((r) => (r.isPastOrOld || r.isBlankDummy) && r.actionType === "new");
    }
    if (previewQ.trim()) {
      const q = previewQ.toLowerCase();
      list = list.filter((r) =>
        [r.jobNo, r.joinNo, r.customer, r.declarationNo, r.invoiceNo, r.csName]
          .some((v) => String(v || "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [stagingData, previewFilter, previewQ]);

  const totalPages = Math.max(1, Math.ceil(filteredStaging.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedStaging = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredStaging.slice(start, start + pageSize);
  }, [filteredStaging, safeCurrentPage, pageSize]);

  /* ==========================================================================
   * 5.1 FILTER & PAGINATION FOR TRANSPORT PREVIEW TABLE
   * ========================================================================== */
  const countNewTransport = useMemo(
    () => stagingTransport?.filter((t) => t.isNew || t.actionType === "new").length || 0,
    [stagingTransport]
  );
  const countDateUpdatesTransport = useMemo(
    () => stagingTransport?.filter((t) => (!t.isNew || t.actionType === "update") && t.isDateChanged).length || 0,
    [stagingTransport]
  );
  const countUnchangedTransport = useMemo(
    () => stagingTransport?.filter((t) => (!t.isNew || t.actionType === "update") && !t.isDateChanged).length || 0,
    [stagingTransport]
  );
  const countExistingTransport = useMemo(
    () => stagingTransport?.filter((t) => !t.isNew && t.actionType === "update").length || 0,
    [stagingTransport]
  );

  const filteredTransportStaging = useMemo(() => {
    if (!stagingTransport) return [];
    let list = [...stagingTransport];
    if (transportFilter === "new") {
      list = list.filter((t) => t.isNew || t.actionType === "new");
    } else if (transportFilter === "date_updates") {
      list = list.filter((t) => t.isDateChanged);
    } else if (transportFilter === "existing") {
      list = list.filter((t) => !t.isNew && t.actionType === "update");
    }
    if (transportQ.trim()) {
      const q = transportQ.toLowerCase();
      list = list.filter((t) =>
        [
          t.tripNo,
          t.transportNo,
          t.jobNo,
          t.customer,
          t.plateNo,
          t.driverName,
          t.transporter,
          t.container,
          t.pickupLocation,
          t.deliveryLocation,
          t.status,
        ].some((v) => String(v || "").toLowerCase().includes(q))
      );
    }
    return list;
  }, [stagingTransport, transportFilter, transportQ]);

  const totalTransportPages = Math.max(
    1,
    Math.ceil(filteredTransportStaging.length / transportPageSize)
  );
  const safeCurrentTransportPage = Math.min(transportPage, totalTransportPages);
  const pagedTransportStaging = useMemo(() => {
    const start = (safeCurrentTransportPage - 1) * transportPageSize;
    return filteredTransportStaging.slice(start, start + transportPageSize);
  }, [filteredTransportStaging, safeCurrentTransportPage, transportPageSize]);

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------------------
       * TOP SECTION: DROPZONE & INGESTION STATUS
       * -------------------------------------------------------------------- */}
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
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleNativeFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className={`mt-4 border-2 border-dashed rounded-[10px] p-6 text-center transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out cursor-pointer flex flex-col items-center justify-center block ${
                isDragOver
                  ? "border-[#f56a22] bg-[#fff6f0] scale-[1.01] shadow-md ring-4 ring-[#f56a22]/15"
                  : "border-[#c5cfd9] hover:border-[#f56a22] bg-[#f5f6f8]/70 hover:bg-[#fff9f5]"
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                aria-label="เลือกไฟล์รายงาน FWD หรือใบขนสินค้าเพื่ออัปโหลด"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleNativeFileUpload(e.target.files[0]);
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
                ลากไฟล์รายงานมาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
              </h3>
              <p className="text-[12.5px] text-[#526275] mt-1 max-w-[420px]">
                รองรับไฟล์ Booking List FWD, รายงานใบขนสินค้า e-Customs (.xlsx / .xls / .csv)
              </p>
              <div className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[6px] bg-[#f56a22] hover:bg-[#e05612] text-white font-medium text-xs shadow-2xs transition-colors">
                <UploadCloud className="w-3.5 h-3.5" />
                <span>เลือกไฟล์จากเครื่อง</span>
              </div>
            </label>

            {/* สถานะไฟล์ที่อัปโหลด */}
            {uploadFile && (
              <div className="mt-4 p-3.5 rounded-[8px] bg-slate-50 border border-[#dce2e8] overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet className="w-5 h-5 text-[#0d7a5f] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] text-[#102238] truncate">
                        {uploadFile.name}
                      </div>
                      <div className="text-[11.5px] font-mono text-[#526275]">
                        {(uploadFile.size / 1024).toFixed(1)} KB · กำลังประมวลผลใน Staging Ingestion
                      </div>
                    </div>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#e6f5f0] text-[#0d7a5f] font-semibold shrink-0">
                    {uploadProgress === 4 ? "วิเคราะห์สำเร็จ" : "กำลังตรวจสอบ..."}
                  </span>
                </div>
                {/* Shimmer Progress Bar ขณะประมวลผล */}
                {isProcessing && (
                  <div className="mt-3 w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full animate-shimmer" />
                  </div>
                )}
              </div>
            )}

            {/* สรุปผลลัพธ์การอัปเดต (Upload Summary) */}
            {uploadSummary && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap sm:flex-nowrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[13.5px] text-emerald-900 flex items-center gap-1.5">
                      <span>
                        ตรวจสอบโครงสร้างไฟล์เรียบร้อย ·{" "}
                        {stagingTransport
                          ? "โหมดตรวจสอบเที่ยวรถขนส่ง (Inland Transport)"
                          : "นโยบายรักษาความถูกต้องเปิดทำงาน"}
                      </span>
                    </div>
                                        {stagingTransport ? (
                      <div className="text-xs text-slate-700 font-mono mt-1 space-y-1">
                        <div>
                          • จำนวนเที่ยวรถในไฟล์ทั้งหมด: <b>{uploadSummary.rows}</b> เที่ยว
                        </div>
                        <div>
                          • เที่ยวรถเดิมไม่เปลี่ยน:{" "}
                          <span className="text-slate-600 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            ⚪ {countUnchangedTransport} เที่ยว (ข้ามเพื่อไม่ให้ซ้ำ)
                          </span>
                        </div>
                        {countDateUpdatesTransport > 0 && (
                          <div>
                            • อัปเดตวันส่งมอบ:{" "}
                            <span className="text-sky-800 font-bold bg-sky-100/80 px-1.5 py-0.5 rounded border border-sky-300">
                              🔄 {countDateUpdatesTransport} เที่ยว
                            </span>
                          </div>
                        )}
                        {countCustomsUpdates > 0 && (
                          <div>
                            • อัปเดตข้อมูลใบขน:{" "}
                            <span className="text-indigo-800 font-bold bg-indigo-100/80 px-1.5 py-0.5 rounded border border-indigo-300">
                              🔄 {countCustomsUpdates} งาน (บันทึกทับงานเดิม ไม่สร้างซ้ำ)
                            </span>
                          </div>
                        )}
                        <div>
                          • เที่ยวรถใหม่ที่จะนำเข้า:{" "}
                          <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                            ✨ {countNewTransport} เที่ยว
                          </span>
                          <span className="ml-1.5 text-slate-600 font-normal">
                            (เลือกแล้ว <b>{selectedTransportIds.size}</b> เที่ยว)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-700 font-mono mt-1 space-y-1">
                        <div>
                          • จำนวนข้อมูลในไฟล์: <b>{uploadSummary.rows}</b> รายการ
                        </div>
                        <div>
                          • งานเดิมไม่เปลี่ยนวันเวลา:{" "}
                          <span className="text-slate-600 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            ⚪ {countUnchanged} งาน (ข้ามเพื่อไม่ให้งานบวม)
                          </span>
                        </div>
                        {countDateUpdates > 0 && (
                          <div>
                            • อัปเดตกำหนดการ ETD/ETA:{" "}
                            <span className="text-sky-800 font-bold bg-sky-100/80 px-1.5 py-0.5 rounded border border-sky-300">
                              🔄 {countDateUpdates} งาน (อัปเดตทับงานเดิม ไม่บวม)
                            </span>
                          </div>
                        )}
                        {countLockedOld > 0 && (
                          <div>
                            • งานเก่า/ก่อนกำหนด:{" "}
                            <span className="text-amber-800 font-bold bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-300/80">
                              🛡️ {countLockedOld} งาน (ล็อคข้อมูลไว้ ป้องกันงานบวม)
                            </span>
                          </div>
                        )}
                        <div>
                          • งานใหม่ที่จะนำเข้า:{" "}
                          <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                            ✨ {countGenuineNew} งาน
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {stagingTransport ? (
                    <button
                      type="button"
                      aria-label="ยืนยันนำเข้าเที่ยวรถเข้าสู่ระบบ"
                      onClick={handleConfirmApplyTransport}
                      disabled={selectedTransportIds.size === 0}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none cursor-pointer ${
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
                  ) : (
                    <button
                      type="button"
                      aria-label="ยืนยันนำเข้าเฉพาะงานใหม่"
                      onClick={handleConfirmApply}
                      disabled={countActionable === 0 || selectedIds.size === 0}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none cursor-pointer ${
                        countActionable > 0 && selectedIds.size > 0
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                      title={
                        countActionable === 0
                          ? "ไม่มีงานใหม่หรือข้อมูลใบขนที่เปลี่ยนแปลง"
                          : `ยืนยันบันทึกข้อมูลที่เลือก ${selectedIds.size} รายการ`
                      }
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {countActionable === 0
                          ? "ไม่มีรายการอัปเดต"
                          : `ยืนยันบันทึกข้อมูล (${selectedIds.size})`}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="ล้างข้อมูลทดสอบโดยไม่บันทึก"
                    onClick={() => {
                      setStagingData(null);
                      setStagingTransport(null);
                      setUploadFile(null);
                      setUploadProgress(-1);
                      setUploadSummary(null);
                    }}
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
            <span className="text-slate-400">ระบบปกป้องไฟล์หลักด้วย Local Snapshot เสมอ</span>
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
                  sub: "ตรวจสอบกับฐาน 1,129 งาน เพื่อแยกแยะงานใหม่ หรืองานที่จะอัปเดต",
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
                        {done
                          ? "✓ เสร็จ"
                          : active
                          ? "กำลังตรวจ..."
                          : "รอ"}
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

      {/* --------------------------------------------------------------------
       * BOTTOM SECTION: STAGING PREVIEW TABLE (ตารางดูข้อมูลก่อนอัปเดตเพื่อเช็ค และแก้ไขเนื้อหา)
       * -------------------------------------------------------------------- */}
      {stagingData && stagingData.length > 0 && (
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
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer btn-press"
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
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-[background-color,color] duration-150 cursor-pointer btn-press ${
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
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 font-medium"               title="ระบบข้ามรายการเดิมที่ไม่มีข้อมูลใบขนหรือกำหนดการเปลี่ยนแปลง">
                ⚪ ไม่มีข้อมูลเปลี่ยนแปลง {countUnchanged} รายการ
              </span>
              {countLockedOld > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 font-medium" title="ระบบล็อคอัตโนมัติ ป้องกันการเผลอนำเข้างานเดือนเก่าเพื่อไม่ให้ยอดเดือนก่อนหน้าบวม">
                  🛡️ ล็อคงานเก่า {countLockedOld} รายการ
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={handleSelectSafeOnly}
                className="px-2.5 py-1 rounded-md px-2.5 py-1 rounded-md bg-emerald-100/80 hover:bg-emerald-200/80 text-emerald-800 font-semibold text-xs border border-emerald-300/80 transition-colors cursor-pointer flex items-center gap-1"
                title="เลือกเฉพาะงานใหม่ประจำงวดปัจจุบัน (พ.ย. 26) ที่มีข้อมูลสินค้าจริง ไม่เอางานเก่าและงานเดิม"
              >
                <Sparkles className="w-3 h-3" />
                <span>✨ เลือกเฉพาะงานใหม่ ({countGenuineNew})</span>
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1 rounded-md px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-300 text-slate-600 font-medium text-xs transition-colors cursor-pointer"
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
                        pagedStaging.filter(isSelectable).every((r) => selectedIds.has(r.id))
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
                            title={`ระบบล็อคอัตโนมัติ: งานย้อนหลังเดือนเก่า (${r.etd?.slice(0, 7) || r.submitDate?.slice(0, 7) || "อดีต"}) ไม่อนุญาตให้นำเข้า เพื่อป้องกันยอดเดือนเก่าบวม`}
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
                            title={`งานย้อนหลังเดือนเก่า (${r.etd?.slice(0, 7) || r.submitDate?.slice(0, 7) || "อดีต"}) — ล็อคป้องกันยอดบวม`}
                          >
                            <span>🛡️ ล็อค: งานเก่า ({r.etd?.slice(0, 7) || r.submitDate?.slice(0, 7) || "อดีต"})</span>
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
                            <span>✨ งานใหม่ประจำงวด ({r.etd?.slice(0, 7) || r.submitDate?.slice(0, 7) || "พ.ย. 26"})</span>
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
                            <div>{r.jobNo || <span className="text-red-500 font-normal">ไม่มี Job No</span>}</div>
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
                          <span className="truncate block font-semibold text-slate-900" title={r.customer}>
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
                                  grossWeight: e.target.value ? parseFloat(e.target.value) : null,
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
                                  cbm: e.target.value ? parseFloat(e.target.value) : null,
                                }))
                              }
                              placeholder="CBM"
                              className="h-7 px-1.5 rounded border border-[#c5cfd9] text-[11px] bg-white outline-none focus:border-[#f56a22]"
                            />
                          </div>
                        ) : r.containerType || r.grossWeight || r.cbm || r.csName ? (
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
                                <span className={r.isDateChanged && r.dateChangeDiff?.includes("ETD") ? "font-bold text-sky-800 bg-sky-50 px-1 rounded border border-sky-200" : ""}>
                                  ETD: {fmtDate(r.etd)}
                                </span>
                              )}
                              {r.eta && (
                                <span className={r.isDateChanged && r.dateChangeDiff?.includes("ETA") ? "font-bold text-sky-800 bg-sky-50 px-1 rounded border border-sky-200" : ""}>
                                  ETA: {fmtDate(r.eta)}
                                </span>
                              )}
                              {!r.etd && !r.eta && (
                                <span>{r.submitDate ? fmtDate(r.submitDate) : "—"}</span>
                              )}
                            </div>
                            {r.isDateChanged && r.dateChangeDiff && (
                              <span className="text-[10.5px] font-mono text-sky-700 bg-sky-50/90 px-1.5 py-0.2 rounded border border-sky-200/80 inline-flex items-center gap-1" title={r.dateChangeDiff}>
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
      )}

      {/* --------------------------------------------------------------------
       * 6.1 TRANSPORT STAGING TABLE (ตารางตรวจสอบข้อมูลเที่ยวรถก่อนนำเข้า)
       * -------------------------------------------------------------------- */}
      {stagingTransport && stagingTransport.length > 0 && (
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
                  aria-label="แสดงเฉพาะเที่ยวรถที่อัปเดตวันส่งมอบ"
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
                  🔄 อัปเดตส่งมอบ ({countDateUpdatesTransport})
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
                aria-label="เลือกเฉพาะเที่ยวรถใหม่"
                onClick={handleSelectSafeTransportOnly}
                className="px-2.5 py-1 rounded-md bg-emerald-100/80 hover:bg-emerald-200/80 text-emerald-800 font-semibold border border-emerald-300/80 transition-[background-color] cursor-pointer inline-flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>เลือกเฉพาะเที่ยวใหม่ ({countNewTransport})</span>
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
                        {t.isDateChanged ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-300"
                            title={`อัปเดตวันส่งมอบ: ${t.dateChangeDiff || ""} (อัปเดตทับเที่ยวเดิม ไม่บวม)`}
                          >
                            <RotateCw className="w-3 h-3 text-sky-600" />
                            <span>🔄 อัปเดตวันส่งมอบ</span>
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
                        <div className="font-semibold text-[#102238] max-w-[240px] truncate" title={t.customer}>
                          {t.customer || "—"}
                        </div>
                        <div className="text-[11px] text-[#526275] flex items-center gap-1 font-mono mt-0.5">
                          <span className="truncate max-w-[110px]" title={t.pickupLocation}>
                            {t.pickupLocation || "—"}
                          </span>
                          <span className="text-slate-400">➔</span>
                          <span className="truncate max-w-[110px]" title={t.deliveryLocation}>
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
                          <div className="text-[10.5px] font-mono text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200 mt-0.5 inline-block" title={t.dateChangeDiff}>
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
                            <span>พร้อมนำเข้า</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 font-medium">
                            ⚪ ข้อมูลเดิม (ข้าม)
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
                  onClick={() => setTransportPage((p) => Math.min(totalTransportPages, p + 1))}
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
      )}
    </div>
  );
}
