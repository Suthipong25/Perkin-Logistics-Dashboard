import sys, os, json, re, datetime

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JOBS_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'jobs.json')

def load_master_index():
    if not os.path.exists(JOBS_PATH):
        return {}, {}, {}
    try:
        with open(JOBS_PATH, 'r', encoding='utf-8') as f:
            jobs = json.load(f)
        by_no = {}
        for j in jobs:
            jno = j.get('jobNo', '').strip().upper()
            if jno:
                by_no[jno] = j
                if jno.startswith('SH'):
                    by_no[jno[2:]] = j  # e.g. SHSI26100024 -> SI26100024
                else:
                    by_no['SH' + jno] = j
        by_join = {}
        for j in jobs:
            jraw = (j.get('joinNo') or '').strip().upper()
            if jraw:
                jclean = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', jraw).strip()
                by_join[jclean] = j
                by_join[jraw] = j
                if jclean.startswith('SH'):
                    by_join[jclean[2:]] = j
                else:
                    by_join['SH' + jclean] = j
        by_bl = {}
        for j in jobs:
            if j.get('hbl'): by_bl[j['hbl'].strip().upper()] = j
            if j.get('mbl'): by_bl[j['mbl'].strip().upper()] = j
            if j.get('bl'): by_bl[j['bl'].strip().upper()] = j
        return by_no, by_join, by_bl
    except Exception:
        return {}, {}, {}

def fix_thai_encoding(s):
    if not isinstance(s, str):
        return s
    try:
        re_decoded = s.encode('iso-8859-1').decode('cp874')
        if any('\u0e00' <= char <= '\u0e7f' for char in re_decoded):
            return re_decoded
    except Exception:
        pass
    return s

def clean_text(v):
    if v is None:
        return ""
    v = fix_thai_encoding(v)
    return re.sub(r'\s+', ' ', str(v).replace('\t', ' ').replace('\xa0', ' ')).strip()

def excel_date_to_iso(val):
    if not val:
        return None
    val_str = str(val).strip()
    try:
        f = float(val_str)
        if 25000 < f < 80000:
            dt = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=int(f))
            return dt.strftime('%Y-%m-%d')
    except ValueError:
        pass
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', val_str)
    if m:
        d = m.group(1).zfill(2)
        mo = m.group(2).zfill(2)
        y = int(m.group(3))
        if y < 100:
            y += 2000
        elif y > 2400:
            y -= 543
        return f"{y:04d}-{mo}-{d}"
    return val_str if len(val_str) <= 10 else None

def check_date_diff(incoming_etd, incoming_eta, incoming_time, match_job):
    if not match_job:
        return False, '', None, None, None
    def norm_d(d):
        return (str(d) or '').strip()[:10] if d else ''
    inc_etd = norm_d(incoming_etd)
    ex_etd = norm_d(match_job.get('etd') or match_job.get('submitDate'))
    inc_eta = norm_d(incoming_eta)
    ex_eta = norm_d(match_job.get('eta'))
    inc_time = (incoming_time or '').strip()
    if inc_time == '00:00': inc_time = ''
    ex_time = (match_job.get('flightTime') or '').strip()
    if ex_time == '00:00': ex_time = ''

    diffs = []
    if inc_etd and inc_etd != ex_etd:
        diffs.append(f'ETD: {ex_etd or "-"} ➔ {inc_etd}')
    if inc_eta and inc_eta != ex_eta:
        diffs.append(f'ETA: {ex_eta or "-"} ➔ {inc_eta}')
    if inc_time and inc_time != ex_time:
        diffs.append(f'เวลา: {ex_time or "-"} ➔ {inc_time}')

    is_changed = len(diffs) > 0
    diff_str = ' • '.join(diffs)
    return is_changed, diff_str, ex_etd or None, ex_eta or None, ex_time or None


def parse_fwd_sea_2row(raw_rows):
    """Parses 2-row SEA FWD format (receiptreport_(1).xls)"""
    rows = []
    by_no, by_join, by_bl = load_master_index()
    r = 3
    while r < len(raw_rows):
        row1 = raw_rows[r]
        no_val = clean_text(row1[0]) if len(row1) > 0 else ""
        job_val = clean_text(row1[5]) if len(row1) > 5 else ""
        
        if (no_val and re.match(r'^\d+(\.0)?$', no_val)) or (job_val and re.match(r'^(SI|SE)\d+', job_val, re.I)):
            etd_raw = clean_text(row1[1]) if len(row1) > 1 else ""
            carrier = clean_text(row1[2]) if len(row1) > 2 else ""
            agent = clean_text(row1[3]) if len(row1) > 3 else ""
            booking = clean_text(row1[4]) if len(row1) > 4 else ""
            hbl = clean_text(row1[6]) if len(row1) > 6 else ""
            local_cust = clean_text(row1[8]) if len(row1) > 8 else ""
            pol = clean_text(row1[11]) if len(row1) > 11 else ""
            commodity = clean_text(row1[14]) if len(row1) > 14 else ""
            
            row2 = raw_rows[r+1] if r + 1 < len(raw_rows) else []
            eta_raw = clean_text(row2[1]) if len(row2) > 1 else ""
            job_date_raw = clean_text(row2[5]) if len(row2) > 5 else ""
            mbl = clean_text(row2[7]) if len(row2) > 7 else ""
            oversea_cust = clean_text(row2[8]) if len(row2) > 8 else ""
            feeder = clean_text(row2[10]) if len(row2) > 10 else ""
            pod = clean_text(row2[12]) if len(row2) > 12 else ""
            cs_name = clean_text(row2[23]) if len(row2) > 23 else ""

            job_clean = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', job_val, flags=re.I).strip().upper()
            customer = oversea_cust or local_cust or "—"
            etd_iso = excel_date_to_iso(etd_raw)
            eta_iso = excel_date_to_iso(eta_raw)
            job_date_iso = excel_date_to_iso(job_date_raw) or etd_iso or eta_iso

            liner_booking = clean_text(row1[7]) if len(row1) > 7 else ""
            loading_date = excel_date_to_iso(clean_text(row1[14])) if len(row1) > 14 else None

            match = by_join.get(job_clean) or by_no.get(job_clean) or (hbl and by_bl.get(hbl.upper()))
            action_type = "update" if match else "new"
            is_date_changed, diff_str, ex_etd, ex_eta, _ = check_date_diff(etd_iso, eta_iso, None, match)
            if match:
                note = f"🔄 อัปเดตกำหนดการ: {diff_str} (อัปเดตทับงานเดิม ไม่เพิ่มแถว)" if is_date_changed else "⚪ งานเดิมในระบบแล้ว (วันเวลาไม่เปลี่ยน • ข้ามเพื่อไม่ให้งานบวม)"
            else:
                note = "✨ งานใหม่จาก FWD (Sea Forwarding)"

            rows.append({
                "id": f"fwd-sea-{r}-{job_clean}",
                "sheet": "SEA FWD",
                "jobNo": job_clean,
                "joinNo": match.get('jobNo') if match else "",
                "customer": customer,
                "declarationNo": "",
                "invoiceNo": booking,
                "referenceNo": booking,
                "status": "In Progress",
                "customsStatus": None,
                "etd": etd_iso,
                "eta": eta_iso,
                "submitDate": job_date_iso,
                "containerType": "FCL / LCL",
                "grossWeight": None,
                "cbm": None,
                "csName": cs_name,
                "bl": hbl or mbl,
                "commodity": commodity,
                "carrier": carrier,
                "agent": agent,
                "feeder": feeder,
                "vessel": feeder,
                "linerBooking": liner_booking,
                "pol": pol,
                "pod": pod,
                "loadingDate": loading_date,
                "actionType": action_type,
                "isDateChanged": is_date_changed,
                "dateChangeDiff": diff_str,
                "oldEtd": ex_etd,
                "oldEta": ex_eta,
                "validationStatus": "valid",
                "validationNote": note
            })
            r += 2
        else:
            r += 1
    return rows

def parse_fwd_air_2row(raw_rows):
    """Parses 2-row AIR FWD format (reportexport.xls)"""
    rows = []
    by_no, by_join, by_bl = load_master_index()
    r = 2
    while r < len(raw_rows):
        row1 = raw_rows[r]
        no_val = clean_text(row1[0]) if len(row1) > 0 else ""
        job_val = clean_text(row1[1]) if len(row1) > 1 else ""

        if (no_val and re.match(r'^\d+(\.0)?$', no_val)) or (job_val and re.match(r'^(AI|AE)\d+', job_val, re.I)):
            shipper = clean_text(row1[2]) if len(row1) > 2 else ""
            agent = clean_text(row1[3]) if len(row1) > 3 else ""
            hawb = clean_text(row1[4]) if len(row1) > 4 else ""
            flight = clean_text(row1[5]) if len(row1) > 5 else ""
            pod = clean_text(row1[6]) if len(row1) > 6 else ""
            gw_raw = clean_text(row1[8]) if len(row1) > 8 else ""
            cs_name = clean_text(row1[10]) if len(row1) > 10 else ""

            row2 = raw_rows[r+1] if r + 1 < len(raw_rows) else []
            job_date_raw = clean_text(row2[1]) if len(row2) > 1 else ""
            consignee = clean_text(row2[2]) if len(row2) > 2 else ""
            mawb = clean_text(row2[4]) if len(row2) > 4 else ""
            flight_time = clean_text(row2[5]) if len(row2) > 5 else ""
            eta_raw = clean_text(row2[6]) if len(row2) > 6 else ""

            job_clean = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', job_val, flags=re.I).strip().upper()
            customer = consignee or shipper or "—"
            eta_iso = excel_date_to_iso(eta_raw)
            job_date_iso = excel_date_to_iso(job_date_raw)

            gw_val = None
            try:
                if gw_raw: gw_val = float(gw_raw.replace(',', ''))
            except: pass

            match = by_join.get(job_clean) or by_no.get(job_clean) or (hawb and by_bl.get(hawb.upper()))
            action_type = "update" if match else "new"
            is_date_changed, diff_str, ex_etd, ex_eta, ex_time = check_date_diff(job_date_iso, eta_iso, flight_time, match)
            if match:
                note = f"🔄 อัปเดตกำหนดการ: {diff_str} (อัปเดตทับงานเดิม ไม่เพิ่มแถว)" if is_date_changed else "⚪ งานเดิมในระบบแล้ว (วันเวลาไม่เปลี่ยน • ข้ามเพื่อไม่ให้งานบวม)"
            else:
                note = "✨ งานใหม่จาก FWD (Air Forwarding)"

            rows.append({
                "id": f"fwd-air-{r}-{job_clean}",
                "sheet": "AIR FWD",
                "jobNo": job_clean,
                "joinNo": match.get('jobNo') if match else "",
                "customer": customer,
                "declarationNo": "",
                "invoiceNo": "",
                "referenceNo": hawb or mawb,
                "status": "In Progress",
                "customsStatus": None,
                "etd": job_date_iso,
                "eta": eta_iso,
                "submitDate": job_date_iso,
                "containerType": "AIR CARGO",
                "grossWeight": gw_val,
                "cbm": None,
                "csName": cs_name,
                "bl": hawb or mawb,
                "commodity": "",
                "carrier": agent,
                "agent": agent,
                "flight": flight,
                "flightNo": flight,
                "flightTime": flight_time if flight_time and flight_time != '00:00' else None,
                "pod": pod,
                "actionType": action_type,
                "isDateChanged": is_date_changed,
                "dateChangeDiff": diff_str,
                "oldEtd": ex_etd,
                "oldEta": ex_eta,
                "oldFlightTime": ex_time,
                "validationStatus": "valid",
                "validationNote": note
            })
            r += 2
        else:
            r += 1
    return rows

def parse_transport_rows(raw_rows):
    """Parses Inland Transport booking list (examination_delivery.xls)"""
    trips = []
    header_idx = -1
    for i, r in enumerate(raw_rows[:10]):
        line_str = " ".join(clean_text(c).upper() for c in r)
        if ("STUFFING" in line_str and "VOLUME" in line_str) or ("JOIN NO" in line_str and "JOB NO" in line_str):
            header_idx = i
            break

    if header_idx == -1:
        return []

    for r_idx in range(header_idx + 1, len(raw_rows)):
        row = raw_rows[r_idx]
        if not any(row):
            continue
        line_str = " ".join(str(c) for c in row)
        if "TOTAL :" in line_str.upper() or "TOTAL:" in line_str.upper():
            continue

        def val(idx):
            return clean_text(row[idx]) if 0 <= idx < len(row) else ""

        col2 = val(2).upper()
        col3 = val(3).upper()

        ts_no = col3 if col3.startswith("TS") else (col2 if col2.startswith("TS") else "")
        if not ts_no or len(ts_no) < 4:
            continue

        linked_job = col2 if (not col2.startswith("TS") and len(col2) >= 4) else ""
        cust = val(4)
        vol = val(6)
        p_from = val(9)
        p_date = excel_date_to_iso(val(10))
        d_to = val(12)
        d_date = excel_date_to_iso(val(13))
        ret_to = val(15)
        transporter = val(24)
        plate = val(25)
        driver = val(26)

        status = "กำลังวิ่ง"
        if d_date:
            today_str = datetime.date.today().strftime("%Y-%m-%d")
            if d_date < today_str:
                status = "ส่งมอบแล้ว"

        trips.append({
            "tripNo": ts_no,
            "transportNo": ts_no,
            "jobNo": linked_job or "",
            "customer": cust,
            "driver": driver or transporter or vol,
            "driverName": driver,
            "transporter": transporter,
            "truckType": vol,
            "container": vol,
            "plateNo": plate,
            "pickupLocation": p_from,
            "pickupDate": p_date,
            "deliveryLocation": d_to,
            "deliver": d_date,
            "deliverDate": d_date,
            "returnDepot": ret_to,
            "status": status,
            "pod": ""
        })
    return trips

def parse_sheet_rows(sheet_name, raw_rows):
    if not raw_rows:
        return [], False, False, False

    first_few = " ".join(" ".join(clean_text(c).upper() for c in r) for r in raw_rows[:4])
    if ("TRANSPORT" in first_few or "EXAMINATION AND DELIVERY" in first_few or sheet_name.upper() == "EXAMINATION AND DELIVERY" or ("STUFFING" in first_few and "DELIVERY BY" in first_few)):
        trips = parse_transport_rows(raw_rows)
        if trips:
            return trips, False, True, True

    if ("BOOKING REPORT" in first_few or "BOOKING DATE" in first_few) and ("CARRIER" in first_few and "AGENT" in first_few):
        rows = parse_fwd_sea_2row(raw_rows)
        if rows:
            return rows, False, True, False

    if "DAILY SHIPMENT REPORT" in first_few or ("HAWB" in first_few and "FLIGHT" in first_few and "MAWB" in first_few):
        rows = parse_fwd_air_2row(raw_rows)
        if rows:
            return rows, False, True, False

    # Standard 1-row layout (Customs / Shipping)
    by_no, by_join, by_bl = load_master_index()
    header_idx = -1
    for i, r in enumerate(raw_rows[:15]):
        non_empty = [clean_text(c).upper() for c in r if clean_text(c)]
        if len(non_empty) < 3:
            continue
        line_str = " ".join(non_empty)
        has_job = any(re.search(r'JOB\s*NO\.?', c) for c in non_empty) or "JOB NO" in line_str
        has_decl = any('DECLARATION' in c for c in non_empty)
        has_cust = any(k in line_str for k in ["IMPORTER", "EXPORTER", "CUSTOMER"])
        if (has_job and (has_decl or has_cust)) or has_decl or has_job:
            header_idx = i
            break

    if header_idx == -1:
        return [], False, False, False

    header_cols = [clean_text(c).upper() for c in raw_rows[header_idx]]
    def get_col_idx(names):
        for idx, col in enumerate(header_cols):
            for n in names:
                if n.upper() in col:
                    return idx
        return -1

    idx_job = get_col_idx(["JOB NO.", "JOB NO", "JOBNO"])
    idx_join = get_col_idx(["JOIN NO", "JOIN"])
    idx_cust = get_col_idx(["IMPORTER NAME", "EXPORTER NAME", "CUSTOMER NAME", "IMPORTER", "EXPORTER", "CUSTOMER"])
    idx_decl = get_col_idx(["DECLARATION NO", "DECLARATION NO.", "DECL. NO", "เลขที่ใบขน", "DECLARATION"])
    idx_decl_type = get_col_idx(["DECLARATION TYPE", "DECL TYPE"])
    idx_inv = get_col_idx(["INVOICE NO", "INVOIVE NO", "INVOICE", "CUS.INV NO"])
    idx_submit = get_col_idx(["SUBMIT DD", "SUBMIT DATE", "SUBMIT"])
    idx_status = get_col_idx(["STATUS JOB", "STATUS"])
    idx_o409 = get_col_idx(["O4O9", "0409"])
    idx_o309 = get_col_idx(["O3O9", "0309"])
    idx_o209 = get_col_idx(["O2O9", "0209"])
    idx_o109 = get_col_idx(["O1O9", "0109"])
    idx_etd = get_col_idx(["ETD"])
    idx_eta = get_col_idx(["ETA"])
    idx_gw = get_col_idx(["G.W.", "GROSS WEIGHT", "GW"])
    idx_cbm = get_col_idx(["MEASUREMENT (M3)", "MEASUREMENT", "CBM"])
    idx_cntr = get_col_idx(["CONTAINER TYPE", "CONTAINER"])
    idx_cs = get_col_idx(["CS NAME", "CS"])
    idx_mbl = get_col_idx(["MBL"])
    idx_hbl = get_col_idx(["HBL"])
    idx_commodity = get_col_idx(["COMMODITY"])
    idx_ref = get_col_idx(["REFERENCE NO", "REFERANCE NO", "REF NO"])

    all_headers_str = " ".join(header_cols)
    sheet_upper = sheet_name.upper()
    is_customs = any(k in all_headers_str for k in ["O4O9", "0409", "O1O9", "0109", "เลขที่ใบขน"]) or "IMPORT" in sheet_upper or "EXPORT" in sheet_upper

    rows = []
    for r_idx, r in enumerate(raw_rows[header_idx + 1:], start=header_idx + 2):
        if not r or not any(str(c).strip() for c in r):
            continue
            
        def val(idx):
            return clean_text(r[idx]) if 0 <= idx < len(r) else ""

        raw_job = val(idx_job)
        raw_join = val(idx_join)
        
        job_no = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', raw_job, flags=re.I).strip().upper()
        join_no = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', raw_join, flags=re.I).strip().upper()
        
        effective_key = job_no or join_no
        if not effective_key or len(effective_key) < 4:
            continue
            
        if "JOB NO" in effective_key or re.match(r'^\d+(\.\d+)?$', effective_key):
            continue

        customer = val(idx_cust)
        declaration_no = val(idx_decl)
        decl_type_val = val(idx_decl_type)
        if declaration_no.upper() in ["NORMAL", "GENERAL", "IMPORT", "EXPORT", "TRANSIT", "RE-EXPORT"]:
            if not decl_type_val:
                decl_type_val = declaration_no
            declaration_no = ""
        inv_no = val(idx_inv)
        submit_raw = val(idx_submit)
        submit_iso = excel_date_to_iso(submit_raw)
        
        etd_raw = val(idx_etd)
        eta_raw = val(idx_eta)
        etd_iso = excel_date_to_iso(etd_raw) or (None if is_customs else submit_iso)  # ใบขน: SUBMIT DD ไม่ใช่ ETD ห้ามเอาไปทับ
        eta_iso = excel_date_to_iso(eta_raw)
        
        st_raw = val(idx_status)
        o409_val = val(idx_o409)
        o309_val = val(idx_o309)
        o209_val = val(idx_o209)
        o109_val = val(idx_o109)
        
        customs_st = None
        if "0409" in st_raw or o409_val or "0409" in o409_val:
            customs_st = "0409"
        elif "0309" in st_raw or o309_val:
            customs_st = "0309"
        elif "0209" in st_raw or o209_val:
            customs_st = "0209"
        elif "0109" in st_raw or o109_val:
            customs_st = "0109"
        elif is_customs and declaration_no and idx_status == -1 and idx_o409 == -1:
            # ไม่มีคอลัมน์สถานะเลย -> อนุมานจากเลขใบขน (ถ้ามีคอลัมน์ STATUS แต่ว่าง = ยังไม่ทราบ ไม่เดาว่า 0409)
            customs_st = "0409"

        gw_val = None
        try:
            raw_gw = val(idx_gw).replace(',', '')
            if raw_gw: gw_val = float(raw_gw)
        except Exception:
            pass

        cbm_val = None
        try:
            raw_cbm = val(idx_cbm).replace(',', '')
            if raw_cbm: cbm_val = float(raw_cbm)
        except Exception:
            pass

        match = by_no.get(effective_key) or (join_no and by_join.get(join_no))
        action_type = "update" if match else "new"
        is_date_changed, diff_str, ex_etd, ex_eta, _ = check_date_diff(etd_iso, eta_iso, None, match)

        rows.append({
            "id": f"row-{sheet_name.strip()}-{r_idx}-{effective_key}",
            "sheet": sheet_name.strip(),
            "jobNo": effective_key,
            "joinNo": join_no if join_no != effective_key else "",
            "customer": customer or "—",
            "declarationNo": declaration_no,
            "invoiceNo": inv_no,
            "referenceNo": val(idx_ref),
            "status": "Completed" if customs_st == "0409" else "In Progress",
            "customsStatus": customs_st,
            "etd": etd_iso,
            "eta": eta_iso,
            "submitDate": submit_iso,
            "containerType": val(idx_cntr),
            "grossWeight": gw_val,
            "cbm": cbm_val,
            "csName": val(idx_cs),
            "bl": val(idx_mbl) or val(idx_hbl),
            "commodity": val(idx_commodity),
            "actionType": action_type,
            "isDateChanged": is_date_changed,
            "dateChangeDiff": diff_str,
            "oldEtd": ex_etd,
            "oldEta": ex_eta,
            "validationStatus": "valid" if (declaration_no or etd_iso or effective_key) else "warning",
            "validationNote": (f"🔄 อัปเดตกำหนดการ: {diff_str} (อัปเดตทับงานเดิม ไม่เพิ่มแถว)" if is_date_changed else "⚪ งานเดิมในระบบแล้ว (วันเวลาไม่เปลี่ยน • ข้ามเพื่อไม่ให้งานบวม)") if match else "✨ งานใหม่"
        })

    return rows, is_customs, True, False

def read_html_tables(file_path):
    """อ่านไฟล์ .xls ที่จริงๆ เป็น HTML (เช่น รายงานใบขนจากระบบ e-Customs Report Designer)
    คืนค่า list ของ (sheet_name, raw_rows) แยกตาม <table> (ข้าม HTML comment อัตโนมัติ)"""
    from html.parser import HTMLParser

    raw = open(file_path, 'rb').read()
    m = re.search(rb'charset=["\']?([\w-]+)', raw[:5000], re.I)
    enc = m.group(1).decode('ascii', 'ignore').lower() if m else 'utf-8'
    if enc in ('tis-620', 'tis620', 'windows-874'):
        enc = 'cp874'
    try:
        text = raw.decode(enc, 'replace')
    except LookupError:
        text = raw.decode('utf-8', 'replace')

    class _TableParser(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.tables, self.row, self.cell = [], None, None
        def handle_starttag(self, tag, attrs):
            if tag == 'table': self.tables.append([])
            elif tag == 'tr' and self.tables: self.row = []
            elif tag in ('td', 'th') and self.row is not None: self.cell = []
        def handle_endtag(self, tag):
            if tag in ('td', 'th') and self.cell is not None and self.row is not None:
                self.row.append(clean_text(''.join(self.cell))); self.cell = None
            elif tag == 'tr' and self.row is not None:
                if any(self.row): self.tables[-1].append(self.row)
                self.row = None
        def handle_data(self, data):
            if self.cell is not None: self.cell.append(data)

    p = _TableParser()
    p.feed(text)
    sheets = []
    for i, rows in enumerate(p.tables):
        head = " ".join(" ".join(r) for r in rows[:3]).upper()
        name = "IMPORT" if "IMPORTER" in head else "EXPORT" if "EXPORTER" in head else f"TABLE{i + 1}"
        sheets.append((name, rows))
    return sheets

def parse_file(file_path):
    if not os.path.exists(file_path):
        return {"ok": False, "error": f"File not found: {file_path}"}
    
    file_name = os.path.basename(file_path)
    lower = file_path.lower()
    
    all_rows = []
    all_transport_trips = []
    seen_keys = set()
    seen_trips = set()
    detected_customs = False
    
    if lower.endswith('.csv'):
        import csv
        raw_rows = []
        for enc in ['utf-8-sig', 'utf-8', 'tis-620', 'cp874', 'latin-1']:
            try:
                with open(file_path, 'r', encoding=enc) as f:
                    reader = csv.reader(f)
                    raw_rows = [list(row) for row in reader]
                if raw_rows:
                    break
            except Exception:
                continue
        sheet_rows, is_c, found, is_trans = parse_sheet_rows("CSV", raw_rows)
        if is_trans:
            for t in sheet_rows:
                if t["tripNo"] not in seen_trips:
                    seen_trips.add(t["tripNo"])
                    all_transport_trips.append(t)
        else:
            for r in sheet_rows:
                if r["jobNo"] not in seen_keys:
                    seen_keys.add(r["jobNo"])
                    all_rows.append(r)
            if is_c: detected_customs = True

    elif lower.endswith('.xls') and not lower.endswith('.xlsx'):
        with open(file_path, 'rb') as fh:
            head = fh.read(2048).lower()
        is_html_xls = any(t in head for t in (b'<html', b'<table', b'<script', b'<!doctype', b'<meta'))
        if is_html_xls:
            # ไฟล์ .xls ที่เป็น HTML (รายงานใบขน e-Customs) -> อ่านแต่ละ <table> เป็นชีต
            try:
                for s_name, raw_rows in read_html_tables(file_path):
                    sheet_rows, is_c, found, is_trans = parse_sheet_rows(s_name, raw_rows)
                    if is_trans:
                        for t in sheet_rows:
                            if t["tripNo"] not in seen_trips:
                                seen_trips.add(t["tripNo"])
                                all_transport_trips.append(t)
                    else:
                        for r in sheet_rows:
                            if r["jobNo"] not in seen_keys:
                                seen_keys.add(r["jobNo"])
                                all_rows.append(r)
                        if is_c: detected_customs = True
            except Exception as e:
                return {"ok": False, "error": f"Failed to read HTML .xls: {str(e)}"}
        else:
            try:
                import xlrd
                wb = None
                last_err = None
                for enc in [None, 'latin-1', 'cp874']:
                    try:
                        if enc:
                            wb = xlrd.open_workbook(file_path, logfile=open(os.devnull, 'w'), encoding_override=enc)
                        else:
                            wb = xlrd.open_workbook(file_path, logfile=open(os.devnull, 'w'))
                        break
                    except Exception as e:
                        last_err = e
                        continue
            
                if wb is None:
                    raise last_err or Exception("Failed to open xls file")

                for s_name in wb.sheet_names():
                    if "COUNTER" in s_name.upper():
                        continue
                    ws = wb.sheet_by_name(s_name)
                    raw_rows = []
                    for r in range(ws.nrows):
                        row_vals = [clean_text(ws.cell_value(r, c)) for c in range(ws.ncols)]
                        if any(row_vals):
                            raw_rows.append(row_vals)
                    sheet_rows, is_c, found, is_trans = parse_sheet_rows(s_name, raw_rows)
                    if is_trans:
                        for t in sheet_rows:
                            if t["tripNo"] not in seen_trips:
                                seen_trips.add(t["tripNo"])
                                all_transport_trips.append(t)
                    else:
                        for r in sheet_rows:
                            if r["jobNo"] not in seen_keys:
                                seen_keys.add(r["jobNo"])
                                all_rows.append(r)
                        if is_c: detected_customs = True
            except Exception as e:
                return {"ok": False, "error": f"Failed to read .xls: {str(e)}"}

    elif lower.endswith('.xlsx'):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True)
            for s_name in wb.sheetnames:
                if any(x in s_name.upper() for x in ["COUNTER", "DASHBOARD", "SUMMARY"]):
                    continue
                ws = wb[s_name]
                raw_rows = []
                for row in ws.iter_rows(values_only=True):
                    row_vals = [clean_text(c) for c in row]
                    if any(row_vals):
                        raw_rows.append(row_vals)
                sheet_rows, is_c, found, is_trans = parse_sheet_rows(s_name, raw_rows)
                if is_trans:
                    for t in sheet_rows:
                        if t["tripNo"] not in seen_trips:
                            seen_trips.add(t["tripNo"])
                            all_transport_trips.append(t)
                else:
                    for r in sheet_rows:
                        if r["jobNo"] not in seen_keys:
                            seen_keys.add(r["jobNo"])
                            all_rows.append(r)
                    if is_c: detected_customs = True
        except Exception as e:
            return {"ok": False, "error": f"Failed to read .xlsx: {str(e)}"}

    if all_transport_trips:
        return {
            "ok": True,
            "fileName": file_name,
            "fileType": "transport",
            "fileTypeLabel": "รายงานการจองรถขนส่งในประเทศ (Inland Transport)",
            "isTransport": True,
            "totalRows": len(all_transport_trips),
            "transportTrips": all_transport_trips,
            "rows": [],
            "message": f"ตรวจพบไฟล์นี้เป็น: รายงานการจองรถขนส่งในประเทศ (Inland Transport) {len(all_transport_trips)} เที่ยวรถ · แยกเข้าตารางเดินรถโดยเฉพาะ ไม่นับรวมในตัวเลขชิปเมนท์หลัก"
        }

    return {
        "ok": True,
        "fileName": file_name,
        "fileType": "customs" if detected_customs else "fwd",
        "fileTypeLabel": "รายงานสถานะศุลกากร (Customs Report)" if detected_customs else "รายงาน FWD Booking Report",
        "totalRows": len(all_rows),
        "rows": all_rows
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "No file path provided"}))
        sys.exit(1)
    
    res = parse_file(sys.argv[1])
    print(json.dumps(res, ensure_ascii=False))
