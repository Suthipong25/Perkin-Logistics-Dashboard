export type ServiceKey = "SEA Import" | "SEA Export" | "AIR Import" | "AIR Export" | "Transport" | "Freight";

export interface JobRecord {
  id?: string;
  jobNo: string;
  service: ServiceKey;
  serviceLabel: string;
  status: "Completed" | "In Progress" | "Cancelled" | "Booking";
  statusDetail: string;
  statusRaw: string;
  customer: string;
  consignee: string;
  bl: string;
  updateStatus?: string;
  etd: string | null;
  eta: string | null;
  jobDate: string | null;
  draftCustoms: boolean;
  advanceDoc: boolean;
  doReleased: boolean;
  customsFiled: boolean;
  cleared: boolean;
  draftDate: string | null;
  customsDate: string | null;
  doDate: string | null;
  clearDate: string | null;
  advanceDate: string | null;
  remark?: string;
  sourceSheet?: string;
  sourceRow: number;
  runningNo?: number;
  transportNo?: string;
  version?: number;
  nextAction: string | null;
  month: string | null;
  year: number | null;
  ageDays: number | null;
  flags: string[];
  // Extended fields from Booking List Report & Customs 0409 Report
  joinNo?: string;
  mbl?: string;
  hbl?: string;
  referenceNo?: string;
  declarationNo?: string;
  declarationCount?: number;
  customsStatus?: string;
  submitDate?: string | null;
  releaseLoc?: string;
  portCode?: string;
  manifestNo?: string;
  o109?: string;
  o209?: string;
  o309?: string;
  o409?: string;
  invoiceNo?: string;
  depoPort?: string;
  terminal?: string;
  shed?: string;
  feeder?: string;
  vessel?: string;
  feederVessel?: string;
  carrier?: string;
  flightNo?: string;
  flightTime?: string;
  linerBooking?: string;
  pol?: string;
  pod?: string;
  placeOfDelivery?: string;
  loadingDate?: string;
  grossWeight?: number;
  packages?: string;
  commodity?: string;
  cbm?: number;
  declarationType?: string;
  shippingType?: string;
  containerType?: string;
  termOfPay?: string;
  csName?: string;
  dataSource?: string;
}

export interface TransportRecord {
  id?: string;
  transportNo: string;
  tripNo?: string;
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
  containerBucket?: string;
  deliver: string | null;
  deliverDate?: string | null;
  pod?: string;
  sourceRow?: number;
}

export interface QualityReport {
  totalJobs: number;
  byService: Record<string, number>;
  byStatus: Record<string, number>;
  byStatusDetail: Record<string, number>;
  statusRawVariants: string[];
  missing: Record<string, number>;
  dateFailures: Record<string, number>;
  rejectedRows: number;
  duplicateJobNumbers: Record<string, number>;
  transportRows: number;
  containerBuckets: Record<string, number>;
}

export interface AdvanceRecord {
  advNo: string;
  jobNo: string;
  customer: string;
  payTo: string;
  branch: string;
  advDate: string;
  amount: number;
  cleared: number;
  clearNo: string;
  shipping: string;
  ageDays: number;
  state: "overdue" | "pending" | "cleared";
  note: string;
}


export interface SnapshotManifestEntry {
  id: string;
  filename: string;
  timestamp: string;
  displayTime: string;
  fileSize: number;
  totalJobs: number;
  totalTransport: number;
  sha256: string;
}

export interface QualityAlertsSummary {
  dateSwapsCount: number;
  bookingAlignmentsCount?: number;
  missingDatesFilledCount?: number;
  crossSheetDupsCount: number;
  unlinkedTransportCount: number;
  hiddenSheetsCount: number;
  totalAlerts: number;
}

export interface DateSwapAlert {
  jobNo: string;
  sheet: string;
  row: number;
  customer: string;
  field: string;
  excelDate: string;
  correctedDate: string;
  reason: string;
}

export interface CrossSheetDupAlert {
  jobNo: string;
  customer: string;
  sheets: Array<{ sheet: string; row: number }>;
  reason?: string;
}

export interface UnlinkedTransportAlert {
  transportNo: string;
  row: number;
  customer: string;
  container?: string;
  deliverDate?: string | null;
  status?: string;
  reason?: string;
}

export interface HiddenSheetAlert {
  name?: string;
  sheetName?: string;
  sheetId?: string;
  note?: string;
  instruction?: string;
}

export interface QualityAlertsReport {
  generatedAt?: string;
  summary: QualityAlertsSummary;
  dateSwaps: DateSwapAlert[];
  bookingAlignments?: DateSwapAlert[];
  missingDatesFilled?: DateSwapAlert[];
  crossSheetDuplicates: CrossSheetDupAlert[];
  unlinkedTransport: UnlinkedTransportAlert[];
  hiddenSheets: HiddenSheetAlert[];
}
