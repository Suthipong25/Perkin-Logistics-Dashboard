import openpyxl, xlrd, json, re, os, datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JOBS_PATH = os.path.join(BASE_DIR, 'dashboard', 'data', 'jobs.json')
SQLITE_SCRIPT = os.path.join(BASE_DIR, 'backend', 'scripts', 'sqlite_db.py')

CARRIER_PREFIXES = {
    'OOLU': 'OOCL',
    'EGLV': 'Evergreen Line',
    '0506': 'Evergreen Line',
    'ONEY': 'Ocean Network Express (ONE)',
    'KMTC': 'KMTC Line',
    'COSU': 'COSCO Shipping',
    'COAU': 'COSCO Shipping',
    'MAEU': 'Maersk Line',
    '276': 'Maersk Line',
    '279': 'Maersk Line',
    '280': 'Maersk Line',
    'MEDU': 'MSC (Mediterranean Shipping Company)',
    'MSCU': 'MSC (Mediterranean Shipping Company)',
    '173': 'MSC (Mediterranean Shipping Company)',
    'SITC': 'SITC Container Lines',
    'HLCU': 'Hapag-Lloyd',
    'YMLU': 'Yang Ming Line',
    'YMJA': 'Yang Ming Line',
    'SNKO': 'Sinokor Merchant Marine',
    'WANHAI': 'Wan Hai Lines',
    '029G': 'Wan Hai Lines',
    'GOSU': 'ZIM Integrated Shipping',
    'ZIMU': 'ZIM Integrated Shipping',
    'HASL': 'Heung-A Line',
    'SNGL': 'Sinokor',
    'CKCO': 'CK Line',
    'CULV': 'CU Lines',
    'A15G': 'Interasia Line',
    'A33G': 'Interasia Line',
}

AIRLINE_PREFIXES = {
    '217-': 'Thai Airways (TG)',
    '072-': 'Gulf Air (GF)',
    '235-': 'Turkish Airlines (TK)',
    '172-': 'Cargolux (CV)',
    '877-': 'AirBridgeCargo (HT)',
    '279-': 'China Airlines (CI)',
    '607-': 'Etihad Airways (EY)',
    '112-': 'China Eastern (MU)',
    '833-': 'Polar Air Cargo (PO)',
    '131-': 'Japan Airlines (JL)',
    '205-': 'All Nippon Airways (NH)',
    '921-': 'Cathay Pacific (CX)',
    '406-': 'UPS Airlines (5X)',
}

def clean_text(v):
    if v is None: return ""
    return re.sub(r'\s+', ' ', str(v).replace('\t', ' ').replace('\xa0', ' ')).strip()

def excel_date_to_iso(val):
    if not val: return None
    s = str(val).strip()
    try:
        f = float(s)
        if 25000 < f < 80000:
            return (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=int(f))).strftime('%Y-%m-%d')
    except ValueError:
        pass
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m: return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', s)
    if m:
        d, mo = m.group(1).zfill(2), m.group(2).zfill(2)
        y = int(m.group(3))
        if y < 100: y += 2000
        elif y > 2400: y -= 543
        return f"{y:04d}-{mo}-{d}"
    return s if len(s) <= 10 else None

def run_enrichment():
    if not os.path.exists(JOBS_PATH):
        print("jobs.json not found")
        return
    
    with open(JOBS_PATH, 'r', encoding='utf-8') as f:
        jobs = json.load(f)
        
    job_map = {}
    for j in jobs:
        jno = j.get('jobNo', '').strip().upper()
        if jno:
            job_map[jno] = j
            if jno.startswith('SH'):
                job_map[jno[2:]] = j
        if j.get('joinNo'):
            jclean = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', j['joinNo'], flags=re.I).strip().upper()
            job_map[jclean] = j
        if j.get('hbl'): job_map[j['hbl'].strip().upper()] = j
        if j.get('mbl'): job_map[j['mbl'].strip().upper()] = j

    print(f"Loaded {len(jobs)} jobs from jobs.json")

    # 1. 2026 Booking Report.xlsx
    bkg_file = os.path.join(BASE_DIR, '2026 Booking Report.xlsx')
    if os.path.exists(bkg_file):
        print(f"Reading {bkg_file}...")
        wb = openpyxl.load_workbook(bkg_file, read_only=True, data_only=True)
        for s in ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']:
            if s not in wb.sheetnames: continue
            ws = wb[s]
            header = None
            for r in ws.iter_rows(values_only=True):
                if not header:
                    if r and any('JOB' in str(c).upper() for c in r if c):
                        header = [str(c).strip().upper() if c else '' for c in r]
                else:
                    row_dict = {header[i]: r[i] for i in range(min(len(header), len(r)))}
                    job_no = str(row_dict.get('JOB NO.') or row_dict.get('JOB NO') or '').strip().upper()
                    if job_no in job_map:
                        target = job_map[job_no]
                        if row_dict.get('FEEDER') and not target.get('vessel'):
                            target['feeder'] = str(row_dict['FEEDER']).strip()
                            target['vessel'] = str(row_dict['FEEDER']).strip()
                        if row_dict.get('DEPO PORT') and not target.get('depoPort'):
                            target['depoPort'] = str(row_dict['DEPO PORT']).strip()
                        if row_dict.get('TERMINAL') and not target.get('terminal'):
                            target['terminal'] = str(row_dict['TERMINAL']).strip()
                        if row_dict.get('SHED') and not target.get('shed'):
                            target['shed'] = str(row_dict['SHED']).strip()
                        if row_dict.get('PLACE OF DELIVERY') and not target.get('placeOfDelivery'):
                            target['placeOfDelivery'] = str(row_dict['PLACE OF DELIVERY']).strip()
                            if not target.get('pod'): target['pod'] = str(row_dict['PLACE OF DELIVERY']).strip()
                        if row_dict.get('DECLARATION TYPE') and not target.get('declarationType'):
                            target['declarationType'] = str(row_dict['DECLARATION TYPE']).strip()
                        if row_dict.get('TERM OF PAY') and not target.get('termOfPay'):
                            target['termOfPay'] = str(row_dict['TERM OF PAY']).strip()

    # 2. receiptreport_(1).xls (SEA FWD)
    fwd_sea = 'C:/Users/User/.gemini/antigravity/brain/4932667a-ceb3-4073-91a9-91826b9b1eae/.user_uploaded/media_1793937669499_6b004157.xls'
    if os.path.exists(fwd_sea):
        print(f"Reading SEA FWD: {fwd_sea}...")
        wb1 = xlrd.open_workbook(fwd_sea)
        ws1 = wb1.sheet_by_index(0)
        curr_carrier = ''
        for r in range(ws1.nrows):
            vals = [clean_text(ws1.cell_value(r, c)) for c in range(ws1.ncols)]
            line = ' '.join(vals)
            m = re.search(r'CARRIER\s*:\s*([^,]+)', line, re.I)
            if m:
                c_name = m.group(1).split('-')[0].strip()
                if c_name: curr_carrier = c_name
            
            no_val = vals[0] if len(vals) > 0 else ''
            job_val = vals[5] if len(vals) > 5 else ''
            if (no_val and re.match(r'^\d+(\.0)?$', no_val)) or (job_val and re.match(r'^(SI|SE)\d+', job_val, re.I)):
                row2 = [clean_text(ws1.cell_value(r+1, c)) for c in range(ws1.ncols)] if r + 1 < ws1.nrows else []
                j_clean = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', job_val, flags=re.I).strip().upper()
                hbl = vals[6] if len(vals) > 6 else ''
                mbl = row2[7] if len(row2) > 7 else ''
                target = job_map.get(j_clean) or (hbl and job_map.get(hbl.upper())) or (mbl and job_map.get(mbl.upper()))
                if target:
                    row_carrier = vals[2] or curr_carrier
                    if row_carrier: target['carrier'] = row_carrier
                    liner_bkg = vals[7] if len(vals) > 7 else ''
                    if liner_bkg: target['linerBooking'] = liner_bkg
                    vessel = row2[10] if len(row2) > 10 else ''
                    if vessel: target['vessel'] = vessel; target['feeder'] = vessel
                    pol = vals[11] if len(vals) > 11 else ''
                    if pol: target['pol'] = pol
                    pod = row2[12] if len(row2) > 12 else (row2[13] if len(row2) > 13 else '')
                    if pod: target['pod'] = pod
                    ld = excel_date_to_iso(vals[14]) if len(vals) > 14 else None
                    if ld: target['loadingDate'] = ld

    # 3. reportexport.xls (AIR FWD)
    fwd_air = 'C:/Users/User/.gemini/antigravity/brain/4932667a-ceb3-4073-91a9-91826b9b1eae/.user_uploaded/media_1793937669499_a8d692fc.xls'
    if os.path.exists(fwd_air):
        print(f"Reading AIR FWD: {fwd_air}...")
        wb2 = xlrd.open_workbook(fwd_air)
        ws2 = wb2.sheet_by_index(0)
        for r in range(ws2.nrows):
            vals = [clean_text(ws2.cell_value(r, c)) for c in range(ws2.ncols)]
            no_val = vals[0] if len(vals) > 0 else ''
            job_val = vals[1] if len(vals) > 1 else ''
            if (no_val and re.match(r'^\d+(\.0)?$', no_val)) or (job_val and re.match(r'^(AI|AE)\d+', job_val, re.I)):
                row2 = [clean_text(ws2.cell_value(r+1, c)) for c in range(ws2.ncols)] if r + 1 < ws2.nrows else []
                j_clean = re.sub(r'\s*\((SEA|AIR)\)\s*$', '', job_val, flags=re.I).strip().upper()
                target = job_map.get(j_clean)
                if target:
                    fl = vals[5] if len(vals) > 5 else ''
                    fl_time = row2[5] if len(row2) > 5 else ''
                    if fl: target['flightNo'] = fl
                    if fl_time and fl_time != '00:00': target['flightTime'] = fl_time
                    pod = vals[6] if len(vals) > 6 else ''
                    if pod: target['pod'] = pod
                    mawb = row2[4] if len(row2) > 4 else ''
                    for pfx, aname in AIRLINE_PREFIXES.items():
                        if mawb.startswith(pfx):
                            target['carrier'] = aname
                            break

    # 4. receiptreport.xls (Shipping Sea Export)
    shp_file = 'C:/Users/User/.gemini/antigravity/brain/4932667a-ceb3-4073-91a9-91826b9b1eae/.user_uploaded/media_1793937669500_b31dbee1.xls'
    if os.path.exists(shp_file):
        print(f"Reading Shipping Report: {shp_file}...")
        wb3 = xlrd.open_workbook(shp_file)
        ws3 = wb3.sheet_by_index(0)
        for r in range(1, ws3.nrows):
            vals = [clean_text(ws3.cell_value(r, c)) for c in range(ws3.ncols)]
            j_val = vals[1] if len(vals) > 1 else ''
            target = job_map.get(j_val.upper())
            if target:
                feeder = vals[9] if len(vals) > 9 else ''
                if feeder and not target.get('vessel'):
                    target['feeder'] = feeder
                    target['vessel'] = feeder
                depo = vals[6] if len(vals) > 6 else ''
                if depo and not target.get('depoPort'): target['depoPort'] = depo
                terminal = vals[7] if len(vals) > 7 else ''
                if terminal and not target.get('terminal'): target['terminal'] = terminal
                shed = vals[8] if len(vals) > 8 else ''
                if shed and not target.get('shed'): target['shed'] = shed
                place = vals[10] if len(vals) > 10 else ''
                if place and not target.get('placeOfDelivery'):
                    target['placeOfDelivery'] = place
                    if not target.get('pod'): target['pod'] = place
                d_type = vals[18] if len(vals) > 18 else ''
                if d_type and not target.get('declarationType'): target['declarationType'] = d_type
                t_pay = vals[24] if len(vals) > 24 else ''
                if t_pay and not target.get('termOfPay'): target['termOfPay'] = t_pay

    # 5. Fallback MBL / MAWB Carrier detection for remaining jobs
    for j in jobs:
        if not j.get('carrier'):
            mbl = (j.get('mbl') or j.get('bl') or '').strip().upper()
            if mbl:
                for pfx, cname in CARRIER_PREFIXES.items():
                    if mbl.startswith(pfx):
                        j['carrier'] = cname
                        break
                if not j.get('carrier'):
                    for pfx, aname in AIRLINE_PREFIXES.items():
                        if mbl.startswith(pfx):
                            j['carrier'] = aname
                            break

    # Save to jobs.json atomically
    tmp_path = JOBS_PATH + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(jobs, f, ensure_ascii=False, indent=1)
    os.replace(tmp_path, JOBS_PATH)

    print("Successfully enriched jobs.json!")
    print(f"Total jobs: {len(jobs)}")
    print(f"With Carrier: {sum(1 for j in jobs if j.get('carrier'))}")
    print(f"With Vessel/Feeder: {sum(1 for j in jobs if j.get('vessel') or j.get('feeder'))}")
    print(f"With Flight No: {sum(1 for j in jobs if j.get('flightNo'))}")
    print(f"With Liner Booking: {sum(1 for j in jobs if j.get('linerBooking'))}")
    print(f"With POL: {sum(1 for j in jobs if j.get('pol'))}")
    print(f"With POD / Delivery: {sum(1 for j in jobs if j.get('pod') or j.get('placeOfDelivery'))}")
    print(f"With Terminal / Shed: {sum(1 for j in jobs if j.get('terminal') or j.get('shed'))}")
    print(f"With Loading Date: {sum(1 for j in jobs if j.get('loadingDate'))}")

if __name__ == '__main__':
    run_enrichment()
