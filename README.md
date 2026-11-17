# Perkin Logistics — Operations & Shipment Control Hub
> **Version 0.3.1 (Enterprise Production)**  
> ศูนย์กลางระบบควบคุมและติดตามสถานะงานขนส่งสินค้า พิธีการศุลกากร และระบบควบคุมเที่ยวรถ สำหรับทีมปฏิบัติการ (Operations), ฝ่ายบริการลูกค้า (Customer Service) และฝ่ายบัญชี/การเงิน

---

## สารบัญ (Table of Contents)
1. [ภาพรวมของระบบและสถาปัตยกรรม (System Overview & Architecture)](#1-ภาพรวมของระบบและสถาปัตยกรรม)
2. [คู่มือสำหรับ Developer: วิธีการตั้งค่าแบบ Step-by-Step](#2-คู่มือสำหรับ-developer-วิธีการตั้งค่าแบบ-step-by-step)
   - [สิ่งที่ต้องเตรียมล่วงหน้า (Prerequisites)](#21-สิ่งที่ต้องเตรียมล่วงหน้า-prerequisites)
   - [ขั้นตอนที่ 1: Clone Repository & ติดตั้ง Dependencies](#22-ขั้นตอนที่-1-clone-repository--ติดตั้ง-dependencies)
   - [ขั้นตอนที่ 2: การตั้งค่า Environment Variables (.env)](#23-ขั้นตอนที่-2-การตั้งค่า-environment-variables-env)
   - [ขั้นตอนที่ 3: โครงสร้างฐานข้อมูลและการรัน Migration (PostgreSQL)](#24-ขั้นตอนที่-3-โครงสร้างฐานข้อมูลและการรัน-migration-postgresql)
   - [ขั้นตอนที่ 4: การรันเซิร์ฟเวอร์ในเครื่อง (Local Development)](#25-ขั้นตอนที่-4-การรันเซิร์ฟเวอร์ในเครื่อง-local-development)
   - [ขั้นตอนที่ 5: การทดสอบ Build และความถูกต้องของโค้ด](#26-ขั้นตอนที่-5-การทดสอบ-build-และความถูกต้องของโค้ด)
   - [ขั้นตอนที่ 6: การ Deploy สู่ Vercel Production](#27-ขั้นตอนที่-6-การ-deploy-สู่-vercel-production)
3. [โครงสร้างโค้ดและการทำงานเชิงลึก (Codebase & Technical Details)](#3-โครงสร้างโค้ดและการทำงานเชิงลึก)
   - [โครงสร้างโฟลเดอร์ (Directory Structure)](#31-โครงสร้างโฟลเดอร์-directory-structure)
   - [กลไกการบันทึกข้อมูลแบบ Dual-Database (Supabase + Local LAN)](#32-กลไกการบันทึกข้อมูลแบบ-dual-database)
   - [Optimistic Concurrency Control & Audit Logging](#33-optimistic-concurrency-control--audit-logging)
4. [คู่มือสำหรับผู้ใช้งาน (User & Operations Manual)](#4-คู่มือสำหรับผู้ใช้งาน-user--operations-manual)
   - [4.1 การเข้าใช้งานระบบ](#41-การเข้าใช้งานระบบ)
   - [4.2 การอ่านแดชบอร์ดภาพรวม (Overview KPIs)](#42-การอ่านแดชบอร์ดภาพรวม-overview-kpis)
   - [4.3 การค้นหาและกรองข้อมูลงาน (Jobs Tracking & Quick Search)](#43-การค้นหาและกรองข้อมูลงาน-jobs-tracking--quick-search)
   - [4.4 การตรวจสอบและแก้ไขรายละเอียดงาน (Drawer & Status Update)](#44-การตรวจสอบและแก้ไขรายละเอียดงาน-drawer--status-update)
   - [4.5 การติดตามงานขนส่งและเที่ยวรถ (Transport & POD Tracking)](#45-การติดตามงานขนส่งและเที่ยวรถ-transport--pod-tracking)
   - [4.6 การติดตามเงินสำรองจ่าย (Shipping Advances & Clearing)](#46-การติดตามเงินสำรองจ่าย-shipping-advances--clearing)
   - [4.7 การนำเข้าข้อมูลผ่านไฟล์ Excel (Upload & Staging Preview)](#47-การนำเข้าข้อมูลผ่านไฟล์-excel-upload--staging-preview)
   - [4.8 การสำรองข้อมูลและความปลอดภัย (Safety Snapshots & Audit Trail)](#48-การสำรองข้อมูลและความปลอดภัย-safety-snapshots--audit-trail)
5. [กฎทางธุรกิจและตรรกะข้อมูล (Business Logic & Rules)](#5-กฎทางธุรกิจและตรรกะข้อมูล-business-logic--rules)
6. [การแก้ไขปัญหาที่พบบ่อย (Troubleshooting & FAQ)](#6-การแก้ไขปัญหาที่พบบ่อย-troubleshooting--faq)

---

## 1. ภาพรวมของระบบและสถาปัตยกรรม

Perkin Logistics Dashboard พัฒนาขึ้นเพื่อทดแทนการติดตามงานด้วย Excel ช่วยให้ทีมงานเห็นสถานะงานแบบ Real-time, ตรวจสอบคอขวดของชิปเมนท์, ควบคุมความเสี่ยงเรื่องตู้ตกค้างหรือเอกสารช้า, และบันทึกประวัติการแก้ไขงานทุกขั้นตอนโดยอัตโนมัติ

```mermaid
flowchart TD
    subgraph Clients["ผู้ใช้งานและอุปกรณ์ (Clients)"]
        Browser["Desktop & Mobile Web Browser"]
    end

    subgraph App["Next.js Application (Vercel Serverless / Node.js)"]
        UI["React Server & Client Components"]
        API_Jobs["/api/jobs/[jobNo] (PATCH Edit)"]
        API_Upload["/api/uploads (Excel Parser & Apply)"]
        API_Sync["/api/sync (Real-time Sync)"]
        API_Dash["/api/dashboard (Cached Aggregations)"]
        DB_Module["src/lib/db.ts (pg.Pool Connection Pooler)"]
    end

    subgraph DataLayer["แหล่งจัดเก็บข้อมูล (Data Persistence)"]
        Supabase[("Supabase PostgreSQL (Cloud Master)\n- Port 6543 Pooler (IPv4)\n- 3,532 Jobs / 572 Trips")]
        LocalPG[("Local PostgreSQL (192.168.1.153:5432/Test001)\n- Best-effort LAN Mirroring")]
        JSONCache["Local JSON Fallback Cache\n(data/jobs.json, data/transport.json)"]
    end

    subgraph Automation["ระบบอัตโนมัติภายนอก"]
        n8n["n8n Automation Webhooks\n(POST /webhook/job-edit-v031)"]
        SharePoint["SharePoint Master Excel\n(JOB_Daily_2026 STATUS_Dashboard.xlsx)"]
    end

    Browser --> UI
    UI --> API_Jobs & API_Upload & API_Sync & API_Dash
    API_Jobs & API_Upload & API_Sync --> DB_Module
    DB_Module -->|Primary Write/Read| Supabase
    DB_Module -.->|LAN Mirroring| LocalPG
    DB_Module -.->|Offline Fallback| JSONCache
    API_Jobs -.->|HMAC SHA256| n8n
    API_Sync -.-> SharePoint
```

### สรุปเทคโนโลยีหลัก (Tech Stack)
- **Framework:** Next.js 14.2.16 (App Router, Server Components + Client Hydration)
- **Language:** TypeScript 5.6.3
- **Styling:** Tailwind CSS 3.4.19 + Lucide React Icons
- **Database:** PostgreSQL (Supabase Cloud + Local PostgreSQL 18)
- **Database Driver:** `pg` (Node Postgres with connection pooling)
- **Hosting / CI-CD:** Vercel (Auto Deploy from GitHub `main` branch)

---

## 2. คู่มือสำหรับ Developer: วิธีการตั้งค่าแบบ Step-by-Step

### 2.1 สิ่งที่ต้องเตรียมล่วงหน้า (Prerequisites)
ก่อนเริ่มต้นติดตั้ง ตรวจสอบให้แน่ใจว่าเครื่องของคุณมีเครื่องมือต่อไปนี้:
1. **Node.js:** เวอร์ชัน 18.17.0 ขึ้นไป (แนะนำ Node.js 20 หรือ 22 LTS)
2. **npm:** เวอร์ชัน 9 ขึ้นไป (มาพร้อม Node.js)
3. **Git:** สำหรับจัดการเวอร์ชันของโค้ด
4. **Python (ทางเลือก):** เวอร์ชัน 3.10 ขึ้นไป (จำเป็นเฉพาะเมื่อต้องการรัน Script ประมวลผล Master Excel ขนาดใหญ่ในเครื่องโลคอล)
5. **PostgreSQL Client (ทางเลือก):** สำหรับเปิดดูข้อมูลหรือรันคำสั่ง SQL โดยตรง

---

### 2.2 ขั้นตอนที่ 1: Clone Repository & ติดตั้ง Dependencies
เปิด Terminal (หรือ PowerShell) แล้วรันคำสั่ง:

```bash
# 1. Clone repository จาก GitHub
git clone https://github.com/Suthipong25/Perkin-Logistics-Dashboard.git

# 2. ย้ายเข้าไปในโฟลเดอร์โปรเจกต์
cd Perkin-Logistics-Dashboard

# 3. ติดตั้งแพ็กเกจ Node.js ทั้งหมด
npm install
```

---

### 2.3 ขั้นตอนที่ 2: การตั้งค่า Environment Variables (.env)
สร้างไฟล์ `.env` ที่ root ของโปรเจกต์ (หรือแก้ไขจาก `.env.example`) โดยกำหนดค่าดังนี้:

```ini
# =============================================================================
# PERKIN LOGISTICS DASHBOARD — ENVIRONMENT CONFIGURATION
# =============================================================================

# --- 1. Supabase PostgreSQL Cloud (ฐานข้อมูลหลักสำหรับการเข้าถึงผ่าน Web & Cloud) ---
# แนะนำใช้พอร์ต 6543 (Transaction Pooler - IPv4 Compatible) เพื่อป้องกันปัญหา IPv6 บน Windows LAN
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
> **หมายเหตุเรื่อง Supabase IPv4 Pooler:**  
> โดเมนตรง `db.vdygytdzouvqwypbgqmd.supabase.co` เป็น IPv6 เท่านั้น หากรันบนเครือข่ายออฟฟิศหรือคอมพิวเตอร์ที่ไม่มี IPv6 Gateway ให้ใช้ `aws-1-ap-northeast-1.pooler.supabase.com` พอร์ต `6543` หรือ `5432` ซึ่งรองรับ IPv4 100%

---

### 2.4 ขั้นตอนที่ 3: โครงสร้างฐานข้อมูลและการรัน Migration (PostgreSQL)

ฐานข้อมูล PostgreSQL ใช้ Schema หลัก 4 ตาราง:

1. **`public.jobs`**: จัดเก็บข้อมูลชิปเมนท์หลัก (Primary Key คือ `id` รูปแบบ เช่น `Jan_4_SHAE26010002` หรือ `SHSI26060001`)
2. **`public.transport_trips`**: จัดเก็บข้อมูลเที่ยวรถขนส่งตู้/สินค้า (Primary Key คือ `trip_no`)
3. **`public.job_history`**: บันทึก Audit Log การแก้ไขข้อมูลทุกครั้ง (Job No, Field Name, Old Value, New Value, วันที่แก้ไข)
4. **`public.snapshots`**: บันทึกสถิติ KPI และ Volume รายวัน

#### คำสั่ง SQL สร้างตาราง (DDL):
หากต้องการสร้างตารางใหม่บน PostgreSQL หรือ Database อื่น สามารถรันคำสั่งนี้ได้ทันที:

```sql
-- 1. ตารางชิปเมนท์หลัก
CREATE TABLE IF NOT EXISTS public.jobs (
    id TEXT PRIMARY KEY,
    job_no TEXT NOT NULL,
    service TEXT NOT NULL,
    service_label TEXT,
    status TEXT NOT NULL,
    status_detail TEXT,
    status_raw TEXT,
    customer TEXT,
    consignee TEXT,
    bl TEXT,
    mbl TEXT,
    hbl TEXT,
    join_no TEXT,
    update_status TEXT,
    etd DATE,
    eta DATE,
    job_date DATE,
    month TEXT,
    year INTEGER,
    draft_customs BOOLEAN DEFAULT FALSE,
    advance_doc BOOLEAN DEFAULT FALSE,
    do_released BOOLEAN DEFAULT FALSE,
    customs_filed BOOLEAN DEFAULT FALSE,
    cleared BOOLEAN DEFAULT FALSE,
    draft_date DATE,
    customs_date DATE,
    do_date DATE,
    clear_date DATE,
    advance_date DATE,
    remark TEXT,
    source_sheet TEXT,
    source_row INTEGER,
    running_no INTEGER,
    version INTEGER DEFAULT 1,
    next_action TEXT,
    age_days INTEGER,
    flags JSONB DEFAULT '[]'::jsonb,
    invoice_no TEXT,
    container_type TEXT,
    gross_weight NUMERIC(12,2),
    cbm NUMERIC(12,2),
    commodity TEXT,
    cs_name TEXT,
    data_source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_job_no ON public.jobs(job_no);
CREATE INDEX IF NOT EXISTS idx_jobs_service ON public.jobs(service);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON public.jobs(customer);

-- 2. ตารางเที่ยวรถขนส่ง
CREATE TABLE IF NOT EXISTS public.transport_trips (
    trip_no TEXT PRIMARY KEY,
    job_no TEXT,
    customer TEXT,
    driver TEXT,
    truck_type TEXT,
    deliver_date TEXT,
    status TEXT,
    pod TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transport_job_no ON public.transport_trips(job_no);

-- 3. ตารางบันทึกประวัติการแก้ไข (Audit Trail)
CREATE TABLE IF NOT EXISTS public.job_history (
    id SERIAL PRIMARY KEY,
    job_no TEXT NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source_file TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_history_job_no ON public.job_history(job_no);

-- 4. ตารางบันทึกสถิติ KPI ประจำวัน
CREATE TABLE IF NOT EXISTS public.snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_date TEXT NOT NULL,
    total_jobs INTEGER NOT NULL,
    completed_jobs INTEGER NOT NULL,
    in_progress_jobs INTEGER NOT NULL,
    cancelled_jobs INTEGER NOT NULL,
    services_breakdown JSONB,
    monthly_breakdown JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

### 2.5 ขั้นตอนที่ 4: การรันเซิร์ฟเวอร์ในเครื่อง (Local Development)

รันคำสั่ง:
```bash
npm run dev
```
เปิดเว็บเบราว์เซอร์ไปที่: `http://localhost:3000`  
ระบบจะเชื่อมต่อไปยัง PostgreSQL อัตโนมัติ หากไม่มีการเชื่อมต่อ จะ Fallback ไปอ่านข้อมูลจาก `data/jobs.json` ในทันที

---

### 2.6 ขั้นตอนที่ 5: การทดสอบ Build และความถูกต้องของโค้ด

ก่อนทำการ Commit ทุกครั้ง ให้รันคำสั่ง Build เพื่อตรวจสอบ Typescript และ Route:
```bash
npm run build
```
หากขึ้นข้อความ:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (6/6)
```
แสดงว่าโค้ดทั้งหมดถูกต้องและพร้อมสำหรับ Production

---

### 2.7 ขั้นตอนที่ 6: การ Deploy สู่ Vercel Production

โปรเจกต์นี้ตั้งค่า Continuous Deployment ร่วมกับ Vercel ไว้แล้ว เมื่อ Push โค้ดเข้า Branch `main` บน GitHub:

```bash
git add .
git commit -m "feat: your new feature"
git push origin main
```

Vercel จะทำการ Build และ Deploy เวอร์ชันใหม่โดยอัตโนมัติ

> [!NOTE]
> **การตั้งค่า Project บน Vercel Dashboard:**
> 1. **Root Directory:** ให้เว้นว่างไว้ (`null`) หรืออยู่ที่ root ของโปรเจกต์
> 2. **Environment Variables บน Vercel:** เพิ่มตัวแปร `DATABASE_URL` และ `DIRECT_URL` ในหมวด Environment Variables
> 3. **Deployment Protection:** ตรวจสอบให้แน่ใจว่า `SSO Protection` ถูกปิด เพื่อให้ผู้ใช้ภายนอกเข้าถึงหน้า Dashboard ได้โดยไม่ต้องล็อกอินบัญชี Vercel

---

## 3. โครงสร้างโค้ดและการทำงานเชิงลึก

### 3.1 โครงสร้างโฟลเดอร์ (Directory Structure)

```
perkin-logistics-dashboard/
├── data/                                 # ไฟล์ข้อมูล JSON สำรองและเอกสารต้นฉบับ
│   ├── jobs.json                         # แคชข้อมูลชิปเมนท์หลัก (3,532 รายการ)
│   ├── transport.json                    # แคชข้อมูลเที่ยวรถ (572 รายการ)
│   ├── quality.json                      # รายงานสถิติคุณภาพข้อมูล
│   └── 2026 Booking Report.xlsx          # ไฟล์ Master Excel
├── backups/                              # โฟลเดอร์สำรองข้อมูล Snapshot รายการแก้ไข
├── scripts/                              # สคริปต์ประมวลผลข้อมูล (Python / ETL)
│   ├── standardize_pipeline.py           # ไปป์ไลน์หลักในการ Clean และ Standardize Excel
│   ├── parse_uploaded_excel.py           # สคริปต์แกะโครงสร้าง Excel ที่อัปโหลดเข้ามา
│   └── update_job_postgres.py            # สคริปต์อัปเดตงานผ่าน CLI
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── api/
│   │   │   ├── dashboard/route.ts        # GET: ดึงข้อมูลสรุปสำหรับ Dashboard
│   │   │   ├── jobs/[jobNo]/route.ts     # GET / PATCH: ดูและแก้ไขข้อมูลงานเดี่ยว
│   │   │   ├── uploads/route.ts          # POST: นำเข้าไฟล์ Excel และกดยืนยัน Apply
│   │   │   ├── sync/route.ts             # POST: อัปเดตข้อมูลสด Real-time
│   │   │   └── export/route.ts           # GET: ส่งออกไฟล์ Excel
│   │   ├── layout.tsx                    # Shell หลักของเว็บไซต์
│   │   └── page.tsx                      # Server Component หน้าแรก
│   ├── components/                       # UI Components ทั้งหมด
│   │   ├── DashboardClient.tsx           # หน้าจอหลัก (Navigation, Tabs, Filters)
│   │   ├── JobsTable.tsx                 # ตารางแสดงรายการงานชิปเมนท์
│   │   ├── JobDetailDrawer.tsx           # หน้าต่างสไลด์ดูรายละเอียดและแก้ไขงาน
│   │   ├── TransportView.tsx             # ตารางติดตามงานขนส่งและตู้สินค้า
│   │   ├── AdvancesView.tsx              # หน้าจอติดตามเงินสำรองจ่าย Shipping
│   │   ├── UploadModal.tsx               # หน้าต่างอัปโหลดและ Staging Diff Preview
│   │   └── SafetyControlView.tsx         # หน้าจอจัดการ Snapshot และ Backup
│   ├── lib/
│   │   ├── db.ts                         # โมดูลเชื่อมต่อ PostgreSQL (pg.Pool & Batch Upsert)
│   │   └── data-store.ts                 # โมดูลจัดการ In-memory Cache & Fallback
│   └── types/
│       └── dashboard.ts                  # TypeScript Interface นิยามโมเดลข้อมูล
├── .env                                  # ไฟล์คอนฟิก Environment (ห้ามแชร์ Key ลับ)
├── package.json                          # รายการ Dependencies และ Scripts
└── tailwind.config.ts                    # คอนฟิกชุดสีและสไตล์ Tailwind
```

### 3.2 กลไกการบันทึกข้อมูลแบบ Dual-Database
ใน [src/lib/db.ts](file:///c:/Users/User/Desktop/Fullstack/perkin-logistics-dashboard/src/lib/db.ts) ระบบใช้เทคนิค:
1. **Parameterized Queries:** ป้องกัน SQL Injection 100%
2. **Chunked Multi-Row Upsert:** นำเข้าข้อมูลครั้งละ 100 แถวด้วย `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` ทำให้การบันทึกข้อมูล 3,500 งานใช้เวลาไม่ถึง 2 วินาที
3. **Resilient Dual-Write:** บันทึกลง Supabase Cloud เสมอ และหากเซิร์ฟเวอร์ต่ออยู่ใน LAN เดียวกับออฟฟิศ จะทำการเขียนสำรองลง `192.168.1.153:5432/Test001` โดยอัตโนมัติ

### 3.3 Optimistic Concurrency Control & Audit Logging
เพื่อป้องกันการที่พนักงาน 2 คนเปิดงานเดียวกันแล้วบันทึกทับข้อมูลกัน:
- ในตาราง `jobs` จะมีฟิลด์ `version` (จำนวนเต็มเริ่มต้นที่ 1)
- เมื่อส่งแก้ไขผ่าน `PATCH /api/jobs/[jobNo]` จะส่ง `expectedVersion` เข้ามาด้วย
- หากมีผู้ใช้อื่นแก้ไขงานนั้นไปก่อนหน้า ระบบจะส่งรหัส **HTTP 409 Conflict** พร้อมแจ้งเตือนให้ผู้ใช้กด Refresh ข้อมูลล่าสุดก่อนบันทึก
- ทุกฟิลด์ที่ถูกแก้ไข จะถูกบันทึกประวัติลง `public.job_history` โดยอัตโนมัติเพื่อตรวจสอบย้อนหลังได้

---

## 4. คู่มือสำหรับผู้ใช้งาน (User & Operations Manual)

### 4.1 การเข้าใช้งานระบบ
- **URL เว็บไซต์:** [https://perkin-logistics-dashboard-suthipongs-projects-2d06d15d.vercel.app/](https://perkin-logistics-dashboard-suthipongs-projects-2d06d15d.vercel.app/)
- ใช้งานได้ทั้งบนคอมพิวเตอร์ตั้งโต๊ะ โน้ตบุ๊ก แท็บเล็ต และมือถือ

---

### 4.2 การอ่านแดชบอร์ดภาพรวม (Overview KPIs)
เมื่อเปิดหน้าเว็บ หน้าแรกจะแสดงการ์ดสรุปสถานะการปฏิบัติการ (Operational Health):

1. **ปริมาณชิปเมนท์รวม (Volume):** แสดงจำนวนงานทั้งหมดสะสม (เช่น 3,532 งาน) แบ่งเป็นงานหลักและงานรถขนส่ง
2. **อัตราปิดงานสำเร็จ (Delivery Rate):** เปอร์เซ็นต์งานที่ดำเนินพิธีการและส่งมอบสินค้าเรียบร้อยแล้ว (เช่น 97.2%)
3. **งานที่กำลังดำเนินการ (Active / In Progress):** แสดงงานที่ยังอยู่ระหว่างขั้นตอน เช่น รอเอกสาร, รอดราฟท์, รอปล่อยตู้
4. **งานเลยกำหนด (Attention / Overdue):** แสดงงานที่เลยกำหนดวัน ETD/ETA แต่ยังไม่ถูกปิดงาน เพื่อให้ทีมงานเร่งติดตาม
5. **สัดส่วนบริการ (Service Distribution):** แยกตาม Sea Import, Sea Export, Air Import, Air Export, Transport และ Freight
6. **กราฟแนวโน้มรายเดือน (2026 Monthly Trend):** แสดงปริมาณงานจริงเปรียบเทียบในแต่ละเดือน

---

### 4.3 การค้นหาและกรองข้อมูลงาน (Jobs Tracking & Quick Search)
ในแถบเมนู **"งานทั้งหมด (Jobs)"**:
- **ช่องค้นหาด่วน (Quick Search):** สามารถพิมพ์ค้นหาได้ทันทีด้วย:
  - หมายเลขงาน (Job No) เช่น `SHSI26060085`, `SHAE26010002`
  - เลขใบตราส่งสินค้า (B/L No / AWB No)
  - ชื่อลูกค้า หรือ Consignee
  - เลขที่ใบกำกับสินค้า (Invoice No)
- **แถบกรองประเภทบริการ (Service Filter):** เลือกดูเฉพาะประเภท เช่น `SEA Import`, `AIR Export` หรือ `ทั้งหมด`
- **แถบกรองสถานะ (Status Filter):** เลือกดูเฉพาะ `Completed`, `In Progress` หรือ `Cancelled`

---

### 4.4 การตรวจสอบและแก้ไขรายละเอียดงาน (Drawer & Status Update)
1. **เปิดดูรายละเอียด:** คลิกที่แถวของงานที่ต้องการในตาราง จะมีหน้าต่างสไลด์ (Drawer) ปรากฏขึ้นทางขวามือ
2. **5 พิธีการศุลกากรหลัก (Milestones):**
   - 📝 **Draft Customs:** ตรวจสอบดราฟท์ใบขน
   - 📑 **Advance Doc:** จัดการเอกสารเบิกจ่าย
   - 📦 **D/O Released:** ได้รับเอกสารปล่อยสินค้า
   - 🏛️ **Customs Filed:** ยิงใบขนสินค้าศุลกากร
   - 🏁 **Cleared:** ตรวจปล่อยสินค้าเรียบร้อย
3. **การแก้ไขข้อมูล:**
   - สามารถแก้ไขวันที่ (Draft Date, Customs Date, D/O Date, Clear Date)
   - ปรับสถานะงานเป็น `In Progress` หรือ `Completed`
   - เพิ่มหมายเหตุ (Remark) เช่น ติดตรวจปล่อย, รอผล X-Ray, รอชำระค่าบริการ
4. **การบันทึก:** คลิกปุ่ม **"บันทึกข้อมูล (Save Changes)"** ข้อมูลจะถูกส่งไปอัปเดตลงฐานข้อมูล PostgreSQL และอัปเดตสถานะบนหน้าเว็บทันที

---

### 4.5 การติดตามงานขนส่งและเที่ยวรถ (Transport & POD Tracking)
ในแถบเมนู **"ขนส่ง & เที่ยวรถ (Transport)"**:
- แสดงข้อมูลเที่ยวรถทุกคัน (Trip No), ประเภทรถ (เช่น 4 Wheel, 6 Wheel, 20' DC, 40' HC)
- ติดตามชื่อคนขับรถ, วันที่ส่งมอบสินค้า (Deliver Date)
- ติดตามเอกสารใบส่งสินค้า/ใบตอบรับ (POD Status)
- เชื่อมโยงกับหมายเลขชิปเมนท์หลัก (Job No) ช่วยให้ค้นหาได้ว่างานไหนใช้รถคันใด

---

### 4.6 การติดตามเงินสำรองจ่าย (Shipping Advances & Clearing)
ในแถบเมนู **"เงินสำรองจ่าย (Advances)"**:
- รวบรวมรายการเงินทดรองจ่ายสำหรับงานชิปเมนท์ (เช่น ค่า D/O, ค่าธรรมเนียมท่าเรือ, ภาษีศุลกากร)
- แสดงแถบเตือนสีแดง (Overdue Alert) สำหรับรายการที่เบิกเงินไปแล้วเกินกำหนดเวลาแต่ยังไม่ได้ส่งเอกสารเคลียร์คืนบัญชี ช่วยให้ทีมงานเร่งรัดติดตามได้อย่างทันท่วงที

---

### 4.7 การนำเข้าข้อมูลผ่านไฟล์ Excel (Upload & Staging Preview)
เมื่อมีไฟล์ข้อมูลใหม่จากแผนก หรือรายงานสรุปจากระบบ FWD:
1. ไปที่เมนู **"นำเข้าข้อมูล (Upload)"** ด้านขวาบน
2. ลากไฟล์ Excel (`.xlsx`) มาวาง หรือกดเลือกไฟล์
3. **ระบบ Staging Preview:**
   - ระบบจะยังไม่บันทึกทับข้อมูลเดิมทันที
   - ระบบจะคำนวณและแสดงผลเปรียบเทียบ (Diff) ให้เห็นว่า:
     - มีงานใหม่กี่รายการ (New Jobs)
     - มีงานเดิมที่จะถูกอัปเดตกี่รายการ (Updated Jobs)
     - มีข้อมูลฟิลด์ใดบ้างที่เปลี่ยนแปลง (เช่น วันที่ส่งมอบเปลี่ยน, สถานะเปลี่ยน)
4. ตรวจสอบความถูกต้อง แล้วกดปุ่ม **"ยืนยันบันทึกข้อมูล (Apply Changes)"** ข้อมูลจะถูกบันทึกลงระบบและเขียนลง PostgreSQL ทันที

---

### 4.8 การสำรองข้อมูลและความปลอดภัย (Safety Snapshots & Audit Trail)
ในแถบเมนู **"ความปลอดภัย (Safety & Backup)"**:
- ทุกครั้งที่มีการอัปโหลดไฟล์หรือกดยืนยันบันทึก ระบบจะสร้าง **Snapshot สำรองข้อมูล** ไว้อัตโนมัติในโฟลเดอร์ `backups/`
- สามารถดาวน์โหลดไฟล์สำรองของแต่ละช่วงเวลามาตรวจสอบย้อนหลังได้
- ดูรายงาน **Data Quality Audit** ตรวจสอบรายการที่ไม่มีเลข B/L, ชื่องานซ้ำ, หรือวันที่ไม่สมบูรณ์

---

## 5. กฎทางธุรกิจและตรรกะข้อมูล (Business Logic & Rules)

| รายการ | กฎและการคำนวณทางธุรกิจ |
| :--- | :--- |
| **การนับสถานะ Completed** | ชิปเมนท์ที่มีสถานะ `Completed` หรือสถานะระบุว่า "ส่งมอบแล้ว", "ตรวจปล่อยเรียบร้อย", หรือมีประทับเวลา Clearance สมบูรณ์ |
| **การคิดวันเกินกำหนด (Overdue)** | - สำหรับงานนำเข้า (**Import**): ใช้เปรียบเทียบกับวันที่เรือ/เครื่องบินเข้า (**ETA**)<br>- สำหรับงานส่งออก (**Export**): ใช้เปรียบเทียบกับวันที่เรือ/เครื่องบินออก (**ETD**)<br>หากพ้นกำหนดเวลาดังกล่าวแล้วสถานะยังไม่เป็น Completed จะถูกจัดเป็นงานค้างทันที |
| **การเชื่อมโยง Job No กับ เที่ยวรถ** | หมายเลขงานอาจมีคำนำหน้า `SH` (เช่น `SHSI...`) หรือไม่มีคำนำหน้า ระบบจะทำการจับคู่แบบสลับ Prefix อัตโนมัติเพื่อให้ผูกกับเที่ยวรถได้อย่างแม่นยำ |
| **การคุ้มครองสิทธิ์ (Role-based Action)** | ผู้ใช้งานทั่วไป (Ops/CS) สามารถแก้ไขสถานะ, วันที่พิธีการ, และ Remark ได้ สำหรับการเปลี่ยนชื่อลูกค้าหรือเลข B/L หลักต้องดำเนินการโดยผู้ดูแลระบบ (Admin) |

---

## 6. การแก้ไขปัญหาที่พบบ่อย (Troubleshooting & FAQ)

### Q1: หน้าเว็บแสดงผลได้ แต่ข้อมูลไม่บันทึกลง PostgreSQL
- **สาเหตุ:** การตั้งค่า `DATABASE_URL` ในไฟล์ `.env` ไม่ถูกต้อง หรือเน็ตเวิร์กบล็อกพอร์ต
- **วิธีแก้:** ตรวจสอบว่าใน `.env` ใช้ Host `aws-1-ap-northeast-1.pooler.supabase.com` และ Port `6543` (Pooler Mode) ไม่ใช่ Direct IPv6

### Q2: ขึ้นข้อความเตือน 409 Conflict ขณะกดบันทึกงาน
- **สาเหตุ:** มีเพื่อนร่วมงานเปิดแก้ไขงานเดียวกันและกดบันทึกไปก่อนหน้า
- **วิธีแก้:** กดปุ่มปิดหน้าต่าง แล้วคลิกเปิดงานนั้นใหม่อีกครั้งเพื่อโหลดข้อมูลเวอร์ชันล่าสุดของเพื่อนร่วมงาน จากนั้นจึงทำการแก้ไขและบันทึกใหม่

### Q3: นำเข้าไฟล์ Excel แล้วระบบแจ้งว่าไม่พบฟิลด์ที่กำหนด
- **สาเหตุ:** หัวตาราง (Header) ใน Excel มีการเปลี่ยนชื่อ หรือเป็น Template คนละเวอร์ชัน
- **วิธีแก้:** ตรวจสอบชื่อคอลัมน์ใน Excel ให้ตรงตามรูปแบบมาตรฐาน เช่น `Job No`, `Customer`, `Status`, `B/L No` หรือนำเข้าผ่าน Template มาตรฐานที่ระบบรองรับ

### Q4: ต้องการกู้คืนข้อมูลหลังจากกด Apply ผิดพลาด
- **วิธีแก้:** ไปที่แถบเมนู **"Safety & Backup"** แล้วเลือกดาวน์โหลด Snapshot ตัวล่าสุดก่อนที่จะเกิดการกู้คืน จากนั้นนำไฟล์ดังกล่าวมาอัปโหลดกลับเข้าระบบ

---

## 7. ข้อมูลติดต่อทีมผู้พัฒนา (Contact & Support)

หากพบปัญหาในการตั้งค่าระบบ หรือต้องการต่อเติมฟีเจอร์เพิ่มเติม ติดต่อ:
- **ฝ่ายพัฒนาระบบโลจิสติกส์ (Perkin Logistics IT & Operations Team)**
- **GitHub Repository:** [https://github.com/Suthipong25/Perkin-Logistics-Dashboard](https://github.com/Suthipong25/Perkin-Logistics-Dashboard)
- **Production Dashboard:** [https://perkin-logistics-dashboard-suthipongs-projects-2d06d15d.vercel.app/](https://perkin-logistics-dashboard-suthipongs-projects-2d06d15d.vercel.app/)
