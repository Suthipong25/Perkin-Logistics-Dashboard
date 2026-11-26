/**
 * ============================================================================
 * Pure Node.js / TypeScript Excel & HTML-XLS Parser (In-Memory)
 * ============================================================================
 * หน้าที่หลัก:
 *   อ่านไฟล์รายงานจากแต่ละแผนก (.xls, .xlsx, .csv, และ .xls ที่ข้างในเป็น HTML จาก e-Customs)
 *   จาก Buffer ใน Memory โดยตรง เพื่อให้ทำงานได้ 100% ทั้งบน Vercel Serverless (ที่ห้ามเขียนไฟล์ลง /var/task
 *   และไม่มี Python) และบนเครื่อง Local
 *
 * โครงสร้างรายงานที่รองรับ (ตรวจจับอัตโนมัติจาก Header 4 บรรทัดแรก):
 *   1. Inland Transport (examination_delivery.xls) -> แยกเข้าตารางเที่ยวรถ (TS...)
 *   2. Sea Oversea FWD 2-row (receiptreport Sea)   -> 1 งานใช้ 2 แถว (แถวบน ETD/HBL, แถวล่าง ETA/MBL)
 *   3. Air Freight FWD 2-row (reportexport Air)    -> 1 งานใช้ 2 แถว (แถวบน Flight/HAWB, แถวล่าง Time/ETA/MAWB)
 *   4. Standard 1-row (Shipping / e-Customs)       -> 1 งานใช้ 1 แถว (รองรับ STATUS JOB, CLEAR DATE, 0109-0409)
 *
 * กฎข้อมูลสำคัญ (Business Rules):
 *   - ห้ามตัดหรือเติม prefix "SH" เมื่อจับคู่เลขงาน (SHSI26110009 != SI26110009 เป็นคนละลำดับเลขแผนก
 *     ต้องผูกผ่าน exact jobNo หรือ joinNo เท่านั้น)
 *   - แปลงภาษาไทยเพี้ยน (ISO-8859-1 -> Windows-874) อัตโนมัติสำหรับไฟล์ .xls เก่าจากโปรแกรมบัญชี/ขนส่ง
 * ============================================================================
 */
import * as XLSX from "xlsx";
import { JobRecord } from "@/types/dashboard";

const thaiDecoder = new TextDecoder("windows-874");

/**
 * แก้ปัญหาภาษาไทยต่างดาว (Mojibake) จากไฟล์ .xls รุ่นเก่าที่เก็บอักขระแบบ CP874/Windows-874
 * แต่ถูกอ่านมาเป็น Latin-1 (เช่น "ä»ÃÑº" -> "ไปรับ")
 * จะแปลงเฉพาะเมื่อทุกตัวอักษรอยู่ในช่วง 0-255 และเมื่อ decode ด้วย windows-874 แล้วพบอักษรไทยจริง
 */
function fixThaiEncoding(s: string): string {
  if (!s) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 255) return s;
    bytes[i] = code;
  }
  try {
    const decoded = thaiDecoder.decode(bytes);
    if (/[\u0e00-\u0e7f]/.test(decoded)) {
      return decoded;
    }
  } catch {
    // ignore
  }
  return s;
}

function cleanText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = fixThaiEncoding(String(v));
  return str.replace(/[\t\u00a0]/g, " ").replace(/\s+/g, " ").trim();
}

const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  "ม.ค.": "01", "ก.พ.": "02", "มี.ค.": "03", "เม.ย.": "04", "พ.ค.": "05", "มิ.ย.": "06",
  "ก.ค.": "07", "ส.ค.": "08", "ก.ย.": "09", "ต.ค.": "10", "พ.ย.": "11", "ธ.ค.": "12",
  "มกราคม": "01", "กุมภาพันธ์": "02", "มีนาคม": "03", "เมษายน": "04", "พฤษภาคม": "05", "มิถุนายน": "06",
  "กรกฎาคม": "07", "สิงหาคม": "08", "กันยายน": "09", "ตุลาคม": "10", "พฤศจิกายน": "11", "ธันวาคม": "12"
};

/**
 * แปลงค่าวันที่ทุกรูปแบบจาก Excel ให้เป็นมาตรฐาน ISO "YYYY-MM-DD"
 * รองรับ:
 *  - JS Date object
 *  - Excel Serial Number (เช่น 46334 -> นับจาก 1899-12-30)
 *  - ISO string ("2026-11-09...")
 *  - แก้ปัญหาสลับวัน/เดือน (US Locale vs Thai Locale): เช่น 11/19/2026 -> 2026-11-19
 *  - วันที่แบบชื่อเดือนภาษาอังกฤษ/ไทย: "19-Nov-2026", "19 พ.ย. 2569", "Nov 19, 2026"
 *  - รูปแบบไทย/ยุโรป DD/MM/YYYY หรือ DD-MM-YY (รองรับ พ.ศ. > 2400 โดยลบ 543 อัตโนมัติ)
 */
function excelDateToIso(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const valStr = String(val).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!valStr) return null;

  const num = Number(valStr);
  if (!isNaN(num) && num > 25000 && num < 80000) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(num) * 86400000;
    const dt = new Date(ms);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const isoMatch = valStr.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Handle Named Months e.g. "19-Nov-2026", "19-Nov-26", "19 Nov 2026"
  const namedMatch1 = valStr.match(/^(\d{1,2})[\s\-/]([A-Za-zก-๙.]+?)[\s\-/](\d{2,4})/);
  if (namedMatch1) {
    const d = namedMatch1[1].padStart(2, "0");
    const monStr = namedMatch1[2].toLowerCase().replace(/\./g, "");
    const mo = MONTH_MAP[monStr] || MONTH_MAP[namedMatch1[2].toLowerCase()];
    if (mo) {
      let y = parseInt(namedMatch1[3], 10);
      if (y < 100) y += 2000;
      else if (y > 2400) y -= 543;
      return `${String(y).padStart(4, "0")}-${mo}-${d}`;
    }
  }

  // Handle "Nov 19, 2026"
  const namedMatch2 = valStr.match(/^([A-Za-zก-๙.]+?)[\s\-/](\d{1,2})[,\s\-/]+(\d{2,4})/);
  if (namedMatch2) {
    const d = namedMatch2[2].padStart(2, "0");
    const monStr = namedMatch2[1].toLowerCase().replace(/\./g, "");
    const mo = MONTH_MAP[monStr] || MONTH_MAP[namedMatch2[1].toLowerCase()];
    if (mo) {
      let y = parseInt(namedMatch2[3], 10);
      if (y < 100) y += 2000;
      else if (y > 2400) y -= 543;
      return `${String(y).padStart(4, "0")}-${mo}-${d}`;
    }
  }

  const dmyMatch = valStr.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;
    else if (y > 2400) y -= 543;

    let d: number;
    let mo: number;

    // Disambiguation between US (MM/DD/YYYY) and Thai/EU (DD/MM/YYYY)
    if (p2 > 12 && p1 <= 12) {
      // Example: 11/19/2026 -> 11 is month, 19 is day
      mo = p1;
      d = p2;
    } else {
      // Standard Perkin Thai logistics: DD/MM/YYYY
      d = p1;
      mo = p2;
    }

    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return valStr.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(valStr) ? valStr : null;
}

interface MasterIndex {
  byNo: Map<string, JobRecord>;
  byJoin: Map<string, JobRecord>;
  byBl: Map<string, JobRecord>;
}

/**
 * สร้างดัชนีค้นหางานเดิมที่มีอยู่ในระบบ (จาก PostgreSQL/JSON) เพื่อตรวจว่าแถวที่อัปโหลดมาเป็น:
 *  - งานใหม่ ("new") หรือ
 *  - งานเดิม ("update") ที่ต้องเทียบว่าวัน ETD/ETA/เวลา เปลี่ยนหรือไม่
 *
 * หมายเหตุสำคัญ:
 *  - จับคู่แบบตรงตัว (exact match) เฉพาะ jobNo, joinNo (ตัด "(SEA)"/"(AIR)" ท้ายคำออก), และ bl
 *  - ห้ามตัด "SH" ออกจาก SHSI/SHSE/SHAI เพราะ Shipping และ Oversea รันเลขคนละชุดกัน
 */
function buildMasterIndex(jobs: JobRecord[]): MasterIndex {
  const byNo = new Map<string, JobRecord>();
  const byJoin = new Map<string, JobRecord>();
  const byBl = new Map<string, JobRecord>();

  for (const j of jobs) {
    const jno = (j.jobNo || "").trim().toUpperCase();
    if (jno) byNo.set(jno, j);

    const jraw = (j.joinNo || "").trim().toUpperCase();
    if (jraw) {
      const jclean = jraw.replace(/\s*\((SEA|AIR)\)\s*$/i, "").trim();
      if (jclean) byJoin.set(jclean, j);
      byJoin.set(jraw, j);
    }

    const bl = (j.bl || j.hbl || "").trim().toUpperCase();
    if (bl && bl.length >= 5) byBl.set(bl, j);
  }

  return { byNo, byJoin, byBl };
}

/**
 * ตรวจสอบความแตกต่างระหว่างข้อมูลงานที่อัปโหลดเข้ามากับงานเดิมในฐานข้อมูล (Multi-Attribute Precision Diff)
 * ครอบคลุม: วันกำหนดการ (ETD/ETA/เวลา/วันตรวจปล่อย), สถานะใบขน, เลขที่ใบขน, สถานะงาน, และ Metadata สำคัญ
 */
interface JobDiffResult {
  isChanged: boolean;
  isDateChanged: boolean;
  isCustomsChanged: boolean;
  isStatusChanged: boolean;
  diffStr: string;
  exEtd: string | null;
  exEta: string | null;
  exTime: string | null;
  note: string;
}

function checkJobDiff(
  incoming: {
    etdIso?: string | null;
    etaIso?: string | null;
    flightTime?: string | null;
    clearIso?: string | null;
    declarationNo?: string | null;
    customsStatus?: string | null;
    status?: string | null;
    hasExplicitStatus?: boolean;
    csName?: string | null;
    customer?: string | null;
    vessel?: string | null;
    feeder?: string | null;
    flightNo?: string | null;
    bl?: string | null;
    mbl?: string | null;
    hbl?: string | null;
    invoiceNo?: string | null;
    containerType?: string | null;
  },
  matchJob?: JobRecord
): JobDiffResult {
  if (!matchJob) {
    return {
      isChanged: false,
      isDateChanged: false,
      isCustomsChanged: false,
      isStatusChanged: false,
      diffStr: "",
      exEtd: null,
      exEta: null,
      exTime: null,
      note: "✨ งานใหม่",
    };
  }

  const normD = (d: unknown) => (d ? String(d).trim().slice(0, 10) : "");
  const incEtd = normD(incoming.etdIso);
  const exEtd = normD(matchJob.etd || matchJob.submitDate);
  const incEta = normD(incoming.etaIso);
  const exEta = normD(matchJob.eta);
  let incTime = (incoming.flightTime || "").trim();
  if (incTime === "00:00") incTime = "";
  let exTime = (matchJob.flightTime || "").trim();
  if (exTime === "00:00") exTime = "";
  const incClear = normD(incoming.clearIso);
  const exClear = normD(matchJob.clearDate);

  const dateDiffs: string[] = [];
  if (incEtd && incEtd !== exEtd) dateDiffs.push(`ETD: ${exEtd || "-"} ➔ ${incEtd}`);
  if (incEta && incEta !== exEta) dateDiffs.push(`ETA: ${exEta || "-"} ➔ ${incEta}`);
  if (incTime && exTime && incTime !== exTime) dateDiffs.push(`เวลา: ${exTime} ➔ ${incTime}`);
  if (incClear && incClear !== exClear) dateDiffs.push(`ตรวจปล่อย: ${exClear || "-"} ➔ ${incClear}`);
  const isDateChanged = dateDiffs.length > 0;

  const customsDiffs: string[] = [];
  const isInvalidDecl = (d?: string | null) =>
    !d || ["-", "—", "N/A", "NONE", "NULL", "NORMAL", "GENERAL", "IMPORT", "EXPORT", "TRANSIT", "RE-EXPORT"].includes(String(d).trim().toUpperCase());

  const incDecl = String(incoming.declarationNo || "").trim();
  const exDecl = String(matchJob.declarationNo || "").trim();
  if (!isInvalidDecl(incDecl) && incDecl !== exDecl) {
    customsDiffs.push(`ใบขน: ${exDecl || "-"} ➔ ${incDecl}`);
  }

  const rank = (s?: string | null) => ["0109", "0209", "0309", "0409"].indexOf(s || "");
  const effectiveExCustoms =
    matchJob.customsStatus ||
    (["0109", "0209", "0309", "0409"].includes(String(matchJob.updateStatus || "")) ? String(matchJob.updateStatus) : null) ||
    (matchJob.cleared || matchJob.status === "Completed" ? "0409" : matchJob.customsFiled || matchJob.declarationNo ? "0309" : null);
  const incRank = rank(incoming.customsStatus);
  const exRank = rank(effectiveExCustoms);
  if (incoming.customsStatus && incRank > exRank) {
    customsDiffs.push(`สถานะใบขน: ${effectiveExCustoms || "-"} ➔ ${incoming.customsStatus}`);
  }
  const isCustomsChanged = customsDiffs.length > 0;

  const statusDiffs: string[] = [];
  if (incoming.hasExplicitStatus && incoming.status && incoming.status !== matchJob.status) {
    statusDiffs.push(`สถานะงาน: ${matchJob.status || "-"} ➔ ${incoming.status}`);
  } else if (incoming.customsStatus === "0409" && matchJob.status !== "Completed") {
    statusDiffs.push(`สถานะงาน: ${matchJob.status || "-"} ➔ Completed (0409)`);
  }
  const isStatusChanged = statusDiffs.length > 0;

  const metaDiffs: string[] = [];
  const incBl = String(incoming.bl || incoming.mbl || incoming.hbl || "").trim();
  const exBl = String(matchJob.mbl || matchJob.bl || matchJob.hbl || "").trim();
  if (incBl && incBl !== "—" && incBl !== exBl) {
    metaDiffs.push(`BL: ${exBl || "-"} ➔ ${incBl}`);
  }
  const incInv = String(incoming.invoiceNo || "").trim();
  const exInv = String(matchJob.invoiceNo || "").trim();
  if (incInv && incInv !== "—" && incInv !== exInv) {
    metaDiffs.push(`INV: ${exInv || "-"} ➔ ${incInv}`);
  }
  const incCntr = String(incoming.containerType || "").trim();
  const exCntr = String(matchJob.containerType || "").trim();
  if (incCntr && incCntr !== "—" && incCntr !== exCntr) {
    metaDiffs.push(`Volume/Container: ${exCntr || "-"} ➔ ${incCntr}`);
  }
  const incCs = String(incoming.csName || "").trim();
  const exCs = String(matchJob.csName || "").trim();
  if (incCs && incCs !== "—" && incCs !== exCs) {
    metaDiffs.push(`CS: ${exCs || "-"} ➔ ${incCs}`);
  }
  const incCust = String(incoming.customer || "").trim();
  const exCust = String(matchJob.customer || "").trim();
  if (incCust && incCust !== "—" && incCust !== "ลูกค้าใหม่" && incCust !== exCust) {
    metaDiffs.push(`ลูกค้า: ${exCust || "-"} ➔ ${incCust}`);
  }

  const allDiffs = [...dateDiffs, ...customsDiffs, ...statusDiffs, ...metaDiffs];
  const isChanged = allDiffs.length > 0;
  const diffStr = allDiffs.join(" • ");
  const note = isChanged
    ? `🔄 อัปเดตข้อมูล: ${diffStr} (อัปเดตทับงานเดิม ไม่เพิ่มแถว)`
    : "⚪ งานเดิมในระบบแล้ว (ข้อมูลตรงกัน • ข้ามเพื่อไม่ให้งานบวม)";

  return {
    isChanged,
    isDateChanged,
    isCustomsChanged,
    isStatusChanged,
    diffStr,
    exEtd: exEtd || null,
    exEta: exEta || null,
    exTime: exTime || null,
    note,
  };
}

/**
 * ตัด tag โหมดการขนส่งท้ายเลขงาน เช่น "SI26100024 (SEA)" -> "SI26100024"
 */
export function stripModeSuffix(val: string): string {
  if (!val) return "";
  return String(val)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*[\(\[\{]?(SEA|AIR)[\)\]\}]?\s*$/i, "")
    .replace(/\s*-\s*(SEA|AIR)\s*$/i, "")
    .trim()
    .toUpperCase();
}

/**
 * รูปแบบที่ 2: รายงาน Sea Oversea FWD แบบ 2 แถวต่อ 1 งาน (เช่น receiptreport_(17).xls)
 *  - แถวบน (row1): No., ETD, Carrier, Agent, Booking, Job No (SI/SE), HBL, Liner Booking, Local Customer, POL, Commodity
 *  - แถวล่าง (row2): ETA, Job Date, MBL, Oversea Customer, Feeder/Vessel, POD, CS Name
 */
function parseFwdSea2Row(rawRows: string[][], idx: MasterIndex) {
  const rows: Record<string, unknown>[] = [];
  let r = 3;
  while (r < rawRows.length) {
    const row1 = rawRows[r] || [];
    const noVal = cleanText(row1[0]);
    const jobVal = cleanText(row1[5]);

    if (/^\d+(\.0)?$/.test(noVal) || /^(SI|SE)\d+/i.test(jobVal)) {
      const etdRaw = cleanText(row1[1]);
      const carrier = cleanText(row1[2]);
      const agent = cleanText(row1[3]);
      const booking = cleanText(row1[4]);
      const hbl = cleanText(row1[6]);
      const linerBooking = cleanText(row1[7]);
      const localCust = cleanText(row1[8]);
      const pol = cleanText(row1[11]);
      const commodity = cleanText(row1[14]);
      const loadingDate = excelDateToIso(cleanText(row1[14]));

      const row2 = rawRows[r + 1] || [];
      const etaRaw = cleanText(row2[1]);
      const jobDateRaw = cleanText(row2[5]);
      const mbl = cleanText(row2[7]);
      const overseaCust = cleanText(row2[8]);
      const feeder = cleanText(row2[10]);
      const pod = cleanText(row2[12]);
      const csName = cleanText(row2[23]);

      const jobClean = stripModeSuffix(jobVal);
      const customer = overseaCust || localCust || "—";
      const etdIso = excelDateToIso(etdRaw);
      const etaIso = excelDateToIso(etaRaw);
      const jobDateIso = excelDateToIso(jobDateRaw) || etdIso || etaIso;

      const match =
        idx.byJoin.get(jobClean) ||
        idx.byNo.get(jobClean) ||
        (hbl ? idx.byBl.get(hbl.toUpperCase()) : undefined);
      const actionType = match ? "update" : "new";
      const { isChanged, isDateChanged, isCustomsChanged, isStatusChanged, diffStr, exEtd, exEta, note } = checkJobDiff(
        {
          etdIso,
          etaIso,
          csName,
          customer,
          vessel: feeder,
          feeder,
          bl: hbl || mbl,
        },
        match
      );

      rows.push({
        id: `fwd-sea-${r}-${jobClean}`,
        sheet: "SEA FWD",
        jobNo: jobClean,
        joinNo: match?.jobNo || "",
        customer,
        declarationNo: "",
        invoiceNo: booking,
        referenceNo: booking,
        status: "In Progress",
        customsStatus: null,
        etd: etdIso,
        eta: etaIso,
        submitDate: jobDateIso,
        containerType: "FCL / LCL",
        grossWeight: null,
        cbm: null,
        csName,
        bl: hbl || mbl,
        commodity,
        carrier,
        agent,
        feeder,
        vessel: feeder,
        linerBooking,
        pol,
        pod,
        loadingDate,
        actionType,
        isChanged,
        isDateChanged,
        isCustomsChanged,
        isStatusChanged,
        dateChangeDiff: diffStr,
        oldEtd: exEtd,
        oldEta: exEta,
        validationStatus: "valid",
        validationNote: match ? note : "✨ งานใหม่จาก FWD (Sea Forwarding)",
      });
      r += 2;
    } else {
      r += 1;
    }
  }
  return rows;
}

/**
 * รูปแบบที่ 3: รายงาน Air Freight FWD แบบ 2 แถวต่อ 1 งาน (เช่น reportexport_(6).xls)
 *  - แถวบน (row1): No., Job No (AI/AE), Shipper, Agent, HAWB, Flight, POD, Gross Weight, CS Name
 *  - แถวล่าง (row2): Job Date, Consignee, MAWB, Flight Time, ETA
 */
function parseFwdAir2Row(rawRows: string[][], idx: MasterIndex) {
  const rows: Record<string, unknown>[] = [];
  let r = 2;
  while (r < rawRows.length) {
    const row1 = rawRows[r] || [];
    const noVal = cleanText(row1[0]);
    const jobVal = cleanText(row1[1]);

    if (/^\d+(\.0)?$/.test(noVal) || /^(AI|AE)\d+/i.test(jobVal)) {
      const shipper = cleanText(row1[2]);
      const agent = cleanText(row1[3]);
      const hawb = cleanText(row1[4]);
      const flight = cleanText(row1[5]);
      const pod = cleanText(row1[6]);
      const gwRaw = cleanText(row1[8]);
      const csName = cleanText(row1[10]);

      const row2 = rawRows[r + 1] || [];
      const jobDateRaw = cleanText(row2[1]);
      const consignee = cleanText(row2[2]);
      const mawb = cleanText(row2[4]);
      const flightTime = cleanText(row2[5]);
      const etaRaw = cleanText(row2[6]);

      const jobClean = stripModeSuffix(jobVal);
      const customer = consignee || shipper || "—";
      const etaIso = excelDateToIso(etaRaw);
      const jobDateIso = excelDateToIso(jobDateRaw);

      let gwVal: number | null = null;
      if (gwRaw) {
        const parsed = parseFloat(gwRaw.replace(/,/g, ""));
        if (!isNaN(parsed)) gwVal = parsed;
      }

      const match =
        idx.byJoin.get(jobClean) ||
        idx.byNo.get(jobClean) ||
        (hawb ? idx.byBl.get(hawb.toUpperCase()) : undefined);
      const actionType = match ? "update" : "new";
      const isAirExp = /^(SH)?AE/i.test(jobClean);
      const airEtdIso = isAirExp ? jobDateIso : null;
      const { isChanged, isDateChanged, isCustomsChanged, isStatusChanged, diffStr, exEtd, exEta, exTime, note } = checkJobDiff(
        {
          etdIso: airEtdIso,
          etaIso,
          flightTime,
          flightNo: flight,
          csName,
          customer,
          bl: hawb || mawb,
        },
        match
      );

      rows.push({
        id: `fwd-air-${r}-${jobClean}`,
        sheet: "AIR FWD",
        jobNo: jobClean,
        joinNo: match?.jobNo || "",
        customer,
        declarationNo: "",
        invoiceNo: "",
        referenceNo: hawb || mawb,
        status: "In Progress",
        customsStatus: null,
        etd: airEtdIso,
        eta: etaIso,
        submitDate: jobDateIso,
        containerType: "AIR CARGO",
        grossWeight: gwVal,
        cbm: null,
        csName,
        bl: hawb || mawb,
        commodity: "",
        carrier: agent,
        agent,
        flight,
        flightNo: flight,
        flightTime: flightTime && flightTime !== "00:00" ? flightTime : null,
        pod,
        actionType,
        isChanged,
        isDateChanged,
        isCustomsChanged,
        isStatusChanged,
        dateChangeDiff: diffStr,
        oldEtd: exEtd,
        oldEta: exEta,
        oldFlightTime: exTime,
        validationStatus: "valid",
        validationNote: match ? note : "✨ งานใหม่จาก FWD (Air Forwarding)",
      });
      r += 2;
    } else {
      r += 1;
    }
  }
  return rows;
}

/**
 * รูปแบบที่ 1: รายงานรถขนส่งในประเทศ Inland Transport (เช่น examination_delivery.xls)
 *  - เลขเที่ยวรถ (TS...) จะอยู่คอลัมน์ 3 หรือคอลัมน์ 2 (กรณีขนส่งทั่วไปไม่ผูก Job หลัก)
 *  - ถ้าคอลัมน์ 2 ไม่ใช่ TS... ให้ถือเป็นเลข Job หลักที่ผูกกับเที่ยวรถนี้ (linkedJob)
 *  - สถานะเบื้องต้น: ถ้าวันส่งมอบ (deliverDate) น้อยกว่าวันนี้ -> "ส่งมอบแล้ว", นอกนั้น -> "กำลังวิ่ง"
 */
function parseTransportRows(rawRows: string[][]) {
  const trips: Record<string, unknown>[] = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const lineStr = rawRows[i].map((c) => cleanText(c).toUpperCase()).join(" ");
    if (
      (lineStr.includes("STUFFING") && lineStr.includes("VOLUME")) ||
      (lineStr.includes("JOIN NO") && lineStr.includes("JOB NO"))
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const todayStr = new Date().toISOString().slice(0, 10);

  for (let rIdx = headerIdx + 1; rIdx < rawRows.length; rIdx++) {
    const row = rawRows[rIdx];
    if (!row || !row.some((c) => cleanText(c))) continue;
    const lineStr = row.join(" ").toUpperCase();
    if (lineStr.includes("TOTAL :") || lineStr.includes("TOTAL:")) continue;

    const val = (i: number) => (i >= 0 && i < row.length ? cleanText(row[i]) : "");
    const col2 = stripModeSuffix(val(2));
    const col3 = stripModeSuffix(val(3));

    const tsNo = col3.startsWith("TS")
      ? col3
      : col2.startsWith("TS")
      ? col2
      : "";
    if (!tsNo || tsNo.length < 4) continue;

    const linkedJob = !col2.startsWith("TS") && col2.length >= 4 ? col2 : "";
    const cust = val(4);
    const vol = val(6);
    const pFrom = val(9);
    const pDate = excelDateToIso(val(10));
    const dTo = val(12);
    const dDate = excelDateToIso(val(13));
    const retTo = val(15);
    const transporter = val(24);
    const plate = val(25);
    const driver = val(26);

    const status = dDate && dDate < todayStr ? "ส่งมอบแล้ว" : "กำลังวิ่ง";

    trips.push({
      tripNo: tsNo,
      transportNo: tsNo,
      jobNo: linkedJob || "",
      customer: cust,
      driver: driver || transporter || vol,
      driverName: driver,
      transporter,
      truckType: vol,
      container: vol,
      plateNo: plate,
      pickupLocation: pFrom,
      pickupDate: pDate,
      deliveryLocation: dTo,
      deliver: dDate,
      deliverDate: dDate,
      returnDepot: retTo,
      status,
      pod: "",
    });
  }
  return trips;
}

/**
 * ตัวคัดแยกประเภทชีต (Dispatcher):
 * ตรวจสอบข้อความใน 4 แถวแรกเพื่อส่งต่อไปยัง Parser ที่ตรงกับรูปแบบไฟล์:
 *   1) Transport  -> parseTransportRows
 *   2) Sea 2-row  -> parseFwdSea2Row
 *   3) Air 2-row  -> parseFwdAir2Row
 *   4) Default    -> Standard 1-row (Shipping / e-Customs) ค้นหาคอลัมน์อัตโนมัติจากชื่อหัวตาราง
 */
function parseSheetRows(
  sheetName: string,
  rawRows: string[][],
  idx: MasterIndex
): {
  rows: Record<string, unknown>[];
  isCustoms: boolean;
  found: boolean;
  isTransport: boolean;
} {
  if (!rawRows || rawRows.length === 0) {
    return { rows: [], isCustoms: false, found: false, isTransport: false };
  }

  const firstFew = rawRows
    .slice(0, 4)
    .map((r) => r.map((c) => cleanText(c).toUpperCase()).join(" "))
    .join(" ");

  if (
    firstFew.includes("TRANSPORT") ||
    firstFew.includes("EXAMINATION AND DELIVERY") ||
    sheetName.toUpperCase() === "EXAMINATION AND DELIVERY" ||
    (firstFew.includes("STUFFING") && firstFew.includes("DELIVERY BY"))
  ) {
    const trips = parseTransportRows(rawRows);
    if (trips.length > 0) {
      return { rows: trips, isCustoms: false, found: true, isTransport: true };
    }
  }

  if (
    (firstFew.includes("BOOKING REPORT") || firstFew.includes("BOOKING DATE")) &&
    firstFew.includes("CARRIER") &&
    firstFew.includes("AGENT")
  ) {
    const rows = parseFwdSea2Row(rawRows, idx);
    if (rows.length > 0) {
      return { rows, isCustoms: false, found: true, isTransport: false };
    }
  }

  if (
    firstFew.includes("DAILY SHIPMENT REPORT") ||
    (firstFew.includes("HAWB") && firstFew.includes("FLIGHT") && firstFew.includes("MAWB"))
  ) {
    const rows = parseFwdAir2Row(rawRows, idx);
    if (rows.length > 0) {
      return { rows, isCustoms: false, found: true, isTransport: false };
    }
  }

  // Standard 1-row layout (Customs / Shipping)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const nonEmpty = rawRows[i].map((c) => cleanText(c).toUpperCase()).filter(Boolean);
    if (nonEmpty.length < 3) continue;
    const lineStr = nonEmpty.join(" ");
    const hasJob = nonEmpty.some((c) => /JOB\s*NO\.?/.test(c)) || lineStr.includes("JOB NO");
    const hasDecl = nonEmpty.some((c) => c.includes("DECLARATION"));
    const hasCust = ["IMPORTER", "EXPORTER", "CUSTOMER"].some((k) => lineStr.includes(k));
    if ((hasJob && (hasDecl || hasCust)) || hasDecl || hasJob) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { rows: [], isCustoms: false, found: false, isTransport: false };
  }

  const headerCols = rawRows[headerIdx].map((c) => cleanText(c).toUpperCase());
  const getColIdx = (names: string[]) => {
    for (let i = 0; i < headerCols.length; i++) {
      for (const n of names) {
        if (headerCols[i].includes(n.toUpperCase())) return i;
      }
    }
    return -1;
  };

  const idxJob = getColIdx(["JOB NO.", "JOB NO", "JOBNO"]);
  const idxJoin = getColIdx(["JOIN NO", "JOIN"]);
  const idxCust = getColIdx([
    "IMPORTER NAME",
    "EXPORTER NAME",
    "CUSTOMER NAME",
    "IMPORTER",
    "EXPORTER",
    "CUSTOMER",
  ]);
  const idxDecl = getColIdx([
    "DECLARATION NO",
    "DECLARATION NO.",
    "DECL. NO",
    "เลขที่ใบขน",
    "DECLARATION",
  ]);
  const idxDeclType = getColIdx(["DECLARATION TYPE", "DECL TYPE"]);
  const idxInv = getColIdx(["INVOICE NO", "INVOIVE NO", "INVOICE", "CUS.INV NO"]);
  const idxSubmit = getColIdx(["SUBMIT DD", "SUBMIT DATE", "SUBMIT"]);
  const idxStatus = getColIdx(["STATUS JOB", "STATUS"]);
  const idxO409 = getColIdx(["O4O9", "0409"]);
  const idxO309 = getColIdx(["O3O9", "0309"]);
  const idxO209 = getColIdx(["O2O9", "0209"]);
  const idxO109 = getColIdx(["O1O9", "0109"]);
  const idxEtd = getColIdx(["ETD"]);
  const idxEta = getColIdx(["ETA"]);
  const idxGw = getColIdx(["G.W.", "GROSS WEIGHT", "GW"]);
  const idxCbm = getColIdx(["MEASUREMENT (M3)", "MEASUREMENT", "CBM"]);
  const idxCntr = getColIdx(["CONTAINER TYPE", "CONTAINER"]);
  const idxCs = getColIdx(["CS NAME", "CS"]);
  const idxMbl = getColIdx(["MBL"]);
  const idxHbl = getColIdx(["HBL"]);
  const idxCommodity = getColIdx(["COMMODITY"]);
  const idxRef = getColIdx(["REFERENCE NO", "REFERANCE NO", "REF NO"]);
  const idxClear = getColIdx(["CLEAR DATE"]);

  const allHeadersStr = headerCols.join(" ");
  const sheetUpper = sheetName.toUpperCase();
  const isCustoms =
    ["O4O9", "0409", "O1O9", "0109", "เลขที่ใบขน"].some((k) =>
      allHeadersStr.includes(k)
    ) ||
    sheetUpper.includes("IMPORT") ||
    sheetUpper.includes("EXPORT");

  const rows: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !r.some((c) => cleanText(c))) continue;
    const rIdx = i + 1;

    const val = (col: number) => (col >= 0 && col < r.length ? cleanText(r[col]) : "");

    const jobNo = stripModeSuffix(val(idxJob));
    const joinNo = stripModeSuffix(val(idxJoin));
    const effectiveKey = jobNo || joinNo;

    if (!effectiveKey || effectiveKey.length < 4) continue;
    if (effectiveKey.includes("JOB NO") || /^\d+(\.\d+)?$/.test(effectiveKey)) continue;

    const customer = val(idxCust);
    let declarationNo = val(idxDecl);
    const declTypeVal = val(idxDeclType);
    if (
      ["NORMAL", "GENERAL", "IMPORT", "EXPORT", "TRANSIT", "RE-EXPORT"].includes(
        declarationNo.toUpperCase()
      )
    ) {
      if (!declTypeVal) {
        // classified as declaration type, not declaration number
      }
      declarationNo = "";
    }

    const invNo = val(idxInv);
    const submitIso = excelDateToIso(val(idxSubmit));
    const etdIso = excelDateToIso(val(idxEtd)) || (isCustoms ? null : submitIso);
    const etaIso = excelDateToIso(val(idxEta));

    const stRaw = val(idxStatus);
    const clearIso = excelDateToIso(val(idxClear));
    const o409Val = val(idxO409);
    const o309Val = val(idxO309);
    const o209Val = val(idxO209);
    const o109Val = val(idxO109);

    let customsSt: string | null = null;
    if (stRaw.includes("0409") || o409Val) customsSt = "0409";
    else if (stRaw.includes("0309") || o309Val) customsSt = "0309";
    else if (stRaw.includes("0209") || o209Val) customsSt = "0209";
    else if (stRaw.includes("0109") || o109Val) customsSt = "0109";
    else if (isCustoms && declarationNo && idxStatus === -1 && idxO409 === -1) {
      customsSt = "0409";
    }

    // แปลงสถานะจากคอลัมน์ STATUS JOB และรหัสใบขน (0109-0409) ให้ตรงกับมาตรฐาน Dashboard
    // hasExplicitStatus = true เมื่อไฟล์มีคอลัมน์ STATUS JOB จริง (เพื่อให้ StagingUploadView ยอมอัปเดตสถานะทับได้)
    const stLower = stRaw.toLowerCase();
    const hasExplicitStatus = Boolean(stRaw);
    let parsedStatus = "In Progress";
    let parsedStatusDetail = "Job Control";
    if (customsSt === "0409" || stLower.includes("complete") || stLower.includes("เสร็จ")) {
      parsedStatus = "Completed";
      parsedStatusDetail = "Job Complete";
      if (!customsSt) customsSt = "0409";
    } else if (stLower.includes("cancel") || stLower.includes("ยกเลิก")) {
      parsedStatus = "Cancelled";
      parsedStatusDetail = "Job Cancelled";
    } else if (stLower.includes("wait") || stLower.includes("รอ")) {
      parsedStatus = "In Progress";
      parsedStatusDetail = "Job Waiting";
    } else if (stLower.includes("booking")) {
      parsedStatus = "Booking";
      parsedStatusDetail = "Job Booking";
    }

    let gwVal: number | null = null;
    const rawGw = val(idxGw).replace(/,/g, "");
    if (rawGw) {
      const n = parseFloat(rawGw);
      if (!isNaN(n)) gwVal = n;
    }

    let cbmVal: number | null = null;
    const rawCbm = val(idxCbm).replace(/,/g, "");
    if (rawCbm) {
      const n = parseFloat(rawCbm);
      if (!isNaN(n)) cbmVal = n;
    }

    const rawMbl = cleanText(val(idxMbl));
    const rawHbl = cleanText(val(idxHbl));
    const blKey = stripModeSuffix(rawMbl || rawHbl);

    const match =
      idx.byNo.get(effectiveKey) ||
      idx.byJoin.get(effectiveKey) ||
      (joinNo ? idx.byNo.get(joinNo) || idx.byJoin.get(joinNo) : undefined) ||
      (blKey && blKey.length >= 6 ? idx.byBl.get(blKey) : undefined);
    const actionType = match ? "update" : "new";
    const { isChanged, isDateChanged, isCustomsChanged, isStatusChanged, diffStr, exEtd, exEta, note } = checkJobDiff(
      {
        etdIso,
        etaIso,
        clearIso,
        declarationNo,
        invoiceNo: invNo,
        containerType: val(idxCntr),
        customsStatus: customsSt,
        status: parsedStatus,
        hasExplicitStatus,
        csName: val(idxCs),
        customer,
        bl: val(idxMbl) || val(idxHbl),
        mbl: rawMbl,
        hbl: rawHbl,
      },
      match
    );

    rows.push({
      id: `row-${sheetName.trim()}-${rIdx}-${effectiveKey}`,
      sheet: sheetName.trim(),
      jobNo: effectiveKey,
      joinNo: joinNo !== effectiveKey ? joinNo : "",
      customer: customer || "—",
      declarationNo,
      invoiceNo: invNo,
      referenceNo: val(idxRef),
      status: parsedStatus,
      statusDetail: parsedStatusDetail,
      statusRaw: stRaw || parsedStatusDetail,
      hasExplicitStatus,
      clearDate: clearIso,
      customsStatus: customsSt,
      etd: etdIso,
      eta: etaIso,
      submitDate: submitIso,
      containerType: val(idxCntr),
      grossWeight: gwVal,
      cbm: cbmVal,
      csName: val(idxCs),
      bl: val(idxMbl) || val(idxHbl),
      mbl: rawMbl,
      hbl: rawHbl,
      commodity: val(idxCommodity),
      actionType,
      isChanged,
      isDateChanged,
      isCustomsChanged,
      isStatusChanged,
      dateChangeDiff: diffStr,
      oldEtd: exEtd,
      oldEta: exEta,
      validationStatus:
        declarationNo || etdIso || etaIso || effectiveKey ? "valid" : "warning",
      validationNote: match ? note : "✨ งานใหม่",
    });
  }

  return { rows, isCustoms, found: true, isTransport: false };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * อ่านไฟล์ .xls ที่เนื้อหาข้างในจริงๆ เป็น HTML (เช่น รายงานใบขนจากระบบ e-Customs Report Designer)
 * - ตรวจ charset จาก <meta> เพื่อรองรับ tis-620 / windows-874
 * - ลบ HTML comment และ <script>/<style> ก่อนแยกแต่ละ <table> เป็น 1 ชีต
 */
function readHtmlTablesFromBuffer(buffer: Buffer): Array<[string, string[][]]> {
  const headText = buffer.subarray(0, 5000).toString("latin1");
  const charsetMatch = headText.match(/charset=["']?([\w-]+)/i);
  const enc = charsetMatch ? charsetMatch[1].toLowerCase() : "utf-8";

  let text: string;
  if (enc === "tis-620" || enc === "tis620" || enc === "windows-874" || enc === "cp874") {
    text = thaiDecoder.decode(buffer);
  } else {
    try {
      text = new TextDecoder(enc).decode(buffer);
    } catch {
      text = buffer.toString("utf-8");
    }
  }

  // Strip HTML comments and script/style blocks
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  const sheets: Array<[string, string[][]]> = [];
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  let tableIdx = 0;

  while ((tableMatch = tableRegex.exec(cleaned)) !== null) {
    tableIdx++;
    const tableBody = tableMatch[1];
    const rows: string[][] = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;

    while ((trMatch = trRegex.exec(tableBody)) !== null) {
      const cells: string[] = [];
      const tdRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const plain = decodeHtmlEntities(tdMatch[1].replace(/<[^>]+>/g, " "));
        cells.push(cleanText(plain));
      }
      if (cells.some(Boolean)) {
        rows.push(cells);
      }
    }

    const head = rows
      .slice(0, 3)
      .map((r) => r.join(" "))
      .join(" ")
      .toUpperCase();
    const name = head.includes("IMPORTER")
      ? "IMPORT"
      : head.includes("EXPORTER")
      ? "EXPORT"
      : `TABLE${tableIdx}`;
    sheets.push([name, rows]);
  }

  return sheets;
}

function sheetToCleanRows(ws: XLSX.WorkSheet): string[][] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
  });
  const out: string[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const vals = row.map((c) => cleanText(c));
    if (vals.some(Boolean)) out.push(vals);
  }
  return out;
}

export interface ParsedUploadResult {
  ok: boolean;
  error?: string;
  fileName?: string;
  fileType?: "transport" | "customs" | "fwd";
  fileTypeLabel?: string;
  isTransport?: boolean;
  totalRows?: number;
  transportTrips?: Record<string, unknown>[];
  rows?: Record<string, unknown>[];
  message?: string;
}

/**
 * Entry Point หลักสำหรับเรียกจาก /api/uploads
 * รับ Buffer ของไฟล์ที่อัปโหลด + ชื่อไฟล์ + รายการงานล่าสุดจาก DB เพื่อวิเคราะห์และคืนผล Preview
 * (ไม่เขียนไฟล์ลงดิสก์เลย จึงปลอดภัย 100% บน Vercel Serverless)
 */
export function parseUploadedExcelBuffer(
  buffer: Buffer,
  fileName: string,
  existingJobs: JobRecord[]
): ParsedUploadResult {
  const lower = fileName.toLowerCase();
  const idx = buildMasterIndex(existingJobs);

  const allRows: Record<string, unknown>[] = [];
  const allTransportTrips: Record<string, unknown>[] = [];
  const seenKeys = new Set<string>();
  const seenTrips = new Set<string>();
  let detectedCustoms = false;

  const collectSheet = (sheetName: string, rawRows: string[][]) => {
    const { rows, isCustoms, isTransport } = parseSheetRows(sheetName, rawRows, idx);
    if (isTransport) {
      for (const t of rows) {
        const key = String(t.tripNo || "");
        if (key && !seenTrips.has(key)) {
          seenTrips.add(key);
          allTransportTrips.push(t);
        }
      }
    } else {
      for (const r of rows) {
        const key = String(r.jobNo || "");
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          allRows.push(r);
        }
      }
      if (isCustoms) detectedCustoms = true;
    }
  };

  try {
    if (lower.endsWith(".csv")) {
      let text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
      if (text.includes("\uFFFD")) {
        text = thaiDecoder.decode(buffer);
      }
      const wb = XLSX.read(text, { type: "string", raw: true });
      for (const sName of wb.SheetNames) {
        collectSheet("CSV", sheetToCleanRows(wb.Sheets[sName]));
      }
    } else if (lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      const head = buffer.subarray(0, 2048).toString("latin1").toLowerCase();
      const isHtmlXls = ["<html", "<table", "<script", "<!doctype", "<meta"].some((t) =>
        head.includes(t)
      );
      if (isHtmlXls) {
        for (const [sName, rawRows] of readHtmlTablesFromBuffer(buffer)) {
          collectSheet(sName, rawRows);
        }
      } else {
        const wb = XLSX.read(buffer, { type: "buffer", codepage: 874, raw: true });
        for (const sName of wb.SheetNames) {
          if (sName.toUpperCase().includes("COUNTER")) continue;
          collectSheet(sName, sheetToCleanRows(wb.Sheets[sName]));
        }
      }
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
      const wb = XLSX.read(buffer, { type: "buffer", codepage: 874, raw: true });
      for (const sName of wb.SheetNames) {
        const upper = sName.toUpperCase();
        if (
          upper.includes("COUNTER") ||
          upper.includes("DASHBOARD") ||
          upper.includes("SUMMARY")
        ) {
          continue;
        }
        collectSheet(sName, sheetToCleanRows(wb.Sheets[sName]));
      }
    } else {
      return {
        ok: false,
        error: `ไม่รองรับนามสกุลไฟล์ ${fileName} (รองรับ .xls, .xlsx, .csv)`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `ไม่สามารถอ่านไฟล์ ${fileName}: ${msg}` };
  }

  if (allTransportTrips.length > 0) {
    return {
      ok: true,
      fileName,
      fileType: "transport",
      fileTypeLabel: "รายงานการจองรถขนส่งในประเทศ (Inland Transport)",
      isTransport: true,
      totalRows: allTransportTrips.length,
      transportTrips: allTransportTrips,
      rows: [],
      message: `ตรวจพบไฟล์นี้เป็น: รายงานการจองรถขนส่งในประเทศ (Inland Transport) ${allTransportTrips.length} เที่ยวรถ · แยกเข้าตารางเดินรถโดยเฉพาะ ไม่นับรวมในตัวเลขชิปเมนท์หลัก`,
    };
  }

  return {
    ok: true,
    fileName,
    fileType: detectedCustoms ? "customs" : "fwd",
    fileTypeLabel: detectedCustoms
      ? "รายงานสถานะศุลกากร (Customs Report)"
      : "รายงาน FWD Booking Report",
    totalRows: allRows.length,
    rows: allRows,
  };
}
