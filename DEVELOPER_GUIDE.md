# Perkin Logistics Dashboard — คู่มือสำหรับนักพัฒนา (Developer Guide)
> **สำหรับ:** Software Engineers, Fullstack Developers, และ DevOps ที่รับช่วงดูแลหรือต่อเติมระบบ  
> **เวอร์ชัน:** 0.3.1 (Enterprise Production)  
> **อัปเดตล่าสุด:** พฤศจิกายน 2026

---

## สารบัญ (Table of Contents)
1. [ภาพรวมสถาปัตยกรรมเชิงเทคนิค (System Architecture)](#1-ภาพรวมสถาปัตยกรรมเชิงเทคนิค)
2. [สิ่งที่ต้องเตรียมล่วงหน้า (Prerequisites)](#2-สิ่งที่ต้องเตรียมล่วงหน้า)
3. [ขั้นตอนการติดตั้งและตั้งค่าแบบ Step-by-Step](#3-ขั้นตอนการติดตั้งและตั้งค่าแบบ-step-by-step)
   - [Step 1: Clone Repository & ติดตั้ง Dependencies](#step-1-clone-repository--ติดตั้ง-dependencies)
   - [Step 2: การตั้งค่า Environment Variables (.env)](#step-2-การตั้งค่า-environment-variables-env)
   - [Step 3: ฐานข้อมูลและการรัน Schema Migration (PostgreSQL)](#step-3-ฐานข้อมูลและการรัน-schema-migration-postgresql)
   - [Step 4: การรัน Development Server ในเครื่อง](#step-4-การรัน-development-server-ในเครื่อง)
   - [Step 5: การทดสอบ Build และความถูกต้องของ Types](#step-5-การทดสอบ-build-และความถูกต้องของ-types)
   - [Step 6: การ Deploy สู่ Vercel Production](#step-6-การ-deploy-สู่-vercel-production)
4. [โครงสร้างโค้ดและการทำงานของระบบ (Codebase Deep Dive)](#4-โครงสร้างโค้ดและการทำงานของระบบ)
   - [แผนผังโฟลเดอร์ (Directory Tree)](#แผนผังโฟลเดอร์-directory-tree)
   - [กลไก Dual-Database (Supabase Cloud + Local LAN 192.168.1.153)](#กลไก-dual-database-supabase-cloud--local-lan-1921681153)
   - [Batch Upserting & High-Performance Ingestion](#batch-upserting--high-performance-ingestion)
   - [Optimistic Concurrency Control (Version Locking)](#optimistic-concurrency-control-version-locking)
   - [Audit Logging (ตาราง public.job_history)](#audit-logging-ตาราง-publicjob_history)
5. [ข้อกำหนด API Endpoints (API Specifications)](#5-ข้อกำหนด-api-endpoints)
6. [แนวทางการพัฒนาต่อยอด (Extending the System)](#6-แนวทางการพัฒนาต่อยอด)
7. [การแก้ไขปัญหาทางเทคนิค (Developer FAQ & Troubleshooting)](#7-การแก้ไขปัญหาทางเทคนิค)

---

## 1. ภาพรวมสถาปัตยกรรมเชิงเทคนิค

ระบบพัฒนาด้วย **Next.js 14 App Router** (Node.js runtime) เชื่อมต่อกับฐานข้อมูล **PostgreSQL** แบบ Hybrid Dual-Layer (Cloud Supabase + Local Office LAN):

```mermaid
flowchart TD
    subgraph Frontend["Frontend Layer"]
        Browser["React 18 Server & Client Components\n(Tailwind CSS + Lucide Icons)"]
    end

    subgraph BackendAPI["Next.js API Routes (Serverless)"]
        API_Jobs["/api/jobs/[jobNo]\n(PATCH: Update Job / OCC 409)"]
        API_Upload["/api/uploads\n(POST: Excel Parser & Chunked Upsert)"]
        API_Sync["/api/sync\n(POST/GET: Real-time DB Fetch)"]
        API_Dash["/api/dashboard\n(GET: Cached KPIs Aggregation)"]
        API_Export["/api/export\n(GET: Excel Workbook Generator)"]
    end

    subgraph DataModule["Database Access Layer (src/lib/db.ts)"]
        PoolManager["pg.Pool Connection Manager\n(Max 10 clients, SSL rejectUnauthorized: false)"]
        BatchUpsert["Chunked Batch Multi-row Upsert\n(100 rows/statement, ON CONFLICT)"]
    end

    subgraph Persistence["Storage & Databases"]
        Supabase[("Supabase Cloud PostgreSQL (Master)\n- Port 6543 IPv4 Transaction Pooler\n- 3,532 Jobs / 572 Transport Trips")]
        LocalPG[("Local PostgreSQL (LAN Mirror)\n- 192.168.1.153:5432/Test001\n- Best-effort LAN write")]
        LocalCache["Atomic JSON Cache\n- data/jobs.json (4.7 MB)\n- data/transport.json (240 KB)"]
        SQLiteLocal[("SQLite Local Engine\n- data/perkin_logistics.db")]
    end

    subgraph External["External Integrations"]
        n8n["n8n Automation Webhooks\n(HMAC-SHA256 Signed Payload)"]
        SharePoint["SharePoint Master Excel\n(JOB_Daily_2026 STATUS_Dashboard.xlsx)"]
    end

    Browser --> BackendAPI
    BackendAPI --> DataModule
    DataModule -->|Primary Connection| Supabase
    DataModule -.->|LAN Mirroring| LocalPG
    DataModule -.->|Offline Fallback| LocalCache
    BackendAPI -.->|Event Emit| n8n
    API_Sync -.-> SharePoint
```

---

## 2. สิ่งที่ต้องเตรียมล่วงหน้า

- **Node.js:** v18.17.0+ (แนะนำ Node.js 20 หรือ 22 LTS)
- **npm:** v9+
- **Git:** เวอร์ชันล่าสุด
- **Python (ทางเลือก):** v3.10+ (เฉพาะเมื่อรัน Local ETL script ขนาดใหญ่)
- **PostgreSQL Client (ทางเลือก):** เช่น `psql`, pgAdmin, DBeaver

---

## 3. ขั้นตอนการติดตั้งและตั้งค่าแบบ Step-by-Step

### Step 1: Clone Repository & ติดตั้ง Dependencies
```bash
git clone https://github.com/Suthipong25/Perkin-Logistics-Dashboard.git
cd Perkin-Logistics-Dashboard
npm install
```

### Step 2: การตั้งค่า Environment Variables (.env)
สร้างไฟล์ `.env` ที่ root ของโปรเจกต์:

```ini
# =============================================================================
# PERKIN LOGISTICS DASHBOARD — ENVIRONMENT CONFIGURATION
# =============================================================================

# --- 1. Supabase PostgreSQL Cloud (ฐานข้อมูลหลักสำหรับการเข้าถึงผ่าน Web & Cloud) ---
# แนะนำใช้พอร์ต 6543 (Transaction Pooler - IPv4) เพื่อป้องกันปัญหา IPv6 บน Windows LAN
DATABASE_URL="postgresql://postgres.vdygytdzouvqwypbgqmd:Perkin2Logistics@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# พอร์ต 5432 (Session Mode สำหรับรัน DDL / Schema Migration)
DIRECT_URL="postgresql://postgres.vdygytdzouvqwypbgqmd:Perkin2Logistics@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

# ตัวแปรเสริมสำหรับการเชื่อมต่อผ่าน Web / Ingestion Script
DATABASE_URL_WEB="postgresql://postgres.vdygytdzouvqwypbgqmd:Perkin2Logistics@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DATABASE_URL_INGEST="postgresql://postgres.vdygytdzouvqwypbgqmd:Perkin2Logistics@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

# --- 2. Local LAN PostgreSQL (ฐานข้อมูลสำรองภายในออฟฟิศ) ---
DATABASE_URL_LOCAL="postgresql://postgres:Perkin2Logistics@192.168.1.153:5432/Test001"

# ข้อมูลเชื่อมต่อมาตรฐานสำหรับ psql หรือ python script
PGHOST="aws-1-ap-northeast-1.pooler.supabase.com"
PGPORT=5432
PGDATABASE="postgres"
PGUSER="postgres.vdygytdzouvqwypbgqmd"
PGPASSWORD="Perkin2Logistics"

# --- 3. Security & Webhooks ---
WEBHOOK_HMAC_SECRET="webhook-secret-perkin-2026"
AUTH_SESSION_SECRET="auth-secret-perkin-2026"
MAX_UPLOAD_BYTES=26214400

# (ทางเลือก) ปลายทาง Webhook ของ n8n เมื่อมีการแก้ไขงานผ่าน Drawer
N8N_EDIT_WEBHOOK_URL="https://n8n.your-domain.com/webhook/job-edit-v031"

# --- 4. Python Environment (เฉพาะเมื่อรัน Local Script) ---
PYTHON_PATH="python"
```

> [!IMPORTANT]
> **ทำไมต้องใช้พอร์ต 6543 บน Supabase?**  
> Hostname โดยตรง `db.vdygytdzouvqwypbgqmd.supabase.co` ผูกกับที่อยู่ IPv6 เท่านั้น ในเครือข่ายออฟฟิศหรือคอมพิวเตอร์ที่ยังไม่มี IPv6 จะต่อไม่ติด การเชื่อมต่อผ่าน `aws-1-ap-northeast-1.pooler.supabase.com` ที่พอร์ต `6543` รองรับ IPv4 เต็มรูปแบบ

---

### Step 3: ฐานข้อมูลและการรัน Schema Migration (PostgreSQL)

หากต้องการ Setup Database ใหม่บน Server อื่น สามารถรันไฟล์สคริปต์ [sql/postgres_migration.sql](file:///c:/Users/User/Desktop/Fullstack/perkin-logistics-dashboard/sql/postgres_migration.sql) ผ่าน `psql` ได้ทันที:

```bash
psql -h aws-1-ap-northeast-1.pooler.supabase.com -p 5432 -U postgres.vdygytdzouvqwypbgqmd -d postgres -f sql/postgres_migration.sql
```

#### โครงสร้างตารางสำคัญ:
- **`public.jobs`**: จัดเก็บข้อมูลชิปเมนท์หลักทั้งหมด (PK: `id` เช่น `Jan_4_SHAE26010002` หรือ `SHSI26060001`)
- **`public.transport_trips`**: จัดเก็บข้อมูลเที่ยวรถ (PK: `trip_no` เช่น `TS26060228`)
- **`public.job_history`**: ตาราง Audit Log สำหรับบันทึกทุกการแก้ไขฟิลด์
- **`public.snapshots`**: สรุปตัวเลขสถิติและ Snapshot รายวัน

---

### Step 4: การรัน Development Server ในเครื่อง
```bash
npm run dev
```
เปิดบราวเซอร์ไปที่: `http://localhost:3000`

---

### Step 5: การทดสอบ Build และความถูกต้องของ Types
ก่อน Push โค้ดทุกครั้ง ต้องรันคำสั่ง build เพื่อยืนยันว่าไม่มี Type error:
```bash
npm run build
```
ผลลัพธ์ต้องแสดง `✓ Compiled successfully` และ `✓ Generating static pages (6/6)`

---

### Step 6: การ Deploy สู่ Vercel Production
1. **GitHub Continuous Deployment:** Push โค้ดเข้า branch `main` ระบบ Vercel จะสร้าง Production Deployment อัตโนมัติ
2. **การตั้งค่า Environment Variables บน Vercel Dashboard:**
   - เพิ่ม `DATABASE_URL` และ `DIRECT_URL` ในหมวด Environment Variables
3. **การตั้งค่า Project Settings บน Vercel:**
   - **Root Directory:** เว้นว่าง (`null`)
   - **SSO Protection / Deployment Protection:** ปิดใช้งานเพื่อให้ผู้ใช้ภายนอกเข้าดูแดชบอร์ดได้โดยไม่ต้องล็อกอินบัญชี Vercel

---

## 4. โครงสร้างโค้ดและการทำงานของระบบ

### แผนผังโฟลเดอร์ (Directory Tree)

```text
perkin-logistics-dashboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── dashboard/route.ts        # GET: รวมข้อมูลสดจาก DB สำหรับหน้าแดชบอร์ด
│   │   │   ├── jobs/[jobNo]/route.ts     # GET / PATCH: รายละเอียดงานและอัปเดตสถานะ (OCC 409)
│   │   │   ├── uploads/route.ts          # POST: นำเข้าไฟล์ Excel และกดยืนยันบันทึก
│   │   │   ├── sync/route.ts             # POST/GET: ดึงข้อมูลสดจาก PostgreSQL
│   │   │   └── export/route.ts           # GET: สร้างไฟล์ Excel สำหรับส่งออก
│   │   ├── layout.tsx                    # Root Layout
│   │   └── page.tsx                      # Server Component หลักของ Dashboard
│   ├── components/
│   │   ├── DashboardClient.tsx           # Client Component รวมแท็บ, ตัวกรอง, การค้นหา
│   │   ├── JobsTable.tsx                 # ตารางแสดงรายการงานชิปเมนท์
│   │   ├── JobDetailDrawer.tsx           # หน้าต่างสไลด์ดูรายละเอียดและแก้ไขงาน
│   │   ├── TransportView.tsx             # ตารางติดตามงานขนส่งและตู้สินค้า
│   │   ├── AdvancesView.tsx              # หน้าจอติดตามเงินสำรองจ่าย Shipping
│   │   ├── UploadModal.tsx               # หน้าต่างอัปโหลดและ Staging Diff Preview
│   │   └── SafetyControlView.tsx         # หน้าจอจัดการ Snapshot และ Backup
│   ├── lib/
│   │   ├── db.ts                         # โมดูลเชื่อมต่อ PostgreSQL (Pool, Batch Upsert, History)
│   │   └── data-store.ts                 # โมดูลจัดการ In-memory Cache & Fallback
│   └── types/
│       └── dashboard.ts                  # Interface นิยามข้อมูล JobRecord, TransportRecord ฯลฯ
├── data/                                 # ไฟล์ Master Data (jobs.json, transport.json, Excel)
├── sql/                                  # ไฟล์ DDL และ Schema Migration SQL
├── scripts/                              # Python ETL Scripts สำหรับประมวลผลข้อมูล
├── docs/                                 # เอกสารสถาปัตยกรรมและสเปกเชิงลึก
└── backups/                              # ไฟล์ Snapshots สำรองข้อมูล
```

### กลไก Dual-Database (Supabase Cloud + Local LAN 192.168.1.153)
ใน [src/lib/db.ts](file:///c:/Users/User/Desktop/Fullstack/perkin-logistics-dashboard/src/lib/db.ts):
- มี `getDbPool()` สำหรับเชื่อมต่อ Supabase Cloud
- มี `getLocalDbPool()` สำหรับเชื่อมต่อ `192.168.1.153:5432/Test001`
- เมื่อมีการแก้ไขงาน (`updateJobInPostgres`) หรืออัปโหลดงาน (`upsertJobsToPostgres` / `upsertTransportToPostgres`):
  - ระบบจะเขียนลง Supabase เป็นอันดับแรก (รับประกันการบันทึก)
  - และทำ **Best-effort Mirroring** ไปยัง Local LAN PostgreSQL พร้อมกัน หากเครื่องรันอยู่ในเน็ตเวิร์กออฟฟิศ

### Batch Upserting & High-Performance Ingestion
ฟังก์ชัน `upsertJobsToPostgres` และ `upsertTransportToPostgres` ทำงานแบบ Chunked Multi-row Parameterized Insert:
- ทำงานรอบละ 100 แถวด้วยคำสั่ง:
  ```sql
  INSERT INTO public.jobs (...) VALUES (...), (...)
  ON CONFLICT (id) DO UPDATE SET
    job_no = EXCLUDED.job_no,
    status = EXCLUDED.status,
    ...
    updated_at = CURRENT_TIMESTAMP;
  ```
- ทำให้การนำเข้าข้อมูล 3,500 งาน ใช้เวลาเพียง ~1.5 วินาที และป้องกัน SQL Injection 100%

### Optimistic Concurrency Control (Version Locking)
ใน [src/app/api/jobs/[jobNo]/route.ts](file:///c:/Users/User/Desktop/Fullstack/perkin-logistics-dashboard/src/app/api/jobs/[jobNo]/route.ts):
- ทุกชิปเมนท์มีเลข `version` (จำนวนเต็ม)
- เมื่อส่งแก้ไข ต้องส่ง `expectedVersion` เข้ามา
- หาก `expectedVersion !== currentVersion` ระบบจะตอบกลับ **HTTP 409 Conflict** ทันที เพื่อป้องกันการเซฟทับกันระหว่างพนักงาน 2 คน

### Audit Logging (ตาราง public.job_history)
ทุกครั้งที่มีการแก้ไขฟิลด์ในงาน ระบบจะสร้างแถวบันทึกลง `public.job_history`:
- `job_no`: หมายเลขงาน
- `field_name`: ชื่อฟิลด์ที่ถูกเปลี่ยน (เช่น `status`, `etd`, `remark`)
- `old_value` / `new_value`: ค่าก่อนและหลังเปลี่ยน
- `source_file`: `web_edit`
- `changed_at`: ประทับเวลา `CURRENT_TIMESTAMP`

---

## 5. ข้อกำหนด API Endpoints

### 1. `GET /api/dashboard`
- **คำอธิบาย:** ดึงข้อมูลสดสำหรับหน้าแรก
- **Response:**
  ```json
  {
    "jobs": [...],
    "transport": [...],
    "quality": {...},
    "advances": [...],
    "timestamp": "2026-11-17T..."
  }
  ```

### 2. `PATCH /api/jobs/[jobNo]`
- **คำอธิบาย:** แก้ไขข้อมูลงานชิปเมนท์
- **Headers:** `x-user-role: "ops" | "admin"`
- **Body Example:**
  ```json
  {
    "status": "In Progress",
    "statusDetail": "รอผลตรวจ X-Ray",
    "etd": "2026-03-05",
    "remark": "ตู้ตรวจเสร็จช่วงบ่าย",
    "expectedVersion": 1
  }
  ```
- **Responses:**
  - `200 OK`: แก้ไขสำเร็จ พร้อมคืนอ็อบเจกต์งานล่าสุด
  - `404 Not Found`: ไม่พบหมายเลขงาน
  - `409 Conflict`: มีผู้อื่นแก้ไขงานนี้ไปก่อนหน้า ต้องรีเฟรชก่อน

### 3. `POST /api/uploads`
- **Case 1 (Multipart Form):** อัปโหลดไฟล์ `.xlsx` เพื่อให้ระบบ Parse และคืนค่า Staging Diff Preview
- **Case 2 (JSON `action: "apply"`):** ยืนยันบันทึกงานใหม่ลง JSON, SQLite และ PostgreSQL
- **Case 3 (JSON `action: "apply_transport"`):** ยืนยันบันทึกเที่ยวรถลงระบบและ PostgreSQL

---

## 6. แนวทางการพัฒนาต่อยอด (Extending the System)

1. **การเพิ่มคอลัมน์ใหม่ในตาราง `public.jobs`:**
   - รัน SQL `ALTER TABLE public.jobs ADD COLUMN new_col TEXT;`
   - เพิ่มฟิลด์ลงใน TypeScript Interface [src/types/dashboard.ts](file:///c:/Users/User/Desktop/Fullstack/perkin-logistics-dashboard/src/types/dashboard.ts)
   - อัปเดต `JOB_COLS` และ `rowVals` ใน [src/lib/db.ts](file:///c:/Users/User/Desktop/Fullstack/perkin-logistics-dashboard/src/lib/db.ts)
2. **การผูก Webhook แจ้งเตือนผ่าน LINE Notify / Telegram:**
   - สามารถ Hook เข้ากับ `PATCH /api/jobs/[jobNo]` เพื่อยิงแจ้งเตือนเมื่องานเปลี่ยนเป็นสถานะสำคัญ

---

## 7. การแก้ไขปัญหาทางเทคนิค (Developer FAQ & Troubleshooting)

| ปัญหา | สาเหตุ | วิธีแก้ไข |
| :--- | :--- | :--- |
| **`connect ETIMEDOUT` บน Supabase** | รันผ่านเน็ตเวิร์กที่ไม่มี IPv6 แล้วใช้ direct host | เปลี่ยน `DATABASE_URL` ให้ชี้ไปที่ `aws-1-ap-northeast-1.pooler.supabase.com:6543` |
| **`password authentication failed`** | รหัสผ่านใน `.env` ไม่ตรงกับ Supabase | ตรวจสอบรหัสผ่านใน Supabase Project Settings > Database แล้วอัปเดตใน `.env` |
| **`NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST` บน Vercel** | Vercel ตั้ง Root Directory เป็น `dashboard` เก่า | ปรับ Root Directory ใน Vercel Dashboard ให้เป็น `null` (repo root) |
| **Vercel Redirect ไปหน้า Login SSO** | เปิด SSO Deployment Protection ไว้ | ปิด `ssoProtection: null` บน Vercel Dashboard Settings |
