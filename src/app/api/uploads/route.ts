/**
 * ============================================================================
 * API Route: POST /api/uploads (Enhanced Multi-File & Smart Sync Engine)
 * ============================================================================
 * รองรับการทำงาน:
 *   1. JSON { action: "smart_sync", deltaJobs, trips }
 *      - บันทึกทั้งงานขนส่งหลักและเที่ยวรถพร้อมกันในคราวเดียว (One-Click Sync)
 *   2. JSON { action: "apply", deltaJobs | jobs } & { action: "apply_transport", trips }
 *      - บันทึกงานแยกตาราง (Jobs หรือ Transport)
 *   3. multipart/form-data
 *      - รองรับการอัปโหลด "หลายไฟล์พร้อมกัน" (Multi-File Drop)
 *      - รองรับ ?autoApply=true เพื่อซิงค์บันทึกทับใน Supabase ทันที
 *      - ทำงานใน Memory 100% ปลอดภัยบน Vercel Serverless
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
import {
  resolveScript,
  mergeStagingJobRows,
  syncJobsToLocalMirror,
  syncTransportToLocalMirror,
  buildUpdatedJob,
  buildNewJob,
} from "@/lib/upload-sync-helpers";

const execFileAsync = promisify(execFile);
export const dynamic = "force-dynamic";

const IS_VERCEL = Boolean(process.env.VERCEL);

async function getCurrentJobs(): Promise<JobRecord[]> {
  const pg = await fetchJobsFromPostgres();
  return pg && pg.length > 0 ? pg : getJobs();
}

async function getCurrentTransport(): Promise<TransportRecord[]> {
  const pg = await fetchTransportFromPostgres();
  return pg && pg.length > 0 ? pg : getTransport();
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // ------------------------------------------------------------------------
    // CASE A: JSON ACTIONS (smart_sync, apply, apply_transport)
    // ------------------------------------------------------------------------
    if (contentType.includes("application/json")) {
      const body = await req.json();

      // 1. One-Click Smart Sync (Jobs + Transport simultaneously)
      if (body.action === "smart_sync") {
        const deltaJobs: JobRecord[] = Array.isArray(body.deltaJobs)
          ? body.deltaJobs
          : Array.isArray(body.jobs)
          ? body.jobs
          : [];
        const tripsToUpsert: any[] = Array.isArray(body.trips) ? body.trips : [];

        if (deltaJobs.length > 0) {
          const pgRes = await upsertJobsToPostgres(deltaJobs);
          if (!pgRes.success && IS_VERCEL) {
            return NextResponse.json(
              { ok: false, error: `ไม่สามารถบันทึกงานลง PostgreSQL ได้: ${pgRes.error || "Unknown DB error"}` },
              { status: 500 }
            );
          }
        }

        if (tripsToUpsert.length > 0) {
          const pgTransRes = await upsertTransportToPostgres(tripsToUpsert);
          if (!pgTransRes.success && IS_VERCEL) {
            return NextResponse.json(
              { ok: false, error: `ไม่สามารถบันทึกเที่ยวรถลง PostgreSQL ได้: ${pgTransRes.error || "Unknown DB error"}` },
              { status: 500 }
            );
          }
        }

        if (!IS_VERCEL) {
          try {
            if (deltaJobs.length > 0) await syncJobsToLocalMirror(deltaJobs);
            if (tripsToUpsert.length > 0) await syncTransportToLocalMirror(tripsToUpsert);
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
          jobsUpdated: deltaJobs.length,
          transportUpdated: tripsToUpsert.length,
          totalJobs: freshJobs.length,
          totalTransport: freshTransport.length,
          jobs: freshJobs,
          transport: freshTransport,
          message: `ซิงค์และบันทึกข้อมูลเรียบร้อย! อัปเดตงาน ${deltaJobs.length} รายการ และเที่ยวรถ ${tripsToUpsert.length} รายการลง Supabase PostgreSQL แล้ว`,
        });
      }

      // 2. Apply Jobs Only
      if (body.action === "apply" && (Array.isArray(body.deltaJobs) || Array.isArray(body.jobs))) {
        const deltaJobs: JobRecord[] | null = Array.isArray(body.deltaJobs) ? body.deltaJobs : null;
        const fullJobs: JobRecord[] | null = Array.isArray(body.jobs) ? body.jobs : null;
        const jobsToUpsert = deltaJobs ?? fullJobs ?? [];

        const pgResult = await upsertJobsToPostgres(jobsToUpsert);
        if (!pgResult.success && IS_VERCEL) {
          return NextResponse.json(
            { ok: false, error: `ไม่สามารถบันทึกลงฐานข้อมูล PostgreSQL ได้: ${pgResult.error || "Unknown DB error"}` },
            { status: 500 }
          );
        }

        if (!IS_VERCEL) {
          try {
            await syncJobsToLocalMirror(jobsToUpsert, {
              fullReplace: Boolean(fullJobs),
              createSnapshot: true,
            });
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

      // 3. Apply Transport Only
      if (body.action === "apply_transport" && Array.isArray(body.trips)) {
        const tripsToUpsert: any[] = body.trips;
        const pgResult = await upsertTransportToPostgres(tripsToUpsert);
        if (!pgResult.success && IS_VERCEL) {
          return NextResponse.json(
            { ok: false, error: `ไม่สามารถบันทึกเที่ยวรถลง PostgreSQL ได้: ${pgResult.error || "Unknown DB error"}` },
            { status: 500 }
          );
        }

        if (!IS_VERCEL) {
          try {
            await syncTransportToLocalMirror(tripsToUpsert, { createSnapshot: true });
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
          addedTrips: tripsToUpsert.filter((t) => t.isNew || t.actionType === "new").length,
          updatedTrips: tripsToUpsert.filter((t) => !t.isNew && t.actionType !== "new").length,
          transport: currentTransport,
          jobs: currentJobs,
          message: `นำเข้าเที่ยวรถสำเร็จ ${tripsToUpsert.length} รายการ ลงระบบและ PostgreSQL เรียบร้อยแล้ว`,
        });
      }
    }

    // ------------------------------------------------------------------------
    // CASE B: MULTIPART / FORM-DATA (Multi-file Drop & Parsing Engine)
    // ------------------------------------------------------------------------
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
        return NextResponse.json({ ok: false, error: "ไม่พบไฟล์ที่อัปโหลด" }, { status: 400 });
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
              (exists &&
                (Boolean(r.isDateChanged) ||
                  Boolean(r.isStatusChanged) ||
                  Boolean(r.isCustomsChanged) ||
                  Boolean(r.isChanged)));
            if (isActionable) actionableJobs++;

            const currentStg = {
              ...r,
              jobNo: canonicalKey,
              joinNo:
                rawJoin && rawJoin !== canonicalKey
                  ? rawJoin
                  : rawKey !== canonicalKey
                  ? rawKey
                  : r.joinNo || "",
              fileType: parsed.fileType || "fwd",
              isPastOrOld,
              isBlankDummy,
              isGenuineNew,
            };

            if (combinedJobsMap.has(canonicalKey)) {
              combinedJobsMap.set(
                canonicalKey,
                mergeStagingJobRows(combinedJobsMap.get(canonicalKey), currentStg)
              );
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

      // Check transport links to jobs
      combinedTripsMap.forEach((trip) => {
        const linkedJobClean = stripModeSuffix(String(trip.jobNo || ""));
        if (
          linkedJobClean &&
          (existingJobMap.has(linkedJobClean) || combinedJobsMap.has(linkedJobClean))
        ) {
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
          if (
            stg.actionType === "update" &&
            (stg.isDateChanged || stg.isStatusChanged || stg.isCustomsChanged || stg.isChanged)
          ) {
            const existing = existingJobMap.get(stg.jobNo.toUpperCase());
            if (existing) {
              actionableJobsToApply.push(buildUpdatedJob(existing, stg));
            }
          } else if (stg.isGenuineNew && stg.actionType === "new") {
            actionableJobsToApply.push(buildNewJob(stg, existingJobs.length));
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
