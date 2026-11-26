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
