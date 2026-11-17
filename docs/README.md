# Documentation Directory (Architecture, Specs & Workflows)

โฟลเดอร์นี้รวบรวมเอกสารสถาปัตยกรรม แผนงานระบบ ข้อกำหนดเชิงเทคนิค และการตั้งค่าระบบอัตโนมัติภายนอก

---

## สารบัญเอกสาร (Document Index)

### 1. สถาปัตยกรรมและไดอะแกรม (Architecture Diagrams)
- **`architecture-v0.3.png` / `architecture-v0.3.svg`**: ไดอะแกรมสถาปัตยกรรมระบบเวอร์ชัน 0.3.1 (Current Production) แสดงการเชื่อมโยง Next.js App Router, PostgreSQL (Supabase Cloud + Local LAN), n8n Automation และ SharePoint
- **`architecture-v0.2.png` / `architecture-v0.2.svg`**: ไดอะแกรมระบบเวอร์ชันก่อนหน้า (v0.2)

### 2. ข้อกำหนดเชิงเทคนิคและสเปกการทำงาน (Technical Specifications)
- **`Web-Editing-Spec-TH.md`**: ข้อกำหนดระบบแก้ไขงานผ่านเว็บ (Drawer Edit), การส่งสัญญาณ Webhook ด้วยลายเซ็นดิจิทัล HMAC-SHA256, และการป้องกันความขัดแย้ง (Optimistic Concurrency Control)
- **`SMART_UPDATE_STATUS_SPEC.md`**: กฎและข้อกำหนดการจัดกลุ่มสถานะงานแบบอัจฉริยะ (Smart Status Mapping) จากไฟล์ระบบ FWD
- **`FWD-Dashboard-Plan-v0.3-TH.md`**: แผนงานการพัฒนาระบบเวอร์ชัน 0.3 (Comprehensive Development Plan)
- **`FWD-Dashboard-Plan-v0.2-TH.md`**: แผนงานเวอร์ชัน 0.2
- **`FWD-Dashboard-Plan-TH.md`**: แผนงานเวอร์ชันเริ่มต้น (v0.1)

### 3. ระบบอัตโนมัติ (Automation & n8n Workflows)
- **`n8n-workflow-2-web-edit-writeback.json`**: ไฟล์คอนฟิก Workflow ของ n8n สำหรับรับ Event การแก้ไขงานจากเว็บแดชบอร์ด แล้วนำไปเขียนอัปเดตกลับลง Master Excel บน SharePoint อัตโนมัติ
