# สเปก: แก้ไขข้อมูลผ่านเว็บ + เขียนกลับ Excel

| | |
|---|---|
| **เวอร์ชัน** | 0.1 (ร่าง) |
| **วันที่** | 28 ตุลาคม 2026 |
| **อ้างอิง** | `FWD-Dashboard-Plan-v0.3-TH.md` (สถาปัตยกรรม v0.3.1) |
| **เป้าหมาย** | ผู้ใช้แก้ข้อมูลงานบนเว็บได้ และเมื่อบันทึก ระบบอัปเดต Excel + DB จากค่าเดียวกัน |

---

## 1. หลักการ

1. **n8n เป็นผู้เขียน Excel เพียงคนเดียว** — เว็บไม่เรียก Graph ตรง ๆ เพื่อกันการเขียนชนกัน
2. **Excel เป็น master** — เขียน Excel ก่อน แล้วจึง commit DB
3. **ทุกการแก้มี audit** — ใคร แก้อะไร จากค่าไหนเป็นค่าไหน เมื่อไร
4. **มี version/conflict** — กันการเขียนทับข้อมูลที่เพิ่งเปลี่ยน
5. **Field ownership ชัดเจน** — ฟิลด์จาก FWD กับฟิลด์ที่คนแก้ แยกกัน

---

## 2. ฟิลด์ที่แก้ได้

| ฟิลด์ | แก้บนเว็บ | Role | แหล่งข้อมูล | หมายเหตุ |
|---|---|---|---|---|
| Job No / Service | ❌ | — | FWD | คีย์ |
| Status | ✅ | ops/admin | FWD + คน | enum 4 ค่า |
| ETD / ETA | ✅ | ops/admin | FWD | วันที่ |
| Customer | ⚠️ admin | admin | FWD | แก้เฉพาะกรณีผิด |
| BL / MBL / HBL | ⚠️ admin | admin | FWD | |
| Draft ใบขน | ✅ | ops | คน | วันที่ / ไม่มี |
| ยิงใบขนจริง | ✅ | ops | คน | วันที่ |
| แลก DO | ✅ | ops | คน | วันที่ |
| Clear & Pickup | ✅ | ops | คน | วันที่ |
| เอกสารเบิกเงิน | ✅ | ops | คน | วันที่ / สถานะ |
| Remark | ✅ | ops | คน | ข้อความ ≤ 500 |
| Next action | ❌ | — | คำนวณ | derived |

> ค่าเริ่มต้น: master fields (customer/BL) ให้ admin แก้เท่านั้น เพื่อไม่ให้ทับข้อมูล FWD

---

## 3. UX

### 3.1 หน้าจอ

- `/jobs` → คลิกแถว → **drawer** รายละเอียด
- ปุ่ม **แก้ไข** (ops/admin) → ฟอร์มใน drawer
- ฟิลด์: select (status), date picker (milestones), textarea (remark)
- ปุ่ม บันทึก / ยกเลิก; แสดง dirty state
- ระหว่างบันทึก: spinner + “กำลังอัปเดต Excel…”
- สำเร็จ: toast “บันทึกแล้ว (Excel + Web)”
- ล้มเหลว: error + ปุ่มลองใหม่ (ไม่เสียค่าที่กรอก)
- แท็บ **ประวัติ** แสดง audit log

### 3.2 Validation

- Status ต้องอยู่ใน enum
- วันที่ต้องเป็นวันที่จริง และ ETD ≤ ETA (เตือน ไม่บล็อก)
- Remark ≤ 500 ตัวอักษร
- ถ้าไม่มี job ใน Excel → ถามว่าจะเพิ่มแถวใหม่

### 3.3 Conflict dialog

ถ้า version ไม่ตรง:
- แสดง “ข้อมูลถูกแก้จากที่อื่น”
- เทียบค่าเดิม/ใหม่/ค่าปัจจุบัน
- ให้เลือก: โหลดใหม่ / บันทึกทับ (admin)

---

## 4. สถาปัตยกรรม

```
[เว็บฟอร์ม]
    │ PATCH /api/jobs/{jobNo}  (changes + version)
    ▼
[Next.js API] ── validate/authz ──► [job_edits: pending]
    │
    │ POST n8n webhook (editId, HMAC)
    ▼
[n8n] ──► [Graph Excel API]
    │        resolve row → PATCH range → calculate
    │
    ├── สำเร็จ → update jobs (DB) + version++ → edit=done
    └── ล้มเหลว → edit=failed (ไม่แตะ DB) + reason

[เว็บ poll /api/edits/{id}] → แสดงผล
```

**ทำไมต้องผ่าน n8n:** ให้มี writer เดียวของ Excel, reuse session/retry/batch, และ audit รวมศูนย์

---

## 5. API

### 5.1 `PATCH /api/jobs/{jobNo}`

```json
{
  "version": 12,
  "changes": {
    "status": "Job Complete",
    "draftCustoms": "2026-10-28",
    "remark": "ปิดชุดบัญชีแล้ว"
  }
}
```

| Status | ความหมาย |
|---|---|
| 200 | สำเร็จ (คืน job ใหม่ + editId) |
| 400 | validation error |
| 403 | ไม่มีสิทธิ์ |
| 404 | ไม่พบงาน |
| 409 | version ไม่ตรง (conflict) |
| 423 | Excel ถูกล็อก/กำลังแก้ |
| 502 | Graph/n8n ล้มเหลว |

### 5.2 `GET /api/edits/{id}`

คืนสถานะ `pending | writing_excel | syncing_db | done | failed` + error

### 5.3 `GET /api/jobs/{jobNo}/history`

cืน audit log 20 รายการล่าสุด

---

## 6. การเขียน Excel

### 6.1 Mapping คอลัมน์

| Field | SEA Import | AIR Import | Air Export | SEA Export |
|---|---|---|---|---|
| Status | C | C | E | F |
| ETD | A | A | C | D |
| ETA | B | B | D | E |
| Customer | E | E | G | H |
| BL | G | G | I | J |
| Draft | H | H | J | K |
| ยิงใบขน | O | M | Q | Q |
| แลก DO | N | L | P | T |
| Clear | P | N | R | S |
| Advance | L | J | N | O |
| Remark | Y | W | AA | AE |

### 6.2 ขั้นตอน

1. resolve `driveId/itemId` จาก share link
2. `createSession`
3. อ่าน `usedRange` ของชีต → หาแถวของ jobNo
4. เทียบค่า → สร้าง `PATCH range` เฉพาะเซลล์ที่เปลี่ยน
5. `$batch` ≤ 20 requests
6. `calculate` (Full)
7. `closeSession`
8. update DB + version++

### 6.3 กรณีพิเศษ

- **ไม่พบแถว:** append ที่แถวสุดท้าย + copy format (ทำใน template/pre-format)
- **jobNo ซ้ำ:** หยุด + แจ้ง conflict (ไม่เดา)
- **วันที่:** เขียนเป็น `Date`/ISO + number format เดิม
- **ช่องว่าง:** ถ้า changes ไม่มี field นั้น → ไม่แตะ

---

## 7. Sync จาก Excel → เว็บ

- Poll `lastModifiedDateTime` ทุก 5 นาที (หรือ Graph webhook)
- ถ้าไฟล์เปลี่ยน → อ่าน `usedRange` → diff กับ DB
- ฟิลด์ที่เปลี่ยนและไม่มี pending edit → update DB (Excel wins)
- ถ้ามี pending edit ฟิลด์เดียวกัน → conflict:
  - ค่าเริ่มต้น: **last-write-wins** ตาม timestamp + audit
  - ทางเลือก: บล็อกและให้ admin resolve
- ข้ามการอ่านที่เกิดจาก write ของตัวเอง: เก็บ `last_applied_hash` / `etag` หลังเขียน แล้วข้ามรอบนั้น

**FWD upload vs web edit (master fields)**

- ค่าเริ่มต้น: FWD ชนะสำหรับ master fields (status/ETD/ETA/customer/BL) เพราะเป็นต้นทาง
- ถ้า web แก้ master และต้องการให้คงอยู่ → ต้องมี `manual_override` flag + admin ยืนยัน
- manual fields (draft/DO/clear/remark) ไม่ถูกแตะโดย FWD upload

> ถ้าไม่ต้องการ two-way ตอนแรก: ปิด polling แล้วให้เว็บเป็นฝ่ายแก้のみ; Excel แก้มือจะไม่ถูกนำเข้า

---

## 8. Audit

`job_edits`:

| field | ตัวอย่าง |
|---|---|
| id | uuid |
| job_no | SHAI26100044 |
| user_id | somchai@... |
| source | web / excel_sync |
| field | status |
| old_value | Job Control |
| new_value | Job Complete |
| status | pending/done/failed |
| run_id | ... |
| created_at / applied_at | timestamps |

แสดงในแท็บประวัติของงาน + หน้า Data Health

---

## 9. สิทธิ์

| Role | แก้ |
|---|---|
| viewer | ❌ |
| ops | status, ETD/ETA, milestones, remark |
| admin | ทุกฟิลด์ + resolve conflict + แก้ customer/BL |

---

## 10. Acceptance Criteria

| ด้าน | เกณฑ์ |
|---|---|
| เวลาบันทึก | < 3 วินาที (ปกติ) |
| Consistency | Excel + DB ตรงกันหลัง success |
| Failure | Excel fail → DB ไม่เปลี่ยน; user retry ได้ |
| Conflict | version mismatch → 409; ไม่มี lost update เงียบ |
| Audit | ทุก edit มี who/what/old/new |
| Excel | chart/สูตรยังอยู่; ไม่แทนไฟล์ |
| Sync | Excel แก้มือ → เว็บเห็นภายใน 5 นาที (ถ้าเปิด polling) |

---

## 11. คำถามที่ต้องตัดสินใจ

1. ฟิลด์ใดให้ ops แก้ได้? (ค่าเริ่มต้นตามข้อ 2)
2. เมื่อ Excel กับเว็บแก้ฟิลด์เดียวกัน: last-write-wins หรือให้ resolve?
3. เปิด two-way sync (Excel → เว็บ) ทันที หรือเริ่มเว็บ → Excel อย่างเดียวก่อน?
4. ต้องมีปุ่ม “ประวัติการแก้ไข” ให้ทุกคนดู หรือเฉพาะ admin?
