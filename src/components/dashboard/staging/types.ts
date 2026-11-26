import { JobRecord, TransportRecord } from "@/types/dashboard";

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
  mbl?: string;
  hbl?: string;
  hasBlColumn?: boolean;
  isChanged?: boolean;
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
  isDriverChanged?: boolean;
  isPlateChanged?: boolean;
  oldDeliverDate?: string | null;
  dateChangeDiff?: string;
  hasLinkedJob: boolean;
  validationStatus: "valid" | "warning";
  validationNote?: string;
}

export interface UploadSummary {
  fileName: string;
  fileType: string;
  rows: number;
  newJobs: number;
  updatedJobs: number;
}

export type StagingFilterType =
  | "all"
  | "new"
  | "date_updates"
  | "customs_updates"
  | "unchanged"
  | "locked_old"
  | "existing";

export type TransportFilterType = "new" | "date_updates" | "existing" | "all";

/** ลำดับขั้นพิธีการศุลกากร (ใช้ตรวจว่าสถานะใบขนขยับไปข้างหน้าหรือไม่) */
export const customsRank = (s?: string | null) =>
  ["0109", "0209", "0309", "0409"].indexOf(s || "");

const INVALID_DECL_VALUES = [
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
];

/**
 * แปลง Staging Record และผสานลงใน Job เดิมที่มีอยู่ (ใช้ร่วมกันทั้งฝั่ง Client และ Server)
 */
export function buildUpdatedJob(existing: JobRecord, stg: any): JobRecord {
  const updated = { ...existing };
  if (stg.etd) updated.etd = stg.etd;
  if (stg.eta) updated.eta = stg.eta;
  if (stg.clearDate) updated.clearDate = stg.clearDate;
  if (stg.flightTime) updated.flightTime = stg.flightTime;
  if (stg.vessel) updated.vessel = stg.vessel;
  if (stg.feeder) updated.feeder = stg.feeder;
  if (stg.flightNo || stg.flight)
    (updated as any).flightNo = stg.flightNo || stg.flight;
  if (stg.carrier) updated.carrier = stg.carrier;
  if (stg.bl && stg.bl !== "—") {
    updated.bl = stg.bl;
    updated.mbl = stg.mbl || stg.bl;
  } else if (stg.fileType !== "customs" && !stg.bl && !stg.mbl && !stg.hbl) {
    updated.bl = "";
    updated.mbl = "";
    updated.hbl = "";
  }
  if (stg.mbl && stg.mbl !== "—") updated.mbl = stg.mbl;
  else if (stg.fileType !== "customs" && stg.hasBlColumn && !stg.mbl) updated.mbl = "";
  if (stg.hbl && stg.hbl !== "—") updated.hbl = stg.hbl;
  else if (stg.fileType !== "customs" && stg.hasBlColumn && !stg.hbl) updated.hbl = "";
  if (stg.invoiceNo && stg.invoiceNo !== "—") updated.invoiceNo = stg.invoiceNo;
  if (stg.csName && stg.csName !== "—") updated.csName = stg.csName;
  if (
    stg.customer &&
    stg.customer !== "—" &&
    stg.customer !== "ลูกค้าใหม่"
  ) {
    updated.customer = stg.customer;
    updated.consignee = stg.customer;
  }
  if (stg.commodity) updated.commodity = stg.commodity;
  if (stg.containerType) updated.containerType = stg.containerType;
  if (stg.grossWeight !== null && stg.grossWeight !== undefined) updated.grossWeight = stg.grossWeight;
  if (stg.cbm !== null && stg.cbm !== undefined) updated.cbm = stg.cbm;

  if (stg.isStatusChanged && stg.hasExplicitStatus && stg.status) {
    updated.status = stg.status;
    if (stg.statusDetail) updated.statusDetail = stg.statusDetail;
    if (stg.statusRaw) updated.statusRaw = stg.statusRaw;
    if (stg.status === "Completed") {
      updated.cleared = true;
      updated.doReleased = true;
      updated.draftCustoms = true;
      updated.customsFiled = true;
      updated.nextAction = "นำส่งสินค้าเรียบร้อย";
    }
  }

  const decl = String(stg.declarationNo || "").trim();
  if (decl && !INVALID_DECL_VALUES.includes(decl.toUpperCase())) {
    updated.declarationNo = decl;
    updated.draftCustoms = true;
    updated.customsFiled = true;
    if (!updated.customsDate)
      updated.customsDate = stg.submitDate || stg.clearDate || null;
  }

  if (stg.customsStatus && customsRank(stg.customsStatus) > customsRank(updated.customsStatus)) {
    updated.customsStatus = stg.customsStatus;
    if (stg.customsStatus === "0409") {
      updated.cleared = true;
      updated.doReleased = true;
      updated.draftCustoms = true;
      updated.customsFiled = true;
      updated.status = "Completed";
      updated.statusDetail = "Job Complete";
      updated.nextAction = "นำส่งสินค้าเรียบร้อย";
    }
  }

  if (stg.isDateChanged) {
    const isExp = /^(SH)?(SE|AE)/i.test(updated.jobNo || "");
    const finalOpDate = isExp
      ? updated.etd || updated.submitDate || updated.eta
      : updated.eta || updated.submitDate || updated.etd;
    if (finalOpDate) {
      updated.jobDate = finalOpDate;
      updated.month = finalOpDate.slice(0, 7);
    }
  }

  return updated;
}

/**
 * สร้าง JobRecord ใหม่จาก Staging Record (ใช้ร่วมกันทั้งฝั่ง Client และ Server)
 */
export function buildNewJob(stg: any, currentTotalJobs: number): JobRecord {
  const isExp = /^(SH)?(SE|AE)/i.test(stg.jobNo);
  const isAir = /^(SH)?(AE|AI)/i.test(stg.jobNo);
  const isTrans = /^(SH)?(TS|SHT)/i.test(stg.jobNo);
  const svc = (
    isTrans
      ? "Transport"
      : isAir
      ? isExp
        ? "AIR Export"
        : "AIR Import"
      : isExp
      ? "SEA Export"
      : "SEA Import"
  ) as JobRecord["service"];

  const finalDate = isExp
    ? stg.etd || stg.submitDate || stg.eta
    : stg.eta || stg.submitDate || stg.etd;
  const opMonth = finalDate ? finalDate.slice(0, 7) : "2026-11";
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

  return {
    id: `Upload_${opMonth}_${stg.jobNo}`,
    jobNo: stg.jobNo,
    joinNo: stg.joinNo || undefined,
    service: svc,
    serviceLabel: svc,
    status: resolvedStatus,
    statusDetail: resolvedDetail,
    statusRaw: stg.statusRaw || resolvedDetail,
    customer: stg.customer || "—",
    consignee: stg.customer && stg.customer !== "—" ? stg.customer : "",
    bl: stg.bl || "",
    mbl: stg.mbl || "",
    hbl: stg.hbl || "",
    invoiceNo: stg.invoiceNo || "",
    declarationNo: stg.declarationNo || "",
    etd: stg.etd || null,
    eta: stg.eta || null,
    month: opMonth,
    year: 2026,
    ageDays: null,
    flags: [],
    jobDate: finalDate || null,
    draftCustoms:
      isDone || Boolean(stg.declarationNo) || Boolean(stg.customsStatus),
    customsFiled: isDone || Boolean(stg.declarationNo),
    doReleased: isDone,
    cleared: isDone,
    advanceDoc: false,
    draftDate: null,
    customsDate: stg.fileType === "customs" ? stg.submitDate || null : null,
    doDate: null,
    clearDate: stg.clearDate || null,
    advanceDate: null,
    sourceRow: currentTotalJobs + 1,
    customsStatus: stg.customsStatus || (isDone ? "0409" : null),
    csName: stg.csName || "",
    containerType: stg.containerType || undefined,
    grossWeight: stg.grossWeight ?? undefined,
    cbm: stg.cbm ?? undefined,
    commodity: stg.commodity || undefined,
    nextAction: isDone ? "นำส่งสินค้าเรียบร้อย" : "ตรวจปล่อยสินค้า",
  };
}

/** ตรวจสอบว่างานนี้อนุญาตให้เลือกนำเข้า/อัปเดตได้หรือไม่ */
export const isSelectable = (r: StagingRecord): boolean => {
  // 1. Genuine new jobs (>= Nov 2026, complete info)
  if (
    r.isGenuineNew &&
    r.actionType === "new" &&
    !r.isPastOrOld &&
    !r.isBlankDummy
  ) {
    return true;
  }
  // Existing jobs may be updated by changed schedules, customs data, status changes, or document numbers (BL / INV / Container).
  if (
    r.actionType === "update" &&
    (r.isDateChanged || r.isCustomsChanged || r.isStatusChanged || (r as any).isChanged)
  ) {
    return true;
  }
  return false;
};

/** คำนวณเฉพาะงานใหม่แท้ประจำงวดปัจจุบัน (พ.ย. 2026) โดยข้ามงานเดิมและล็อคงานเก่า */
export const computeSafeSelection = (records: StagingRecord[]): Set<string> => {
  const set = new Set<string>();
  for (const r of records) {
    if (isSelectable(r)) {
      set.add(r.id);
    }
  }
  return set;
};
