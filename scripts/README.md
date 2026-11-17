# Scripts Directory (ETL, Data Pipelines & Maintenance)

โฟลเดอร์นี้รวบรวม Python Script สำหรับการประมวลผลข้อมูล (ETL), การแปลงไฟล์ Excel จาก SharePoint, การซิงค์ฐานข้อมูล และการบำรุงรักษาข้อมูล

---

## รายการสคริปต์สำคัญ (Core Pipelines)

| สคริปต์ | หน้าที่การทำงาน | การเรียกใช้ |
| :--- | :--- | :--- |
| **`standardize_pipeline.py`** | **[สคริปต์หลัก]** ประมวลผล Master Excel (`2026 Booking Report.xlsx` และ `JOB_Daily_2026 STATUS_Dashboard.xlsx`) เพื่อสร้างไฟล์ `jobs.json` และ `transport.json` ที่สมบูรณ์ พร้อมคำนวณ KPIs | `python scripts/standardize_pipeline.py` |
| **`sqlite_db.py`** | อัปเดตและซิงค์ข้อมูลลงฐานข้อมูล SQLite ในเครื่อง (`data/perkin_logistics.db`) พร้อมบันทึก Audit History | `python scripts/sqlite_db.py` |
| **`migrate_to_postgres.py`** | แปลงข้อมูลจาก SQLite/JSON ไปเป็น PostgreSQL SQL (`sql/postgres_migration.sql`) และสามารถ Execute ตรงเข้าฐานข้อมูลได้ | `python scripts/migrate_to_postgres.py` |
| **`sync_from_postgres.py`** | ดึงข้อมูลชิปเมนท์และเที่ยวรถล่าสุดจาก PostgreSQL กลับมาอัปเดตไฟล์ `data/jobs.json` และ `data/transport.json` | `python scripts/sync_from_postgres.py` |
| **`parse_uploaded_excel.py`** | สคริปต์ที่ Next.js API (`/api/uploads`) เรียกใช้เพื่อแกะโครงสร้างไฟล์ Excel ที่ผู้ใช้อัปโหลดสำหรับทำ Staging Preview | เรียกใช้อัตโนมัติผ่าน Web API |
| **`update_job_postgres.py`** | อัปเดตข้อมูลงานเดี่ยวลงตาราง `public.jobs` ใน PostgreSQL พร้อมบันทึกประวัติการแก้ไข | `python scripts/update_job_postgres.py <JobNo> '<JSON>'` |
| **`update_job_sqlite.py`** | อัปเดตข้อมูลงานเดี่ยวลงตาราง SQLite พร้อมบันทึกประวัติ | `python scripts/update_job_sqlite.py <JobNo> '<JSON>'` |
| **`sync_live_sharepoint.py`** | สคริปต์ดึงและซิงค์ไฟล์ข้อมูลอัตโนมัติจาก Microsoft SharePoint | `python scripts/sync_live_sharepoint.py` |

---

## สคริปต์ตรวจสอบและการวิเคราะห์ข้อมูล (Inspection & Quality)

- **`inspect_diff.py`**: เปรียบเทียบความแตกต่างของแถวข้อมูลระหว่างไฟล์
- **`inspect_exact_headers.py`**: ตรวจสอบชื่อคอลัมน์และตำแหน่ง Header ของแต่ละชีทใน Excel
- **`inspect_ops_sheets.py`**: ตรวจสอบชีทการปฏิบัติการ (Ops Sheets)
- **`enrich_carrier_and_routing.py`**: วิเคราะห์และเติมชื่อสายเรือ (Carrier) และสายการบินจาก B/L Prefix
- **`gen_update_status_sql.py`**: สร้าง SQL คำสั่งอัปเดตสถานะงานโดยเฉพาะ
