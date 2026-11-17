import zipfile, re, json, datetime, os
import xml.etree.ElementTree as ET

def clean_text(v):
    if not v:
        return ""
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
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', val_str)
    if m:
        d = m.group(1).zfill(2)
        mo = m.group(2).zfill(2)
        y = int(m.group(3))
        if y < 100:
            y += 2000
        elif y > 2400:
            y -= 543
        return f"{y:04d}-{mo}-{d}"
    return None

def normalize_service(type_code, job_no):
    t = (type_code or '').upper().strip()
    j = (job_no or '').upper().strip()
    if 'SHSI' in t or j.startswith('SHSI') or j.startswith('SI'):
        return 'SEA Import', 'SEA-IMP', 'Sea Import'
    if 'SHSE' in t or j.startswith('SHSE') or j.startswith('SE'):
        return 'SEA Export', 'SEA-EXP', 'Sea Export'
    if 'SHAI' in t or j.startswith('SHAI') or j.startswith('AI'):
        return 'AIR Import', 'AIR-IMP', 'Air Import'
    if 'SHAE' in t or j.startswith('SHAE') or j.startswith('AE'):
        return 'AIR Export', 'AIR-EXP', 'AIR Export'
    if 'TS' in t or 'SHT' in t or j.startswith('TS') or j.startswith('SHT'):
        return 'Freight', 'TRN', 'Transport'
    return 'Freight', 'FRT', 'Freight'

def load_live_customs_status(live_xlsx_path):
    """
    โหลดสถานะ 0109-0409 ล่าสุดจาก JOB_Daily_2026 STATUS_Dashboard.xlsx
    """
    if not os.path.exists(live_xlsx_path):
        return {}
    
    print(f"Loading live customs updates from: {live_xlsx_path}")
    status_map = {}
    try:
        zf = zipfile.ZipFile(live_xlsx_path, 'r')
        shared = []
        if 'xl/sharedStrings.xml' in zf.namelist():
            sst = ET.fromstring(zf.read('xl/sharedStrings.xml'))
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in sst.findall('.//ns:si', ns):
                shared.append(''.join(t.text for t in si.findall('.//ns:t', ns) if t.text))

        wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))}
        ns_wb = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

        for s_node in wb_xml.findall('.//ns:sheet', ns_wb):
            s_name = s_node.attrib['name']
            if s_name not in ['SEA Import', 'AIR Import', 'Air Export', 'SEA Export', ' Freight ']:
                continue
            rId = s_node.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            target = rels[rId]
            sheet_path = 'xl/' + target if not target.startswith('xl/') else target
            ws_root = ET.fromstring(zf.read(sheet_path))
            rows = ws_root.findall('.//ns:row', ns_wb)

            for r in rows:
                r_num = int(r.attrib.get('r', 0))
                if r_num < 4:
                    continue
                cells = {}
                for c in r.findall('ns:c', ns_wb):
                    col = re.match(r'([A-Z]+)', c.attrib.get('r', '')).group(1)
                    t = c.attrib.get('t')
                    v = c.find('ns:v', ns_wb)
                    val = v.text if v is not None else ''
                    if t == 's' and val and int(val) < len(shared):
                        val = shared[int(val)]
                    cells[col] = clean_text(val)

                # คอลัมน์ Job No ในแต่ละชีท
                job_val = cells.get('D') or cells.get('F') or cells.get('G') or ''
                job_clean = re.sub(r'[^A-Za-z0-9]', '', job_val).upper()
                if not job_clean or len(job_clean) < 5:
                    continue

                raw_st = cells.get('C') or cells.get('E') or cells.get('F') or ''
                update_st = cells.get('X') or cells.get('V') or cells.get('Z') or cells.get('AD') or ''
                bl_val = cells.get('G') or cells.get('I') or cells.get('J') or ''

                st_lower = (raw_st + ' ' + update_st).lower()
                is_completed = '0409' in st_lower or 'complete' in st_lower or 'เสร็จ' in st_lower
                is_duty = '0309' in st_lower or 'duty' in st_lower
                is_customs = '0209' in st_lower or 'customs' in st_lower or 'ยิงใบขน' in st_lower
                is_draft = '0109' in st_lower or 'draft' in st_lower
                is_cancel = 'cancel' in st_lower or 'ยกเลิก' in st_lower

                status_map[job_clean] = {
                    "statusRaw": raw_st,
                    "updateStatus": update_st or ("0409" if is_completed else None),
                    "status": "Completed" if is_completed else ("Cancelled" if is_cancel else "In Progress"),
                    "statusDetail": "Job Complete" if is_completed else ("Job Cancelled" if is_cancel else ("Duty Paid" if is_duty else ("Customs Filed" if is_customs else ("Draft Customs" if is_draft else "Job Control")))),
                    "draftCustoms": is_completed or is_customs or is_draft,
                    "customsFiled": is_completed or is_customs,
                    "doReleased": is_completed,
                    "cleared": is_completed,
                    "bl": bl_val,
                }
    except Exception as e:
        print("Notice reading live customs:", e)
    
    print(f"Loaded {len(status_map)} live status keys from JOB_Daily_2026 STATUS_Dashboard.")
    return status_map

def run():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if not os.path.exists(os.path.join(base_dir, 'package.json')):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    booking_xlsx = os.path.join(base_dir, 'data', '2026 Booking Report.xlsx')
    if not os.path.exists(booking_xlsx):
        booking_xlsx = os.path.join(base_dir, '2026 Booking Report.xlsx')

    output_jobs_json = os.path.join(base_dir, 'data', 'jobs.json')
    if not os.path.exists(os.path.dirname(output_jobs_json)):
        output_jobs_json = os.path.join(base_dir, 'dashboard', 'data', 'jobs.json')

    live_xlsx = os.path.join(base_dir, 'data', 'JOB_Daily_2026 STATUS_Dashboard.xlsx')
    if not os.path.exists(live_xlsx):
        live_xlsx = os.path.join(base_dir, 'JOB_Daily_2026 STATUS_Dashboard.xlsx')
    if not os.path.exists(live_xlsx):
        live_xlsx = os.path.join(base_dir, 'tmp', 'live_sharepoint_test.xlsx')

    if not os.path.exists(booking_xlsx):
        print(f"Error: {booking_xlsx} not found")
        return

    print(f"Loading Booking Report: {booking_xlsx}")
    zf = zipfile.ZipFile(booking_xlsx, 'r')
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    shared = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        sst = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in sst.findall('.//ns:si', ns):
            shared.append(''.join(t.text for t in si.findall('.//ns:t', ns) if t.text))

    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))}
    months_order = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    sheet_map = {s.attrib['name']: s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'] for s in wb_xml.findall('.//ns:sheet', ns)}

    month_num_map = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
        'July': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    }

    # Load live status updates
    live_status_map = load_live_customs_status(live_xlsx)

    all_jobs = []
    seen_ids = set()

    for m in months_order:
        if m not in sheet_map:
            continue
        target = rels[sheet_map[m]]
        sheet_path = 'xl/' + target if not target.startswith('xl/') else target
        root = ET.fromstring(zf.read(sheet_path))
        
        header_cols = {}
        rows = root.findall('.//ns:row', ns)
        header_r_num = 2
        for r in rows[:5]:
            r_num = int(r.attrib.get('r', 0))
            cells = {}
            for c in r.findall('ns:c', ns):
                col = re.match(r'([A-Z]+)', c.attrib.get('r', '')).group(1)
                t = c.attrib.get('t')
                v = c.find('ns:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val and int(val) < len(shared):
                    val = shared[int(val)]
                cells[col] = val
            line_str = ' '.join(str(v) for v in cells.values()).upper()
            if 'JOB NO' in line_str or 'CUSTOMER' in line_str:
                header_r_num = r_num
                status_candidates = []
                for col_l, val in cells.items():
                    v_clean = str(val).strip().upper()
                    if 'JOB NO' in v_clean: header_cols['job'] = col_l
                    elif 'JOIN NO' in v_clean: header_cols['join'] = col_l
                    elif 'CUSTOMER' in v_clean: header_cols['customer'] = col_l
                    elif 'STATUS' in v_clean: status_candidates.append(col_l)
                    elif v_clean == 'TYPE': header_cols['type'] = col_l
                    elif 'YEAR' in v_clean: header_cols['year'] = col_l
                    elif 'MONTH' in v_clean: header_cols['month'] = col_l
                    elif 'DAY' in v_clean: header_cols['day'] = col_l
                    elif v_clean == 'ETD': header_cols['etd'] = col_l
                    elif v_clean == 'ETA': header_cols['eta'] = col_l
                    elif 'INV' in v_clean: header_cols['inv'] = col_l
                    elif 'MBL' in v_clean: header_cols['mbl'] = col_l
                    elif 'HBL' in v_clean: header_cols['hbl'] = col_l
                    elif 'G.W.' in v_clean: header_cols['gw'] = col_l
                    elif 'MEASUREMENT' in v_clean: header_cols['cbm'] = col_l
                    elif 'CONTAINER' in v_clean: header_cols['container'] = col_l
                    elif 'CS' in v_clean: header_cols['cs'] = col_l
                    elif 'COMMODITY' in v_clean: header_cols['commodity'] = col_l
                    elif 'PLACE OF DELIVERY' in v_clean: header_cols['pod'] = col_l
                
                # Pick primary status column: sort so single-letter columns like 'D' or 'E' come first
                if status_candidates:
                    status_candidates.sort(key=lambda x: (len(x), x))
                    header_cols['status'] = status_candidates[0]
                    if len(status_candidates) > 1:
                        header_cols['status_alt'] = status_candidates[1]
                break

        job_col = header_cols.get('job', 'B')
        join_col = header_cols.get('join', 'C')
        cust_col = header_cols.get('customer', 'E')
        type_col = header_cols.get('type', 'F')
        status_col = header_cols.get('status', 'D')
        year_col = header_cols.get('year', 'H')
        month_col = header_cols.get('month', 'I')
        day_col = header_cols.get('day', 'J')
        etd_col = header_cols.get('etd', 'K')
        eta_col = header_cols.get('eta', 'L')
        inv_col = header_cols.get('inv', 'M')
        mbl_col = header_cols.get('mbl', 'N')
        hbl_col = header_cols.get('hbl', 'O')
        gw_col = header_cols.get('gw', 'U')
        cbm_col = header_cols.get('cbm', 'X')
        cntr_col = header_cols.get('container', 'AC')
        cs_col = header_cols.get('cs', 'AE')
        comm_col = header_cols.get('commodity', 'W')

        sheet_jobs = 0
        sheet_month_key = f"2026-{month_num_map.get(m, '01')}"

        for r in rows:
            r_num = int(r.attrib.get('r', 0))
            if r_num <= header_r_num:
                continue
            cells = {}
            for c in r.findall('ns:c', ns):
                col = re.match(r'([A-Z]+)', c.attrib.get('r', '')).group(1)
                t = c.attrib.get('t')
                v = c.find('ns:v', ns)
                val = v.text if v is not None else ''
                if t == 's' and val and int(val) < len(shared):
                    val = shared[int(val)]
                cells[col] = clean_text(val)

            no_a = cells.get('A', '')
            raw_b = cells.get(job_col, '')
            raw_c = cells.get(join_col, '')
            raw_job = raw_b or raw_c

            if not raw_job:
                if no_a and no_a.isdigit():
                    raw_job = f"JOB-{m}-{no_a}"
                else:
                    continue

            job_no = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', raw_job, flags=re.I).strip().upper()
            if not job_no or 'JOB NO' in job_no or 'TOTAL' in job_no or 'REPORT' in job_no or 'JOIN NO' in job_no:
                continue

            unique_id = f"{m}_{r_num}_{job_no}"
            if unique_id in seen_ids:
                continue
            seen_ids.add(unique_id)

            by = cells.get(year_col, '2026')
            bm = cells.get(month_col, month_num_map.get(m, '01'))
            bd = cells.get(day_col, '01')
            try:
                by_i = int(float(by)) if by else 2026
                bm_i = int(float(bm)) if bm else int(month_num_map.get(m, '1'))
                bd_i = int(float(bd)) if bd else 1
                if not (1 <= bm_i <= 12):
                    bm_i = int(month_num_map.get(m, '1'))
                if not (1 <= bd_i <= 31):
                    bd_i = 1
                job_date = f"{by_i:04d}-{bm_i:02d}-{bd_i:02d}"
            except Exception:
                job_date = f"{sheet_month_key}-01"

            etd_iso = excel_date_to_iso(cells.get(etd_col)) or job_date
            eta_iso = excel_date_to_iso(cells.get(eta_col))

            raw_type = cells.get(type_col, '')
            svc_key, svc_code, svc_lbl = normalize_service(raw_type, job_no)

            raw_st = cells.get(status_col, '').strip()
            raw_st_alt = cells.get(header_cols.get('status_alt', ''), '').strip()
            combined_st = (raw_st + ' ' + raw_st_alt).lower()

            if 'complete' in combined_st or '0409' in combined_st or 'เสร็จ' in combined_st:
                st = 'Completed'
                std = 'Job Complete'
                chosen_raw = 'Job Complete'
            elif 'cancel' in combined_st or 'ยกเลิก' in combined_st:
                st = 'Cancelled'
                std = 'Job Cancelled'
                chosen_raw = raw_st or raw_st_alt or 'Job Cancelled'
            elif 'wait' in combined_st or 'รอ' in combined_st:
                st = 'In Progress'
                std = 'Job Waiting'
                chosen_raw = raw_st or raw_st_alt or 'Job Waiting'
            elif 'duty' in combined_st or '0309' in combined_st:
                st = 'In Progress'
                std = 'Duty Paid'
                chosen_raw = raw_st or raw_st_alt or 'Duty Paid'
            elif 'customs' in combined_st or '0209' in combined_st or 'ยิงใบขน' in combined_st:
                st = 'In Progress'
                std = 'Customs Filed'
                chosen_raw = raw_st or raw_st_alt or 'Customs Filed'
            elif '0109' in combined_st or 'draft' in combined_st:
                st = 'In Progress'
                std = 'Draft Customs'
                chosen_raw = raw_st or raw_st_alt or 'Draft Customs'
            elif 'booking' in combined_st:
                st = 'Booking'
                std = 'Job Booking'
                chosen_raw = raw_st or raw_st_alt or 'Job Booking'
            else:
                st = 'In Progress'
                std = 'Job Control'
                chosen_raw = raw_st or raw_st_alt or 'Job Control'

            gw_val = None
            try:
                gw_str = cells.get(gw_col, '')
                if gw_str and gw_str != '######':
                    gw_val = float(gw_str)
            except Exception:
                pass

            cbm_val = None
            try:
                cbm_str = cells.get(cbm_col, '')
                if cbm_str:
                    cbm_val = float(cbm_str)
            except Exception:
                pass

            customer_name = cells.get(cust_col, '—')
            join_no = raw_c if raw_b else None

            # Look up live status from JOB_Daily_2026 STATUS_Dashboard
            clean_k = re.sub(r'[^A-Za-z0-9]', '', job_no).upper()
            live = live_status_map.get(clean_k, {})

            record = {
                "id": unique_id,
                "jobNo": job_no,
                "service": svc_key,
                "serviceLabel": svc_lbl,
                "status": live.get("status") or st,
                "statusDetail": live.get("statusDetail") or std,
                "statusRaw": live.get("statusRaw") or chosen_raw or raw_st or "Job Control",
                "customer": customer_name if customer_name != '—' else "—",
                "consignee": customer_name,
                "bl": cells.get(mbl_col) or cells.get(hbl_col) or live.get("bl") or "",
                "mbl": cells.get(mbl_col) or live.get("bl"),
                "hbl": cells.get(hbl_col) or live.get("bl"),
                "joinNo": join_no,
                "updateStatus": live.get("updateStatus") or ("0409" if st == "Completed" else None),
                "etd": etd_iso,
                "eta": eta_iso,
                "jobDate": job_date,
                "month": sheet_month_key,
                "year": 2026,
                "draftCustoms": live.get("draftCustoms", st == "Completed"),
                "advanceDoc": live.get("advanceDoc", False),
                "doReleased": live.get("doReleased", st == "Completed"),
                "customsFiled": live.get("customsFiled", st == "Completed"),
                "cleared": live.get("cleared", st == "Completed"),
                "draftDate": None,
                "customsDate": None,
                "doDate": None,
                "clearDate": None,
                "advanceDate": None,
                "remark": None,
                "sourceSheet": m,
                "sourceRow": r_num,
                "runningNo": int(no_a) if no_a and no_a.isdigit() else None,
                "version": 1,
                "nextAction": None,
                "ageDays": None,
                "flags": [],
                "invoiceNo": cells.get(inv_col),
                "containerType": cells.get(cntr_col),
                "grossWeight": gw_val,
                "cbm": cbm_val,
                "commodity": cells.get(comm_col),
                "csName": cells.get(cs_col),
                "dataSource": "2026 Booking Report.xlsx"
            }
            all_jobs.append(record)
            sheet_jobs += 1

        print(f"Sheet {m}: successfully indexed {sheet_jobs} jobs (Target: {m}).")

    # Reconcile status across duplicate job entries
    # If a job is marked Completed in any record or live status, sync Completed to all instances of that jobNo
    completed_job_nos = {
        j["jobNo"]
        for j in all_jobs
        if j.get("jobNo") and (j.get("status") == "Completed" or j.get("statusDetail") == "Job Complete" or "complete" in (j.get("statusRaw") or "").lower())
    }
    reconciled_count = 0
    for j in all_jobs:
        jno = j.get("jobNo")
        if jno in completed_job_nos and j.get("status") != "Completed":
            j["status"] = "Completed"
            j["statusDetail"] = "Job Complete"
            j["statusRaw"] = "Job Complete"
            j["cleared"] = True
            j["customsFiled"] = True
            j["doReleased"] = True
            reconciled_count += 1
    if reconciled_count > 0:
        print(f"Reconciled {reconciled_count} duplicate job records to Completed status.")

    print(f"\n==========================================")
    print(f"Total jobs extracted from 2026 Booking Report.xlsx: {len(all_jobs)}")
    print(f"Writing to: {output_jobs_json} ...")
    os.makedirs(os.path.dirname(output_jobs_json), exist_ok=True)
    with open(output_jobs_json, 'w', encoding='utf-8') as f:
        json.dump(all_jobs, f, ensure_ascii=False, indent=2)
    print("Done! jobs.json successfully updated.")

if __name__ == '__main__':
    run()