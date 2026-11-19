/**
 * ============================================================================
 * API Route: POST /api/uploads (Enhanced Multi-File & Smart Sync Engine)
 * ============================================================================
 * รองรับการทำงาน:
 *   1. JSON { action: "smart_sync", deltaJobs, trips }
 *      - บันทึกทั้งงานขนส่งหลักและเที่ยวรถพร้อมกันในคราวเดียว (One-Click Sync)
 *      - ส่งเฉพาะ deltaJobs และ trips ที่เปลี่ยนแปลงจริงไปยัง Supabase PostgreSQL
 *   2. JSON { action: "apply", deltaJobs | jobs } & { action: "apply_transport", trips }
 *      - คงไว้เพื่อรองรับระบบเดิม (Backward Compatibility)
 *   3. multipart/form-data
 *      - รองรับการอัปโหลด "หลายไฟล์พร้อมกัน" (Multi-File Drop):
 *        เช่น โยน examination_delivery + receiptreport + reportexport พร้อมกัน
 *      - รองรับ ?autoApply=true เพื่ออ่านและซิงค์บันทึกทับใน Supabase ทันที ไม่ต้องกดยืนยันหลายรอบ
 *      - ทำงานใน Memory 100% ไม่สร้าง temp file ใน /var/task ปลอดภัยบน Vercel Serverless
 * ============================================================================
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";
import { getJobs, getTransport } from "@/lib/data-store";
import {
  fetchJobsFromPostgres,
  fetchTransportFromPostgres,
  upsertJobsToPostgres,
  upsertTransportToPostgres,
} from "@/lib/db";
import { parseUploadedExcelBuffer, stripModeSuffix } from "@/lib/excel-parser";
import { JobRecord, TransportRecord } from "@/types/dashboard";

const execFileAsync = promisify(execFile);
export const dynamic = "force-dynamic";

const IS_VERCEL = Boolean(process.env.VERCEL);

function resolveScript(name: string): string {
  const local = path.resolve(process.cwd(), "scripts", name);
  if (fsSync.existsSync(local)) return local;
  return path.resolve(process.cwd(), "../backend/scripts", name);
}

function resolveBackupDir(): string {
  const local = path.resolve(process.cwd(), "backups");
  if (fsSync.existsSync(local)) return local;
  const parent = path.resolve(process.cwd(), "../backups");
  if (fsSync.existsSync(parent)) return parent;
  return local;
}

async function getCurrentJobs(): Promise<JobRecord[]> {
  const pgJobs = await fetchJobsFromPostgres();
  if (pgJobs && pgJobs.length > 0) return pgJobs;
  return getJobs();
}

async function getCurrentTransport(): Promise<TransportRecord[]> {
  const pgTransport = await fetchTransportFromPostgres();
  if (pgTransport && pgTransport.length > 0) return pgTransport;
  return getTransport();
}

/**
 * รวมข้อมูลงานระหว่างหลายไฟล์แบบแม่นยำสูง (Multi-File Intelligent Merge)
 * ป้องกันไฟล์ FWD เขียนทับข้อมูลใบขนของ Customs หรือสถานะเสร็จสิ้น
 */
function mergeStagingJobRows(prev: any, incoming: any) {
  const merged = { ...prev };

  // 1. เลขที่ใบขน: คงเลขที่ใบขนที่ถูกต้องเสมอ (ไม่ทับด้วยค่าว่างหรือคำว่า NORMAL)
  const isInvalidDecl = (d?: string | null) =>
    !d || ["-", "—", "N/A", "NONE", "NULL", "NORMAL", "GENERAL", "IMPORT", "EXPORT", "TRANSIT", "RE-EXPORT"].includes(String(d).trim().toUpperCase());
  if (!isInvalidDecl(incoming.declarationNo)) {
    merged.declarationNo = String(incoming.declarationNo).trim();
  }

  // 2. สถานะใบขน: ขยับไปข้างหน้าเท่านั้น (0109 -> 0209 -> 0309 -> 0409) ไม่ลดระดับ
  const rank = (s?: string | null) => ["0109", "0209", "0309", "0409"].indexOf(s || "");
  if (rank(incoming.customsStatus) > rank(merged.customsStatus)) {
    merged.customsStatus = incoming.customsStatus;
  }

  // 3. สถานะงาน: สถานะ Completed / Job Complete ต้องไม่ถูกลดระดับกลับเป็น Job Booking
  if (incoming.status === "Completed" || incoming.statusDetail === "Job Complete" || merged.customsStatus === "0409") {
    merged.status = "Completed";
    merged.statusDetail = "Job Complete";
    merged.hasExplicitStatus = true;
  } else if (merged.status !== "Completed" && incoming.hasExplicitStatus && incoming.status) {
    merged.status = incoming.status;
    merged.statusDetail = incoming.statusDetail || merged.statusDetail;
    merged.hasExplicitStatus = true;
  }

  // 4. ข้อมูลสายเรือ/เที่ยวบิน/ตู้สินค้า: เสริมข้อมูลที่ขาดหาย
  if (incoming.vessel) merged.vessel = incoming.vessel;
  if (incoming.feeder) merged.feeder = incoming.feeder;
  if (incoming.carrier && !merged.carrier) merged.carrier = incoming.carrier;
  if (incoming.flightNo || incoming.flight) merged.flightNo = incoming.flightNo || incoming.flight;
  if (incoming.flightTime && incoming.flightTime !== "00:00") merged.flightTime = incoming.flightTime;
  if (incoming.linerBooking && !merged.linerBooking) merged.linerBooking = incoming.linerBooking;
  if (incoming.bl && !merged.bl) merged.bl = incoming.bl;
  if (incoming.commodity && !merged.commodity) merged.commodity = incoming.commodity;
  if (incoming.containerType && !merged.containerType) merged.containerType = incoming.containerType;
  if (incoming.grossWeight && !merged.grossWeight) merged.grossWeight = incoming.grossWeight;
  if (incoming.cbm && !merged.cbm) merged.cbm = incoming.cbm;
  if (incoming.csName && !merged.csName) merged.csName = incoming.csName;
  if (incoming.customer && incoming.customer !== "—" && incoming.customer !== "ลูกค้าใหม่" && (!merged.customer || merged.customer === "—")) {
    merged.customer = incoming.customer;
  }

  // 5. กำหนดการวันเวลา
  if (incoming.clearDate) merged.clearDate = incoming.clearDate;
  if (incoming.submitDate) merged.submitDate = incoming.submitDate;
  if (incoming.etd) merged.etd = incoming.etd;
  if (incoming.eta) merged.eta = incoming.eta;

  // 6. รวมสถานะการเปลี่ยนแปลง
  merged.isDateChanged = Boolean(merged.isDateChanged || incoming.isDateChanged);
  merged.isCustomsChanged = Boolean(merged.isCustomsChanged || incoming.isCustomsChanged);
  merged.isStatusChanged = Boolean(merged.isStatusChanged || incoming.isStatusChanged);
  merged.isChanged = Boolean(
    merged.isChanged ||
    incoming.isChanged ||
    merged.isDateChanged ||
    merged.isCustomsChanged ||
    merged.isStatusChanged
  );
  if (incoming.fileType === "customs") merged.fileType = "customs";

  const diffSet = new Set<string>();
  if (merged.dateChangeDiff) merged.dateChangeDiff.split(" • ").forEach((d: string) => diffSet.add(d.trim()));
  if (incoming.dateChangeDiff) incoming.dateChangeDiff.split(" • ").forEach((d: string) => diffSet.add(d.trim()));
  merged.dateChangeDiff = Array.from(diffSet).filter(Boolean).join(" • ");

  if (merged.actionType === "update" && merged.dateChangeDiff) {
    merged.validationNote = `🔄 อัปเดตข้อมูล: ${merged.dateChangeDiff} (อัปเดตทับงานเดิม ไม่เพิ่มแถว)`;
  }

  return merged;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();

      // Case 1: Smart Sync (บันทึกทั้งงานขนส่งหลักและเที่ยวรถพร้อมกันในคราวเดียว)
      if (body.action === "smart_sync") {
        const deltaJobs: JobRecord[] = Array.isArray(body.deltaJobs)
          ? body.deltaJobs
          : Array.isArray(body.jobs)
          ? body.jobs
          : [];
        const tripsToUpsert: any[] = Array.isArray(body.trips) ? body.trips : [];

        let jobsUpdated = 0;
        let transportUpdated = 0;

        if (deltaJobs.length > 0) {
          const pgRes = await upsertJobsToPostgres(deltaJobs);
          if (!pgRes.success && IS_VERCEL) {
            return NextResponse.json(
              {
                ok: false,
                error: `ไม่สามารถบันทึกงานลง PostgreSQL ได้: ${pgRes.error || "Unknown DB error"}`,
              },
              { status: 500 }
            );
          }
          jobsUpdated = deltaJobs.length;
        }

        if (tripsToUpsert.length > 0) {
          const pgTransRes = await upsertTransportToPostgres(tripsToUpsert);
          if (!pgTransRes.success && IS_VERCEL) {
            return NextResponse.json(
              {
                ok: false,
                error: `ไม่สามารถบันทึกเที่ยวรถลง PostgreSQL ได้: ${pgTransRes.error || "Unknown DB error"}`,
              },
              { status: 500 }
            );
          }
          transportUpdated = tripsToUpsert.length;
        }

        // Local Mirror (ทำเฉพาะเครื่อง Local ไม่ทำบน Vercel Read-Only FS)
        if (!IS_VERCEL) {
          try {
            if (deltaJobs.length > 0) {
              const jobsPath = path.resolve(process.cwd(), "data/jobs.json");
              const existingLocal = getJobs();
              const byKey = new Map<string, number>();
              const mergedLocalJobs = [...existingLocal];
              mergedLocalJobs.forEach((j, idx) => {
                if (j.id) byKey.set(`ID:${j.id}`, idx);
                if (j.jobNo) byKey.set(`NO:${j.jobNo.trim().toUpperCase()}`, idx);
              });
              for (const dj of deltaJobs) {
                const idxById = dj.id ? byKey.get(`ID:${dj.id}`) : undefined;
                const idxByNo = dj.jobNo
                  ? byKey.get(`NO:${dj.jobNo.trim().toUpperCase()}`)
                  : undefined;
                const targetIdx = idxById ?? idxByNo;
                if (targetIdx !== undefined) mergedLocalJobs[targetIdx] = dj;
                else mergedLocalJobs.push(dj);
              }
              await fs.writeFile(
                jobsPath,
                JSON.stringify(mergedLocalJobs, null, 1),
                "utf-8"
              );
            }

            if (tripsToUpsert.length > 0) {
              const transportPath = path.resolve(process.cwd(), "data/transport.json");
              const existingTrans = getTransport();
              const transMap = new Map<string, any>();
              existingTrans.forEach((t) => {
                const k = (t.tripNo || t.transportNo || "").trim().toUpperCase();
                if (k) transMap.set(k, t);
              });
              for (const t of tripsToUpsert) {
                const k = (t.tripNo || t.transportNo || "").trim().toUpperCase();
                if (k) {
                  const ex = transMap.get(k);
                  if (ex) Object.assign(ex, t);
                  else transMap.set(k, t);
                }
              }
              await fs.writeFile(
                transportPath,
                JSON.stringify(Array.from(transMap.values()), null, 2),
                "utf-8"
              );
            }
          } catch (mirrorErr) {
            console.warn("[UPLOAD] Local mirror sync warning:", mirrorErr);
          }
        }

        const freshJobs = await getCurrentJobs();
        const freshTransport = await getCurrentTransport();

        return NextResponse.json({
          ok: true,
          saved: true,
          smartSync: true,
          jobsUpdated,
          transportUpdated,
          totalJobs: freshJobs.length,
          totalTransport: freshTransport.length,
          jobs: freshJobs,
          transport: freshTransport,
          message: `ซิงค์และบันทึกข้อมูลเรียบร้อย! อัปเดตงาน ${jobsUpdated} รายการ และเที่ยวรถ ${transportUpdated} รายการลง Supabase PostgreSQL แล้ว`,
        });
      }

      // Case 2: Apply Jobs (เดี่ยว)
      if (
        body.action === "apply" &&
        (Array.isArray(body.deltaJobs) || Array.isArray(body.jobs))
      ) {
        const deltaJobs: JobRecord[] | null = Array.isArray(body.deltaJobs)
          ? body.deltaJobs
          : null;
        const fullJobs: JobRecord[] | null = Array.isArray(body.jobs)
          ? body.jobs
          : null;
        const jobsToUpsert = deltaJobs ?? fullJobs ?? [];

        const pgResult = await upsertJobsToPostgres(jobsToUpsert);
        if (!pgResult.success && IS_VERCEL) {
          return NextResponse.json(
            {
              ok: false,
              error: `ไม่สามารถบันทึกลงฐานข้อมูล PostgreSQL ได้: ${pgResult.error || "Unknown DB error"}`,
            },
            { status: 500 }
          );
        }

        let finalTotalJobs = fullJobs?.length ?? jobsToUpsert.length;
        if (!IS_VERCEL) {
          try {
            const jobsPath = path.resolve(process.cwd(), "data/jobs.json");
            let mergedLocalJobs: JobRecord[];

            if (fullJobs) {
              mergedLocalJobs = fullJobs;
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
            finalTotalJobs = mergedLocalJobs.length;

            const backupDir = resolveBackupDir();
            await fs.mkdir(backupDir, { recursive: true }).catch(() => {});
            const backupPath = path.join(
              backupDir,
              `snapshot_${Date.now()}_jobs_applied.json`
            );
            await fs.copyFile(jobsPath, backupPath).catch(() => {});

            const tmpPath = path.resolve(
              process.cwd(),
              `data/jobs.json.tmp.${Date.now()}`
            );
            await fs.writeFile(
              tmpPath,
              JSON.stringify(mergedLocalJobs, null, 1),
              "utf-8"
            );
            await fs.rename(tmpPath, jobsPath);

            const sqliteScript = resolveScript("sqlite_db.py");
            const pythonExe = process.env.PYTHON_PATH || "python";
            if (fsSync.existsSync(sqliteScript)) {
              execFile(pythonExe, [sqliteScript], () => {});
            }
          } catch (localErr) {
            console.warn("[UPLOAD] Local jobs mirror warning:", localErr);
          }
        }

        const freshJobs = await getCurrentJobs();
        return NextResponse.json({
          ok: true,
          saved: true,
          totalJobs: freshJobs.length,
          upsertedJobs: jobsToUpsert.length,
          jobs: freshJobs,
          message: `บันทึกข้อมูล ${jobsToUpsert.length} รายการลงระบบและ PostgreSQL เรียบร้อยแล้ว`,
        });
      }

      // Case 3: Apply Transport (เดี่ยว)
      if (body.action === "apply_transport" && Array.isArray(body.trips)) {
        const existingTransport = await getCurrentTransport();

        const map = new Map<string, any>();
        for (const t of existingTransport) {
          const key = (t.tripNo || t.transportNo || "").trim().toUpperCase();
          if (key) map.set(key, { ...t });
        }

        let added = 0;
        let updated = 0;
        const tripsToUpsert: any[] = [];
        for (const trip of body.trips) {
          const key = (trip.tripNo || trip.transportNo || "").trim().toUpperCase();
          if (!key) continue;
          if (map.has(key)) {
            const ex = map.get(key);
            Object.assign(ex, trip);
            tripsToUpsert.push(ex);
            updated++;
          } else {
            map.set(key, trip);
            tripsToUpsert.push(trip);
            added++;
          }
        }

        const mergedTransport = Array.from(map.values());

        const pgResult = await upsertTransportToPostgres(tripsToUpsert);
        if (!pgResult.success && IS_VERCEL) {
          return NextResponse.json(
            {
              ok: false,
              error: `ไม่สามารถบันทึกเที่ยวรถลง PostgreSQL ได้: ${pgResult.error || "Unknown DB error"}`,
            },
            { status: 500 }
          );
        }

        if (!IS_VERCEL) {
          try {
            const transportPath = path.resolve(process.cwd(), "data/transport.json");
            const backupDir = resolveBackupDir();
            await fs.mkdir(backupDir, { recursive: true }).catch(() => {});
            const backupPath = path.join(
              backupDir,
              `snapshot_${Date.now()}_transport_applied.json`
            );
            await fs.copyFile(transportPath, backupPath).catch(() => {});

            const tmpPath = path.resolve(
              process.cwd(),
              `data/transport.json.tmp.${Date.now()}`
            );
            await fs.writeFile(
              tmpPath,
              JSON.stringify(mergedTransport, null, 2),
              "utf-8"
            );
            await fs.rename(tmpPath, transportPath);

            const sqliteScript = resolveScript("sqlite_db.py");
            const pythonExe = process.env.PYTHON_PATH || "python";
            if (fsSync.existsSync(sqliteScript)) {
              execFile(pythonExe, [sqliteScript], () => {});
            }
          } catch (localErr) {
            console.warn("[UPLOAD] Local transport mirror warning:", localErr);
          }
        }

        const currentJobs = await getCurrentJobs();
        const currentTransport = await getCurrentTransport();

        return NextResponse.json({
          ok: true,
          saved: true,
          totalTransport: currentTransport.length,
          addedTrips: added,
          updatedTrips: updated,
          transport: currentTransport,
          jobs: currentJobs,
          message: `นำเข้าเที่ยวรถสำเร็จ ${added} เที่ยวใหม่ / อัปเดต ${updated} เที่ยว (ยอดรวม ${currentTransport.length} เที่ยว) ลงระบบและ PostgreSQL เรียบร้อยแล้ว`,
        });
      }
    }

    // Case 4: File Upload (Multi-file Drop & Auto-Classification)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const directFiles = formData.getAll("files");
      const singleFiles = formData.getAll("file");
      const rawFileList: File[] = [];

      for (const item of [...directFiles, ...singleFiles]) {
        if (item instanceof File && item.size > 0 && !rawFileList.some((f) => f.name === item.name)) {
          rawFileList.push(item);
        }
      }

      if (rawFileList.length === 0) {
        return NextResponse.json(
          { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด" },
          { status: 400 }
        );
      }

      const autoApply = formData.get("autoApply") === "true";
      const existingJobs = await getCurrentJobs();
      const existingTransport = await getCurrentTransport();

      const existingTransMap = new Map<string, any>();
      existingTransport.forEach((t) => {
        const key = (t.tripNo || t.transportNo || "").trim().toUpperCase();
        if (key) existingTransMap.set(key, t);
      });

      const existingJobMap = new Map<string, JobRecord>();
      existingJobs.forEach((j) => {
        if (j.jobNo) existingJobMap.set(j.jobNo.trim().toUpperCase(), j);
        if (j.joinNo) {
          const jn = j.joinNo.trim().toUpperCase().replace(/\s*\((SEA|AIR)\)\s*$/i, "").trim();
          if (jn) existingJobMap.set(jn, j);
        }
      });

      const fileResults: Array<{
        name: string;
        fileType: string;
        fileTypeLabel: string;
        isTransport: boolean;
        totalRows: number;
        actionableCount: number;
      }> = [];

      const combinedTripsMap = new Map<string, any>();
      const combinedJobsMap = new Map<string, any>();
      const joinToPrimaryMap = new Map<string, string>();

      for (const file of rawFileList) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileNameLower = file.name.toLowerCase();

        const isBookingMaster =
          fileNameLower.endsWith(".xlsx") &&
          (fileNameLower.includes("booking report") || buffer.length > 2 * 1024 * 1024);
        const isTransportMaster =
          fileNameLower.endsWith(".xlsx") && fileNameLower.includes("job_daily");

        if (isBookingMaster || isTransportMaster) {
          if (IS_VERCEL) {
            return NextResponse.json(
              {
                ok: false,
                error:
                  "ไฟล์ Master ขนาดใหญ่ (2026 Booking Report / JOB_Daily) กรุณาซิงค์ผ่านเครื่อง Local ส่วนไฟล์รายงานประจำวัน (.xls/.xlsx/.csv) รองรับบนเว็บ Production นี้ได้ทันทีครับ",
              },
              { status: 400 }
            );
          }
          // On Local machine: allow master pipeline sync
          const tmpDir = path.join(os.tmpdir(), "perkin-uploads");
          await fs.mkdir(tmpDir, { recursive: true });
          const tempPath = path.join(tmpDir, `${Date.now()}_${file.name}`);
          await fs.writeFile(tempPath, buffer);

          const pythonExe = process.env.PYTHON_PATH || "python";
          const pipelineScript = resolveScript("standardize_pipeline.py");
          if (fsSync.existsSync(pipelineScript)) {
            await execFileAsync(pythonExe, [pipelineScript]);
          }
          await fs.unlink(tempPath).catch(() => {});
          const freshJobs = getJobs();
          const freshTransport = getTransport();
          await upsertJobsToPostgres(freshJobs).catch(() => {});
          await upsertTransportToPostgres(freshTransport).catch(() => {});

          return NextResponse.json({
            ok: true,
            directApplied: true,
            fileName: file.name,
            totalJobs: freshJobs.length,
            totalTransport: freshTransport.length,
            jobs: freshJobs,
            transport: freshTransport,
            message: `อัปเดตไฟล์ Master สำเร็จ! พบข้อมูล ${freshJobs.length} งาน และ ${freshTransport.length} เที่ยวรถ`,
          });
        }

        // Daily / Departmental reports
        const parsed = parseUploadedExcelBuffer(buffer, file.name, existingJobs);
        if (!parsed.ok) continue;

        if (parsed.isTransport && Array.isArray(parsed.transportTrips)) {
          let actionableTrips = 0;
          for (const rawT of parsed.transportTrips) {
            const t = rawT as any;
            const tripKey = String(t.tripNo || t.transportNo || "").trim().toUpperCase();
            if (!tripKey) continue;
            const existingTrip = existingTransMap.get(tripKey);
            const exists = Boolean(existingTrip);

            const normD = (d: any) => (d ? String(d).trim().slice(0, 10) : "");
            const incDeliver = normD(t.deliver || t.deliverDate);
            const exDeliver = normD(existingTrip?.deliver || existingTrip?.deliverDate);
            const incPickup = normD(t.pickupDate);
            const exPickup = normD(existingTrip?.pickupDate);

            const transDiffs: string[] = [];
            if (incDeliver && incDeliver !== exDeliver) {
              transDiffs.push(`ส่งมอบ: ${exDeliver || "-"} ➔ ${incDeliver}`);
            }
            if (incPickup && incPickup !== exPickup) {
              transDiffs.push(`รับตู้: ${exPickup || "-"} ➔ ${incPickup}`);
            }
            const exDriver = String(existingTrip?.driverName || existingTrip?.driver || existingTrip?.driver_name || "").trim();
            const incDriver = String(t.driverName || t.driver || "").trim();
            const isDriverChanged = Boolean(exists && incDriver && incDriver !== exDriver);
            if (isDriverChanged) {
              transDiffs.push(`คนขับ: ${exDriver || "-"} ➔ ${incDriver}`);
            }

            const exPlate = String(existingTrip?.plateNo || existingTrip?.plate_no || "").trim();
            const incPlate = String(t.plateNo || "").trim();
            const isPlateChanged = Boolean(exists && incPlate && incPlate !== exPlate);
            if (isPlateChanged) {
              transDiffs.push(`ทะเบียน: ${exPlate || "-"} ➔ ${incPlate}`);
            }

            const isDateChanged = exists && transDiffs.length > 0;
            const isActionable = !exists || isDateChanged;
            if (isActionable) actionableTrips++;

            const linkedJobClean = String(t.jobNo || "").trim().toUpperCase();
            const hasLinkedJob = Boolean(linkedJobClean && existingJobMap.has(linkedJobClean));

            const enriched = {
              ...t,
              id: `trans-${tripKey}`,
              actionType: exists ? "update" : "new",
              isNew: !exists,
              isDateChanged,
              isDriverChanged,
              isPlateChanged,
              oldDeliverDate: exDeliver || null,
              dateChangeDiff: transDiffs.join(" • "),
              hasLinkedJob,
              validationStatus: "valid",
              validationNote: !exists
                ? hasLinkedJob
                  ? `เที่ยวรถใหม่ • ผูกกับ Job ${linkedJobClean}`
                  : "เที่ยวรถใหม่ • ขนส่งทั่วไป"
                : isDateChanged
                ? `🔄 อัปเดตข้อมูล: ${transDiffs.join(" • ")}`
                : "⚪ เที่ยวเดิมในระบบ (ข้อมูลตรงกัน)",
            };

            combinedTripsMap.set(tripKey, enriched);
          }

          fileResults.push({
            name: file.name,
            fileType: "transport",
            fileTypeLabel: "รายงานการจองรถขนส่ง (Inland Transport)",
            isTransport: true,
            totalRows: parsed.transportTrips.length,
            actionableCount: actionableTrips,
          });
        } else if (Array.isArray(parsed.rows)) {
          let actionableJobs = 0;
          for (const rawR of parsed.rows) {
            const r = rawR as any;
            const rawKey = stripModeSuffix(String(r.jobNo || ""));
            const rawJoin = stripModeSuffix(String(r.joinNo || ""));
            if (!rawKey && !rawJoin) continue;

            const existing =
              (rawKey ? existingJobMap.get(rawKey) : undefined) ||
              (rawJoin ? existingJobMap.get(rawJoin) : undefined);
            const exists = Boolean(existing);

            const canonicalKey = existing
              ? stripModeSuffix(existing.jobNo)
              : (rawKey && joinToPrimaryMap.get(rawKey)) ||
                (rawJoin && joinToPrimaryMap.get(rawJoin)) ||
                rawKey ||
                rawJoin;

            if (rawKey) joinToPrimaryMap.set(rawKey, canonicalKey);
            if (rawJoin) joinToPrimaryMap.set(rawJoin, canonicalKey);

            const isExp = /^(SH)?(SE|AE)/i.test(canonicalKey);
            const opDate = isExp
              ? String(r.etd || r.submitDate || r.eta || "")
              : String(r.eta || r.submitDate || r.etd || "");

            const isPastOrOld = !exists && Boolean(opDate && opDate < "2026-11-01");
            const isBlankDummy = !exists && !r.containerType && !r.grossWeight && !r.bl && !r.commodity;
            const isGenuineNew = !exists && !isPastOrOld && !isBlankDummy;

            const isActionable =
              isGenuineNew ||
              (exists && (Boolean(r.isDateChanged) || Boolean(r.isStatusChanged) || Boolean(r.isCustomsChanged) || Boolean(r.isChanged)));
            if (isActionable) actionableJobs++;

            const currentStg = {
              ...r,
              jobNo: canonicalKey,
              joinNo: rawJoin && rawJoin !== canonicalKey ? rawJoin : (rawKey !== canonicalKey ? rawKey : r.joinNo || ""),
              fileType: parsed.fileType || "fwd",
              isPastOrOld,
              isBlankDummy,
              isGenuineNew,
            };

            if (combinedJobsMap.has(canonicalKey)) {
              combinedJobsMap.set(canonicalKey, mergeStagingJobRows(combinedJobsMap.get(canonicalKey), currentStg));
            } else {
              combinedJobsMap.set(canonicalKey, currentStg);
            }
          }

          fileResults.push({
            name: file.name,
            fileType: parsed.fileType || "fwd",
            fileTypeLabel: parsed.fileTypeLabel || "รายงานการขนส่ง",
            isTransport: false,
            totalRows: parsed.rows.length,
            actionableCount: actionableJobs,
          });
        }
      }

      // ตรวจสอบความเชื่อมโยงเที่ยวรถขนส่งกับ Job ขนส่งหลักอีกครั้งแบบ Order-Independent
      combinedTripsMap.forEach((trip) => {
        const linkedJobClean = stripModeSuffix(String(trip.jobNo || ""));
        if (linkedJobClean && (existingJobMap.has(linkedJobClean) || combinedJobsMap.has(linkedJobClean))) {
          trip.hasLinkedJob = true;
          if (trip.validationNote.includes("ขนส่งทั่วไป")) {
            trip.validationNote = `เที่ยวรถใหม่ • ผูกกับ Job ${linkedJobClean}`;
          }
        }
      });

      const allTransportTrips = Array.from(combinedTripsMap.values());
      const allJobRows = Array.from(combinedJobsMap.values());

      // If Auto-Apply is requested: save immediately without waiting for preview
      if (autoApply) {
        const actionableJobsToApply: JobRecord[] = [];
        for (const stg of allJobRows) {
          if (stg.actionType === "update" && (stg.isDateChanged || stg.isStatusChanged || stg.isCustomsChanged || stg.isChanged)) {
            const existing = existingJobMap.get(stg.jobNo.toUpperCase());
            if (existing) {
              const updated = { ...existing };
              if (stg.etd) updated.etd = stg.etd;
              if (stg.eta) updated.eta = stg.eta;
              if (stg.clearDate) updated.clearDate = stg.clearDate;
              if (stg.flightTime) updated.flightTime = stg.flightTime;
              if (stg.vessel) updated.vessel = stg.vessel;
              if (stg.feeder) updated.feeder = stg.feeder;
              if (stg.flightNo || stg.flight) (updated as any).flightNo = stg.flightNo || stg.flight;
              if (stg.carrier && !updated.carrier) updated.carrier = stg.carrier;
              if (stg.bl && (!updated.bl || updated.bl === "—")) updated.bl = stg.bl;
              if (stg.csName && (!updated.csName || updated.csName === "—")) updated.csName = stg.csName;
              if (stg.customer && stg.customer !== "—" && (!updated.customer || updated.customer === "—" || updated.customer === "ลูกค้าใหม่")) {
                updated.customer = stg.customer;
              }
              if (stg.commodity && !updated.commodity) updated.commodity = stg.commodity;
              if (stg.containerType && !updated.containerType) updated.containerType = stg.containerType;
              if (stg.grossWeight && !updated.grossWeight) updated.grossWeight = stg.grossWeight;
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
                updated.customsFiled = true;
                if (!updated.customsDate) updated.customsDate = stg.submitDate || stg.clearDate || null;
              }
              actionableJobsToApply.push(updated);
            }
          } else if (stg.isGenuineNew && stg.actionType === "new") {
            const isExp = /^(SH)?(SE|AE)/i.test(stg.jobNo);
            const isAir = /^(SH)?(AE|AI)/i.test(stg.jobNo);
            const isTrans = /^(SH)?(TS|SHT)/i.test(stg.jobNo);
            const svc = isTrans
              ? "Transport"
              : isAir
              ? (isExp ? "AIR Export" : "AIR Import")
              : (isExp ? "SEA Export" : "SEA Import");

            const finalDate = isExp ? stg.etd || stg.eta : stg.eta || stg.etd;
            const opMonth = finalDate ? finalDate.slice(0, 7) : "2026-11";
            const isDone = stg.status === "Completed" || stg.customsStatus === "0409";

            actionableJobsToApply.push({
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
              draftCustoms: isDone,
              customsFiled: isDone || Boolean(stg.declarationNo),
              doReleased: isDone,
              cleared: isDone,
              advanceDoc: false,
              draftDate: null,
              customsDate: stg.submitDate || null,
              doDate: null,
              clearDate: stg.clearDate || null,
              advanceDate: null,
              sourceRow: 0,
              customsStatus: stg.customsStatus || null,
              csName: stg.csName || "",
              containerType: stg.containerType || undefined,
              grossWeight: stg.grossWeight ?? undefined,
              cbm: stg.cbm ?? undefined,
              commodity: stg.commodity || undefined,
              nextAction: isDone ? "นำส่งสินค้าเรียบร้อย" : "ตรวจปล่อยสินค้า",
            });
          }
        }

        const actionableTripsToApply = allTransportTrips.filter(
          (t) => t.isNew || t.isDateChanged || t.isDriverChanged || (t as any).isPlateChanged
        );

        if (actionableJobsToApply.length > 0) {
          await upsertJobsToPostgres(actionableJobsToApply);
        }
        if (actionableTripsToApply.length > 0) {
          await upsertTransportToPostgres(actionableTripsToApply);
        }

        const freshJobs = await getCurrentJobs();
        const freshTransport = await getCurrentTransport();

        return NextResponse.json({
          ok: true,
          autoApplied: true,
          filesCount: rawFileList.length,
          files: fileResults,
          jobsUpdated: actionableJobsToApply.length,
          transportUpdated: actionableTripsToApply.length,
          totalJobs: freshJobs.length,
          totalTransport: freshTransport.length,
          jobs: freshJobs,
          transport: freshTransport,
          message: `⚡ ซิงค์อัตโนมัติสำเร็จ ${rawFileList.length} ไฟล์! อัปเดตงาน ${actionableJobsToApply.length} รายการ และเที่ยวรถ ${actionableTripsToApply.length} เที่ยวลง Supabase ทันที`,
        });
      }

      // Return unified Staging preview
      const hasTransport = allTransportTrips.length > 0;
      const hasJobs = allJobRows.length > 0;

      return NextResponse.json({
        ok: true,
        multiple: rawFileList.length > 1,
        filesCount: rawFileList.length,
        files: fileResults,
        hasTransport,
        hasJobs,
        isTransport: hasTransport && !hasJobs,
        totalRows: allJobRows.length,
        rows: allJobRows,
        transportTrips: allTransportTrips,
        message: `อ่านข้อมูลสำเร็จ ${rawFileList.length} ไฟล์ (${allJobRows.length} งาน • ${allTransportTrips.length} เที่ยวรถ)`,
      });
    }

    return NextResponse.json(
      { ok: false, error: "รองรับเฉพาะ multipart/form-data หรือ JSON" },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg || "เกิดข้อผิดพลาดในการประมวลผลไฟล์" },
      { status: 500 }
    );
  }
}
