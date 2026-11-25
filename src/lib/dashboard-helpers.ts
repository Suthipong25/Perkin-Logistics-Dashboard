/**
 * ============================================================================
 * PERKIN LOGISTICS DASHBOARD — SHARED HELPERS & UTILITIES
 * ============================================================================
 * ไฟล์นี้รวบรวมฟังก์ชันและค่าคงที่ส่วนกลางที่ใช้ร่วมกันในทุกคอมโพเนนต์
 * เช่น การแปลงวันที่, การจัดกลุ่มบริการ, การคำนวณสถานะงาน, และการจัดฟอร์แมตตัวเลข
 * 
 * วัตถุประสงค์เพื่อลดการเขียนโค้ดซ้ำซ้อน (DRY Principle) และทำให้ระบบบำรุงรักษาง่าย
 * 
 * สารบัญฟังก์ชัน:
 * 1. SERVICES & MONTHS: ค่าคงที่บริการหลัก 5 หมวด และรายชื่อเดือนภาษาไทย
 * 2. MONTH_FILTER_OPTIONS: ตัวเลือกสำหรับ Dropdown กรองข้อมูลรายเดือน
 * 3. fmtNum / fmtDate / fmtMonth: จัดรูปแบบตัวเลขและวันที่ (พ.ศ. / ค.ศ.)
 * 4. getJobMonth: ดึงเดือน (YYYY-MM) จาก Job Record อย่างแม่นยำ
 * 5. daysOpen / isOpen: คำนวณจำนวนวันที่เปิดงานและตรวจสอบว่ายังไม่ปิดงานหรือไม่
 * 6. serviceMeta / statusMeta: ดึงสี Badge, รหัสย่อ และ Label ของสถานะงาน
 * 7. computeNextAction: คำนวณขั้นตอนถัดไปในกระบวนการศุลกากร 5 ขั้นตอน
 * 8. classifyContainer: จัดกลุ่มขนาดตู้คอนเทนเนอร์ (40' HC, 40' DC, 20' DC, รถบรรทุก)
 * ============================================================================
 */

import { JobRecord, ServiceKey } from "@/types/dashboard";

/* ============================================================================
 * 1. SERVICES & METADATA CONFIGURATION
 * กำหนดรหัสบริการ สีธีมประจำบริการ และชื่อย่อตามระบบชิปเมนท์ของ Perkin Logistics
 * ============================================================================ */
export const SERVICES = [
  { key: "SEA Import", name: "Sea Import", code: "SEA-IMP", color: "#073766" },
  { key: "AIR Import", name: "Air Import", code: "AIR-IMP", color: "#0d7a5f" },
  { key: "SEA Export", name: "Sea Export", code: "SEA-EXP", color: "#f56a22" },
  { key: "AIR Export", name: "AIR Export", code: "AIR-EXP", color: "#5288b6" },
  { key: "Transport", name: "Transport", code: "TRN", color: "#d97706" },
  { key: "Freight", name: "Freight", code: "FRT", color: "#c07d53" },
] as const;

/* รายชื่อเดือนย่อภาษาไทยสำหรับแสดงผลบน Dashboard */
export const MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/* ตัวเลือกสำหรับ Dropdown หรือ Segmented Button ในการกรองตามเดือน (เรียง ม.ค. - ธ.ค. 26) */
export const MONTH_FILTER_OPTIONS = [
  { key: "all", label: "ทุกเดือน (All 12 Months)" },
  { key: "2026-01", label: "ม.ค. 26" },
  { key: "2026-02", label: "ก.พ. 26" },
  { key: "2026-03", label: "มี.ค. 26" },
  { key: "2026-04", label: "เม.ย. 26" },
  { key: "2026-05", label: "พ.ค. 26" },
  { key: "2026-06", label: "มิ.ย. 26" },
  { key: "2026-07", label: "ก.ค. 26" },
  { key: "2026-08", label: "ส.ค. 26" },
  { key: "2026-09", label: "ก.ย. 26" },
  { key: "2026-10", label: "ต.ค. 26" },
  { key: "2026-11", label: "พ.ย. 26" },
  { key: "2026-12", label: "ธ.ค. 26" },
];

/* ============================================================================
 * 2. FORMATTING HELPERS
 * ฟังก์ชันจัดฟอร์แมตตัวเลขและวันที่ให้อ่านง่าย
 * ============================================================================ */

/**
 * แปลงตัวเลขให้มีเครื่องหมายจุลภาค (Comma) คั่นหลักพัน เช่น 1,234
 */
export function fmtNum(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Number(n || 0));
}

/**
 * ตรวจสอบความถูกต้องของ ISO Date String รูปแบบ YYYY-MM-DD
 */
export function isValidIso(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const y = Number(iso.slice(0, 4));
  return y >= 2000 && y <= 2100;
}

/**
 * จัดรูปแบบวันที่ ISO YYYY-MM-DD เป็น "วันที่ เดือนย่อ ปี" เช่น "10 ต.ค. 2026"
 */
export function fmtDate(iso: string | null | undefined): string {
  if (!isValidIso(iso)) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * จัดรูปแบบเดือน ISO YYYY-MM เป็น "เดือนย่อ ปีสั้น" เช่น "ต.ค. 26"
 */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/**
 * คำนวณร้อยละ (Percentage) พร้อมปัดทศนิยม 1 ตำแหน่ง
 */
export function pct(a: number, b: number): number {
  return b ? Math.round((a / b) * 1000) / 10 : 0;
}

/* ============================================================================
 * 3. BUSINESS LOGIC & CLASSIFICATION HELPERS
 * ลอจิกการจัดกลุ่มข้อมูลชิปเมนท์และกระบวนการทำงาน
 * ============================================================================ */

/**
 * สกัดเดือนของงาน (YYYY-MM) เพื่อใช้กรองข้อมูล
 * ลำดับการตรวจสอบ:
 * 1. ฟิลด์ job.month (ถ้ามี)
 * 2. ฟิลด์ job.etd
 * 3. ฟิลด์ job.jobDate
 * 4. รูปแบบ Job No (เช่น SI2610xxx -> เดือน 10 ปี 2026)
 */
const SHEET_MONTH_MAP: Record<string, string> = {
  Jan: "2026-01", Feb: "2026-02", Mar: "2026-03", Apr: "2026-04",
  May: "2026-05", Jun: "2026-06", July: "2026-07", Aug: "2026-08",
  Sep: "2026-09", Oct: "2026-10", Nov: "2026-11", Dec: "2026-12",
};

export function getJobMonth(job: JobRecord): string | null {
  if (job.month && /^\d{4}-\d{2}/.test(job.month)) return job.month.slice(0, 7);
  const isExp =
    (job.service || "").includes("Export") ||
    /^(SH)?(SE|AE)/i.test(job.jobNo || "");
  const primaryDate = isExp ? (job.etd || job.eta) : (job.eta || job.etd);
  if (primaryDate && /^\d{4}-\d{2}/.test(primaryDate)) return primaryDate.slice(0, 7);
  if (job.jobDate && /^\d{4}-\d{2}/.test(job.jobDate)) return job.jobDate.slice(0, 7);
  if (job.sourceSheet && SHEET_MONTH_MAP[job.sourceSheet]) return SHEET_MONTH_MAP[job.sourceSheet];
  const m = job.jobNo.match(/^[A-Za-z]+(\d{2})(\d{2})/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return `20${m[1]}-${m[2]}`;
  }
  return null;
}

/**
 * คำนวณจำนวนวันที่เปิดงานมาแล้ว เทียบกับกำหนดส่งมอบจริง (ณ วันที่ปัจจุบันแบบไดนามิก)
 * - งานขาเข้า (Import): ยึดตาม ETA (วันเรือ/เครื่องบินถึงไทย) หากมีข้อมูล เพื่อไม่ให้เกิด false overdue ระหว่างที่เรือยังเดินทางอยู่กลางทะเล
 * - งานขาออก (Export): ยึดตาม ETD (วันเรือ/เครื่องบินตัดรอบออกจากไทย)
 */
export function daysOpen(job: JobRecord): number | null {
  const isExport =
    job.service.includes("Export") ||
    job.jobNo.startsWith("SE") ||
    job.jobNo.startsWith("AE") ||
    job.jobNo.startsWith("SHSE") ||
    job.jobNo.startsWith("SHAE");
  const targetDateStr = (!isExport && job.eta && isValidIso(job.eta))
    ? job.eta
    : (job.etd && isValidIso(job.etd) ? job.etd : job.jobDate);
  if (!isValidIso(targetDateStr)) return null;

  // Sanity Guard: ป้องกันวันค้างเทียม (False Overdue) จากวันที่สลับฟอร์แมต
  // งานที่เปิดในเดือน M (เช่น 2610 = ต.ค.) จะไม่มีเหตุการณ์เกินกำหนดตั้งแต่ต้นปี (ม.ค.-ก.ค.)
  const m = job.jobNo.match(/^[A-Za-z]+(\d{2})(\d{2})/);
  if (m) {
    const jobYear = 2000 + Number(m[1]);
    const jobMonth = Number(m[2]);
    const [targetY, targetM] = targetDateStr.slice(0, 7).split("-").map(Number);
    if (targetY === jobYear && targetM < jobMonth - 1) {
      return null;
    }
  }

  const targetTime = new Date(`${targetDateStr!.slice(0, 10)}T00:00:00+07:00`).getTime();
  if (isNaN(targetTime)) return null;
  const nowBkk = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date(`${nowBkk}T00:00:00+07:00`).getTime();
  return Math.floor((today - targetTime) / 86400000);
}

/**
 * ตรวจสอบว่างานยังอยู่ระหว่างดำเนินงานหรือไม่ (สถานะไม่ใช่ Completed หรือ Cancelled)
 */
export function isOpen(job: JobRecord): boolean {
  return job.status === "In Progress" || job.status === "Booking";
}

/**
 * ดึงข้อมูล Metadata ของบริการ (ชื่อเต็ม, โค้ด, สีประจำบริการ)
 */
export function serviceMeta(service: string) {
  const norm = (service || "").toUpperCase();
  return (
    SERVICES.find((s) => s.key.toUpperCase() === norm) || {
      key: service as ServiceKey,
      name: service,
      code: "OTHER",
      color: "#526275",
    }
  );
}

export type JobStage = "Booking" | "Control" | "Waiting" | "Completed" | "Cancelled";

/**
 * จำแนกสถานะงานตามลำดับ FWD System (Single Source of Truth)
 * Flow: Job Booking Request > Job Control > Job Waiting > Job Complete
 */
export function classifyJob(job: JobRecord): JobStage {
  const st = job.status || "";
  const std = job.statusDetail || "";
  const raw = job.statusRaw || "";
  if (st === "Completed" || std.includes("Complete") || raw.includes("Complete")) {
    return "Completed";
  }
  if (st === "Cancelled" || std.includes("Cancel") || raw.includes("Cancel")) {
    return "Cancelled";
  }
  if (
    st === "Booking" ||
    std.includes("Booking") ||
    std.includes("Request") ||
    raw.includes("Booking") ||
    raw.includes("Request")
  ) {
    return "Booking";
  }
  if (std.includes("Wait") || raw.includes("Wait")) {
    return "Waiting";
  }
  return "Control";
}

/**
 * ดึงสถานะการทำงาน (Key, Label, จุดสี และ Class ของ Badge)
 */
export function statusMeta(job: JobRecord) {
  const stage = classifyJob(job);
  if (stage === "Completed")
    return {
      key: "Completed",
      label: "Job Complete",
      dot: "bg-[#0d7a5f]",
      badge: "bg-[#e6f5f0] text-[#0d7a5f] border-[#0d7a5f]/25",
    };
  if (stage === "Cancelled")
    return {
      key: "Cancelled",
      label: "Job Cancelled",
      dot: "bg-[#6e7e91]",
      badge: "bg-slate-100 text-[#526275] border-slate-300",
    };
  if (stage === "Booking")
    return {
      key: "Booking",
      label: "Job Booking Request",
      dot: "bg-[#8b5cf6]",
      badge: "bg-[#ede9fe] text-[#6d28d9] border-[#8b5cf6]/30",
    };
  if (stage === "Waiting")
    return {
      key: "Waiting",
      label: "Job Waiting",
      dot: "bg-[#f56a22]",
      badge: "bg-[#fff1e8] text-[#c2410c] border-[#f56a22]/30",
    };
  return {
    key: "Control",
    label: "Job Control",
    dot: "bg-[#0284c7]",
    badge: "bg-[#e0f2fe] text-[#0369a1] border-[#0284c7]/25",
  };
}

/**
 * คำนวณขั้นตอนถัดไปที่ต้องทำ (Next Action) จาก Milestone ศุลกากร 5 ขั้นตอน
 * รองรับการอนุมานย้อนกลับ: หากมีเลขที่ใบขนหรือยิงใบขนแล้ว ย่อมผ่านขั้นออก Draft แล้วเสมอ
 */
export function computeNextAction(job: JobRecord): string | null {
  if (!isOpen(job)) return null;
  const cSt = job.customsStatus || job.updateStatus || "";
  const isCleared = Boolean(job.cleared || cSt === "0409");
  const isDoDone = Boolean(job.doReleased || isCleared);
  const isFiled = Boolean(job.customsFiled || job.declarationNo || ["0209", "0309", "0409"].includes(cSt) || isDoDone);
  const isDrafted = Boolean(job.draftCustoms || cSt === "0109" || isFiled);

  if (!isDrafted) return "รอออก Draft ใบขน";
  if (!isFiled) return "รอยิงใบขนจริง";
  if (!isDoDone) return "รอแลก DO";
  if (!isCleared) return "รอ Clear & Pickup";
  if (!job.advanceDoc) return "รอเอกสารเบิกเงิน";
  return "ติดตามปิดชุดงาน";
}

/**
 * จำแนกประเภทตู้คอนเทนเนอร์จากข้อความดิบใน Excel
 */
export function classifyContainer(raw: string | undefined): string {
  if (!raw) return "รถบรรทุก 4/6 ล้อ";
  const low = raw.toLowerCase();
  if (low.includes("40") && (low.includes("hq") || low.includes("hc"))) return "40' HQ/HC";
  if (low.includes("40")) return "40' DC";
  if (low.includes("20")) return "20' DC";
  return "รถบรรทุก 4/6 ล้อ";
}
