# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: HTML5, Modern CSS / Tailwind CSS, Chart.js for data visualization, and Vanilla JS for fast in-browser interaction.

## Users

- **Logistics Operations Managers & Supervisors:** ต้องการเห็นภาพรวมงานทุกประเภท (Sea Import/Export, Air Import/Export, Transport), ติดตามคอขวด, และงานที่สถานะยังไม่เสร็จสิ้น (Job Control, Job Waiting).
- **Customer Service (CS) & Operations Officers:** ต้องการค้นหางานด่วน (Quick Search by Job No. / B/L / Invoice No.), ตรวจสอบสถานะการปล่อยตู้/รับสินค้า และวันที่ยิงใบขน.
- **Shipping & Accounting Coordinators:** ต้องการตรวจสอบรายการเบิกเงินสำรองจ่าย (Shipping Advance) ที่เกินกำหนด (เช่น เกิน 1–16 วัน) เพื่อเร่งรัดเอกสารปิดชุดและทำ Clearing คืนเงิน.

## Product Purpose

เว็บแดชบอร์ดศูนย์กลางควบคุมและติดตามสถานะงานขนส่งสินค้าและโลจิสติกส์ (Logistics Operations & Shipment Tracking Hub) ที่ประมวลผลข้อมูลจากระบบ FWD และ SharePoint โดยอัตโนมัติ เพื่อทดแทนการบันทึกมือใน Excel ลดความผิดพลาดของข้อมูล และเพิ่มความโปร่งใสในการปฏิบัติงานแบบเรียลไทม์

## Positioning

ระบบติดตามสถานะโลจิสติกส์แบบ All-in-One ที่เชื่อมโยงข้อมูลตั้งแต่ระดับภาพรวม (Executive KPIs) ไปจนถึงระดับรายตู้ รายเที่ยวขนส่ง และรายการ Advance/Clearing ทางการเงินอย่างแม่นยำ พร้อมระบบแจ้งเตือนเชิงรุก (Proactive Alerting)

## Operating Context

- เชื่อมโยงข้อมูลผ่านระบบ n8n Automation จากไฟล์ Export ของระบบ FWD / e-Customs / e-Freight
- แสดงผลผ่านหน้าเว็บเบราว์เซอร์ทั้งบนหน้าจอ Desktop ในสำนักงาน และอุปกรณ์พกพาของทีมงานหน้างาน
- นำเสนอข้อมูลสถานะ 3 มิติ: ด้านพิธีการศุลกากร (Draft/ยิงใบขน), ด้านการขนส่ง (หัวลาก/รถร่วม/ตู้), และด้านการเงิน (Advance/Clearing)

## Capabilities and Constraints

- **Capabilities:**
  - Real-time KPI Overview (Total Jobs, Completed, In Progress, Overdue Advance Alerts)
  - Interactive Filter by Service: SEA Import, AIR Import, SEA Export, AIR Export, Transport
  - Multi-parameter Fast Search: Job No, Customer, Container/Truck No, B/L, Invoice No.
  - Risk & Exception Highlighting: งานที่เบิกเงินเกินกำหนด, ตู้ติดปัญหา, งานค้างส่ง
  - Customer Intelligence: สรุปสัดส่วนงานของลูกค้ารายสำคัญ (Top 10 Customers)
- **Constraints:**
  - Read-Only Dashboard for end-users: ป้องกันการแก้ไขตัวเลขหรือสูตรคำนวณโดยไม่ได้ตั้งใจ
  - Data Protection: ต้องคัดกรองหรือปกปิดข้อมูลส่วนบุคคลที่ละเอียดอ่อน (เช่น เลขบัตรประชาชนคนขับ)

## Brand Commitments

- **Tone & Voice:** น่าเชื่อถือ ชัดเจน แม่นยำ สไตล์องค์กรโลจิสติกส์ระดับสากล
- **Color Identity:** Deep Navy Blue / Slate (ฐานความมั่นคง), Emerald Green (งานเสร็จสิ้น/ปลอดภัย), Amber/Orange (งานกำลังดำเนินการ/รอเรือเข้า), Crimson Red (แจ้งเตือนเร่งด่วน/เกินกำหนด)

## Evidence on Hand

- ข้อมูลจริงจาก FWD Export ประกอบด้วย:
  - ข้อมูล Sea Export Form (Booking dates June - July 2026)
  - สรุปสถานะงาน Consignee ของ SAVE Logistics
  - ตารางสถานะงาน Air Import, Air Export, Sea Import, Sea Export
  - ตารางขนส่ง (Transport) และประวัติรถขนส่ง (หัวลาก/ตู้คอนเทนเนอร์)
  - รายการควบคุมการเบิกเงิน Shipping (Advance Control & Clearing List)

## Product Principles

1. **Clarity Over Clutter:** จัดลำดับความสำคัญของข้อมูลให้ผู้ใช้สแกนหาสิ่งที่ต้องทำได้ภายใน 3 วินาที
2. **Action-Oriented Exceptions:** งานที่มีปัญหาหรือเกินกำหนดต้องโดดเด่นและมีข้อมูลพร้อมสำหรับการติดต่อแก้ไขทันที
3. **Data Integrity Guaranteed:** โครงสร้างข้อมูลสอดคล้องกับระบบ FWD ดั้งเดิมโดยไม่มีการบิดเบือนหรือสูญหาย
