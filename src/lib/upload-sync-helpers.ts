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
  if (incoming.linerBooking) merged.linerBooking = incoming.linerBooking;
  if (incoming.hasBlColumn) merged.hasBlColumn = true;
  if (incoming.bl && incoming.bl !== "—") merged.bl = incoming.bl;
  if (incoming.mbl && incoming.mbl !== "—") merged.mbl = incoming.mbl;
  if (incoming.hbl && incoming.hbl !== "—") merged.hbl = incoming.hbl;
  if (incoming.invoiceNo && incoming.invoiceNo !== "—") merged.invoiceNo = incoming.invoiceNo;
  if (incoming.commodity) merged.commodity = incoming.commodity;
  if (incoming.containerType) merged.containerType = incoming.containerType;
  if (incoming.grossWeight !== null && incoming.grossWeight !== undefined) {
    merged.grossWeight = incoming.grossWeight;
  }
  if (incoming.cbm !== null && incoming.cbm !== undefined) {
    merged.cbm = incoming.cbm;
  }
  if (incoming.csName && incoming.csName !== "—") merged.csName = incoming.csName;
  if (
    incoming.customer &&
    incoming.customer !== "—" &&
    incoming.customer !== "ลูกค้าใหม่"
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

import {
  buildUpdatedJob,
  buildNewJob,
} from "@/components/dashboard/staging/types";

export { buildUpdatedJob, buildNewJob };
