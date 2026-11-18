"""
=============================================================================
PERKIN LOGISTICS — BOOKING REPORT PIPELINE
=============================================================================
Source of truth: SharePoint "2026 Booking Report.xlsx"
  - 1 แถวที่มีเลขงาน (ตามคอลัมน์ NO.) = 1 งาน  → ยอดต่อเดือนตรงกับไฟล์ (ม.ค. = 566)
  - ประเภทบริการอ่านจากคอลัมน์ Type: SHSI/SI, SHSE/SE, SHAI/AI, SHAE/AE, TS/SHT = Transport
  - สถานะอ่านจากคอลัมน์ STATUS JOB ของไฟล์นี้เท่านั้น
JOB_Daily_2026 STATUS_Dashboard.xlsx ใช้เฉพาะชีท Transport → transport.json (หน้า Transport)
=============================================================================
"""
import zipfile, re, json, datetime, os, sys
import xml.etree.ElementTree as ET
from collections import Counter

# Ensure UTF-8 output on all Windows environments
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
MONTHS = {'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
          'July': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'}
SERVICE_BY_PREFIX = {
    'SHSI': ('SEA Import', 'Sea Import'), 'SI': ('SEA Import', 'Sea Import'),
    'SHSE': ('SEA Export', 'Sea Export'), 'SE': ('SEA Export', 'Sea Export'),
    'SHAI': ('AIR Import', 'Air Import'), 'AI': ('AIR Import', 'Air Import'),
    'SHAE': ('AIR Export', 'AIR Export'), 'AE': ('AIR Export', 'AIR Export'),
    'TS': ('Transport', 'Transport'), 'SHT': ('Transport', 'Transport'),
}


def clean_text(v):
    return re.sub(r'\s+', ' ', str(v or '').replace('\xa0', ' ')).strip()


def excel_date_to_iso(val, fallback_month=None):
    s = clean_text(val)
    if not s:
        return None
    try:
        f = float(s)
        if 25000 < f < 80000:
            return (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=int(f))).strftime('%Y-%m-%d')
    except ValueError:
        pass
    m = re.match(r'^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.match(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', s)
        if m:
            p1, p2, p3 = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if p3 in (25, 26, 2025, 2026, 2027):
                y = p3 + 2000 if p3 < 100 else p3
                d, mo = p1, p2
            elif p1 in (25, 26, 2025, 2026, 2027):
                y = p1 + 2000 if p1 < 100 else p1
                mo, d = p2, p3
            else:
                y = p3 + 2000 if p3 < 100 else (p3 - 543 if p3 > 2400 else p3)
                d, mo = p1, p2
        else:
            return None

    if y in (2008, 2006, 2007) or y < 2020:
        y = 2026
    if mo == 0:
        mo = fallback_month if fallback_month else 8
    elif mo > 12 and 1 <= d <= 12:
        mo, d = d, mo

    if mo < 1 or mo > 12 or d < 1 or d > 31:
        return None
    return f"{y:04d}-{mo:02d}-{d:02d}"


def fix_swapped_date(date_str, expected_month_int):
    """Fix Excel US locale swapping day and month when typed as DD/MM/YYYY."""
    if not date_str or len(date_str) < 10:
        return date_str
    try:
        y, m, d = int(date_str[0:4]), int(date_str[5:7]), int(date_str[8:10])
        if y == 2026 and m != expected_month_int and d == expected_month_int:
            if 1 <= m <= 31:
                return f"{y:04d}-{d:02d}-{m:02d}"
    except Exception:
        pass
    return date_str
    return None


def normalize_service(type_code, job_no):
    """Type column first (TS rows carry the shipment job no. in JOB NO.), then job-no prefix."""
    for code in (clean_text(type_code).upper(), clean_text(job_no).upper()):
        for prefix in sorted(SERVICE_BY_PREFIX, key=len, reverse=True):
            if code.startswith(prefix):
                return SERVICE_BY_PREFIX[prefix]
    return 'Freight', 'Freight'


def classify_status(raw):
    s = raw.lower()
    if 'complete' in s or '0409' in s or 'เสร็จ' in s:
        return 'Completed', 'Job Complete'
    if 'cancel' in s or 'ยกเลิก' in s:
        return 'Cancelled', 'Job Cancelled'
    if 'wait' in s or 'รอ' in s:
        return 'In Progress', 'Job Waiting'
    if 'booking' in s:
        return 'Booking', 'Job Booking'
    return 'In Progress', 'Job Control'


class Workbook:
    def __init__(self, path):
        self.zf = zipfile.ZipFile(path)
        names = self.zf.namelist()
        self.shared = []
        if 'xl/sharedStrings.xml' in names:
            sst = ET.fromstring(self.zf.read('xl/sharedStrings.xml'))
            self.shared = [''.join(t.text or '' for t in si.findall('.//ns:t', NS)) for si in sst.findall('.//ns:si', NS)]
        wb = ET.fromstring(self.zf.read('xl/workbook.xml'))
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(self.zf.read('xl/_rels/workbook.xml.rels'))}
        self.sheets = {}
        for s in wb.findall('.//ns:sheet', NS):
            t = rels[s.attrib[RID]].lstrip('/')
            self.sheets[s.attrib['name']] = t if t.startswith('xl/') else 'xl/' + t

    def rows(self, name):
        """Yield (row_number, {col: text})."""
        for r in ET.fromstring(self.zf.read(self.sheets[name])).findall('.//ns:row', NS):
            cells = {}
            for c in r.findall('ns:c', NS):
                v = c.find('ns:v', NS)
                val = v.text if v is not None else ''
                if c.attrib.get('t') == 's' and val:
                    val = self.shared[int(val)]
                cells[re.match(r'[A-Z]+', c.attrib['r']).group(0)] = clean_text(val)
            yield int(r.attrib.get('r', 0)), cells


def find_header(rows):
    """Return (header_row_number, {field: col}) — first STATUS column wins (Feb has a stale 2nd one in AD)."""
    keys = [('job', lambda v: v.startswith('JOB NO')), ('join', lambda v: v.startswith('JOIN NO')),
            ('status', lambda v: 'STATUS' in v), ('customer', lambda v: 'CUSTOMER' in v),
            ('type', lambda v: v == 'TYPE'), ('year', lambda v: v == 'YEAR'), ('month', lambda v: v == 'MONTH'),
            ('day', lambda v: v == 'DAY'), ('etd', lambda v: v == 'ETD'), ('eta', lambda v: v == 'ETA'),
            ('inv', lambda v: 'INV' in v), ('mbl', lambda v: 'MBL' in v), ('hbl', lambda v: 'HBL' in v),
            ('gw', lambda v: v.startswith('G.W')), ('cbm', lambda v: 'MEASUREMENT' in v),
            ('container', lambda v: 'CONTAINER' in v), ('cs', lambda v: v.startswith('CS')),
            ('commodity', lambda v: 'COMMODITY' in v)]
    for r_num, cells in rows[:6]:
        upper = {col: v.upper() for col, v in cells.items() if v}
        if not any(v.startswith('JOB NO') for v in upper.values()):
            continue
        hdr = {}
        for col in sorted(upper, key=lambda c: (len(c), c)):
            for field, match in keys:
                if field not in hdr and match(upper[col]):
                    hdr[field] = col
                    break
        return r_num, hdr
    return 2, {}


def to_float(s):
    return float(s) if s and re.fullmatch(r'-?\d+(?:\.\d+)?', s) else None


def extract_booking(path):
    wb = Workbook(path)
    jobs = []
    for sheet, mm in MONTHS.items():
        if sheet not in wb.sheets:
            continue
        rows = list(wb.rows(sheet))
        header_row, h = find_header(rows)
        month_key = f"2026-{mm}"
        count = 0
        for r_num, c in rows:
            if r_num <= header_row:
                continue
            no = c.get('A', '')
            raw_job = c.get(h.get('job', 'B'), '') or c.get(h.get('join', 'C'), '')
            if not raw_job and not no.isdigit():
                continue
            job_no = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', raw_job, flags=re.I).upper() or f"JOB-{sheet.upper()}-{no}"
            if any(k in job_no for k in ('JOB NO', 'TOTAL', 'REPORT', 'JOIN NO')):
                continue

            service, label = normalize_service(c.get(h.get('type', 'F'), ''), job_no)
            raw_status = c.get(h.get('status', 'D'), '')
            status, detail = classify_status(raw_status)
            try:
                job_date = f"{int(float(c.get(h.get('year', 'H')) or 2026)):04d}-{int(float(c.get(h.get('month', 'I')) or mm)):02d}-{int(float(c.get(h.get('day', 'J')) or 1)):02d}"
            except ValueError:
                job_date = f"{month_key}-01"
            done = status == 'Completed'
            join_no = c.get(h.get('join', 'C'), '')

            raw_etd = excel_date_to_iso(c.get(h.get('etd', 'K'))) or job_date
            raw_eta = excel_date_to_iso(c.get(h.get('eta', 'L')))
            etd = fix_swapped_date(raw_etd, int(mm))
            eta = fix_swapped_date(raw_eta, int(mm))

            # User Rule: ETD จับ Export, ETA จับ Import (reset per row so dates never leak across rows!)
            row_month = month_key
            if 'Export' in service and etd:
                job_date = etd
                if etd.startswith('2026-'):
                    row_month = etd[:7]
            elif 'Import' in service and eta:
                job_date = eta
                if eta.startswith('2026-'):
                    row_month = eta[:7]

            jobs.append({
                "id": f"{sheet}_{r_num}_{job_no}",
                "jobNo": job_no,
                "service": service,
                "serviceLabel": label,
                "status": status,
                "statusDetail": detail,
                "statusRaw": raw_status or detail,
                "customer": c.get(h.get('customer', 'E'), '') or '—',
                "consignee": c.get(h.get('customer', 'E'), '') or '—',
                "bl": c.get(h.get('mbl', '~'), '') or c.get(h.get('hbl', '~'), ''),
                "mbl": c.get(h.get('mbl', '~')) or None,
                "hbl": c.get(h.get('hbl', '~')) or None,
                "joinNo": join_no or None,
                "updateStatus": None,
                "etd": etd,
                "eta": eta,
                "jobDate": job_date,
                "month": row_month,
                "year": 2026,
                "draftCustoms": done, "advanceDoc": False, "doReleased": done,
                "customsFiled": done, "cleared": done,
                "draftDate": None, "customsDate": None, "doDate": None, "clearDate": None,
                "advanceDate": None, "remark": None,
                "sourceSheet": sheet,
                "sourceRow": r_num,
                "runningNo": int(no) if no.isdigit() else None,
                "version": 1, "nextAction": None, "ageDays": None, "flags": [],
                "invoiceNo": c.get(h.get('inv', '~'), ''),
                "containerType": c.get(h.get('container', '~'), ''),
                "grossWeight": to_float(c.get(h.get('gw', '~'), '')),
                "cbm": to_float(c.get(h.get('cbm', '~'), '')),
                "commodity": c.get(h.get('commodity', '~'), ''),
                "csName": c.get(h.get('cs', '~'), ''),
                "dataSource": "2026 Booking Report.xlsx",
            })
            count += 1
        print(f"  {sheet:5s}: {count} งาน")
    return jobs


def extract_daily_ops(path):
    """Extract operational tracking milestones (Draft ใบขน, 0209/0309/0409, Advance, DO, POD) from department sheets."""
    wb = Workbook(path)
    SHEET_CFG = {
        'AIR Import':  {'job': 'D', 'draft': 'H', 'o2': 'I', 'o3': '',  'o4': 'I', 'adv': 'J', 'do': 'L', 'filed': 'M', 'clear': 'N', 'ts': 'Q', 'update': 'V', 'rmk': 'W'},
        'Air Export':  {'job': 'F', 'draft': 'J', 'o2': 'K', 'o3': 'L', 'o4': 'M', 'adv': 'N', 'do': 'P', 'filed': 'Q', 'clear': 'R', 'ts': 'U', 'update': 'Z', 'rmk': 'AA'},
        'SEA Import':  {'job': 'D', 'draft': 'H', 'o2': 'I', 'o3': 'J', 'o4': 'K', 'adv': 'L', 'do': 'N', 'filed': 'O', 'clear': 'P', 'ts': 'S', 'update': 'X', 'rmk': 'Y'},
        'SEA Export':  {'job': 'G', 'draft': 'K', 'o2': 'L', 'o3': 'M', 'o4': 'N', 'adv': 'O', 'do': 'T', 'filed': 'Q', 'clear': 'S', 'ts': 'X', 'update': 'AD', 'rmk': 'AE'},
        ' Freight ':   {'job': 'F', 'draft': 'J', 'o2': 'K', 'o3': 'L', 'o4': 'M', 'adv': 'N', 'do': 'P', 'filed': 'Q', 'clear': 'S', 'ts': 'V', 'update': 'AA', 'rmk': 'AB'},
        'Freight':     {'job': 'F', 'draft': 'J', 'o2': 'K', 'o3': 'L', 'o4': 'M', 'adv': 'N', 'do': 'P', 'filed': 'Q', 'clear': 'S', 'ts': 'V', 'update': 'AA', 'rmk': 'AB'}
    }
    ops_by_job = {}
    for sheet_name, cfg in SHEET_CFG.items():
        if sheet_name not in wb.sheets:
            continue
        for r_num, c in wb.rows(sheet_name):
            if r_num <= 3:
                continue
            jno = clean_text(c.get(cfg['job'], ''))
            if not jno or len(jno) < 4:
                continue

            def is_done(v):
                if not v:
                    return False
                vl = v.lower()
                return vl not in ('no', 'none', '-', '', 'รอ', 'false')

            draft_val = c.get(cfg['draft'], '')
            o2_val = c.get(cfg['o2'], '')
            o3_val = c.get(cfg['o3'], '')
            o4_val = c.get(cfg['o4'], '')
            adv_val = c.get(cfg['adv'], '')
            do_val = c.get(cfg['do'], '')
            filed_val = c.get(cfg['filed'], '')
            clear_val = c.get(cfg['clear'], '')
            ts_val = c.get(cfg['ts'], '')
            up_val = clean_text(c.get(cfg.get('update', ''), ''))
            if up_val in ('\xa0', '-', 'None', 'none', ''):
                up_val = None
            rmk_val = c.get(cfg['rmk'], '')

            ops_by_job[jno.upper()] = {
                'draftCustoms': is_done(draft_val),
                'draftDate': excel_date_to_iso(draft_val) if is_done(draft_val) else None,
                'o209': o2_val if is_done(o2_val) else None,
                'o309': o3_val if is_done(o3_val) else None,
                'o409': o4_val if is_done(o4_val) else None,
                'advanceDoc': is_done(adv_val),
                'advanceDate': excel_date_to_iso(adv_val) if is_done(adv_val) else None,
                'doReleased': is_done(do_val),
                'doDate': excel_date_to_iso(do_val) if is_done(do_val) else None,
                'customsFiled': is_done(filed_val),
                'customsDate': excel_date_to_iso(filed_val) if is_done(filed_val) else None,
                'cleared': is_done(clear_val),
                'clearDate': excel_date_to_iso(clear_val) if is_done(clear_val) else None,
                'transportNo': ts_val if is_done(ts_val) else None,
                'updateStatus': up_val,
                'remark': rmk_val or None
            }
    return ops_by_job


def extract_transport(path):
    """Transport sheet in JOB_Daily: A=Booking Date, B=Job No, C=TS no., D=Customer, E=Job Status, F=Container, G=Deliver, I=POD."""
    wb = Workbook(path)
    if 'Transport' not in wb.sheets:
        return []
    trips = []
    for r_num, c in wb.rows('Transport'):
        trip_no = clean_text(c.get('C', ''))
        if r_num <= 4 or not trip_no.upper().startswith('TS'):
            continue
        st = (c.get('E') or c.get('H') or '').lower()
        status = 'ส่งมอบแล้ว' if ('complete' in st or 'ส่งมอบ' in st) else ('ยกเลิก' if ('cancel' in st or 'ยกเลิก' in st) else 'กำลังวิ่ง')
        deliver = excel_date_to_iso(c.get('G')) or excel_date_to_iso(c.get('A')) or ''
        pod_val = clean_text(c.get('I', ''))
        container_val = clean_text(c.get('F', ''))
        trips.append({
            "tripNo": trip_no,
            "transportNo": trip_no,
            "jobNo": clean_text(c.get('B', '')),
            "customer": clean_text(c.get('D', '')),
            "driver": container_val,
            "truckType": container_val,
            "container": container_val,
            "deliver": deliver,
            "deliverDate": deliver,
            "status": status,
            "pod": pod_val
        })
    return trips


def run():
    import shutil
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if not os.path.exists(os.path.join(base, 'package.json')):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    booking = os.path.join(base, 'data', '2026 Booking Report.xlsx')
    if not os.path.exists(booking):
        booking = os.path.join(base, '2026 Booking Report.xlsx')

    backup = os.path.join(base, 'backups', '2026_Booking_Report_Original.xlsx')

    daily = os.path.join(base, 'data', 'JOB_Daily_2026 STATUS_Dashboard.xlsx')
    if not os.path.exists(daily):
        daily = os.path.join(base, 'JOB_Daily_2026 STATUS_Dashboard.xlsx')

    data_dir = os.path.join(base, 'data')
    if not os.path.exists(data_dir):
        data_dir = os.path.join(base, 'dashboard', 'data')

    def has_monthly_sheets(path):
        try:
            wb = Workbook(path)
            return any(m in wb.sheets for m in ('Jan', 'Feb', 'Mar'))
        except Exception:
            return False

    # 1. Smart Auto-Detect: Check if user downloaded latest file to Downloads folder
    downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')
    dl_booking = os.path.join(downloads_dir, '2026 Booking Report.xlsx')
    if os.path.exists(dl_booking) and has_monthly_sheets(dl_booking):
        if not os.path.exists(booking) or os.path.getmtime(dl_booking) > os.path.getmtime(booking):
            print(f"[AUTO-DETECT] Using latest file from Downloads: {dl_booking}")
            shutil.copy2(dl_booking, booking)

    for name in ('JOB_Daily_2026 STATUS_Dashboard.xlsx', 'JOB_Daily_2026 STATUS_Dashboard (1).xlsx'):
        dl_daily = os.path.join(downloads_dir, name)
        if os.path.exists(dl_daily):
            if not os.path.exists(daily) or os.path.getmtime(dl_daily) > os.path.getmtime(daily):
                shutil.copy2(dl_daily, daily)

    # 2. Smart Auto-Detect: Check OneDrive synced folders
    for od_root in [
        os.path.join(os.path.expanduser('~'), 'OneDrive'),
        os.path.join(os.path.expanduser('~'), 'OneDrive - Perkin Logistics'),
        os.path.join(os.path.expanduser('~'), 'Perkin Logistics')
    ]:
        od_booking = os.path.join(od_root, 'report', '2026 Booking Report.xlsx')
        if os.path.exists(od_booking) and has_monthly_sheets(od_booking):
            if not os.path.exists(booking) or os.path.getmtime(od_booking) > os.path.getmtime(booking):
                print(f"[AUTO-DETECT] Using latest file from OneDrive: {od_booking}")
                shutil.copy2(od_booking, booking)

    if not os.path.exists(booking) or not has_monthly_sheets(booking):
        if os.path.exists(backup) and has_monthly_sheets(backup):
            print(f"[RECOVERY] Restoring master booking report from {backup}")
            shutil.copy2(backup, booking)
        elif not os.path.exists(booking):
            raise SystemExit(f"Error: {booking} not found")

    print(f"[1/2] Booking Report: {booking}")
    jobs = extract_booking(booking)
    if len(jobs) == 0 and os.path.exists(backup) and has_monthly_sheets(backup):
        print(f"[RECOVERY] 0 jobs extracted, using backup {backup}")
        jobs = extract_booking(backup)

    print(f"  รวม {len(jobs)} งาน | {dict(Counter(j['service'] for j in jobs))}")
    print(f"  สถานะ {dict(Counter(j['statusDetail'] for j in jobs))}")

    # Enrich master jobs with Daily Ops (Draft ใบขน, 0209/0309/0409, Advance, DO, Transport No)
    if os.path.exists(daily):
        print(f"[2/3] Daily Operations Tracking: {daily}")
        ops_by_job = extract_daily_ops(daily)
        enriched_count = 0
        for j in jobs:
            jno = j.get('jobNo', '').upper()
            if jno in ops_by_job:
                ops = ops_by_job[jno]
                j['draftCustoms'] = ops['draftCustoms']
                if ops['draftDate']: j['draftDate'] = ops['draftDate']
                if ops['o209']: j['o209'] = ops['o209']
                if ops['o309']: j['o309'] = ops['o309']
                if ops['o409']: j['o409'] = ops['o409']
                j['advanceDoc'] = ops['advanceDoc']
                if ops['advanceDate']: j['advanceDate'] = ops['advanceDate']
                j['doReleased'] = ops['doReleased']
                if ops['doDate']: j['doDate'] = ops['doDate']
                j['customsFiled'] = ops['customsFiled']
                if ops['customsDate']: j['customsDate'] = ops['customsDate']
                j['cleared'] = ops['cleared']
                if ops['clearDate']: j['clearDate'] = ops['clearDate']
                if ops['transportNo']: j['transportTripNo'] = ops['transportNo']
                if ops.get('updateStatus'): j['updateStatus'] = ops['updateStatus']
                if ops['remark']: j['remark'] = ops['remark']
                if ops.get('o409'):
                    j['customsStatus'] = '0409'
                elif ops.get('o309'):
                    j['customsStatus'] = '0309'
                elif ops.get('o209'):
                    j['customsStatus'] = '0209'
                elif ops.get('draftCustoms'):
                    j['customsStatus'] = '0109'
                enriched_count += 1
            elif j.get('status') == 'Completed':
                j['customsStatus'] = '0409'
            elif j.get('customsFiled'):
                j['customsStatus'] = '0209'
            elif j.get('draftCustoms'):
                j['customsStatus'] = '0109'
        print(f"  Enriched {enriched_count} master jobs with daily operations details")

    if len(jobs) > 0:
        with open(os.path.join(data_dir, 'jobs.json'), 'w', encoding='utf-8') as f:
            json.dump(jobs, f, ensure_ascii=False, indent=2)

    if os.path.exists(daily):
        print(f"[3/3] Transport trips: {daily}")
        trips = extract_transport(daily)
        if trips:
            with open(os.path.join(data_dir, 'transport.json'), 'w', encoding='utf-8') as f:
                json.dump(trips, f, ensure_ascii=False, indent=2)
        print(f"  {len(trips)} เที่ยว")

    # Sync with local SQLite Database & History Tracking
    try:
        from . import sqlite_db
    except ImportError:
        import sqlite_db
    sqlite_db.init_db()
    sqlite_db.sync_jobs(source_file=os.path.basename(booking))
    if os.path.exists(daily):
        sqlite_db.sync_transport()
    print("[DB SYNCED] SQLite database up to date.")

    # Re-generate PostgreSQL migration SQL
    try:
        try:
            from . import migrate_to_postgres
        except ImportError:
            import migrate_to_postgres
        migrate_to_postgres.generate_postgres_sql()
        print("[POSTGRES SQL UPDATED] postgres_migration.sql ready.")
    except Exception as e:
        print(f"[POSTGRES SQL WARNING] {e}")

    print("[SUCCESS]")


if __name__ == '__main__':
    run()
