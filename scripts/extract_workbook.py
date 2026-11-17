# -*- coding: utf-8 -*-
"""
Extract + normalize the FWD / JOB_Daily_2026 workbook into a canonical JSON dataset
used by the dashboard prototype.

Source : C:\\Users\\User\\Downloads\\JOB_Daily_2026 STATUS_Dashboard.xlsx
Output : dashboard/data/jobs.json, dashboard/data/quality.json
"""
import json
import re
import sys
import io
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

import openpyxl
from openpyxl.utils.datetime import from_excel

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SRC = Path(r"C:\Users\User\Downloads\JOB_Daily_2026 STATUS_Dashboard.xlsx")
OUT = Path(r"C:\Users\User\Desktop\n8n\dashboard\data")
OUT.mkdir(parents=True, exist_ok=True)

JOB_RE = re.compile(r"([A-Z]{2,4})\s*(\d{8})")
DATE_RE = re.compile(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})")
ISO_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")

SHEETS = {
    "SEA Import": dict(
        header_row=3, start_row=4, last_row=512,
        job="D", status="C", etd="A", eta="B", customer="E", consignee="F", bl="G",
        draft="H", advance="L", do="N", customs="O", cleared="P", job_date=None,
    ),
    "AIR Import": dict(
        header_row=3, start_row=4, last_row=237,
        job="D", status="C", etd="A", eta="B", customer="E", consignee="F", bl="G",
        draft="H", advance="J", do="L", customs="M", cleared="N", job_date=None,
    ),
    "Air Export": dict(
        header_row=3, start_row=4, last_row=28,
        job="F", status="E", etd="C", eta="D", customer="G", consignee="H", bl="I",
        draft="J", advance="N", do="P", customs="Q", cleared="R", job_date="B",
    ),
    "SEA Export": dict(
        header_row=3, start_row=4, last_row=250,
        job="G", status="F", etd="D", eta="E", customer="H", consignee="I", bl="J",
        draft="K", advance="O", do="T", customs="Q", cleared="S", job_date="B",
    ),
}

SERVICE_LABEL = {
    "SEA Import": "Sea Import",
    "AIR Import": "Air Import",
    "Air Export": "Air Export",
    "SEA Export": "Sea Export",
}


def cell(ws, row, col):
    return ws[f"{col}{row}"].value


def clean(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return value
    text = str(value).replace("\xa0", " ").replace("\t", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip()


def parse_date(value, fallback_year=2026):
    """Return (iso_date|None, ok: bool, raw: str)."""
    if value is None or value == "":
        return None, True, ""
    raw = str(value)
    if isinstance(value, datetime):
        return value.date().isoformat(), True, raw
    if isinstance(value, date):
        return value.isoformat(), True, raw
    if isinstance(value, (int, float)) and 30000 < value < 60000:
        try:
            return from_excel(value).date().isoformat(), True, raw
        except Exception:
            pass
    text = str(value).strip()
    m = ISO_RE.search(text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat(), True, raw
        except ValueError:
            return None, False, raw
    m = DATE_RE.search(text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        if 1 <= d <= 31 and 1 <= mo <= 12:
            try:
                return date(y, mo, d).isoformat(), True, raw
            except ValueError:
                return None, False, raw
    # only "DD/MM" -> assume fallback year
    m = re.match(r"^(\d{1,2})/(\d{1,2})$", text)
    if m:
        try:
            return date(fallback_year, int(m.group(2)), int(m.group(1))).isoformat(), True, raw
        except ValueError:
            return None, False, raw
    return None, False, raw


def norm_job(value):
    if value is None:
        return ""
    text = str(value).upper().replace("\t", " ").replace("\xa0", " ")
    m = JOB_RE.search(text)
    if not m:
        return ""
    return f"{m.group(1)}{m.group(2)}"


def norm_customer(value):
    text = clean(value)
    text = re.sub(r"\s+", " ", text).strip(" .,-")
    return text


TRUTHY_NEGATIVE = {"", "no", "n/a", "na", "-", "0", "none", "ไม่มี", "no ", "ไม่"}


def has_value(value):
    if value is None:
        return False
    text = clean(value)
    if isinstance(text, (datetime, date)):
        return True
    return str(text).strip().lower() not in TRUTHY_NEGATIVE


def ms_date(value):
    if not has_value(value):
        return None
    parsed, ok, _ = parse_date(value)
    return parsed if ok else None


def norm_status(raw):
    text = clean(raw)
    low = text.lower()
    if not low:
        return "Unknown", "Unknown"
    if "cancel" in low:
        return "Cancelled", "Cancelled"
    if "complete" in low:
        return "Completed", "Completed"
    if "waiting" in low:
        return "In Progress", "Waiting"
    if "control" in low:
        return "In Progress", "Control"
    if "booking" in low:
        return "Booking", "Booking"
    return "In Progress", text


wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)

jobs = []
rejects = []
missing = Counter()
status_raw_counter = Counter()
dup = Counter()
date_fail = Counter()

for sheet, cfg in SHEETS.items():
    ws = wb[sheet]
    for r in range(cfg["start_row"], cfg["last_row"] + 1):
        job_no = norm_job(cell(ws, r, cfg["job"]))
        if not job_no:
            row_has_data = any(
                clean(cell(ws, r, c)) not in ("", "None")
                for c in [cfg["status"], cfg["customer"], cfg["etd"]]
            )
            if row_has_data:
                rejects.append({"sheet": sheet, "row": r, "reason": "no_job_no"})
            continue

        status_group, status_detail = norm_status(cell(ws, r, cfg["status"]))
        status_raw = clean(cell(ws, r, cfg["status"]))
        status_raw_counter[(sheet, status_raw)] += 1

        etd, etd_ok, etd_raw = parse_date(cell(ws, r, cfg["etd"]))
        eta, eta_ok, eta_raw = parse_date(cell(ws, r, cfg["eta"]))
        if not etd_ok:
            date_fail[f"{sheet}.ETD"] += 1
        if not eta_ok:
            date_fail[f"{sheet}.ETA"] += 1

        customer = norm_customer(cell(ws, r, cfg["customer"]))
        if not customer:
            missing[f"{sheet}.customer"] += 1
        if not etd:
            missing[f"{sheet}.etd"] += 1
        if not eta:
            missing[f"{sheet}.eta"] += 1

        record = {
            "jobNo": job_no,
            "service": sheet,
            "serviceLabel": SERVICE_LABEL[sheet],
            "status": status_group,
            "statusDetail": status_detail,
            "statusRaw": status_raw,
            "customer": customer,
            "consignee": clean(cell(ws, r, cfg["consignee"])),
            "bl": clean(cell(ws, r, cfg["bl"])),
            "etd": etd,
            "eta": eta,
            "etdRaw": etd_raw if not etd else "",
            "etaRaw": eta_raw if not eta else "",
            "jobDate": None,
            "draftCustoms": has_value(cell(ws, r, cfg["draft"])),
            "advanceDoc": has_value(cell(ws, r, cfg["advance"])),
            "doReleased": has_value(cell(ws, r, cfg["do"])),
            "customsFiled": has_value(cell(ws, r, cfg["customs"])),
            "cleared": has_value(cell(ws, r, cfg["cleared"])),
            "draftDate": ms_date(cell(ws, r, cfg["draft"])),
            "customsDate": ms_date(cell(ws, r, cfg["customs"])),
            "doDate": ms_date(cell(ws, r, cfg["do"])),
            "clearDate": ms_date(cell(ws, r, cfg["cleared"])),
            "advanceDate": ms_date(cell(ws, r, cfg["advance"])),
            "sourceRow": r,
        }
        if cfg["job_date"]:
            jd, _, _ = parse_date(cell(ws, r, cfg["job_date"]))
            record["jobDate"] = jd
            if not jd:
                missing[f"{sheet}.job_date"] += 1
        jobs.append(record)
        dup[job_no] += 1

# duplicates
dupes = {k: v for k, v in dup.items() if v > 1}

# next action for open jobs
for j in jobs:
    if j["status"] in ("Completed", "Cancelled"):
        j["nextAction"] = None
        continue
    if not j["draftCustoms"]:
        j["nextAction"] = "รอ Draft ใบขน"
    elif not j["customsFiled"]:
        j["nextAction"] = "รอยิงใบขนจริง"
    elif not j["doReleased"]:
        j["nextAction"] = "รอแลก DO"
    elif not j["cleared"]:
        j["nextAction"] = "รอ Clear & Pickup"
    elif not j["advanceDoc"]:
        j["nextAction"] = "รอเอกสารเบิกเงิน"
    else:
        j["nextAction"] = "ติดตามปิดงาน"

# derived month key (ETD, fallback job date)
for j in jobs:
    src = j["etd"] or j["jobDate"]
    j["month"] = src[:7] if src else None
    j["year"] = int(src[:4]) if src else None

today = date(2026, 10, 28)


def age_days(iso):
    if not iso:
        return None
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return None
    return (today - d).days


for j in jobs:
    j["ageDays"] = age_days(j["etd"]) if j["status"] in ("In Progress", "Booking") else None
    flags = []
    if not j["customer"]:
        flags.append("missing_customer")
    if not j["etd"]:
        flags.append("missing_etd")
    if not j["eta"]:
        flags.append("missing_eta")
    if j["status"] == "Unknown":
        flags.append("unknown_status")
    if not j["bl"]:
        flags.append("missing_bl")
    if "." in j["customer"] and j["customer"].count("CO.,LTD") > 1:
        flags.append("merged_customer_name")
    j["flags"] = flags

# transport snapshot
transport_rows = []
ws = wb["Transport"]
container_bucket = Counter()
for r in range(5, 555):
    type_no = clean(cell(ws, r, "C"))
    job_no = clean(cell(ws, r, "B"))
    customer = clean(cell(ws, r, "D"))
    status = clean(cell(ws, r, "E"))
    container = clean(cell(ws, r, "F"))
    deliver, _, _ = parse_date(cell(ws, r, "G"))
    if not type_no and not job_no:
        continue
    transport_rows.append({
        "transportNo": type_no,
        "jobNo": job_no,
        "customer": customer,
        "status": status,
        "container": container,
        "deliver": deliver,
    })
    c = container.lower()
    if "40" in c and "hc" in c:
        container_bucket["40' HC"] += 1
    elif "40" in c:
        container_bucket["40'"] += 1
    elif "20" in c:
        container_bucket["20'"] += 1
    elif "wheel" in c:
        container_bucket["รถยนต์ 4/6 ล้อ"] += 1
    elif c:
        container_bucket["อื่น ๆ"] += 1

payload = {
    "generatedAt": "2026-10-28T09:30:00+07:00",
    "sourceFile": SRC.name,
    "snapshotDate": today.isoformat(),
    "count": len(jobs),
    "jobs": jobs,
}
(OUT / "jobs.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

quality = {
    "totalJobs": len(jobs),
    "byService": dict(Counter(j["service"] for j in jobs)),
    "byStatus": dict(Counter(j["status"] for j in jobs)),
    "byStatusDetail": dict(Counter(j["statusDetail"] for j in jobs)),
    "statusRawVariants": sorted({k[1] for k in status_raw_counter}),
    "missing": dict(missing),
    "dateFailures": dict(date_fail),
    "rejectedRows": len(rejects),
    "rejectsSample": rejects[:30],
    "duplicateJobNumbers": dupes,
    "transportRows": len(transport_rows),
    "containerBuckets": dict(container_bucket),
    "mismatchedServicePrefix": [
        j["jobNo"] for j in jobs
        if j["service"] == "SEA Import" and not j["jobNo"].startswith(("SI", "SHSI"))
    ][:20],
}
(OUT / "quality.json").write_text(json.dumps(quality, ensure_ascii=False, indent=1), encoding="utf-8")

(OUT / "transport.json").write_text(
    json.dumps({"count": len(transport_rows), "rows": transport_rows}, ensure_ascii=False, indent=1),
    encoding="utf-8",
)

print("jobs:", len(jobs))
print("by service:", quality["byService"])
print("by status:", quality["byStatus"])
print("by detail:", quality["byStatusDetail"])
print("status raw variants:", quality["statusRawVariants"])
print("missing:", quality["missing"])
print("date failures:", quality["dateFailures"])
print("rejects:", len(rejects), rejects[:5])
print("dupes:", list(dupes.items())[:10], "count", len(dupes))
print("transport:", len(transport_rows), dict(container_bucket))
print("prefix mismatch:", len(quality["mismatchedServicePrefix"]), quality["mismatchedServicePrefix"][:10])
