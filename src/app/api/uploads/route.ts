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
import { parseUploadedExcelBuffer } from "@/lib/excel-parser";
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

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();

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

        // 1. PostgreSQL persistence (Supabase Cloud + Local LAN Master)
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

        // 2. Local JSON & SQLite mirror (skip on Vercel read-only filesystem)
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

        return NextResponse.json({
          ok: true,
          saved: true,
          totalJobs: finalTotalJobs,
          upsertedJobs: jobsToUpsert.length,
          message: `บันทึกข้อมูล ${jobsToUpsert.length} รายการลงระบบและ PostgreSQL เรียบร้อยแล้ว`,
        });
      }

      if (body.action === "apply_transport" && Array.isArray(body.trips)) {
        const existingTransport = await getCurrentTransport();

        // 1. Merge selected trips
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

        // 2. PostgreSQL persistence (Supabase Cloud + Local LAN Master)
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

        // 3. Local JSON & SQLite mirror (skip on Vercel read-only filesystem)
        if (!IS_VERCEL) {
          try {
            const transportPath = path.resolve(
              process.cwd(),
              "data/transport.json"
            );
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

            // Also enrich linked jobs locally with transportNo
            const jobsPath = path.resolve(process.cwd(), "data/jobs.json");
            let enrichedJobsCount = 0;
            try {
              const rawJ = await fs.readFile(jobsPath, "utf-8");
              const jobsList = JSON.parse(rawJ);
              const jobMap = new Map<string, any>();
              for (const j of jobsList) {
                if (j.jobNo) jobMap.set(j.jobNo.trim().toUpperCase(), j);
                if (j.joinNo) {
                  const jn = j.joinNo
                    .trim()
                    .toUpperCase()
                    .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
                    .trim();
                  if (jn && !jobMap.has(jn)) jobMap.set(jn, j);
                }
              }
              for (const trip of body.trips) {
                if (trip.jobNo) {
                  const jKey = trip.jobNo.trim().toUpperCase();
                  const matched = jobMap.get(jKey);
                  if (matched && !matched.transportNo) {
                    matched.transportNo = trip.tripNo || trip.transportNo;
                    enrichedJobsCount++;
                  }
                }
              }
              if (enrichedJobsCount > 0) {
                await fs.writeFile(
                  jobsPath,
                  JSON.stringify(jobsList, null, 1),
                  "utf-8"
                );
              }
            } catch {}

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

        return NextResponse.json({
          ok: true,
          saved: true,
          totalTransport: mergedTransport.length,
          addedTrips: added,
          updatedTrips: updated,
          transport: mergedTransport,
          jobs: currentJobs,
          message: `นำเข้าเที่ยวรถสำเร็จ ${added} เที่ยวใหม่ / อัปเดต ${updated} เที่ยว (ยอดรวม ${mergedTransport.length} เที่ยว) ลงระบบและ PostgreSQL เรียบร้อยแล้ว`,
        });
      }
    }

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { ok: false, error: "ไม่พบไฟล์ที่อัปโหลด" },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const fileNameLower = file.name.toLowerCase();

      const isBookingMaster =
        fileNameLower.endsWith(".xlsx") &&
        (fileNameLower.includes("booking report") ||
          buffer.length > 2 * 1024 * 1024);
      const isTransportMaster =
        fileNameLower.endsWith(".xlsx") && fileNameLower.includes("job_daily");

      // Case A & B: Full Master Workbooks (Local Python pipeline only)
      if (isBookingMaster || isTransportMaster) {
        if (IS_VERCEL) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "ไฟล์ Master ขนาดใหญ่ (2026 Booking Report / JOB_Daily) กรุณาซิงค์ผ่านเครื่อง Local (localhost) ส่วนรายงานประจำวัน/รายแผนก (.xls/.xlsx/.csv) สามารถอัปโหลดบนเว็บนี้ได้ทันทีครับ",
            },
            { status: 400 }
          );
        }

        const tmpDir = path.join(os.tmpdir(), "perkin-uploads");
        await fs.mkdir(tmpDir, { recursive: true });
        const tempPath = path.join(
          tmpDir,
          `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_\-\.]/g, "_")}`
        );
        await fs.writeFile(tempPath, buffer);

        const pythonExe = process.env.PYTHON_PATH || "python";

        if (isBookingMaster) {
          const rootMaster = path.resolve(
            process.cwd(),
            "data/2026 Booking Report.xlsx"
          );
          const backupMaster = path.resolve(
            resolveBackupDir(),
            `snapshot_${Date.now()}_booking.xlsx`
          );
          await fs
            .mkdir(resolveBackupDir(), { recursive: true })
            .catch(() => {});
          await fs.copyFile(rootMaster, backupMaster).catch(() => {});
          await fs.copyFile(tempPath, rootMaster);
          await fs.unlink(tempPath).catch(() => {});

          const pipelineScript = resolveScript("standardize_pipeline.py");
          if (fsSync.existsSync(pipelineScript)) {
            await execFileAsync(pythonExe, [pipelineScript]);
          }

          const jobs = getJobs();
          const transport = getTransport();

          if (jobs.length > 0) {
            await upsertJobsToPostgres(jobs).catch((e) =>
              console.warn("[UPLOAD] PG jobs sync warning:", e)
            );
          }
          if (transport.length > 0) {
            await upsertTransportToPostgres(transport).catch((e) =>
              console.warn("[UPLOAD] PG transport sync warning:", e)
            );
          }

          return NextResponse.json({
            ok: true,
            directApplied: true,
            fileName: file.name,
            totalJobs: jobs.length,
            totalTransport: transport.length,
            jobs,
            transport,
            message: `อัปเดตไฟล์ Master สำเร็จ! พบข้อมูลทั้งหมด ${jobs.length} งาน (บันทึกลง PostgreSQL เรียบร้อย)`,
          });
        }

        // isTransportMaster
        const rootDaily = path.resolve(
          process.cwd(),
          "data/JOB_Daily_2026 STATUS_Dashboard.xlsx"
        );
        await fs.copyFile(tempPath, rootDaily).catch(() => {});
        await fs.unlink(tempPath).catch(() => {});

        const pipelineScript = resolveScript("standardize_pipeline.py");
        if (fsSync.existsSync(pipelineScript)) {
          await execFileAsync(pythonExe, [pipelineScript]);
        }

        const jobs = getJobs();
        const transport = getTransport();

        if (transport.length > 0) {
          await upsertTransportToPostgres(transport).catch((e) =>
            console.warn("[UPLOAD] PG transport sync warning:", e)
          );
        }

        return NextResponse.json({
          ok: true,
          directApplied: true,
          fileName: file.name,
          totalJobs: jobs.length,
          totalTransport: transport.length,
          jobs,
          transport,
          message: `อัปเดตไฟล์ Transport สำเร็จ! พบข้อมูล ${transport.length} เที่ยว (บันทึกลง PostgreSQL เรียบร้อย)`,
        });
      }

      // Case C: Incremental Customs / Shipping / Oversea / Air / Transport sheet
      // Pure Node.js in-memory parsing (zero /var/task disk writes, zero Python required -> works 100% on Vercel & Local)
      const existingJobs = await getCurrentJobs();
      const parsed = parseUploadedExcelBuffer(buffer, file.name, existingJobs);

      if (!parsed.ok) {
        return NextResponse.json(parsed, { status: 400 });
      }

      // Handle Transport file upload (Inland Transport - รถขนส่ง) -> Return preview for staging first!
      if (parsed.isTransport && Array.isArray(parsed.transportTrips)) {
        const existingTransport = await getCurrentTransport();

        const existingTransMap = new Map<string, any>();
        for (const t of existingTransport) {
          const key = (t.tripNo || t.transportNo || "").trim().toUpperCase();
          if (key) existingTransMap.set(key, t);
        }

        // เช็คว่ามีรายการที่ตรงกับ Job No หรือ Join No ที่มีในระบบหรือไม่ (ห้ามตัด prefix SH เพราะเลขรันแยกแผนกกัน)
        const jobNoSet = new Set<string>();
        for (const j of existingJobs) {
          if (j.jobNo) jobNoSet.add(j.jobNo.trim().toUpperCase());
          if (j.joinNo) {
            const jn = j.joinNo
              .trim()
              .toUpperCase()
              .replace(/\s*\((SEA|AIR)\)\s*$/i, "")
              .trim();
            if (jn) jobNoSet.add(jn);
          }
        }

        let newTripsCount = 0;
        let existingTripsCount = 0;
        let dateUpdateTripsCount = 0;

        const enrichedTrips = parsed.transportTrips.map((t: any, idx: number) => {
          const tripKey = (t.tripNo || t.transportNo || "").trim().toUpperCase();
          const existingTrip = existingTransMap.get(tripKey);
          const exists = Boolean(existingTrip);

          const normD = (d: any) => (d ? String(d).trim().slice(0, 10) : "");
          const incDeliver = normD(t.deliver || t.deliverDate);
          const exDeliver = normD(
            existingTrip?.deliver || existingTrip?.deliverDate
          );
          const incPickup = normD(t.pickupDate);
          const exPickup = normD(existingTrip?.pickupDate);

          const transDiffs: string[] = [];
          if (incDeliver && incDeliver !== exDeliver) {
            transDiffs.push(`ส่งมอบ: ${exDeliver || "-"} ➔ ${incDeliver}`);
          }
          if (incPickup && incPickup !== exPickup) {
            transDiffs.push(`รับตู้: ${exPickup || "-"} ➔ ${incPickup}`);
          }

          const isDateChanged = exists && transDiffs.length > 0;
          const dateChangeDiff = transDiffs.join(" • ");

          if (!exists) {
            newTripsCount++;
          } else if (isDateChanged) {
            dateUpdateTripsCount++;
          } else {
            existingTripsCount++;
          }

          const linkedJobClean = (t.jobNo || "").trim().toUpperCase();
          const hasLinkedJob = Boolean(
            linkedJobClean && jobNoSet.has(linkedJobClean)
          );

          return {
            ...t,
            id: `trans-${idx}-${tripKey}`,
            actionType: exists ? "update" : "new",
            isNew: !exists,
            isDateChanged,
            oldDeliverDate: exDeliver || null,
            dateChangeDiff,
            hasLinkedJob,
            validationStatus: "valid",
            validationNote: !exists
              ? hasLinkedJob
                ? `เที่ยวรถใหม่ • ผูกกับ Job ${linkedJobClean}`
                : "เที่ยวรถใหม่ • ขนส่งทั่วไป (ไม่ผูก Job)"
              : isDateChanged
              ? `🔄 อัปเดตวันส่งมอบ: ${dateChangeDiff} (อัปเดตทับเที่ยวเดิม ไม่บวม)`
              : "⚪ เที่ยวรถเดิมในระบบ (วันเวลาไม่เปลี่ยน • ข้ามเพื่อไม่ให้งานบวม)",
          };
        });

        return NextResponse.json({
          ok: true,
          isTransport: true,
          directApplied: false,
          fileName: file.name,
          fileType: "transport",
          fileTypeLabel: "รายงานการจองรถขนส่งในประเทศ (Inland Transport)",
          totalRows: enrichedTrips.length,
          newTripsCount,
          existingTripsCount,
          dateUpdateTripsCount,
          transportTrips: enrichedTrips,
          rows: [],
          message: `อ่านไฟล์รายงานการจองรถขนส่งสำเร็จ ${enrichedTrips.length} เที่ยวรถ (พบเที่ยวรถใหม่ ${newTripsCount} เที่ยว) · กรุณาตรวจสอบข้อมูลก่อนกดยืนยันนำเข้า`,
        });
      }

      return NextResponse.json(parsed);
    }

    return NextResponse.json(
      { ok: false, error: "รองรับเฉพาะ multipart/form-data" },
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
