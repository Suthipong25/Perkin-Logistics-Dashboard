# SQL Directory (Database Schemas & Migrations)

โฟลเดอร์นี้รวบรวมไฟล์สคริปต์ SQL ทั้งหมดสำหรับสร้างตารางและรัน Migration ของฐานข้อมูล **PostgreSQL** และ **SQLite**

---

## รายการไฟล์ SQL

| ไฟล์ | วัตถุประสงค์ | ฐานข้อมูลเป้าหมาย |
| :--- | :--- | :--- |
| **`postgres_migration.sql`** | **[สคริปต์หลัก]** สร้างตาราง `public.jobs`, `public.transport_trips`, `public.job_history`, `public.snapshots` พร้อม Index และข้อมูล Seed ครบถ้วน (3,532 งาน และ 572 เที่ยวรถ) | PostgreSQL (Supabase / Local 18) |
| **`schema_sqlite.sql`** | DDL สร้าง Schema ฐานข้อมูลภายในเครื่องของ SQLite (`data/perkin_logistics.db`) | SQLite 3 |
| **`002_seed_data.sql`** | ข้อมูลตั้งต้นสำหรับทดสอบระบบ (Seed records) | PostgreSQL |
| **`update_status_only.sql`** | ชุดคำสั่ง SQL อัปเดตเฉพาะคอลัมน์สถานะและ Detail | PostgreSQL |

---

## ตัวอย่างการนำไปใช้รันบน PostgreSQL

```bash
# นำเข้า SQL ผ่าน psql ไปยัง PostgreSQL
psql -h aws-1-ap-northeast-1.pooler.supabase.com -p 5432 -U postgres.vdygytdzouvqwypbgqmd -d postgres -f sql/postgres_migration.sql
```
