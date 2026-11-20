# Perkin Logistics — Operations & Shipment Control Hub
> **Version 0.3.1 (Enterprise Production)**  
> ศูนย์กลางระบบควบคุมและติดตามสถานะงานขนส่งสินค้า พิธีการศุลกากร และระบบควบคุมเที่ยวรถ สำหรับทีมปฏิบัติการ (Operations), ฝ่ายบริการลูกค้า (Customer Service), ฝ่ายบัญชี/การเงิน และผู้บริหาร

[![Production Status](https://img.shields.io/badge/Production-Live%20Ready-emerald)](https://perkin-logistics-dashboard-suthipongs-projects-2d06d15d.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.16-black)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/PostgreSQL-Supabase%20Cloud-blue)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()



---

## 📚 เอกสารคู่มือระบบ (Quick Documentation Links)

เพื่อความสะดวกในการศึกษาและใช้งาน ระบบได้แยกคู่มือออกเป็น 2 เล่มเฉพาะทางอย่างชัดเจน:

| คู่มือ | สำหรับกลุ่มผู้อ่าน | เนื้อหาสำคัญ | ลิงก์เข้าดู |
| :--- | :--- | :--- | :--- |
| 👨‍💻 **คู่มือนักพัฒนา (Developer Guide)** | Software Engineers, DevOps, และผู้ดูแลระบบ | สถาปัตยกรรมระบบ, วิธีติดตั้งแบบ Step-by-Step, การตั้งค่า `.env`, สคริปต์ SQL Migration, การทำงานของ Database Dual-Write, API Endpoints และการ Deploy | 📖 [เปิดอ่าน DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) |
| 👥 **คู่มือการใช้งาน (User Guide)** | ทีมงาน Operations, Customer Service, Shipping และบัญชี | วิธีอ่านแดชบอร์ด, การค้นหางาน, การตรวจสอบ 5 ขั้นตอนศุลกากร, การอัปเดตสถานะงาน, การติดตามเที่ยวรถขนส่ง, การเฝ้าระวังเงินสำรองจ่าย และการนำเข้าไฟล์ Excel | 📖 [เปิดอ่าน USER_GUIDE.md](./USER_GUIDE.md) |

---

## ⚡ สรุปวิธีเริ่มต้นด่วนสำหรับ Developer (Quickstart in 3 Steps)

```bash
# 1. Clone repository และติดตั้ง dependencies
git clone https://github.com/Suthipong25/Perkin-Logistics-Dashboard.git
cd Perkin-Logistics-Dashboard
npm install

# 2. ตั้งค่าไฟล์ .env (คัดลอกจาก .env.example)
# ตรวจสอบ DATABASE_URL ชี้ไปยัง Supabase หรือ PostgreSQL

# 3. รันเซิร์ฟเวอร์ทดสอบ
npm run dev
```
เปิดบราวเซอร์ไปที่: `http://localhost:3000`  
*(อ่านรายละเอียดการตั้งค่าแบบเจาะลึกได้ใน [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md))*

---

## 🌟 จุดเด่นและฟังก์ชันหลักของระบบ (Key Features)

1. **ภาพรวมการปฏิบัติการแบบ Real-time (Operational Health):**
   - แสดงสถิติชิปเมนท์สะสม (3,532 งาน) อัตราปิดงานสำเร็จ (97.2%)
   - ติดตามงานที่ยังเปิดอยู่ (Active Jobs) และแจ้งเตือนงานที่เลยกำหนดวัน ETD/ETA ทันที
2. **ค้นหาและกรองข้อมูลด่วน (Fast Filter & Search):**
   - ค้นหาได้ด้วย Job No, เลข B/L / AWB, ชื่อลูกค้า หรือ Invoice No แบบทันที
   - แยกหมวดหมู่ตาม 6 บริการหลัก: `SEA Import`, `SEA Export`, `AIR Import`, `AIR Export`, `Transport` และ `Freight`
3. **ตรวจสอบ 5 พิธีการศุลกากร (Milestone Tracking):**
   - ติดตามขั้นตอน: Draft Customs ➔ Advance Doc ➔ D/O Released ➔ Customs Filed ➔ Cleared
   - หน้าต่าง Drawer สำหรับแก้ไขสถานะ ใส่วันที่ และบันทึกหมายเหตุการปฏิบัติการ (Remark)
4. **ระบบควบคุมเที่ยวรถขนส่ง (Inland Transport Hub):**
   - ติดตามเที่ยวรถ 572 เที่ยว, ตรวจสอบทะเบียน, ชื่อคนขับรถ, วันที่ส่งมอบ และใบรับรองส่งของ (POD)
5. **ระบบควบคุมเงินสำรองจ่าย (Shipping Advances):**
   - เฝ้าระวังรายการเบิกเงินทดรองจ่ายที่ค้าง Clearing เกินกำหนด เพื่อป้องกันความเสี่ยงทางการเงิน
6. **ระบบนำเข้าไฟล์ Excel อัจฉริยะ (Upload & Staging Preview):**
   - ตรวจสอบความถูกต้องและแสดงผลเปรียบเทียบ (Diff) งานใหม่/งานที่แก้ไข ก่อนกดยืนยันบันทึกจริง
7. **ระบบจัดเก็บข้อมูลแบบ Dual-Storage (Supabase Cloud + Local LAN):**
   - บันทึกข้อมูลลง Cloud PostgreSQL สำหรับใช้งานได้จากทุกที่ตลอด 24 ชม. และซิงค์ลง Local PostgreSQL ในออฟฟิศคู่ขนาน

---

## 📁 แผนผังโฟลเดอร์ของโปรเจกต์ (Project Directory Structure)

```text
perkin-logistics-dashboard/
├── 📂 src/                  # ซอร์สโค้ด Next.js App Router (UI Components, API Routes, DB Modules)
├── 📂 data/                 # ไฟล์ข้อมูล Master และ In-memory Cache (jobs.json, transport.json)
├── 📂 sql/                  # สคริปต์ SQL DDL และ Migration สำหรับ PostgreSQL และ SQLite
├── 📂 scripts/              # สคริปต์ Python ETL และการประมวลผลข้อมูล
├── 📂 docs/                 # เอกสารสถาปัตยกรรม แผนงาน และไฟล์ตั้งค่า n8n
├── 📂 backups/              # โฟลเดอร์สำรองข้อมูล Snapshot อัตโนมัติ
├── 📂 public/               # รูปภาพ โลโก้ และ Font สำหรับหน้าเว็บ
│
├── 📖 DEVELOPER_GUIDE.md    # [สำหรับ Developer] คู่มือการติดตั้งและต่อยอดระบบแบบ Step-by-Step
├── 📖 USER_GUIDE.md         # [สำหรับผู้ใช้ทั่วไป] คู่มือการใช้งานหน้าเว็บและฟังก์ชันต่างๆ
├── 📄 README.md             # หน้าหลักแนะนำระบบและสารบัญเอกสาร
└── ⚙️ package.json / .env   # การตั้งค่าระบบมาตรฐาน
```

---

## 👥 ติดต่อสอบถามและทีมพัฒนา (Maintainers)
- **Perkin Logistics IT & Operations Engineering Team**
- **GitHub Repository:** [https://github.com/Suthipong25/Perkin-Logistics-Dashboard](https://github.com/Suthipong25/Perkin-Logistics-Dashboard)
