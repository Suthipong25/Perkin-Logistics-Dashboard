import { JobRecord } from "@/types/dashboard";
import { StagingRecord, customsRank } from "./types";

/**
 * อ่านและแยกโครงสร้างข้อมูล CSV จากไฟล์แนบฝั่ง Client
 */
export function parseCSVText(
  csvContent: string,
  fileName: string,
  existingJobMap: Map<string, JobRecord>
): StagingRecord[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const isCustoms =
    fileName.toLowerCase().includes("customs") || fileName.includes("ใบขน");
  const fileType = isCustoms ? "customs" : "fwd";

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
  const idxCustomer =
    colIdx("IMPORTER") !== -1
      ? colIdx("IMPORTER")
      : colIdx("EXPORTER") !== -1
      ? colIdx("EXPORTER")
      : colIdx("CUSTOMER");
  const idxDecl = colIdx("DECLARATION");
  const idxInv =
    colIdx("INVOICE") !== -1
      ? colIdx("INVOICE")
      : colIdx("INVOIVE") !== -1
      ? colIdx("INVOIVE")
      : colIdx("CUS.INV");
  const idxSubmit = colIdx("SUBMIT");
  const idxStatus = colIdx("STATUS");
  const idxO409 = colIdx("O4O9");
  const idxO309 = colIdx("O309");
  const idxO209 = colIdx("O2O9");
  const idxO109 = colIdx("O1O9");
  const idxETD = colIdx("ETD");
  const idxETA = colIdx("ETA");
  const idxGW = colIdx("G.W.");
  const idxCBM = colIdx("MEASUREMENT");
  const idxCntr = colIdx("CONTAINER");
  const idxCS = colIdx("CS NAME");
  const idxMBL = colIdx("MBL");
  const idxHBL = colIdx("HBL");
  const idxCommodity = colIdx("COMMODITY");

  const toIsoDate = (raw: string): string => {
    const s = raw.trim();
    if (!s) return "";
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    return s.slice(0, 10);
  };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith(",,") || line.toUpperCase().startsWith("TOTAL"))
      continue;

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

    const clean = (val: string | undefined) =>
      val ? val.replace(/^["']|["']$/g, "").trim() : "";

    const rawJob = clean(cols[idxJob]);
    const rawJoin = idxJoin !== -1 ? clean(cols[idxJoin]) : "";
    const jobNo = rawJob.replace(/\s*\((SEA|AIR)\)\s*$/i, "").toUpperCase();

    if (!jobNo && !rawJoin) continue;
    const effectiveKey = (jobNo || rawJoin)
      .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
      .toUpperCase();

    const customer = clean(cols[idxCustomer]);
    const declarationNo = idxDecl !== -1 ? clean(cols[idxDecl]) : "";
    const invoiceNo = idxInv !== -1 ? clean(cols[idxInv]) : "";
    const submitDate = idxSubmit !== -1 ? toIsoDate(clean(cols[idxSubmit])) : "";
    const etd = idxETD !== -1 ? toIsoDate(clean(cols[idxETD])) : "";
    const eta = idxETA !== -1 ? toIsoDate(clean(cols[idxETA])) : "";
    const rawMbl = idxMBL !== -1 ? clean(cols[idxMBL]) : "";
    const rawHbl = idxHBL !== -1 ? clean(cols[idxHBL]) : "";
    const blVal = rawMbl || rawHbl;
    const cntrVal = idxCntr !== -1 ? clean(cols[idxCntr]) : "";
    const commVal = idxCommodity !== -1 ? clean(cols[idxCommodity]) : "";
    const csVal = idxCS !== -1 ? clean(cols[idxCS]) : "";
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
    const cbmVal =
      idxCBM !== -1 && cols[idxCBM] ? parseFloat(cols[idxCBM]) : null;

    const isExpJob = /^(SH)?(SE|AE)/i.test(effectiveKey);
    const opDate = isExpJob
      ? etd || submitDate || eta || ""
      : eta || submitDate || etd || "";
    const isPastOrOld =
      !existsInMaster && Boolean(opDate && opDate < "2026-11-01");
    const isBlankDummy =
      !existsInMaster &&
      !clean(cols[idxCntr]) &&
      isNaN(gwVal as number) &&
      !clean(cols[idxMBL]) &&
      !clean(cols[idxCommodity]);
    const isGenuineNew = !existsInMaster && !isPastOrOld && !isBlankDummy;

    const normDate = (d?: string | null) =>
      d ? String(d).trim().slice(0, 10) : "";
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
    if (
      isCustoms &&
      declarationNo &&
      declarationNo !== existing?.declarationNo?.trim()
    ) {
      customsDiffs.push(
        `เลขใบขน: ${existing?.declarationNo || "-"} ➔ ${declarationNo}`
      );
    }
    const incomingCustomsDate = isCustoms ? submitDate : "";
    const existingCustomsDate = existing?.customsDate?.trim() || "";
    if (incomingCustomsDate && incomingCustomsDate !== existingCustomsDate) {
      customsDiffs.push(
        `วันที่ยื่นใบขน: ${existingCustomsDate || "-"} ➔ ${incomingCustomsDate}`
      );
    }
    if (
      isCustoms &&
      existing &&
      cStatus &&
      customsRank(cStatus) > customsRank(existing.customsStatus)
    ) {
      customsDiffs.push(
        `สถานะใบขน: ${existing.customsStatus || "-"} ➔ ${cStatus}`
      );
    }
    if (existsInMaster) {
      const exCust = (existing?.customer || "").trim();
      const isCustChanged = Boolean(customer && customer !== "—" && customer !== exCust);
      if (isCustChanged) customsDiffs.push(`ลูกค้า: ${exCust || "-"} ➔ ${customer}`);
      const exBl = (existing?.mbl || existing?.bl || existing?.hbl || "").trim();
      if (blVal && blVal !== exBl) customsDiffs.push(`BL: ${exBl || "-"} ➔ ${blVal}`);
      else if (!blVal && exBl && (idxMBL !== -1 || idxHBL !== -1 || isCustChanged)) {
        customsDiffs.push(`BL: ${exBl} ➔ (ล้างค่า B/L)`);
      }
      const exInv = (existing?.invoiceNo || "").trim();
      if (invoiceNo && invoiceNo !== exInv) customsDiffs.push(`INV: ${exInv || "-"} ➔ ${invoiceNo}`);
      const exCntr = (existing?.containerType || "").trim();
      if (cntrVal && cntrVal !== exCntr) customsDiffs.push(`Volume: ${exCntr || "-"} ➔ ${cntrVal}`);
      const exComm = (existing?.commodity || "").trim();
      if (commVal && commVal !== exComm) customsDiffs.push(`สินค้า: ${exComm || "-"} ➔ ${commVal}`);
      const exCs = (existing?.csName || "").trim();
      if (csVal && csVal !== exCs) customsDiffs.push(`CS: ${exCs || "-"} ➔ ${csVal}`);
    }
    const isCustomsChanged = existsInMaster && customsDiffs.length > 0;
    const customsChangeDiff = customsDiffs.join(" • ");

    let note = !effectiveKey ? "ไม่ระบุ Job No" : undefined;
    let vStatus: "valid" | "warning" =
      declarationNo || etd || effectiveKey ? "valid" : "warning";

    if (existsInMaster) {
      if (isDateChanged || isCustomsChanged) {
        vStatus = "valid";
        note = `🔄 อัปเดต: ${[dateChangeDiff, customsChangeDiff]
          .filter(Boolean)
          .join(" • ")} (อัปเดตทับงานเดิม ไม่เพิ่มแถวใหม่)`;
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
        note = "✨ งานใหม่แท้ประจำงวด (นำเข้าได้ ปลอดภัย)";
      }
    }

    parsed.push({
      id: `csv-${effectiveKey}-${i}`,
      actionType,
      jobNo: effectiveKey,
      joinNo: rawJoin && rawJoin !== effectiveKey ? rawJoin : undefined,
      fileType,
      customer:
        customer || (existsInMaster ? existing?.customer || "—" : "ลูกค้าใหม่"),
      declarationNo: declarationNo || undefined,
      invoiceNo: invoiceNo || undefined,
      status: existsInMaster
        ? existing?.status || "In Progress"
        : cStatus === "0409"
        ? "Completed"
        : "In Progress",
      customsStatus: cStatus || (existsInMaster ? existing?.customsStatus : undefined),
      etd: etd || undefined,
      eta: eta || undefined,
      submitDate: submitDate || undefined,
      containerType: cntrVal || undefined,
      grossWeight: gwVal,
      cbm: cbmVal,
      csName: csVal || undefined,
      bl: blVal || undefined,
      commodity: commVal || undefined,
      isPastOrOld,
      isBlankDummy,
      isGenuineNew,
      isDateChanged,
      isCustomsChanged,
      dateChangeDiff: isDateChanged ? dateChangeDiff : undefined,
      customsChangeDiff: isCustomsChanged ? customsChangeDiff : undefined,
      validationStatus: vStatus,
      validationNote: note,
    });
  }

  return parsed;
}
