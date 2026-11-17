import zipfile, re, json, datetime, os, shutil, hashlib
import xml.etree.ElementTree as ET

tmp_xlsx = os.path.join(os.path.dirname(__file__), '../../tmp/live_sharepoint_test.xlsx')
booking_xlsx = os.path.join(os.path.dirname(__file__), '../../2026 Booking Report.xlsx')
jobs_json_path = os.path.join(os.path.dirname(__file__), '../../dashboard/data/jobs.json')
transport_json_path = os.path.join(os.path.dirname(__file__), '../../dashboard/data/transport.json')
quality_json_path = os.path.join(os.path.dirname(__file__), '../../dashboard/data/quality_alerts.json')
backups_dir = os.path.join(os.path.dirname(__file__), '../../backups/snapshots')

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
    
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', val_str)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', val_str)
    if m:
        day = m.group(1).zfill(2)
        month = m.group(2).zfill(2)
        year = int(m.group(3))
        if year < 100:
            year += 2000
        elif year > 2400:
            year -= 543
        return f"{year:04d}-{month}-{day}"
    return None

def rectify_us_date(d_iso, job_y, job_m):
    """
    ตรวจจับและคำนวณแก้วันที่สลับวัน ⇄ เดือนจากเครื่องพนักงานที่ตั้งค่าภูมิภาคแบบ US (MM/DD/YYYY)
    
    หลักการทำงาน:
    1. พนักงานพิมพ์วันที่แบบ DD/MM/YYYY ลงในเครื่องที่มี Locale เป็น English (US)
    2. Excel ตีความ DD เป็นเดือน (Month) และ MM เป็นวัน (Day)
    3. เมื่องานมีกำหนดส่งในเดือนเดียวกัน (dd == job_m) หรือเดือนถัดไป (dd in [job_m+1, job_m+2])
       Excel จะบันทึกเป็นเดือน 01, 02, 03, 07 ซึ่งเป็นเดือนในอดีต ทำให้ระบบคำนวณเป็นงานค้าง 200+ วัน
    4. ฟังก์ชันนี้จะสลับตำแหน่งกลับคืนเป็นวันที่และเดือนที่ถูกต้องตามความตั้งใจจริง
    """
    if not d_iso or len(d_iso) < 10:
        return d_iso, False, ""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", d_iso)
    if not m:
        return d_iso, False, ""
    dy, dm, dd = int(m.group(1)), int(m.group(2)), int(m.group(3))
    
    if dy != job_y:
        return d_iso, False, ""
        
    valid_targets = [job_m]
    if job_m < 12:
        valid_targets.append(job_m + 1)
    if job_m < 11:
        valid_targets.append(job_m + 2)
        
    if dd in valid_targets and 1 <= dm <= 31 and dm != dd:
        if dm < job_m or (dd == job_m and dm != job_m and dm <= 12):
            corrected_iso = f"{dy:04d}-{dd:02d}-{dm:02d}"
            target_desc = f"เดือนงาน ({dd:02d})" if dd == job_m else f"เดือนถัดไป ({dd:02d})"
            reason = f"เครื่องพนักงานบันทึกเป็นแบบ US (สลับวัน {dm} กลายเป็นเดือน {dm:02d}, และเดือน {dd:02d} [{target_desc}] กลายเป็นวันที่ {dd})"
            return corrected_iso, True, reason
            
    return d_iso, False, ""

def normalize_status(raw, customs_code=None):
    s = clean_text(raw).lower()
    c = clean_text(customs_code).lower()
    
    if '0409' in s or '0409' in c or 'complete' in s or 'เสร็จ' in s:
        return 'Completed', 'Completed', 'Job Complete'
    if '0309' in s or '0309' in c or 'duty' in s or 'ภาษี' in s:
        return 'In Progress', 'Control', 'Duty Paid'
    if '0209' in s or '0209' in c or 'customs' in s or 'ยิงใบขน' in s:
        return 'In Progress', 'Control', 'Customs Filed'
    if '0109' in s or '0109' in c or 'draft' in s or 'ร่าง' in s:
        return 'In Progress', 'Waiting', 'Draft Customs'
    if 'cancel' in s or 'ยกเลิก' in s:
        return 'Cancelled', 'Cancelled', 'Job Cancelled'
    if 'wait' in s or 'รอ' in s:
        return 'In Progress', 'Waiting', 'Job Waiting'
    if 'booking' in s:
        return 'Booking', 'Booking', 'Job Booking'
    return 'In Progress', 'Control', 'Job Control'

def load_booking_report(path):
    if not os.path.exists(path):
        print(f"Warning: Booking report not found at {path}")
        return {}
        
    print(f"Loading Booking Report from {path}...")
    zf = zipfile.ZipFile(path, 'r')
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    shared = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        sst = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in sst.findall('.//ns:si', ns):
            shared.append(''.join(t.text for t in si.findall('.//ns:t', ns) if t.text))
            
    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))}
    
    month_sheets = {'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'July', 'Sep', 'Oct', 'Aug', 'Nov', 'Dec'}
    booking_map = {}
    
    for s_node in wb_xml.findall('.//ns:sheet', ns):
        s_name = s_node.attrib['name']
        rId = s_node.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rels[rId]
        sheet_path = 'xl/' + target if not target.startswith('xl/') else target
        root = ET.fromstring(zf.read(sheet_path))
        is_month = s_name in month_sheets
        
        for row in root.findall('.//ns:row', ns):
            r_num = int(row.attrib.get('r', 0))
            if r_num <= 3:
                continue
            cells = {}
            for c in row.findall('ns:c', ns):
                col = re.match(r'([A-Z]+)', c.attrib.get('r', '')).group(1)
                t = c.attrib.get('t')
                v = c.find('ns:v', ns)
                val = v.text if v is not None else None
                if t == 's' and val is not None and int(val) < len(shared):
                    val = shared[int(val)]
                cells[col] = clean_text(val)
                
            job_no = cells.get('B', '')
            join_no = cells.get('C', '')
            
            # Extract true date from split Year, Month, Day columns
            b_year = cells.get('H')
            b_month = cells.get('I')
            b_day = cells.get('J')
            booking_date = None
            try:
                by = int(float(b_year)) if b_year else None
                bm = int(float(b_month)) if b_month else None
                bd = int(float(b_day)) if b_day else None
                if by and bm and bd and 1 <= bm <= 12 and 1 <= bd <= 31:
                    booking_date = f"{by:04d}-{bm:02d}-{bd:02d}"
            except Exception:
                pass
                
            b_eta = excel_date_to_iso(cells.get('L')) or excel_date_to_iso(cells.get('G'))
            b_etd = excel_date_to_iso(cells.get('K'))
            
            gw_val = None
            try:
                if cells.get('U') and cells.get('U') != '######':
                    gw_val = float(cells.get('U'))
            except Exception:
                pass
                
            cbm_val = None
            try:
                if cells.get('X'):
                    cbm_val = float(cells.get('X'))
            except Exception:
                pass
                
            info = {
                'sheet': s_name,
                'is_month': is_month,
                'row': r_num,
                'job_no': job_no,
                'join_no': join_no,
                'booking_date': booking_date,
                'etd': b_etd,
                'eta': b_eta,
                'status': cells.get('D'),
                'customer': cells.get('E'),
                'commodity': cells.get('W'),
                'container': cells.get('AC'),
                'packages': cells.get('V'),
                'gw': gw_val,
                'cbm': cbm_val,
                'declaration_type': cells.get('Z'),
                'shipping_type': cells.get('AB'),
                'cs': cells.get('AE'),
                'mbl': cells.get('N'),
                'hbl': cells.get('O'),
                'depo': cells.get('P'),
                'terminal': cells.get('Q'),
                'feeder': cells.get('S'),
                'delivery': cells.get('T'),
                'inv': cells.get('M')
            }
            
            for text_val in [job_no, join_no]:
                if not text_val:
                    continue
                for part in re.split(r'[\s/]+', text_val):
                    clean_p = re.sub(r'[^A-Za-z0-9]', '', part).upper()
                    if len(clean_p) >= 7:
                        if clean_p not in booking_map or (is_month and not booking_map[clean_p]['is_month']):
                            booking_map[clean_p] = info
                            
    print(f"Indexed {len(booking_map)} job keys from 2026 Booking Report.")
    return booking_map

def run_sync():
    booking_map = load_booking_report(booking_xlsx)
    
    with zipfile.ZipFile(tmp_xlsx) as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            sst_xml = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in sst_xml.findall('.//ns:si', ns):
                text = "".join(t.text or "" for t in si.findall('.//ns:t', ns))
                shared_strings.append(text)

        wb_rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rel_map = {r.attrib['Id']: r.attrib['Target'] for r in wb_rels}
        wb_xml = ET.fromstring(z.read('xl/workbook.xml'))
        ns_wb = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

        # 1. Detect Hidden Sheets (Quality Alert)
        hidden_sheet_alerts = []
        for s in wb_xml.findall('.//ns:sheet', ns_wb):
            if s.attrib.get('state') == 'hidden':
                hidden_sheet_alerts.append({
                    "name": s.attrib.get('name'),
                    "sheetId": s.attrib.get('sheetId'),
                    "note": "ชีทนี้ถูกซ่อนไว้ใน Excel (สามารถคลิกขวาที่แท็บชีทเพื่อ Unhide ได้)"
                })

        sheet_specs = {
            'SEA Import': {'service': 'SEA Import', 'code': 'SEA-IMP', 'start_row': 4,
                           'cols': {'etd': 'A', 'eta': 'B', 'status': 'C', 'job': 'D', 'customer': 'E', 'consignee': 'F', 'bl_inv': 'G', 'draft': 'H', 'o209': 'I', 'o309': 'J', 'o409': 'K', 'advance': 'L', 'update_status': 'X'}},
            'AIR Import': {'service': 'AIR Import', 'code': 'AIR-IMP', 'start_row': 4,
                           'cols': {'etd': 'A', 'eta': 'B', 'status': 'C', 'job': 'D', 'customer': 'E', 'consignee': 'F', 'bl_inv': 'G', 'draft': 'H', 'customs_status': 'I', 'advance': 'J', 'carrier': 'K', 'do': 'L', 'update_status': 'V'}},
            'Air Export': {'service': 'Air Export', 'code': 'AIR-EXP', 'start_row': 4,
                           'cols': {'cs': 'A', 'job_date': 'B', 'etd': 'C', 'eta': 'D', 'status': 'E', 'job': 'F', 'customer': 'G', 'consignee': 'H', 'bl_inv': 'I', 'draft': 'J', 'o209': 'K', 'o309': 'L', 'o409': 'M', 'advance': 'N', 'update_status': 'Z'}},
            'SEA Export': {'service': 'SEA Export', 'code': 'SEA-EXP', 'start_row': 4,
                           'cols': {'cs': 'A', 'job_date': 'B', 'etd': 'D', 'eta': 'E', 'status': 'F', 'job': 'G', 'customer': 'H', 'consignee': 'I', 'bl_inv': 'J', 'draft': 'K', 'o209': 'L', 'o309': 'M', 'o409': 'N', 'update_status': 'AD'}},
            'Freight': {'service': 'Freight', 'code': 'FRT', 'start_row': 4,
                        'cols': {'cs': 'A', 'sub_type': 'B', 'etd': 'C', 'eta': 'D', 'status': 'E', 'job': 'F', 'customer': 'G', 'consignee': 'H', 'bl_inv': 'I', 'draft': 'J', 'o209': 'K', 'o309': 'L', 'o409': 'M', 'advance': 'N', 'update_status': 'AA'}}
        }

        all_jobs = []
        job_locations = {}
        date_swap_alerts = []
        booking_alignment_alerts = []
        missing_dates_alerts = []

        for sheet_node in wb_xml.findall('.//ns:sheet', ns_wb):
            sheet_raw = sheet_node.attrib['name']
            sheet_clean = sheet_raw.strip()
            if sheet_clean not in sheet_specs:
                continue
            spec = sheet_specs[sheet_clean]
            rId = sheet_node.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            target = rel_map[rId]
            clean_target = target.lstrip('/')
            sheet_path = 'xl/' + clean_target if not clean_target.startswith('xl/') else clean_target

            ws_xml = ET.fromstring(z.read(sheet_path))
            rows = ws_xml.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')

            for r in rows:
                r_num = int(r.attrib.get('r', 0))
                if r_num < spec['start_row']:
                    continue

                cell_dict = {}
                for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    ref = c.attrib.get('r', '')
                    col_letter = re.sub(r'\d+', '', ref)
                    t = c.attrib.get('t')
                    v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = v.text if v is not None else ""
                    if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                        val = shared_strings[int(val)]
                    cell_dict[col_letter] = clean_text(val)

                cols = spec['cols']
                raw_job = cell_dict.get(cols['job'], '')
                job_no = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', raw_job, flags=re.I)
                job_no = re.sub(r'\s+', '', job_no).upper()

                if not job_no or len(job_no) < 5 or 'REPORT' in job_no or 'TOTAL' in job_no or 'CREATE' in job_no or 'BOOKING' in job_no:
                    continue

                # Cross-sheet duplicate tracking
                loc_entry = {
                    "sheet": spec['service'],
                    "row": r_num,
                    "customer": cell_dict.get(cols.get('customer', ''), ''),
                    "status": cell_dict.get(cols.get('status', ''), '')
                }
                if job_no in job_locations:
                    job_locations[job_no].append(loc_entry)
                else:
                    job_locations[job_no] = [loc_entry]

                bl_inv_raw = cell_dict.get(cols.get('bl_inv', ''), '')
                bl = bl_inv_raw
                inv = ""
                if '/' in bl_inv_raw:
                    parts = [p.strip() for p in bl_inv_raw.split('/') if p.strip()]
                    if len(parts) >= 2:
                        bl = parts[0]
                        inv = parts[1]

                customs_code = None
                for o_key in ['o409', 'o309', 'o209', 'customs_status']:
                    if o_key in cols and cell_dict.get(cols[o_key]):
                        customs_code = o_key.replace('o', '') if o_key != 'customs_status' else cell_dict.get(cols[o_key])
                        break

                raw_st = cell_dict.get(cols.get('status', ''), '')
                st_gen, st_detail, st_excel = normalize_status(raw_st, customs_code)

                # Raw dates from Master Excel
                raw_etd_iso = excel_date_to_iso(cell_dict.get(cols.get('etd', ''), ''))
                raw_eta_iso = excel_date_to_iso(cell_dict.get(cols.get('eta', ''), ''))
                raw_job_date_iso = excel_date_to_iso(cell_dict.get(cols.get('job_date', ''), ''))

                # Match with Booking Report
                clean_k = re.sub(r'[^A-Za-z0-9]', '', job_no).upper()
                bk = booking_map.get(clean_k)
                current_cust = clean_text(cell_dict.get(cols.get('customer', ''), '')).lower()
                if not bk:
                    # Match by numeric sequence (e.g. 26100004) ONLY if customer is compatible
                    num_match = re.search(r'\d{6,}', job_no)
                    if num_match:
                        num_str = num_match.group(0)
                        c_words = [w for w in re.split(r'[^a-zA-Z0-9]+', current_cust) if len(w) >= 4 and w not in ['co', 'ltd', 'thailand', 'corp', 'company', 'limited']]
                        for bk_k, bk_v in booking_map.items():
                            if num_str in bk_k:
                                bk_cust = clean_text(bk_v.get('customer', '')).lower()
                                if not current_cust or any(w in bk_cust for w in c_words):
                                    bk = bk_v
                                    break

                # Smart Date Rectification & Error Detection
                etd_iso = raw_etd_iso
                eta_iso = raw_eta_iso
                job_date_iso = raw_job_date_iso

                # Extract Expected Year & Month from Job No prefix (e.g. SHSI26100024 -> Year=2026, Month=10)
                m_no = re.search(r'^[A-Za-z]+(\d{2})(\d{2})', job_no)
                job_year = 2000 + int(m_no.group(1)) if m_no else 2026
                job_month = int(m_no.group(2)) if m_no else 10

                # 1. Cross-reference with 2026 Booking Report
                if bk and bk.get('booking_date'):
                    # If Booking Report has explicit Year, Month, Day
                    should_rectify = False
                    if not raw_etd_iso:
                        should_rectify = True
                    else:
                        try:
                            raw_m = int(raw_etd_iso[5:7]) if len(raw_etd_iso) >= 7 else None
                            bk_m = int(bk['booking_date'][5:7])
                            # If raw date in Excel was flipped/wrong month, and Booking Report confirms the true job month
                            if raw_m != job_month and bk_m == job_month:
                                should_rectify = True
                            elif clean_k in booking_map and raw_m != bk_m:
                                should_rectify = True
                        except Exception:
                            pass

                    if should_rectify and etd_iso != bk['booking_date']:
                        entry = {
                            "jobNo": job_no,
                            "sheet": spec['service'],
                            "row": r_num,
                            "customer": cell_dict.get(cols.get('customer', ''), ''),
                            "field": "ETD",
                            "excelDate": etd_iso or "-",
                            "correctedDate": bk['booking_date'],
                            "reason": f"อ้างอิงวันที่แท้จริงจาก 2026 Booking Report (ชีท {bk['sheet']} แถว {bk['row']})"
                        }
                        if not etd_iso or etd_iso == "-":
                            missing_dates_alerts.append(entry)
                        else:
                            booking_alignment_alerts.append(entry)
                        etd_iso = bk['booking_date']

                if bk and bk.get('eta') and not eta_iso:
                    eta_iso = bk['eta']

                # 2. Check US Locale Flip (MM/DD/YYYY) on ETD
                if etd_iso:
                    corrected_etd, changed_etd, reason_etd = rectify_us_date(etd_iso, job_year, job_month)
                    if changed_etd:
                        date_swap_alerts.append({
                            "jobNo": job_no,
                            "sheet": spec['service'],
                            "row": r_num,
                            "customer": cell_dict.get(cols.get('customer', ''), ''),
                            "field": "ETD",
                            "excelDate": etd_iso,
                            "correctedDate": corrected_etd,
                            "reason": reason_etd
                        })
                        etd_iso = corrected_etd

                # Check US Locale Flip on ETA
                if eta_iso:
                    corrected_eta, changed_eta, reason_eta = rectify_us_date(eta_iso, job_year, job_month)
                    if changed_eta:
                        date_swap_alerts.append({
                            "jobNo": job_no,
                            "sheet": spec['service'],
                            "row": r_num,
                            "customer": cell_dict.get(cols.get('customer', ''), ''),
                            "field": "ETA",
                            "excelDate": eta_iso,
                            "correctedDate": corrected_eta,
                            "reason": reason_eta
                        })
                        eta_iso = corrected_eta

                # Month key: official job creation month cohort from prefix (e.g. 2610 -> 2026-10)
                if m_no and 1 <= job_month <= 12:
                    month_key = f"{job_year:04d}-{job_month:02d}"
                elif etd_iso:
                    month_key = etd_iso[:7]
                elif job_date_iso:
                    month_key = job_date_iso[:7]
                else:
                    month_key = f"{job_year:04d}-{job_month:02d}"

                has_draft = bool(cell_dict.get(cols.get('draft', '')))
                has_o209 = bool(cell_dict.get(cols.get('o209', '')))
                has_o309 = bool(cell_dict.get(cols.get('o309', '')))
                has_o409 = bool(cell_dict.get(cols.get('o409', '')))
                has_advance = bool(cell_dict.get(cols.get('advance', '')))
                has_do = bool(cell_dict.get(cols.get('do', '')))

                is_completed = (st_gen == 'Completed') or has_o409
                if is_completed:
                    c_status = "0409"
                elif st_gen == 'Cancelled':
                    c_status = None
                else:
                    if has_o409:
                        c_status = "0409"
                    elif has_o309:
                        c_status = "0309"
                    elif has_o209:
                        c_status = "0209"
                    else:
                        c_status = "0109"

                job_rec = {
                    "jobNo": job_no,
                    "service": spec['service'],
                    "serviceCode": spec['code'],
                    "status": st_gen,
                    "statusDetail": st_detail,
                    "statusRaw": raw_st,
                    "customer": cell_dict.get(cols.get('customer', ''), '') or (bk.get('customer', '') if bk else ''),
                    "consignee": cell_dict.get(cols.get('consignee', ''), ''),
                    "bl": bl or (bk.get('hbl', '') or bk.get('mbl', '') if bk else ''),
                    "invoiceNo": inv or (bk.get('inv', '') if bk else ''),
                    "etd": etd_iso,
                    "eta": eta_iso,
                    "month": month_key,
                    "jobDate": job_date_iso or etd_iso,
                    "draftCustoms": has_draft or (c_status == "0109"),
                    "customsFiled": has_o209 or is_completed,
                    "doReleased": has_do or is_completed,
                    "cleared": is_completed,
                    "advanceDoc": has_advance,
                    "customsStatus": c_status,
                    "o109": has_draft or (c_status == "0109"),
                    "o209": has_o209 or (c_status == "0209"),
                    "o309": has_o309 or (c_status == "0309"),
                    "o409": is_completed,
                    "csName": cell_dict.get(cols.get('cs', ''), '') or (bk.get('cs', '') if bk else ''),
                    "updateStatus": cell_dict.get(cols.get('update_status', ''), ''),
                    "sourceSheet": sheet_raw.strip(),
                    "sourceRow": r_num,
                    "nextAction": "ติดตามเอกสารเบิก" if st_gen == 'Completed' and not has_advance else ("ติดตามปิดงาน" if st_gen != 'Completed' else "ปิดงานสมบูรณ์แล้ว"),
                    # Extended metadata from Booking Report
                    "commodity": bk.get('commodity') if bk else None,
                    "containerType": bk.get('container') if bk else None,
                    "packages": bk.get('packages') if bk else None,
                    "grossWeight": bk.get('gw') if bk else None,
                    "cbm": bk.get('cbm') if bk else None,
                    "declarationType": bk.get('declaration_type') if bk else None,
                    "shippingType": bk.get('shipping_type') if bk else None,
                    "joinNo": bk.get('join_no') if bk else None,
                    "mbl": bk.get('mbl') if bk else None,
                    "hbl": bk.get('hbl') if bk else None,
                    "depoPort": bk.get('depo') if bk else None,
                    "terminal": bk.get('terminal') if bk else None,
                    "placeOfDelivery": bk.get('delivery') if bk else None,
                }
                all_jobs.append(job_rec)

        # 2. Parse Transport and Detect Unlinked Trips
        transport_trips = []
        unlinked_transport_alerts = []

        for sheet_node in wb_xml.findall('.//ns:sheet', ns_wb):
            if sheet_node.attrib['name'].strip() == 'Transport':
                rId = sheet_node.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
                target = rel_map[rId]
                sheet_path = 'xl/' + target if not target.startswith('xl/') else target
                ws_xml = ET.fromstring(z.read(sheet_path))
                rows = ws_xml.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
                
                for r in rows:
                    r_num = int(r.attrib.get('r', 0))
                    if r_num < 5:
                        continue
                    cell_dict = {}
                    for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                        ref = c.attrib.get('r', '')
                        col_letter = re.sub(r'\d+', '', ref)
                        t = c.attrib.get('t')
                        v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                        val = v.text if v is not None else ""
                        if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                            val = shared_strings[int(val)]
                        cell_dict[col_letter] = clean_text(val)

                    ts_no = cell_dict.get('C') or cell_dict.get('B')
                    if not ts_no or not ts_no.startswith('TS'):
                        continue
                    
                    raw_job = cell_dict.get('B') or ''
                    job_link = raw_job if raw_job and not raw_job.startswith('TS') and any(raw_job.startswith(p) for p in ['SH', 'SI', 'SE', 'AI', 'AE']) else None
                    cust = cell_dict.get('D') or ''
                    
                    st_raw = cell_dict.get('E') or ''
                    if 'cancel' in st_raw.lower():
                        status_th = 'ยกเลิก'
                    elif 'complete' in st_raw.lower():
                        status_th = 'วิ่งส่งมอบแล้ว'
                    else:
                        status_th = 'กำลังวิ่ง'

                    container = cell_dict.get('F') or "1 x 40' HC"
                    container_bucket = "40' HC" if '40' in container else ("20'" if '20' in container else "รถยนต์ 4/6 ล้อ")
                    deliver_iso = excel_date_to_iso(cell_dict.get('G')) or excel_date_to_iso(cell_dict.get('A')) or "2026-10-28"

                    trip = {
                        "id": f"TS-{r_num}",
                        "transportNo": ts_no,
                        "jobNo": job_link,
                        "customer": cust,
                        "container": container,
                        "containerBucket": container_bucket,
                        "status": status_th,
                        "deliver": deliver_iso,
                        "deliverDate": deliver_iso,
                        "sourceRow": r_num
                    }
                    transport_trips.append(trip)

                    if not job_link:
                        unlinked_transport_alerts.append({
                            "transportNo": ts_no,
                            "row": r_num,
                            "customer": cust,
                            "status": status_th,
                            "container": container,
                            "deliverDate": deliver_iso,
                            "reason": "ไม่ได้ระบุ Job No ในคอลัมน์ B (งานขนส่งลอย ไม่มี Job แม่ผูกไว้)"
                        })
                break

    # Build Cross-sheet duplicate alerts
    cross_sheet_alerts = []
    for j_no, locs in job_locations.items():
        if len(locs) > 1:
            cross_sheet_alerts.append({
                "jobNo": j_no,
                "customer": locs[0].get('customer', ''),
                "sheets": [{"sheet": l['sheet'], "row": l['row']} for l in locs],
                "reason": f"พบรหัสงาน {j_no} ซ้ำกันใน {len(locs)} ตำแหน่ง: " + ", ".join(f"ชีท {l['sheet']} แถว {l['row']}" for l in locs)
            })

    # Save Jobs & Transport
    with open(jobs_json_path, 'w', encoding='utf-8') as f:
        json.dump(all_jobs, f, indent=2, ensure_ascii=False)
    with open(transport_json_path, 'w', encoding='utf-8') as f:
        json.dump(transport_trips, f, indent=2, ensure_ascii=False)

    # 2.5 Ensure all 12 month sheets from 2026 Booking Report.xlsx are merged
    try:
        import sys
        sys.path.append(os.path.dirname(__file__))
        from extract_all_booking_jobs import run as run_extract_all
        run_extract_all()
    except Exception as e:
        print("Notice running extract_all_booking_jobs:", e)

    # 3. Snapshot Backup & Versioning
    os.makedirs(backups_dir, exist_ok=True)
    manifest_path = os.path.join(backups_dir, 'manifest.json')
    manifest = []
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, 'r', encoding='utf-8') as mf:
                manifest = json.load(mf)
        except Exception:
            manifest = []

    with open(tmp_xlsx, 'rb') as f:
        current_sha = hashlib.sha256(f.read()).hexdigest()

    now = datetime.datetime.now()
    now_str = now.strftime('%Y-%m-%d_%H-%M-%S')

    needs_backup = True
    if manifest and manifest[0].get('sha256') == current_sha:
        needs_backup = False

    if needs_backup:
        snap_filename = f"snapshot_{now_str}.xlsx"
        snap_filepath = os.path.join(backups_dir, snap_filename)
        shutil.copy2(tmp_xlsx, snap_filepath)
        file_size = os.path.getsize(snap_filepath)
        entry = {
            "id": now_str,
            "filename": snap_filename,
            "timestamp": now.isoformat(),
            "displayTime": now.strftime('%d/%m/%Y %H:%M:%S'),
            "fileSize": file_size,
            "totalJobs": len(all_jobs),
            "totalTransport": len(transport_trips),
            "sha256": current_sha
        }
        manifest.insert(0, entry)
        manifest = manifest[:30] # Keep latest 30 snapshots
        with open(manifest_path, 'w', encoding='utf-8') as mf:
            json.dump(manifest, mf, indent=2, ensure_ascii=False)
        print(f"Created new snapshot backup: {snap_filename}")

    # 4. Save Quality Report
    quality_report = {
        "generatedAt": now.isoformat(),
        "summary": {
            "dateSwapsCount": len(date_swap_alerts),
            "bookingAlignmentsCount": len(booking_alignment_alerts),
            "missingDatesFilledCount": len(missing_dates_alerts),
            "crossSheetDupsCount": len(cross_sheet_alerts),
            "unlinkedTransportCount": len(unlinked_transport_alerts),
            "hiddenSheetsCount": len(hidden_sheet_alerts),
            "totalAlerts": len(date_swap_alerts) + len(booking_alignment_alerts) + len(missing_dates_alerts) + len(cross_sheet_alerts) + len(unlinked_transport_alerts) + len(hidden_sheet_alerts)
        },
        "dateSwaps": date_swap_alerts,
        "bookingAlignments": booking_alignment_alerts,
        "missingDatesFilled": missing_dates_alerts,
        "crossSheetDuplicates": cross_sheet_alerts,
        "unlinkedTransport": unlinked_transport_alerts,
        "hiddenSheets": hidden_sheet_alerts
    }
    with open(quality_json_path, 'w', encoding='utf-8') as qf:
        json.dump(quality_report, qf, indent=2, ensure_ascii=False)

    print(f"Sync complete: {len(all_jobs)} jobs, {len(transport_trips)} trips, {quality_report['summary']['totalAlerts']} quality alerts ({len(date_swap_alerts)} date swaps, {len(cross_sheet_alerts)} dups, {len(unlinked_transport_alerts)} unlinked trips, {len(hidden_sheet_alerts)} hidden sheets).")

if __name__ == '__main__':
    run_sync()
