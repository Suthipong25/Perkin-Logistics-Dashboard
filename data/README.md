# Data Directory (Application State, Master Workbooks & Cache)

โฟลเดอร์นี้รวบรวมไฟล์ข้อมูลหลักที่ระบบแดชบอร์ดใช้งาน ทั้งไฟล์ Master Excel, In-memory JSON Cache และ SQLite Database

---

## รายการไฟล์ในโฟลเดอร์

| ไฟล์ | ขนาดโดยประมาณ | คำอธิบาย |
| :--- | :--- | :--- |
| **`jobs.json`** | ~4.7 MB | ข้อมูลชิปเมนท์หลักทั้งหมด (3,532 รายการ) ใช้เป็น In-memory Cache ความเร็วสูงระดับ sub-millisecond และเป็น Offline Fallback เมื่อต่อฐานข้อมูลไม่ได้ |
| **`transport.json`** | ~240 KB | ข้อมูลเที่ยวรถขนส่งสินค้า (Inland Transport) ทั้งหมด 572 เที่ยวรถ พร้อมรายละเอียดคนขับ ทะเบียน ประเภทรถ และสถานะส่งมอบ |
| **`quality.json`** | ~3 KB | รายงานวิเคราะห์คุณภาพข้อมูล สรุปจำนวนงานตาม Service, Status, Missing Fields, Duplicate Checks |
| **`quality_alerts.json`** | ~1 KB | รายการแจ้งเตือนความผิดปกติของข้อมูล (เช่น วันที่ไม่อยู่ในเกณฑ์, ข้อมูลที่ไม่ครบถ้วน) |
| **`perkin_logistics.db`** | ~3.8 MB | ฐานข้อมูล SQLite ในเครื่อง สำหรับจัดเก็บข้อมูล Audit Trail และประวัติการแก้ไขในระดับ Local |
| **`2026 Booking Report.xlsx`** | ~15.4 MB | ไฟล์ Master Booking Report ฉบับสมบูรณ์ (Source of Truth) ของปี 2026 ที่ซิงค์มาจาก SharePoint |
| **`JOB_Daily_2026 STATUS_Dashboard.xlsx`** | ~7.4 MB | ไฟล์บันทึกการติดตามงานประจำวันของทีมปฏิบัติการ (Ops Tracking, ดราฟท์ใบขน, วันที่ตรวจปล่อย) |
