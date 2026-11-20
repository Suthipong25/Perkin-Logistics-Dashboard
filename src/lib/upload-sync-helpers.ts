import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { execFile } from "child_process";
import { JobRecord } from "@/types/dashboard";
import { getJobs, getTransport } from "@/lib/data-store";

/**
 * ค้นหา Path ของ Python script สำหรับรันงานประมวลผลพื้นหลังบนเครื่อง Local
 */
export function resolveScript(name: string): string {
  const local = path.resolve(process.cwd(), "scripts", name);
  if (fsSync.existsSync(local)) return local;
  return path.resolve(process.cwd(), "../backend/scripts", name);
}

/**
 * ค้นหา Path สำหรับจัดเก็บไฟล์ Snapshot สำรองข้อมูล
 */
export function resolveBackupDir(): string {
  const local = path.resolve(process.cwd(), "backups");
  if (fsSync.existsSync(local)) return local;
  const parent = path.resolve(process.cwd(), "../backups");
  if (fsSync.existsSync(parent)) return parent;
  return local;
}

/**
 * รวมข้อมูล Staging Record สองแถวที่มีเลขงานเดียวกัน (เช่น ข้อมูลจาก Sea FWD รวมกับข้อมูลจากใบขน)
 */
export function mergeStagingJobRows(prev: any, incoming: any) {
  const merged = { ...prev };

  // 1. เลขที่ใบขน: คงเลขที่ใบขนที่ถูกต้องเสมอ (ไม่ทับด้วยค่าว่างหรือคำว่า NORMAL)
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

  if (!isInvalidDecl(incoming.declarationNo)) {
    merged.declarationNo = String(incoming.declarationNo).trim();
  }

  // 2. สถานะใบขน: ขยับไปข้างหน้าเท่านั้น (0109 -> 0209 -> 0309 -> 0409) ไม่ลดระดับ
  const rank = (s?: string | null) =>
    ["0109", "0209", "0309", "0409"].indexOf(s || "");
  if (rank(incoming.customsStatus) > rank(merged.customsStatus)) {
    merged.customsStatus = incoming.customsStatus;
  }

  // 3. สถานะงาน: สถานะ Completed / Job Complete ต้องไม่ถูกลดระดับกลับเป็น Job Booking
  if (
    incoming.status === "Completed" ||
    incoming.statusDetail === "Job Complete" ||
    merged.customsStatus === "0409"
  ) {
    merged.status = "Completed";
    merged.statusDetail = "Job Complete";
    merged.hasExplicitStatus = true;
  } else if (
    merged.status !== "Completed" &&
    incoming.hasExplicitStatus &&
    incoming.status
  ) {
    merged.status = incoming.status;
    merged.statusDetail = incoming.statusDetail || merged.statusDetail;
    merged.hasExplicitStatus = true;
  }

  // 4. ข้อมูลสายเรือ/เที่ยวบิน/ตู้สินค้า: เสริมข้อมูลที่ขาดหาย
  if (incoming.vessel) merged.vessel = incoming.vessel;
  if (incoming.feeder) merged.feeder = incoming.feeder;
  if (incoming.carrier && !merged.carrier) merged.carrier = incoming.carrier;
  if (incoming.flightNo || incoming.flight)
    merged.flightNo = incoming.flightNo || incoming.flight;
  if (incoming.flightTime && incoming.flightTime !== "00:00")
    merged.flightTime = incoming.flightTime;
  if (incoming.linerBooking && !merged.linerBooking)
    merged.linerBooking = incoming.linerBooking;
  if (incoming.bl && !merged.bl) merged.bl = incoming.bl;
  if (incoming.commodity && !merged.commodity)
    merged.commodity = incoming.commodity;
  if (incoming.containerType && !merged.containerType)
    merged.containerType = incoming.containerType;
  if (incoming.grossWeight && !merged.grossWeight)
    merged.grossWeight = incoming.grossWeight;
  if (incoming.cbm && !merged.cbm) merged.cbm = incoming.cbm;
  if (incoming.csName && !merged.csName) merged.csName = incoming.csName;
  if (
    incoming.customer &&
    incoming.customer !== "—" &&
    incoming.customer !== "ลูกค้าใหม่" &&
    (!merged.customer || merged.customer === "—")
  ) {
    merged.customer = incoming.customer;
  }

  // 5. กำหนดการวันเวลา
  if (incoming.clearDate) merged.clearDate = incoming.clearDate;
  if (incoming.submitDate) merged.submitDate = incoming.submitDate;
  if (incoming.etd) merged.etd = incoming.etd;
  if (incoming.eta) merged.eta = incoming.eta;

  // 6. รวมสถานะการเปลี่ยนแปลง
  merged.isDateChanged = Boolean(merged.isDateChanged || incoming.isDateChanged);
  merged.isCustomsChanged = Boolean(
    merged.isCustomsChanged || incoming.isCustomsChanged
  );
  merged.isStatusChanged = Boolean(
    merged.isStatusChanged || incoming.isStatusChanged
  );
  merged.isChanged = Boolean(
    merged.isChanged ||
      incoming.isChanged ||
      merged.isDateChanged ||
      merged.isCustomsChanged ||
      merged.isStatusChanged
  );
  if (incoming.fileType === "customs") merged.fileType = "customs";

  const diffSet = new Set<string>();
  if (merged.dateChangeDiff)
    merged.dateChangeDiff
      .split(" • ")
      .forEach((d: string) => diffSet.add(d.trim()));
  if (incoming.dateChangeDiff)
    incoming.dateChangeDiff
      .split(" • ")
      .forEach((d: string) => diffSet.add(d.trim()));
  merged.dateChangeDiff = Array.from(diffSet).filter(Boolean).join(" • ");

  if (merged.actionType === "update" && merged.dateChangeDiff) {
    merged.validationNote = `🔄 อัปเดตข้อมูล: ${merged.dateChangeDiff} (อัปเดตทับงานเดิม ไม่เพิ่มแถว)`;
  }

  return merged;
}

/**
 * อัปเดตข้อมูลงานชิปเมนท์ลงไฟล์ Mirror บนเครื่อง Local (data/jobs.json) พร้อมสำรองข้อมูล snapshot
 */
export async function syncJobsToLocalMirror(
  jobsToUpsert: JobRecord[],
  options?: { fullReplace?: boolean; createSnapshot?: boolean }
): Promise<number> {
  const jobsPath = path.resolve(process.cwd(), "data/jobs.json");
  let mergedLocalJobs: JobRecord[];

  if (options?.fullReplace) {
    mergedLocalJobs = jobsToUpsert;
  } else {
    const existingLocal = getJobs();
    const byKey = new Map<string, number>();
    mergedLocalJobs = [...existingLocal];

    mergedLocalJobs.forEach((j, idx) => {
      if (j.id) byKey.set(`ID:${j.id}`, idx);
      if (j.jobNo) byKey.set(`NO:${j.jobNo.trim().toUpperCase()}`, idx);
    });

    for (const dj of jobsToUpsert) {
      const idxById = dj.id ? byKey.get(`ID:${dj.id}`) : undefined;
      const idxByNo = dj.jobNo
        ? byKey.get(`NO:${dj.jobNo.trim().toUpperCase()}`)
        : undefined;
      const targetIdx = idxById ?? idxByNo;

      if (targetIdx !== undefined) {
        mergedLocalJobs[targetIdx] = dj;
      } else {
        mergedLocalJobs.push(dj);
      }
    }
  }

  if (options?.createSnapshot) {
    const backupDir = resolveBackupDir();
    await fs.mkdir(backupDir, { recursive: true }).catch(() => {});
    const backupPath = path.join(
      backupDir,
      `snapshot_${Date.now()}_jobs_applied.json`
    );
    await fs.copyFile(jobsPath, backupPath).catch(() => {});
  }

  const tmpPath = path.resolve(
    process.cwd(),
    `data/jobs.json.tmp.${Date.now()}`
  );
  await fs.writeFile(tmpPath, JSON.stringify(mergedLocalJobs, null, 1), "utf-8");
  await fs.rename(tmpPath, jobsPath);

  // Trigger SQLite local sync if available
  const sqliteScript = resolveScript("sqlite_db.py");
  const pythonExe = process.env.PYTHON_PATH || "python";
  if (fsSync.existsSync(sqliteScript)) {
    execFile(pythonExe, [sqliteScript], () => {});
  }

  return mergedLocalJobs.length;
}

/**
 * อัปเดตข้อมูลเที่ยวรถลงไฟล์ Mirror บนเครื่อง Local (data/transport.json) พร้อมสำรองข้อมูล snapshot
 */
export async function syncTransportToLocalMirror(
  tripsToUpsert: any[],
  options?: { createSnapshot?: boolean }
): Promise<void> {
  const transportPath = path.resolve(process.cwd(), "data/transport.json");
  const existingTrans = getTransport();
  const transMap = new Map<string, any>();

  existingTrans.forEach((t) => {
    const k = (t.tripNo || t.transportNo || "").trim().toUpperCase();
    if (k) transMap.set(k, { ...t });
  });

  for (const t of tripsToUpsert) {
    const k = (t.tripNo || t.transportNo || "").trim().toUpperCase();
    if (k) {
      const ex = transMap.get(k);
      if (ex) Object.assign(ex, t);
      else transMap.set(k, t);
    }
  }

  const mergedTransport = Array.from(transMap.values());

  if (options?.createSnapshot) {
    const backupDir = resolveBackupDir();
    await fs.mkdir(backupDir, { recursive: true }).catch(() => {});
    const backupPath = path.join(
      backupDir,
      `snapshot_${Date.now()}_transport_applied.json`
    );
    await fs.copyFile(transportPath, backupPath).catch(() => {});
  }

  const tmpPath = path.resolve(
    process.cwd(),
    `data/transport.json.tmp.${Date.now()}`
  );
  await fs.writeFile(tmpPath, JSON.stringify(mergedTransport, null, 2), "utf-8");
  await fs.rename(tmpPath, transportPath);

  // Trigger SQLite local sync if available
  const sqliteScript = resolveScript("sqlite_db.py");
  const pythonExe = process.env.PYTHON_PATH || "python";
  if (fsSync.existsSync(sqliteScript)) {
    execFile(pythonExe, [sqliteScript], () => {});
  }
}

/**
 * แปลง Staging Record และผสานลงใน Job เดิมที่มีอยู่
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
  if (stg.carrier && !updated.carrier) updated.carrier = stg.carrier;
  if (stg.bl && (!updated.bl || updated.bl === "—")) updated.bl = stg.bl;
  if (stg.csName && (!updated.csName || updated.csName === "—"))
    updated.csName = stg.csName;
  if (
    stg.customer &&
    stg.customer !== "—" &&
    (!updated.customer ||
      updated.customer === "—" ||
      updated.customer === "ลูกค้าใหม่")
  ) {
    updated.customer = stg.customer;
  }
  if (stg.commodity && !updated.commodity) updated.commodity = stg.commodity;
  if (stg.containerType && !updated.containerType)
    updated.containerType = stg.containerType;
  if (stg.grossWeight && !updated.grossWeight)
    updated.grossWeight = stg.grossWeight;
  if (stg.cbm && !updated.cbm) updated.cbm = stg.cbm;

  if (stg.isStatusChanged && stg.hasExplicitStatus && stg.status) {
    updated.status = stg.status;
    if (stg.statusDetail) updated.statusDetail = stg.statusDetail;
    if (stg.statusRaw) updated.statusRaw = stg.statusRaw;
  }

  if (stg.customsStatus) {
    updated.customsStatus = stg.customsStatus;
    if (stg.customsStatus === "0409") {
      updated.cleared = true;
      updated.doReleased = true;
      updated.status = "Completed";
      updated.statusDetail = "Job Complete";
      updated.nextAction = "นำส่งสินค้าเรียบร้อย";
    }
  }

  if (stg.declarationNo) {
    updated.declarationNo = stg.declarationNo;
    updated.draftCustoms = true;
    updated.customsFiled = true;
    if (!updated.customsDate)
      updated.customsDate = stg.submitDate || stg.clearDate || null;
  }

  return updated;
}

/**
 * สร้าง JobRecord ใหม่จาก Staging Record
 */
export function buildNewJob(stg: any, currentTotalJobs: number): JobRecord {
  const isExp = /^(SH)?(SE|AE)/i.test(stg.jobNo);
  const isAir = /^(SH)?(AE|AI)/i.test(stg.jobNo);
  const isTrans = /^(SH)?(TS|SHT)/i.test(stg.jobNo);
  const svc = isTrans
    ? "Transport"
    : isAir
    ? isExp
      ? "AIR Export"
      : "AIR Import"
    : isExp
    ? "SEA Export"
    : "SEA Import";

  const finalDate = isExp
    ? stg.etd || stg.submitDate || stg.eta
    : stg.eta || stg.submitDate || stg.etd;
  const opMonth = finalDate ? finalDate.slice(0, 7) : "2026-11";
  const isDone = stg.status === "Completed" || stg.customsStatus === "0409";

  return {
    id: `Upload_${opMonth}_${stg.jobNo}`,
    jobNo: stg.jobNo,
    joinNo: stg.joinNo || undefined,
    service: svc,
    serviceLabel: svc,
    status: isDone ? "Completed" : stg.status || "In Progress",
    statusDetail: isDone ? "Job Complete" : stg.statusDetail || "Job Control",
    statusRaw: stg.statusRaw || (isDone ? "Job Complete" : "Job Control"),
    customer: stg.customer || "—",
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
    jobDate: finalDate || null,
    draftCustoms:
      isDone || Boolean(stg.declarationNo) || Boolean(stg.customsStatus),
    customsFiled: isDone || Boolean(stg.declarationNo),
    doReleased: isDone,
    cleared: isDone,
    advanceDoc: false,
    draftDate: null,
    customsDate: stg.submitDate || null,
    doDate: null,
    clearDate: stg.clearDate || null,
    advanceDate: null,
    sourceRow: currentTotalJobs + 1,
    customsStatus: stg.customsStatus || null,
    csName: stg.csName || "",
    containerType: stg.containerType || undefined,
    grossWeight: stg.grossWeight ?? undefined,
    cbm: stg.cbm ?? undefined,
    commodity: stg.commodity || undefined,
    nextAction: isDone ? "นำส่งสินค้าเรียบร้อย" : "ตรวจปล่อยสินค้า",
  };
}
