import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getJobs, updateJobInMemory } from "@/lib/data-store";
import { updateJobInPostgres } from "@/lib/db";

const SHEET_COLUMN_MAP: Record<
  string,
  Record<string, string>
> = {
  "SEA Import": {
    job: "D",
    status: "C",
    etd: "A",
    eta: "B",
    customer: "E",
    bl: "G",
    draft: "H",
    advance: "L",
    do: "N",
    customs: "O",
    cleared: "P",
    updateStatus: "X",
    remark: "Y",
  },
  "AIR Import": {
    job: "D",
    status: "C",
    etd: "A",
    eta: "B",
    customer: "E",
    bl: "G",
    draft: "H",
    advance: "J",
    do: "L",
    customs: "M",
    cleared: "N",
    updateStatus: "V",
    remark: "W",
  },
  "Air Export": {
    job: "F",
    status: "E",
    etd: "C",
    eta: "D",
    customer: "G",
    bl: "I",
    draft: "J",
    advance: "N",
    do: "P",
    customs: "Q",
    cleared: "R",
    updateStatus: "Z",
    remark: "AA",
  },
  "AIR Export": {
    job: "F",
    status: "E",
    etd: "C",
    eta: "D",
    customer: "G",
    bl: "I",
    draft: "J",
    advance: "N",
    do: "P",
    customs: "Q",
    cleared: "R",
    updateStatus: "Z",
    remark: "AA",
  },
  "SEA Export": {
    job: "G",
    status: "F",
    etd: "D",
    eta: "E",
    customer: "H",
    bl: "J",
    draft: "K",
    advance: "O",
    do: "T",
    customs: "Q",
    cleared: "S",
    updateStatus: "AD",
    remark: "AE",
  },
  Freight: {
    job: "E",
    status: "D",
    etd: "A",
    eta: "B",
    customer: "F",
    updateStatus: "AA",
    remark: "AB",
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobNo: string } }
) {
  const jobNo = decodeURIComponent(params.jobNo);
  const currentJobs = getJobs();
  const currentJob = currentJobs.find((j) => j.jobNo === jobNo);
  if (!currentJob) {
    return NextResponse.json({ error: "ไม่พบหมายเลขงานนี้" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job: currentJob });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { jobNo: string } }
) {
  const jobNo = decodeURIComponent(params.jobNo);
  const body = await req.json();

  // 1. ตรวจสอบว่ามีหมายเลขงานอยู่ในระบบหรือไม่
  const currentJobs = getJobs();
  const currentJob = currentJobs.find((j) => j.jobNo === jobNo);
  if (!currentJob) {
    return NextResponse.json({ error: "ไม่พบหมายเลขงานนี้" }, { status: 404 });
  }

  // 2. ตรวจสิทธิ์ผู้ใช้ (ops / data_analyse แก้ได้เฉพาะ Status, ETD/ETA, Milestones, Remark; admin แก้ Customer/BL ได้)
  const role = req.headers.get("x-user-role") || body.role || "ops";
  if (role !== "admin" && (body.customer !== undefined || body.bl !== undefined || body.consignee !== undefined)) {
    return NextResponse.json(
      { error: "เฉพาะสิทธิ์ Admin เท่านั้นที่สามารถแก้ไขชื่อลูกค้าหรือเลข B/L ได้" },
      { status: 403 }
    );
  }

  // Whitelist ฟิลด์ที่อนุญาตให้แก้ไข (ป้องกัน Mass Assignment)
  const allowedKeys = [
    "status",
    "statusDetail",
    "etd",
    "eta",
    "draftDate",
    "customsDate",
    "doDate",
    "clearDate",
    "advanceDate",
    "draftCustoms",
    "advanceDoc",
    "doReleased",
    "customsFiled",
    "cleared",
    "updateStatus",
    "remark",
    ...(role === "admin" ? ["customer", "bl", "consignee"] : []),
  ];

  const sanitizedPatch: Record<string, any> = {};
  for (const k of allowedKeys) {
    if (body[k] !== undefined) {
      sanitizedPatch[k] = body[k];
    }
  }

  // 3. จัดการเลข version (Last-Write-Wins: อนุญาตให้ผู้ใช้ทุกคนบันทึกได้ทันทีเสมอ ไม่บล็อกด้วย 409 Conflict)
  const currentVersion = (currentJob as { version?: number }).version || 1;
  const nextVersion =
    Math.max(currentVersion, Number(body.expectedVersion) || 1) + 1;

  // 4. สร้างรายการแก้ไขและส่ง Webhook ไปหา n8n (POST /webhook/job-edit-v031)
  const editId = crypto.randomUUID();
  const sourceSheet = currentJob.sourceSheet || currentJob.service || "SEA Import";
  const sourceRow = currentJob.sourceRow || 2;
  const cols = SHEET_COLUMN_MAP[sourceSheet] || SHEET_COLUMN_MAP["SEA Import"];

  const webhookPayload = {
    editId,
    jobNo,
    sourceSheet,
    sourceRow,
    expectedVersion: currentVersion,
    excelColMap: cols,
    changes: {
      status: body.status,
      statusDetail: body.statusDetail,
      etd: body.etd,
      eta: body.eta,
      draftDate: body.draftDate,
      customsDate: body.customsDate,
      doDate: body.doDate,
      clearDate: body.clearDate,
      advanceDate: body.advanceDate,
      updateStatus: body.updateStatus,
      remark: body.remark,
    },
  };

  const n8nWebhookUrl = process.env.N8N_EDIT_WEBHOOK_URL;
  let syncedViaN8n = false;
  if (n8nWebhookUrl) {
    try {
      const rawBody = JSON.stringify(webhookPayload);
      const secret = process.env.WEBHOOK_HMAC_SECRET || "perkin-logistics-secret";
      const signature = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

      const resp = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
        },
        body: rawBody,
      });
      syncedViaN8n = resp.ok;
    } catch {
      syncedViaN8n = false;
    }
  }

  // 5. อัปเดตข้อมูลในระบบเว็บและเพิ่มเลข version + 1
  const updated = updateJobInMemory(jobNo, {
    ...sanitizedPatch,
    version: nextVersion,
  });

  // 6. Direct sync to Supabase PostgreSQL (functions in Node.js serverless & local)
  await updateJobInPostgres(jobNo, {
    ...sanitizedPatch,
    version: nextVersion,
  });

  return NextResponse.json({
    ok: true,
    editId,
    syncedToExcel: true,
    syncedViaN8n,
    syncedToDb: true,
    job: updated,
    version: nextVersion,
  });
}
