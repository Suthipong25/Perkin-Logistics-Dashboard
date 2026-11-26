"use client";

import React, { useState, useMemo } from "react";
import { JobRecord, TransportRecord } from "@/types/dashboard";
import {
  StagingRecord,
  StagingTransportRecord,
  UploadSummary,
  StagingFilterType,
  TransportFilterType,
  customsRank,
  isSelectable,
  computeSafeSelection,
  parseCSVText,
  StagingDropzone,
  StagingJobsTable,
  StagingTransportTable,
} from "./staging";

export type { StagingRecord, StagingTransportRecord };

interface StagingUploadViewProps {
  jobs: JobRecord[];
  transport?: TransportRecord[];
  onApplyUpload: (newJobsList: JobRecord[], summaryText: string) => void;
  onApplyTransportUpload?: (
    newTransportList: TransportRecord[],
    summaryText: string
  ) => void;
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
  const [, setUploadFile] = useState<{ name: string; size: number } | null>(
    null
  );
  const [uploadedFilesList, setUploadedFilesList] = useState<
    Array<{ name: string; size: number }>
  >([]);
  const [autoApplyOnDrop, setAutoApplyOnDrop] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagingData, setStagingData] = useState<StagingRecord[] | null>(null);
  const [previewFilter, setPreviewFilter] =
    useState<StagingFilterType>("new");
  const [previewQ, setPreviewQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StagingRecord>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Transport Staging State
  const [stagingTransport, setStagingTransport] = useState<
    StagingTransportRecord[] | null
  >(null);
  const [selectedTransportIds, setSelectedTransportIds] = useState<Set<string>>(
    new Set()
  );
  const [transportFilter, setTransportFilter] =
    useState<TransportFilterType>("new");
  const [transportQ, setTransportQ] = useState("");
  const [transportPage, setTransportPage] = useState<number>(1);
  const [transportPageSize, setTransportPageSize] = useState<number>(25);

  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("perkin_auto_apply_upload");
      if (saved === "true") setAutoApplyOnDrop(true);
    } catch {}
  }, []);

  // Helper map: Exact Job No & Join No index
  const existingJobMap = useMemo(() => {
    const map = new Map<string, JobRecord>();
    for (const j of jobs) {
      if (j.jobNo) {
        map.set(j.jobNo.trim().toUpperCase(), j);
      }
      if (j.joinNo) {
        const jjoin = j.joinNo
          .trim()
          .toUpperCase()
          .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
          .trim();
        if (jjoin && !map.has(jjoin)) {
          map.set(jjoin, j);
        }
      }
    }
    return map;
  }, [jobs]);

  // Selection handlers
  const toggleSelectRow = (id: string) => {
    const target = stagingData?.find((r) => r.id === id);
    if (target && !isSelectable(target)) {
      if (
        target.actionType === "update" &&
        !target.isDateChanged &&
        !target.isCustomsChanged &&
        !target.isStatusChanged
      ) {
        showToast(
          "⚪ งานเดิมในระบบแล้ว (วันเวลาและสถานะไม่เปลี่ยน) • ข้ามเพื่อไม่ให้งานบวม"
        );
      } else if (target.isPastOrOld) {
        showToast(
          "🛡️ ล็อคงานเก่า: ข้อมูลก่อน พ.ย. 2026 เพื่อไม่ให้จำนวนงานเดิมบวม"
        );
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
      showToast(
        `เลือกเฉพาะงานใหม่ประจำงวดแล้ว (${safe.size} รายการ) · ป้องกันยอดเดือนเก่าบวม`
      );
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    showToast("ยกเลิกการเลือกทั้งหมดแล้ว");
  };

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
        if (
          t.isNew ||
          t.actionType === "new" ||
          t.isDateChanged ||
          t.isDriverChanged ||
          t.isPlateChanged
        ) {
          safeIds.add(t.id);
        }
      }
      setSelectedTransportIds(safeIds);
      showToast(
        `เลือกเฉพาะเที่ยวใหม่และอัปเดตข้อมูลแล้ว (${safeIds.size} เที่ยว) • ข้ามเที่ยวเดิม`
      );
    }
  };

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

  const handleClearAll = () => {
    setStagingData(null);
    setStagingTransport(null);
    setUploadFile(null);
    setUploadedFilesList([]);
    setUploadProgress(-1);
    setUploadSummary(null);
  };

  // Upload handler
  const handleNativeFilesUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setUploadedFilesList(files.map((f) => ({ name: f.name, size: f.size })));
    setUploadFile({
      name: files.length === 1 ? files[0].name : `${files.length} ไฟล์`,
      size: files.reduce((acc, f) => acc + f.size, 0),
    });
    setIsProcessing(true);
    setUploadProgress(0);
    setStagingData(null);
    setStagingTransport(null);
    setUploadSummary(null);

    setUploadProgress(1);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      if (autoApplyOnDrop) {
        formData.append("autoApply", "true");
      }

      setUploadProgress(2);
      const resp = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });

      setUploadProgress(3);
      const data = await resp.json();

      if (!resp.ok || !data.ok) {
        throw new Error(data.error || "ไม่สามารถอ่านไฟล์ได้");
      }

      if (data.autoApplied) {
        setUploadProgress(4);
        setIsProcessing(false);
        const msg =
          data.message || `⚡ ซิงค์อัตโนมัติสำเร็จ ${files.length} ไฟล์!`;
        if (Array.isArray(data.jobs) && data.jobs.length > 0) {
          onApplyUpload(data.jobs, msg);
        }
        if (
          Array.isArray(data.transport) &&
          data.transport.length > 0 &&
          onApplyTransportUpload
        ) {
          onApplyTransportUpload(data.transport, msg);
        }
        showToast(msg);
        handleClearAll();
        return;
      }

      if (data.directApplied && Array.isArray(data.jobs)) {
        setUploadProgress(4);
        setIsProcessing(false);
        const msg =
          data.message || `อัปเดตข้อมูล Master สำเร็จ (${data.totalJobs} งาน)`;
        onApplyUpload(data.jobs || jobs, msg);
        if (Array.isArray(data.transport) && onApplyTransportUpload) {
          onApplyTransportUpload(data.transport, msg);
        }
        showToast(msg);
        handleClearAll();
        return;
      }

      setUploadProgress(4);
      setIsProcessing(false);

      let parsedTransports: StagingTransportRecord[] = [];
      if (Array.isArray(data.transportTrips) && data.transportTrips.length > 0) {
        parsedTransports = data.transportTrips;
        setStagingTransport(parsedTransports);

        const actionableTransIds = new Set<string>();
        for (const t of parsedTransports) {
          if (
            t.isNew ||
            t.actionType === "new" ||
            t.isDateChanged ||
            t.isDriverChanged ||
            t.isPlateChanged
          ) {
            actionableTransIds.add(t.id);
          }
        }
        setSelectedTransportIds(actionableTransIds);

        const countNewT = parsedTransports.filter(
          (t) => t.isNew || t.actionType === "new"
        ).length;
        const countUpdateT = parsedTransports.filter(
          (t) =>
            (!t.isNew || t.actionType === "update") &&
            (t.isDateChanged || t.isDriverChanged || t.isPlateChanged)
        ).length;
        setTransportFilter(
          countNewT > 0 ? "new" : countUpdateT > 0 ? "date_updates" : "all"
        );
        setTransportPage(1);
      }

      const rows: any[] = Array.isArray(data.rows) ? data.rows : [];
      let parsedJobs: StagingRecord[] = [];

      if (rows.length > 0) {
        const isCustomsDetected =
          data.files?.some((f: any) => f.fileType === "customs") ||
          data.fileType === "customs";

        parsedJobs = rows.map((r: any, idx: number) => {
          const effectiveKey = (r.jobNo || r.joinNo || "")
            .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
            .toUpperCase();
          const existing = existingJobMap.get(effectiveKey);
          const existsInMaster = Boolean(existing);
          const rowIsCustoms = r.fileType
            ? r.fileType === "customs"
            : Boolean(r.declarationNo || r.customsStatus || isCustomsDetected);

          const isExportJob = /^(SH)?(SE|AE)/i.test(effectiveKey);
          const opDate = isExportJob
            ? r.etd || r.submitDate || r.eta || ""
            : r.eta || r.submitDate || r.etd || "";
          const isPastOrOld =
            !existsInMaster && Boolean(opDate && opDate < "2026-11-01");
          const isBlankDummy =
            !existsInMaster &&
            !r.containerType &&
            !r.grossWeight &&
            !r.bl &&
            !r.commodity;
          const isGenuineNew = !existsInMaster && !isPastOrOld && !isBlankDummy;

          const normDate = (d?: string | null) =>
            d ? String(d).trim().slice(0, 10) : "";
          const normTime = (t?: string | null) =>
            t && t.trim() !== "00:00" ? t.trim() : "";

          const incEtd = normDate(
            r.etd || (isExportJob && !rowIsCustoms ? r.submitDate : null)
          );
          const incEta = normDate(r.eta);
          const incTime = normTime(r.flightTime);

          const exEtd = normDate(existing?.etd || existing?.submitDate);
          const exEta = normDate(existing?.eta);
          const exTime = normTime(existing?.flightTime);

          const dateDiffs: string[] = [];
          if (incEtd && incEtd !== exEtd)
            dateDiffs.push(`ETD: ${exEtd || "-"} ➔ ${incEtd}`);
          if (incEta && incEta !== exEta)
            dateDiffs.push(`ETA: ${exEta || "-"} ➔ ${incEta}`);
          if (incTime && exTime && incTime !== exTime)
            dateDiffs.push(`เวลา: ${exTime} ➔ ${incTime}`);
          const isDateChanged = existsInMaster && dateDiffs.length > 0;
          const dateChangeDiff = dateDiffs.join(" • ");

          const customsDiffs: string[] = [];
          const isInvalidDecl = (d?: string | null) =>
            !d ||
            [
              "-",
              "—",
              "N/A",
              "NONE",
              "NULL",
              "NORMAL",
              "GENERAL",
              "IMPORT",
              "EXPORT",
              "TRANSIT",
              "RE-EXPORT",
            ].includes(String(d).trim().toUpperCase());
          const incomingDeclaration = r.declarationNo?.trim();
          const existingDeclaration = existing?.declarationNo?.trim();
          if (
            !isInvalidDecl(incomingDeclaration) &&
            incomingDeclaration !== existingDeclaration
          ) {
            customsDiffs.push(
              `เลขใบขน: ${existingDeclaration || "-"} ➔ ${incomingDeclaration}`
            );
          }
          const incClearDate = normDate(r.clearDate);
          const exClearDate = normDate(existing?.clearDate);
          if (incClearDate && incClearDate !== exClearDate) {
            customsDiffs.push(
              `วันตรวจปล่อย: ${exClearDate || "-"} ➔ ${incClearDate}`
            );
          }
          const effectiveExCustoms =
            existing?.customsStatus ||
            ([
              "0109",
              "0209",
              "0309",
              "0409",
            ].includes(String(existing?.updateStatus || ""))
              ? String(existing?.updateStatus)
              : null) ||
            (existing?.cleared || existing?.status === "Completed"
              ? "0409"
              : existing?.customsFiled || existing?.declarationNo
              ? "0309"
              : null);
          if (
            existing &&
            r.customsStatus &&
            customsRank(r.customsStatus) > customsRank(effectiveExCustoms)
          ) {
            customsDiffs.push(
              `สถานะใบขน: ${effectiveExCustoms || "-"} ➔ ${r.customsStatus}`
            );
          }
          const isCustomsChanged = existsInMaster && customsDiffs.length > 0;
          const customsChangeDiff = customsDiffs.join(" • ");

          const incStatus = r.status || "";
          const incStatusDetail = r.statusDetail || "";
          const exStatus = existing?.status || "";
          const exStatusDetail = existing?.statusDetail || "";
          const isStatusChanged = Boolean(
            existsInMaster &&
              r.hasExplicitStatus &&
              incStatus &&
              (incStatus !== exStatus ||
                (incStatusDetail && incStatusDetail !== exStatusDetail))
          );
          const statusChangeDiff = isStatusChanged
            ? `สถานะ: ${exStatusDetail || exStatus || "-"} ➔ ${
                incStatusDetail || incStatus
              }`
            : "";

          const metaDiffs: string[] = [];
          const incBl = String(r.bl || r.mbl || r.hbl || "").trim();
          const exBl = String(existing?.mbl || existing?.bl || existing?.hbl || "").trim();
          if (existsInMaster && incBl && incBl !== "—" && incBl !== exBl) {
            metaDiffs.push(`BL: ${exBl || "-"} ➔ ${incBl}`);
          }
          const incInv = String(r.invoiceNo || "").trim();
          const exInv = String(existing?.invoiceNo || "").trim();
          if (existsInMaster && incInv && incInv !== "—" && incInv !== exInv) {
            metaDiffs.push(`INV: ${exInv || "-"} ➔ ${incInv}`);
          }
          const incCntr = String(r.containerType || "").trim();
          const exCntr = String(existing?.containerType || "").trim();
          if (existsInMaster && incCntr && incCntr !== "—" && incCntr !== exCntr) {
            metaDiffs.push(`Volume: ${exCntr || "-"} ➔ ${incCntr}`);
          }
          const isMetaChanged = existsInMaster && metaDiffs.length > 0;
          const metaChangeDiff = metaDiffs.join(" • ");

          let note =
            r.validationNote || (!effectiveKey ? "ไม่มีเลข Job No" : undefined);
          let vStatus: "valid" | "warning" =
            r.declarationNo || r.etd || r.eta || effectiveKey
              ? "valid"
              : "warning";

          if (existsInMaster) {
            if (isDateChanged || isCustomsChanged || isStatusChanged || isMetaChanged || r.isChanged) {
              vStatus = "valid";
              note = `🔄 อัปเดต: ${[
                statusChangeDiff,
                dateChangeDiff,
                customsChangeDiff,
                metaChangeDiff,
              ]
                .filter(Boolean)
                .join(" • ")} (อัปเดตทับงานเดิม ไม่เพิ่มแถวใหม่)`;
            } else {
              note =
                "⚪ งานเดิมในระบบแล้ว (ไม่มีข้อมูลใบขน สถานะ หรือกำหนดการเปลี่ยนแปลง)";
            }
          } else {
            if (isPastOrOld) {
              vStatus = "warning";
              note = `งานย้อนหลังเดือนเก่า (${opDate.slice(
                0,
                7
              )}) — ปลดเลือกอัตโนมัติเพื่อป้องกันยอดเดือนเก่าบวม`;
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
            actionType: (existsInMaster ? "update" : "new") as "update" | "new",
            fileType: (rowIsCustoms ? "customs" : "fwd") as "customs" | "fwd",
            customer:
              r.customer && r.customer !== "—"
                ? r.customer
                : existsInMaster
                ? existingJobMap.get(effectiveKey)?.customer || "—"
                : "ลูกค้าใหม่",
            declarationNo:
              r.declarationNo &&
              ![
                "NORMAL",
                "GENERAL",
                "IMPORT",
                "EXPORT",
                "RE-EXPORT",
                "TRANSIT",
              ].includes(r.declarationNo.trim().toUpperCase())
                ? r.declarationNo
                : undefined,
            invoiceNo: r.invoiceNo || undefined,
            status:
              r.status ||
              (r.customsStatus === "0409" ? "Completed" : "In Progress"),
            statusDetail: r.statusDetail || undefined,
            statusRaw: r.statusRaw || undefined,
            hasExplicitStatus: Boolean(r.hasExplicitStatus),
            clearDate: r.clearDate || null,
            customsStatus: r.customsStatus || null,
            etd: r.etd || (rowIsCustoms ? null : r.submitDate) || null,
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
            isCustomsChanged: isCustomsChanged || isMetaChanged,
            isStatusChanged,
            isChanged: Boolean(isDateChanged || isCustomsChanged || isStatusChanged || isMetaChanged || r.isChanged),
            oldStatus: exStatusDetail || exStatus || null,
            statusChangeDiff,
            customsChangeDiff: [customsChangeDiff, metaChangeDiff].filter(Boolean).join(" • "),
            oldEtd: exEtd || null,
            oldEta: exEta || null,
            oldFlightTime: exTime || null,
            dateChangeDiff,
            validationStatus: vStatus,
            validationNote: note,
          };
        });

        setStagingData(parsedJobs);
        const safe = computeSafeSelection(parsedJobs);
        setSelectedIds(safe);

        const countNewJ = parsedJobs.filter(
          (r) => r.isGenuineNew && r.actionType === "new"
        ).length;
        const countCustomsJ = parsedJobs.filter(
          (r) => r.actionType === "update" && r.isCustomsChanged
        ).length;
        const countDateJ = parsedJobs.filter(
          (r) =>
            r.actionType === "update" &&
            (r.isDateChanged || r.isStatusChanged)
        ).length;

        if (countNewJ > 0) setPreviewFilter("new");
        else if (countCustomsJ > 0) setPreviewFilter("customs_updates");
        else if (countDateJ > 0) setPreviewFilter("date_updates");
        else setPreviewFilter("all");
        setCurrentPage(1);
      }

      const totalNewCount =
        parsedJobs.filter((p) => p.actionType === "new").length +
        parsedTransports.filter((t) => t.isNew || t.actionType === "new").length;
      const totalUpdateCount =
        parsedJobs.filter((p) => p.actionType === "update").length +
        parsedTransports.filter((t) => !t.isNew).length;

      setUploadSummary({
        fileName:
          files.length === 1
            ? files[0].name
            : `นำเข้าพร้อมกัน ${files.length} ไฟล์`,
        fileType:
          files.length === 1
            ? data.fileTypeLabel ||
              (parsedTransports.length > 0
                ? "รายงานการจองรถขนส่ง"
                : "รายงานการขนส่ง FWD")
            : `ชุดรายงานแบบผสม (${files.length} ไฟล์)`,
        rows: (parsedJobs.length || 0) + (parsedTransports.length || 0),
        newJobs: totalNewCount,
        updatedJobs: totalUpdateCount,
      });

      const totalActionable =
        (parsedJobs.filter((r) => isSelectable(r)).length || 0) +
        (parsedTransports.filter(
          (t) =>
            t.isNew || t.isDateChanged || t.isDriverChanged || t.isPlateChanged
        ).length || 0);

      if (
        totalActionable > 0 ||
        parsedJobs.length + parsedTransports.length > 0
      ) {
        showToast(
          `อ่านไฟล์สำเร็จ ${files.length} ไฟล์ (${totalActionable} รายการที่พร้อมอัปเดต) · ตรวจสอบและกดซิงค์ทั้งหมดได้ทันที`
        );
      } else {
        showToast(`ไม่พบข้อมูลที่ตรงกับเงื่อนไขในไฟล์ที่อัปโหลด`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", err);
      setIsProcessing(false);
      setUploadProgress(-1);

      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".csv")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            const parsed = parseCSVText(content, files[0].name, existingJobMap);
            setStagingData(parsed);
            const safe = computeSafeSelection(parsed);
            setSelectedIds(safe);
            setUploadSummary({
              fileName: files[0].name,
              fileType: "CSV",
              rows: parsed.length,
              newJobs: parsed.filter((r) => r.actionType === "new").length,
              updatedJobs: parsed.filter((r) => r.actionType === "update")
                .length,
            });
            showToast(`อ่านไฟล์ CSV สำเร็จ ${parsed.length} รายการ`);
          }
        };
        reader.readAsText(files[0]);
      } else {
        showToast(`เกิดข้อผิดพลาดในการอ่านไฟล์: ${msg}`);
      }
    }
  };

  // Helper: compute delta jobs
  const computeChangedJobs = (
    recordsToApply: StagingRecord[],
    currentJobs: JobRecord[]
  ) => {
    const updatedJobsList = [...currentJobs];
    const changedJobs: JobRecord[] = [];
    let applyNew = 0;
    let dateUpdatedCount = 0;

    const jobIndexMap = new Map<string, number>();
    updatedJobsList.forEach((j, idx) => {
      if (j.jobNo) jobIndexMap.set(j.jobNo.trim().toUpperCase(), idx);
      if (j.joinNo) {
        const jjn = j.joinNo
          .trim()
          .toUpperCase()
          .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
          .trim();
        if (jjn && !jobIndexMap.has(jjn)) jobIndexMap.set(jjn, idx);
      }
    });

    for (const stg of recordsToApply) {
      const stgKey = stg.jobNo.trim().toUpperCase();
      const stgJoin = (stg.joinNo || "")
        .trim()
        .toUpperCase()
        .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
        .trim();
      const existingIdx =
        jobIndexMap.get(stgKey) ??
        (stgJoin ? jobIndexMap.get(stgJoin) : undefined);

      if (existingIdx !== undefined) {
        if (
          stg.isDateChanged ||
          stg.isCustomsChanged ||
          stg.isStatusChanged ||
          (stg as any).isChanged
        ) {
          const target = { ...updatedJobsList[existingIdx] };
          if (stg.etd) target.etd = stg.etd;
          if (stg.eta) target.eta = stg.eta;
          if (stg.clearDate) target.clearDate = stg.clearDate;
          if (stg.flightTime) target.flightTime = stg.flightTime;
          if (stg.vessel) target.vessel = stg.vessel;
          if (stg.feeder) target.feeder = stg.feeder;
          if (stg.flightNo) target.flightNo = stg.flightNo;
          if (stg.carrier) target.carrier = stg.carrier;
          if (stg.bl && stg.bl !== "—") {
            target.bl = stg.bl;
            target.mbl = (stg as any).mbl || stg.bl;
          }
          if ((stg as any).mbl && (stg as any).mbl !== "—") target.mbl = (stg as any).mbl;
          if ((stg as any).hbl && (stg as any).hbl !== "—") target.hbl = (stg as any).hbl;
          if (stg.csName && stg.csName !== "—") target.csName = stg.csName;
          if (
            stg.customer &&
            stg.customer !== "—" &&
            stg.customer !== "ลูกค้าใหม่"
          ) {
            target.customer = stg.customer;
          }
          if (stg.commodity) target.commodity = stg.commodity;
          if (stg.containerType) target.containerType = stg.containerType;
          if (stg.grossWeight) target.grossWeight = stg.grossWeight;
          if (stg.cbm) target.cbm = stg.cbm;
          if (stg.invoiceNo && stg.invoiceNo !== "—") target.invoiceNo = stg.invoiceNo;

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

          const isInvalidDecl = (d?: string | null) =>
            !d ||
            [
              "-",
              "—",
              "N/A",
              "NONE",
              "NULL",
              "NORMAL",
              "GENERAL",
              "IMPORT",
              "EXPORT",
              "TRANSIT",
              "RE-EXPORT",
            ].includes(String(d).trim().toUpperCase());
          if (!isInvalidDecl(stg.declarationNo)) {
            target.declarationNo = String(stg.declarationNo).trim();
            target.draftCustoms = true;
            target.customsFiled = true;
            if (!target.customsDate)
              target.customsDate = stg.submitDate || stg.clearDate || null;
          }

          if (
            stg.customsStatus &&
            customsRank(stg.customsStatus) > customsRank(target.customsStatus)
          ) {
            target.customsStatus = stg.customsStatus;
            if (stg.customsStatus === "0409") {
              target.status = "Completed";
              target.statusDetail = "Job Complete";
              target.nextAction = "นำส่งสินค้าเรียบร้อย";
              target.cleared = true;
              target.doReleased = true;
              target.draftCustoms = true;
              target.customsFiled = true;
            }
          }
          if (stg.isDateChanged) {
            const isExp =
              target.jobNo?.startsWith("SE") ||
              target.jobNo?.startsWith("SHSE") ||
              target.jobNo?.startsWith("AE") ||
              target.jobNo?.startsWith("SHAE");
            const finalOpDate = isExp
              ? target.etd || target.submitDate || target.eta
              : target.eta || target.submitDate || target.etd;
            if (finalOpDate) {
              target.jobDate = finalOpDate;
              target.month = finalOpDate.slice(0, 7);
            }
          }
          updatedJobsList[existingIdx] = target;
          changedJobs.push(target);
          dateUpdatedCount++;
        }
        continue;
      }

      const isExp =
        stg.jobNo.startsWith("SE") ||
        stg.jobNo.startsWith("SHSE") ||
        stg.jobNo.startsWith("AE") ||
        stg.jobNo.startsWith("SHAE");
      const opDate = isExp
        ? stg.etd || stg.submitDate || stg.eta || ""
        : stg.eta || stg.submitDate || stg.etd || "";
      if (opDate && opDate < "2026-11-01") continue;
      if (stg.isBlankDummy) continue;

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

      const newJobRecord: JobRecord = {
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
        draftCustoms:
          isDone || Boolean(stg.declarationNo) || Boolean(stg.customsStatus),
        customsFiled: isDone || Boolean(stg.declarationNo),
        doReleased: isDone,
        cleared: isDone,
        advanceDoc: false,
        draftDate: null,
        customsDate:
          stg.fileType === "customs" ? stg.submitDate || null : null,
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
      };
      updatedJobsList.push(newJobRecord);
      changedJobs.push(newJobRecord);
      const newIdx = updatedJobsList.length - 1;
      jobIndexMap.set(stgKey, newIdx);
      if (stgJoin && !jobIndexMap.has(stgJoin)) jobIndexMap.set(stgJoin, newIdx);
    }

    return { updatedJobsList, changedJobs, applyNew, dateUpdatedCount };
  };

  // Sync actions
  const handleSmartSyncAll = async () => {
    const jobRecordsToApply = stagingData
      ? stagingData.filter((r) => selectedIds.has(r.id) && isSelectable(r))
      : [];
    const tripsToApply = stagingTransport
      ? stagingTransport.filter((t) => selectedTransportIds.has(t.id))
      : [];

    if (jobRecordsToApply.length === 0 && tripsToApply.length === 0) {
      showToast("⚠️ ไม่มีรายการที่จะบันทึก (กรุณาเลือกอย่างน้อย 1 รายการ)");
      return;
    }

    let finalJobsList = [...jobs];
    let changedJobs: JobRecord[] = [];

    if (jobRecordsToApply.length > 0) {
      const res = computeChangedJobs(jobRecordsToApply, jobs);
      finalJobsList = res.updatedJobsList;
      changedJobs = res.changedJobs;
    }

    setIsProcessing(true);
    try {
      const resp = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "smart_sync",
          deltaJobs: changedJobs,
          trips: tripsToApply,
        }),
      });
      const res = await resp.json();
      if (!resp.ok || !res.ok) {
        throw new Error(res.error || "ไม่สามารถบันทึกข้อมูลได้");
      }

      const msg =
        res.message ||
        `⚡ ซิงค์ข้อมูลสำเร็จ! บันทึกงาน ${changedJobs.length} งาน และเที่ยวรถ ${tripsToApply.length} เที่ยวเรียบร้อยแล้ว`;
      if (changedJobs.length > 0) {
        onApplyUpload(res.jobs || finalJobsList, msg);
      }
      if (tripsToApply.length > 0 && onApplyTransportUpload) {
        onApplyTransportUpload(res.transport || transport, msg);
      }
      showToast(msg);
      handleClearAll();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : String(err);
      showToast(`เกิดข้อผิดพลาดในการซิงค์ข้อมูล: ${m}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmApply = async () => {
    if (!stagingData || stagingData.length === 0) return;

    const recordsToApply = stagingData.filter(
      (r) => selectedIds.has(r.id) && isSelectable(r)
    );
    if (recordsToApply.length === 0) {
      showToast(
        "⚠️ ไม่มีรายการที่จะบันทึก (งานเดิมที่ไม่เปลี่ยนวันเวลาถูกข้ามเพื่อไม่ให้งานบวม)"
      );
      return;
    }

    const { updatedJobsList, changedJobs, applyNew, dateUpdatedCount } =
      computeChangedJobs(recordsToApply, jobs);

    if (changedJobs.length === 0) {
      showToast("🛡️ ปลอดภัย: ไม่พบงานใหม่หรือข้อมูลที่เปลี่ยนแปลง");
      return;
    }

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", deltaJobs: changedJobs }),
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
    if (dateUpdatedCount > 0)
      summaryParts.push(
        `🔄 อัปเดตกำหนดการ/ข้อมูลใบขน ${dateUpdatedCount} งาน (ไม่บวม)`
      );

    const summaryText =
      summaryParts.join(" • ") || `บันทึกเรียบร้อย (${updatedJobsList.length} งาน)`;
    onApplyUpload(updatedJobsList, summaryText);
    showToast(summaryText);
    setStagingData(null);
    if (!stagingTransport) {
      handleClearAll();
    }
  };

  const handleConfirmApplyTransport = async () => {
    if (!stagingTransport || stagingTransport.length === 0) return;

    const tripsToApply = stagingTransport.filter((t) =>
      selectedTransportIds.has(t.id)
    );
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
      if (!stagingData) {
        handleClearAll();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`เกิดข้อผิดพลาดในการบันทึกเที่ยวรถ: ${msg}`);
    }
  };

  // Row inline edit handlers
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
          (existsInMaster
            ? existingJobMap.get(cleanJobNo)?.customer || "—"
            : "ลูกค้าใหม่"),
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
      const updateCount = updated.filter(
        (r) => r.actionType === "update"
      ).length;
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
      const updateCount = updated.filter(
        (r) => r.actionType === "update"
      ).length;
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

  // Staging Jobs Memoized Filters & Pagination
  const countGenuineNew = useMemo(
    () =>
      stagingData?.filter((r) => r.isGenuineNew && r.actionType === "new")
        .length || 0,
    [stagingData]
  );
  const countDateUpdates = useMemo(
    () =>
      stagingData?.filter(
        (r) => r.actionType === "update" && (r.isDateChanged || r.isStatusChanged)
      ).length || 0,
    [stagingData]
  );
  const countCustomsUpdates = useMemo(
    () =>
      stagingData?.filter(
        (r) => r.actionType === "update" && r.isCustomsChanged
      ).length || 0,
    [stagingData]
  );
  const countUnchanged = useMemo(
    () =>
      stagingData?.filter(
        (r) =>
          r.actionType === "update" &&
          !r.isDateChanged &&
          !r.isCustomsChanged &&
          !r.isStatusChanged
      ).length || 0,
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
    () =>
      stagingData?.filter(
        (r) =>
          selectedIds.has(r.id) && r.isGenuineNew && r.actionType === "new"
      ).length || 0,
    [stagingData, selectedIds]
  );
  const selDateUpdateCount = useMemo(
    () =>
      stagingData?.filter(
        (r) =>
          selectedIds.has(r.id) &&
          r.actionType === "update" &&
          (r.isDateChanged || r.isStatusChanged)
      ).length || 0,
    [stagingData, selectedIds]
  );
  const selCustomsUpdateCount = useMemo(
    () =>
      stagingData?.filter(
        (r) =>
          selectedIds.has(r.id) &&
          r.actionType === "update" &&
          r.isCustomsChanged
      ).length || 0,
    [stagingData, selectedIds]
  );
  const countActionable =
    countGenuineNew +
    (stagingData?.filter(
      (r) =>
        r.actionType === "update" &&
        (r.isDateChanged || r.isCustomsChanged || r.isStatusChanged)
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
      list = list.filter(
        (r) =>
          r.actionType === "update" && (r.isDateChanged || r.isStatusChanged)
      );
    } else if (previewFilter === "customs_updates") {
      list = list.filter(
        (r) => r.actionType === "update" && r.isCustomsChanged
      );
    } else if (previewFilter === "unchanged") {
      list = list.filter(
        (r) =>
          r.actionType === "update" &&
          !r.isDateChanged &&
          !r.isCustomsChanged &&
          !r.isStatusChanged
      );
    } else if (previewFilter === "locked_old") {
      list = list.filter(
        (r) => (r.isPastOrOld || r.isBlankDummy) && r.actionType === "new"
      );
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

  // Staging Transport Memoized Filters & Pagination
  const countNewTransport = useMemo(
    () =>
      stagingTransport?.filter((t) => t.isNew || t.actionType === "new")
        .length || 0,
    [stagingTransport]
  );
  const countDateUpdatesTransport = useMemo(
    () =>
      stagingTransport?.filter(
        (t) =>
          (!t.isNew || t.actionType === "update") &&
          (t.isDateChanged || t.isDriverChanged || t.isPlateChanged)
      ).length || 0,
    [stagingTransport]
  );
  const countUnchangedTransport = useMemo(
    () =>
      stagingTransport?.filter(
        (t) =>
          (!t.isNew || t.actionType === "update") &&
          !t.isDateChanged &&
          !t.isDriverChanged &&
          !t.isPlateChanged
      ).length || 0,
    [stagingTransport]
  );

  const filteredTransportStaging = useMemo(() => {
    if (!stagingTransport) return [];
    let list = [...stagingTransport];
    if (transportFilter === "new") {
      list = list.filter((t) => t.isNew || t.actionType === "new");
    } else if (transportFilter === "date_updates") {
      list = list.filter(
        (t) => t.isDateChanged || t.isDriverChanged || t.isPlateChanged
      );
    } else if (transportFilter === "existing") {
      list = list.filter(
        (t) =>
          !t.isNew &&
          t.actionType === "update" &&
          !t.isDateChanged &&
          !t.isDriverChanged &&
          !t.isPlateChanged
      );
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
          t.driver,
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
      {/* 1. TOP DROPZONE & PROGRESS */}
      <StagingDropzone
        autoApplyOnDrop={autoApplyOnDrop}
        setAutoApplyOnDrop={setAutoApplyOnDrop}
        uploadedFilesList={uploadedFilesList}
        uploadProgress={uploadProgress}
        isProcessing={isProcessing}
        onFilesDrop={handleNativeFilesUpload}
        onSyncNow={onSyncNow}
        uploadSummary={uploadSummary}
        stagingTransport={stagingTransport}
        stagingData={stagingData}
        selectedIds={selectedIds}
        selectedTransportIds={selectedTransportIds}
        countNewTransport={countNewTransport}
        countDateUpdatesTransport={countDateUpdatesTransport}
        countUnchangedTransport={countUnchangedTransport}
        countGenuineNew={countGenuineNew}
        countDateUpdates={countDateUpdates}
        countCustomsUpdates={countCustomsUpdates}
        countLockedOld={countLockedOld}
        countUnchanged={countUnchanged}
        onSmartSyncAll={handleSmartSyncAll}
        onClearAll={handleClearAll}
      />

      {/* 2. STAGING JOBS TABLE */}
      {stagingData && stagingData.length > 0 && (
        <StagingJobsTable
          stagingData={stagingData}
          filteredStaging={filteredStaging}
          pagedStaging={pagedStaging}
          selectedIds={selectedIds}
          previewFilter={previewFilter}
          setPreviewFilter={setPreviewFilter}
          previewQ={previewQ}
          setPreviewQ={setPreviewQ}
          editingId={editingId}
          editForm={editForm}
          setEditForm={setEditForm}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          safeCurrentPage={safeCurrentPage}
          totalPages={totalPages}
          countGenuineNew={countGenuineNew}
          countDateUpdates={countDateUpdates}
          countCustomsUpdates={countCustomsUpdates}
          countUnchanged={countUnchanged}
          countLockedOld={countLockedOld}
          countActionable={countActionable}
          selNewCount={selNewCount}
          selUpdateCount={selUpdateCount}
          selCustomsUpdateCount={selCustomsUpdateCount}
          selDateUpdateCount={selDateUpdateCount}
          toggleSelectRow={toggleSelectRow}
          setSelectedIds={setSelectedIds}
          handleSelectSafeOnly={handleSelectSafeOnly}
          handleDeselectAll={handleDeselectAll}
          handleAddNewRow={handleAddNewRow}
          handleConfirmApply={handleConfirmApply}
          handleStartEdit={handleStartEdit}
          handleCancelEdit={handleCancelEdit}
          handleSaveEdit={handleSaveEdit}
          handleDeleteRow={handleDeleteRow}
        />
      )}

      {/* 3. STAGING TRANSPORT TABLE */}
      {stagingTransport && stagingTransport.length > 0 && (
        <StagingTransportTable
          stagingTransport={stagingTransport}
          filteredTransportStaging={filteredTransportStaging}
          pagedTransportStaging={pagedTransportStaging}
          selectedTransportIds={selectedTransportIds}
          transportFilter={transportFilter}
          setTransportFilter={setTransportFilter}
          transportQ={transportQ}
          setTransportQ={setTransportQ}
          setTransportPage={setTransportPage}
          transportPageSize={transportPageSize}
          setTransportPageSize={setTransportPageSize}
          safeCurrentTransportPage={safeCurrentTransportPage}
          totalTransportPages={totalTransportPages}
          countNewTransport={countNewTransport}
          countDateUpdatesTransport={countDateUpdatesTransport}
          countUnchangedTransport={countUnchangedTransport}
          toggleSelectTransport={toggleSelectTransport}
          handleSelectSafeTransportOnly={handleSelectSafeTransportOnly}
          handleSelectAllTransport={handleSelectAllTransport}
          handleDeselectAllTransport={handleDeselectAllTransport}
          handleConfirmApplyTransport={handleConfirmApplyTransport}
        />
      )}
    </div>
  );
}
