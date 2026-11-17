"""
=============================================================================
MERGE ALL OPERATIONAL DATA INTO MASTER PIPELINE
=============================================================================
Combines:
1. Master Booking (jobs.json, 3,552 jobs)
2. Shipping Report (753 records, receiptreport.xls)
3. FWD SEA Report (110 records, sea_report.csv)
4. FWD AIR Report (9 records, air_report.csv)
5. Transport Report (31 trips, transport_report.csv)

Strict Business Rule:
- ETD for Export (SHSE, SE, SHAE, AE)
- ETA for Import (SHSI, SI, SHAI, AI)
=============================================================================
"""

import sys, os, json, csv, re, datetime, xlrd

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = r'c:\Users\User\Desktop\n8n'
DATA_DIR = os.path.join(BASE_DIR, 'dashboard', 'data')
JOBS_PATH = os.path.join(DATA_DIR, 'jobs.json')
TRANSPORT_PATH = os.path.join(DATA_DIR, 'transport.json')

SHIPPING_XLS = r'C:\Users\User\.gemini\antigravity\brain\4932667a-ceb3-4073-91a9-91826b9b1eae\.user_uploaded\media_1793929900807_eee9a7cf.xls'
SEA_CSV = os.path.join(BASE_DIR, 'scratch', 'sea_report.csv')
AIR_CSV = os.path.join(BASE_DIR, 'scratch', 'air_report.csv')
TRANSPORT_CSV = os.path.join(BASE_DIR, 'scratch', 'transport_report.csv')

def fix_cp874(s):
    if not isinstance(s, str):
        if isinstance(s, float) and s.is_integer():
            return str(int(s))
        return str(s) if s is not None else ''
    try:
        return s.encode('iso-8859-1').decode('cp874').strip()
    except Exception:
        return s.strip()

def clean_text(v):
    return re.sub(r'\s+', ' ', str(v or '').replace('\xa0', ' ')).strip()

def date_to_iso(val):
    s = clean_text(val)
    if not s:
        return None
    # Check DD/MM/YYYY
    m = re.match(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100: y += 2000
        if y > 2400: y -= 543
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    # Check YYYY-MM-DD
    m = re.match(r'^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    return None

def main():
    print("--- 1. Loading Existing Master Data ---")
    with open(JOBS_PATH, 'r', encoding='utf-8') as f:
        jobs = json.load(f)
    with open(TRANSPORT_PATH, 'r', encoding='utf-8') as f:
        transport = json.load(f)

    print(f"Existing jobs: {len(jobs)}")
    print(f"Existing transport: {len(transport)}")

    jobs_by_no = {j.get('jobNo', '').strip(): j for j in jobs if j.get('jobNo')}
    jobs_by_id = {j.get('id', '').strip(): j for j in jobs if j.get('id')}

    # =========================================================================
    # 2. Process Shipping Report
    # =========================================================================
    print("\n--- 2. Merging Shipping Report (753 rows) ---")
    wb = xlrd.open_workbook(SHIPPING_XLS)
    sheet = wb.sheet_by_name('BOOKING REPORT')

    shipping_new_count = 0
    shipping_enriched_count = 0
    shipping_clear_date_count = 0
    shipping_status_complete_count = 0

    for r in range(2, sheet.nrows):
        vals = [fix_cp874(sheet.cell_value(r, c)) for c in range(sheet.ncols)]
        if not any(vals) or 'Total :' in vals[0] or vals[0].startswith('SHIPPING NAME'):
            continue
        
        job_no = vals[1].strip()
        if not job_no:
            continue
            
        join_no = vals[2].strip()
        cust = vals[3].strip()
        mbl = vals[4].strip() or None
        hbl = vals[5].strip() or None
        depo_port = vals[6].strip() or None
        terminal = vals[7].strip() or None
        feeder = vals[9].strip() or None
        place_delivery = vals[10].strip() or None
        raw_etd = date_to_iso(vals[11])
        raw_eta = date_to_iso(vals[12])
        try: gw = float(vals[13]) if vals[13] else None
        except: gw = None
        packages = vals[14].strip() or None
        commodity = vals[15].strip() or None
        try: cbm = float(vals[16]) if vals[16] else None
        except: cbm = None
        clear_date = date_to_iso(vals[17])
        declaration_type = vals[18].strip() or None
        other_info = vals[19].strip() or None
        shipping_mode = vals[20].strip() or None
        container_type = vals[21].strip() or None
        status_job = vals[22].strip()
        invoice_no = vals[23].strip() or None
        term_of_pay = vals[24].strip() or None
        cs_name = vals[25].strip() or None

        # Determine Service
        if job_no.startswith('SHSE'): service, label = 'SEA Export', 'Sea Export'
        elif job_no.startswith('SHSI'): service, label = 'SEA Import', 'Sea Import'
        elif job_no.startswith('SHAE'): service, label = 'AIR Export', 'Air Export'
        elif job_no.startswith('SHAI'): service, label = 'AIR Import', 'Air Import'
        else: service, label = 'Freight', 'Freight'

        # Rule: ETD for Export, ETA for Import
        if 'Export' in service:
            primary_date = raw_etd or raw_eta or '2026-11-01'
        else:
            primary_date = raw_eta or raw_etd or '2026-11-01'
        month_key = primary_date[:7]

        if job_no in jobs_by_no:
            # ENRICH EXISTING JOB
            j = jobs_by_no[job_no]
            if clear_date and not j.get('clearDate'):
                j['clearDate'] = clear_date
                j['cleared'] = True
                j['customsStatus'] = '0409'
                shipping_clear_date_count += 1
            if status_job == 'Job Complete' and j.get('status') != 'Completed':
                j['status'] = 'Completed'
                j['statusDetail'] = 'Job Complete'
                shipping_status_complete_count += 1
            if gw and not j.get('grossWeight'): j['grossWeight'] = gw
            if cbm and not j.get('cbm'): j['cbm'] = cbm
            if container_type and not j.get('containerType'): j['containerType'] = container_type
            if invoice_no and not j.get('invoiceNo'): j['invoiceNo'] = invoice_no
            if cs_name and not j.get('csName'): j['csName'] = cs_name
            if commodity and not j.get('commodity'): j['commodity'] = commodity
            if mbl and not j.get('mbl'): j['mbl'] = mbl
            if hbl and not j.get('hbl'): j['hbl'] = hbl
            if join_no and not j.get('joinNo'): j['joinNo'] = join_no

            # Enrich Shipping Extra Ops
            if depo_port: j['depoPort'] = depo_port
            if terminal: j['terminal'] = terminal
            if feeder: j['feeder'] = feeder
            if place_delivery: j['deliveryPlace'] = place_delivery
            if declaration_type: j['declarationType'] = declaration_type
            if shipping_mode: j['shippingType'] = shipping_mode
            if term_of_pay: j['termOfPay'] = term_of_pay
            if packages: j['packages'] = packages

            shipping_enriched_count += 1
        else:
            # CREATE NEW JOB
            is_done = status_job == 'Job Complete'
            new_job = {
                "id": f"Nov_{len(jobs)+1}_{job_no}",
                "jobNo": job_no,
                "service": service,
                "serviceLabel": label,
                "status": "Completed" if is_done else "In Progress",
                "statusDetail": status_job or ("Job Complete" if is_done else "Job Control"),
                "statusRaw": status_job,
                "customer": cust,
                "consignee": cust,
                "bl": mbl or hbl or '',
                "mbl": mbl,
                "hbl": hbl,
                "joinNo": join_no or None,
                "updateStatus": None,
                "etd": raw_etd,
                "eta": raw_eta,
                "jobDate": primary_date,
                "month": month_key,
                "year": 2026,
                "draftCustoms": is_done,
                "advanceDoc": False,
                "doReleased": is_done,
                "customsFiled": is_done,
                "cleared": is_done or (clear_date is not None),
                "draftDate": None,
                "customsDate": None,
                "doDate": None,
                "clearDate": clear_date,
                "advanceDate": None,
                "remark": other_info,
                "sourceSheet": "Shipping",
                "sourceRow": r,
                "runningNo": len(jobs) + 1,
                "version": 1,
                "nextAction": None,
                "ageDays": None,
                "flags": [],
                "invoiceNo": invoice_no or '',
                "containerType": container_type or '',
                "grossWeight": gw,
                "cbm": cbm,
                "commodity": commodity or '',
                "csName": cs_name or '',
                "dataSource": "Shipping Report.xls",
                "customsStatus": "0409" if (is_done or clear_date) else "0209",
                "depoPort": depo_port,
                "terminal": terminal,
                "feeder": feeder,
                "deliveryPlace": place_delivery,
                "declarationType": declaration_type,
                "shippingType": shipping_mode,
                "termOfPay": term_of_pay,
                "packages": packages
            }
            jobs.append(new_job)
            jobs_by_no[job_no] = new_job
            shipping_new_count += 1

    print(f"  Enriched {shipping_enriched_count} existing shipping jobs")
    print(f"  Added {shipping_new_count} brand new shipping jobs")
    print(f"  Updated Clear Date for {shipping_clear_date_count} jobs")
    print(f"  Updated Status Complete for {shipping_status_complete_count} jobs")

    # =========================================================================
    # 3. Process FWD SEA Report
    # =========================================================================
    print("\n--- 3. Merging FWD SEA Report (110 jobs) ---")
    with open(SEA_CSV, 'r', encoding='utf-8', errors='ignore') as f:
        sea_lines = list(csv.reader(f))

    fwd_sea_new_count = 0
    fwd_sea_enriched_count = 0

    i = 3
    while i < len(sea_lines):
        line = sea_lines[i]
        if not line or not any(line) or line[0].startswith('CARRIER :') or 'Total :' in line or (len(line) > 14 and 'Total :' in line[14]):
            i += 1
            continue
        if line[0].strip().isdigit():
            row1 = line
            row2 = sea_lines[i+1] if i+1 < len(sea_lines) else [''] * len(row1)
            i += 2

            raw_etd = date_to_iso(row1[1].strip())
            carrier = row1[2].strip()
            agent = row1[3].strip()
            booking_no = row1[4].strip()
            job_no = row1[5].strip()
            hbl = row1[6].strip() or None
            local_cust = row1[8].strip()
            cust_inv = row1[9].strip() or None
            feeder = row1[10].strip() or None
            pol = row1[11].strip() or None
            dest_eta = date_to_iso(row1[13].strip())
            loading_date = date_to_iso(row1[14].strip())
            c20 = row1[15].strip()
            c40hq = row1[18].strip()
            lcl = row1[20].strip()
            has_transport = row1[21].strip()
            has_shipping = row1[22].strip()
            cs_name = row1[23].strip()
            commodity = row1[24].strip()
            remark = row1[25].strip() if len(row1) > 25 else ''

            raw_eta = date_to_iso(row2[1].strip())
            coload = row2[2].strip()
            agent_ref = row2[3].strip()
            booking_date = date_to_iso(row2[4].strip())
            job_date_val = date_to_iso(row2[5].strip())
            mbl = row2[7].strip() or None
            oversea_cust = row2[8].strip() or None
            cust_po = row2[9].strip() or None
            vessel = row2[10].strip() or None
            dest_port = row2[13].strip() or row2[12].strip() or None
            sale_name = row2[23].strip() if len(row2) > 23 else ''

            service, label = ('SEA Export', 'Sea Export') if job_no.startswith('SE') else ('SEA Import', 'Sea Import')

            # Rule: ETD for Export, ETA for Import
            if 'Export' in service:
                primary_date = raw_etd or booking_date or '2026-11-01'
            else:
                primary_date = raw_eta or dest_eta or booking_date or '2026-11-01'
            month_key = primary_date[:7]

            container_desc = ""
            if c40hq and float(c40hq) > 0: container_desc += f"{c40hq} x 40' HQ "
            if c20 and float(c20) > 0: container_desc += f"{c20} x 20' DC "
            if lcl and float(lcl) > 0: container_desc += f"LCL {lcl} CBM"
            container_desc = container_desc.strip()

            if job_no in jobs_by_no:
                j = jobs_by_no[job_no]
                if carrier: j['carrier'] = carrier
                if agent: j['overseaAgent'] = agent
                if vessel: j['vessel'] = vessel
                if feeder: j['feeder'] = feeder
                if pol: j['pol'] = pol
                if dest_port: j['pod'] = dest_port
                if oversea_cust: j['overseaCustomer'] = oversea_cust
                if cust_po: j['customerPo'] = cust_po
                if cust_inv: j['invoiceNo'] = cust_inv
                if sale_name: j['saleName'] = sale_name
                if cs_name and not j.get('csName'): j['csName'] = cs_name
                if commodity and not j.get('commodity'): j['commodity'] = commodity
                if mbl and not j.get('mbl'): j['mbl'] = mbl
                if hbl and not j.get('hbl'): j['hbl'] = hbl
                if container_desc and not j.get('containerType'): j['containerType'] = container_desc
                j['hasTransport'] = (has_transport == 'Y')
                j['hasShipping'] = (has_shipping == 'Y')
                fwd_sea_enriched_count += 1
            else:
                # Add Brand New FWD Sea Job
                new_job = {
                    "id": f"Nov_{len(jobs)+1}_{job_no}",
                    "jobNo": job_no,
                    "service": service,
                    "serviceLabel": label,
                    "status": "In Progress" if '2026-11' in month_key or '2026-12' in month_key else "Completed",
                    "statusDetail": "Job Control" if '2026-11' in month_key or '2026-12' in month_key else "Job Complete",
                    "statusRaw": "Job Booking",
                    "customer": local_cust,
                    "consignee": local_cust,
                    "bl": mbl or hbl or '',
                    "mbl": mbl,
                    "hbl": hbl,
                    "joinNo": None,
                    "updateStatus": None,
                    "etd": raw_etd,
                    "eta": raw_eta or dest_eta,
                    "jobDate": primary_date,
                    "month": month_key,
                    "year": 2026,
                    "draftCustoms": True,
                    "advanceDoc": False,
                    "doReleased": True,
                    "customsFiled": True,
                    "cleared": False if ('2026-11' in month_key or '2026-12' in month_key) else True,
                    "draftDate": None,
                    "customsDate": None,
                    "doDate": None,
                    "clearDate": None if ('2026-11' in month_key or '2026-12' in month_key) else primary_date,
                    "advanceDate": None,
                    "remark": remark,
                    "sourceSheet": "FWD_SEA",
                    "sourceRow": i,
                    "runningNo": len(jobs) + 1,
                    "version": 1,
                    "nextAction": None,
                    "ageDays": None,
                    "flags": [],
                    "invoiceNo": cust_inv or '',
                    "containerType": container_desc,
                    "grossWeight": None,
                    "cbm": float(lcl) if (lcl and float(lcl) > 0) else None,
                    "commodity": commodity or '',
                    "csName": cs_name or '',
                    "saleName": sale_name or '',
                    "carrier": carrier or '',
                    "overseaAgent": agent or '',
                    "overseaCustomer": oversea_cust or '',
                    "customerPo": cust_po or '',
                    "vessel": vessel or '',
                    "feeder": feeder or '',
                    "pol": pol or '',
                    "pod": dest_port or '',
                    "hasTransport": (has_transport == 'Y'),
                    "hasShipping": (has_shipping == 'Y'),
                    "dataSource": "FWD SEA Report.csv",
                    "customsStatus": "0209" if ('2026-11' in month_key or '2026-12' in month_key) else "0409"
                }
                jobs.append(new_job)
                jobs_by_no[job_no] = new_job
                fwd_sea_new_count += 1
        else:
            i += 1

    print(f"  Enriched {fwd_sea_enriched_count} existing FWD SEA jobs")
    print(f"  Added {fwd_sea_new_count} brand new FWD SEA jobs")

    # =========================================================================
    # 4. Process FWD AIR Report
    # =========================================================================
    print("\n--- 4. Merging FWD AIR Report (9 jobs) ---")
    with open(AIR_CSV, 'r', encoding='utf-8', errors='ignore') as f:
        air_lines = list(csv.reader(f))

    fwd_air_new_count = 0
    fwd_air_enriched_count = 0

    i = 3
    while i < len(air_lines):
        line = air_lines[i]
        if not line or not any(line) or 'TOTAL' in line[0] or 'TOTAL' in line[6]:
            break
        if line[0].strip().isdigit():
            row1 = line
            row2 = air_lines[i+1] if i+1 < len(air_lines) else [''] * len(row1)
            i += 2

            job_no = row1[1].strip()
            shipper = row1[2].strip()
            agent = row1[3].strip()
            hawb = row1[4].strip() or None
            flight = row1[5].strip()
            port_dest = row1[6].strip()
            try: packages = float(row1[7].strip())
            except: packages = None
            try: act_wt = float(row1[8].strip())
            except: act_wt = None
            try: chg_wt = float(row1[9].strip())
            except: chg_wt = None
            cs_name = row1[10].strip()
            remark = row1[12].strip() if len(row1) > 12 else ''

            job_date_raw = date_to_iso(row2[1].strip())
            consignee = row2[2].strip()
            mawb = row2[4].strip() or None
            flight_time = row2[5].strip()
            raw_eta = date_to_iso(row2[6].strip())
            sale_name = row2[11].strip() if len(row2) > 11 else ''

            service, label = ('AIR Export', 'Air Export') if job_no.startswith('AE') else ('AIR Import', 'Air Import')

            # Rule: ETD for Export, ETA for Import
            if 'Export' in service:
                primary_date = job_date_raw or raw_eta or '2026-11-01'
            else:
                primary_date = raw_eta or job_date_raw or '2026-11-01'
            month_key = primary_date[:7]

            if job_no in jobs_by_no:
                j = jobs_by_no[job_no]
                if flight: j['flight'] = flight
                if mawb: j['mbl'] = mawb
                if hawb: j['hbl'] = hawb
                if agent: j['overseaAgent'] = agent
                if act_wt: j['grossWeight'] = act_wt
                if chg_wt: j['chargeableWeight'] = chg_wt
                if cs_name: j['csName'] = cs_name
                if sale_name: j['saleName'] = sale_name
                fwd_air_enriched_count += 1
            else:
                new_job = {
                    "id": f"Nov_{len(jobs)+1}_{job_no}",
                    "jobNo": job_no,
                    "service": service,
                    "serviceLabel": label,
                    "status": "In Progress" if '2026-11' in month_key else "Completed",
                    "statusDetail": "Job Control" if '2026-11' in month_key else "Job Complete",
                    "statusRaw": "Job Booking",
                    "customer": consignee if 'Import' in service else shipper,
                    "consignee": consignee,
                    "bl": mawb or hawb or '',
                    "mbl": mawb,
                    "hbl": hawb,
                    "joinNo": None,
                    "updateStatus": None,
                    "etd": job_date_raw if 'Export' in service else None,
                    "eta": raw_eta,
                    "jobDate": primary_date,
                    "month": month_key,
                    "year": 2026,
                    "draftCustoms": True,
                    "advanceDoc": False,
                    "doReleased": True,
                    "customsFiled": True,
                    "cleared": False if '2026-11' in month_key else True,
                    "draftDate": None,
                    "customsDate": None,
                    "doDate": None,
                    "clearDate": None if '2026-11' in month_key else primary_date,
                    "advanceDate": None,
                    "remark": remark,
                    "sourceSheet": "FWD_AIR",
                    "sourceRow": i,
                    "runningNo": len(jobs) + 1,
                    "version": 1,
                    "nextAction": None,
                    "ageDays": None,
                    "flags": [],
                    "invoiceNo": '',
                    "containerType": f"{packages} PKG" if packages else '',
                    "grossWeight": act_wt,
                    "chargeableWeight": chg_wt,
                    "cbm": None,
                    "commodity": '',
                    "csName": cs_name or '',
                    "saleName": sale_name or '',
                    "flight": flight,
                    "flightTime": flight_time,
                    "overseaAgent": agent or '',
                    "dataSource": "FWD AIR Report.csv",
                    "customsStatus": "0209" if '2026-11' in month_key else "0409"
                }
                jobs.append(new_job)
                jobs_by_no[job_no] = new_job
                fwd_air_new_count += 1
        else:
            i += 1

    print(f"  Enriched {fwd_air_enriched_count} existing FWD AIR jobs")
    print(f"  Added {fwd_air_new_count} brand new FWD AIR jobs")

    # =========================================================================
    # 5. Process Transport Report (31 trips)
    # =========================================================================
    print("\n--- 5. Merging Transport Report (31 trips) ---")
    with open(TRANSPORT_CSV, 'r', encoding='utf-8', errors='ignore') as f:
        ts_lines = list(csv.reader(f))[3:]

    ts_map = {}
    for t in transport:
        tno = t.get('transportNo') or t.get('tripNo')
        if tno: ts_map[tno.strip()] = t

    ts_enriched_count = 0
    ts_new_count = 0

    for r in ts_lines:
        if not r or not r[0].strip().isdigit():
            continue
        no = r[0].strip()
        b_date = date_to_iso(r[1].strip())
        join_no = r[2].strip()
        ts_no = r[3].strip()
        cust = r[4].strip()
        stuffing = r[5].strip()
        volume = r[6].strip()
        im_ex = r[7].strip()
        dom_type = fix_cp874(r[8].strip())
        pickup_from = fix_cp874(r[9].strip())
        pickup_date = date_to_iso(r[10].strip())
        pickup_time = r[11].strip()
        delivery_to = fix_cp874(r[12].strip())
        delivery_date = date_to_iso(r[13].strip())
        delivery_time = r[14].strip()
        return_to = fix_cp874(r[15].strip())
        return_date = date_to_iso(r[16].strip())
        return_time = r[17].strip()
        qty = r[18].strip()
        try: cbm = float(r[19].strip().replace(',', '')) if r[19] else None
        except: cbm = None
        try: wt = float(r[20].strip().replace(',', '')) if r[20] else None
        except: wt = None
        transporter = fix_cp874(r[24].strip())
        plate_no = fix_cp874(r[25].strip())
        driver = fix_cp874(r[26].strip())

        status = 'ส่งมอบแล้ว' if delivery_date and delivery_date <= '2026-11-04' else 'กำลังวิ่ง'

        if ts_no in ts_map:
            t = ts_map[ts_no]
            # Fix driver, plate, transporter, and deliver date
            if driver: t['driver'] = driver
            t['driverName'] = driver
            if transporter: t['transporter'] = transporter
            if plate_no: t['plateNo'] = plate_no
            if delivery_date:
                t['deliverDate'] = delivery_date
                t['deliver'] = delivery_date
            if delivery_to: t['deliveryLocation'] = delivery_to
            if pickup_from: t['pickupLocation'] = pickup_from
            if return_to: t['returnDepot'] = return_to
            if join_no: t['jobNo'] = join_no
            if volume and not t.get('truckType'): t['truckType'] = volume
            ts_enriched_count += 1
        else:
            new_trip = {
                "tripNo": ts_no,
                "transportNo": ts_no,
                "jobNo": join_no or '',
                "customer": cust,
                "driver": driver or transporter or volume,
                "driverName": driver or '',
                "truckType": volume,
                "container": volume,
                "transporter": transporter,
                "plateNo": plate_no,
                "pickupLocation": pickup_from,
                "pickupDate": pickup_date,
                "pickupTime": pickup_time,
                "deliveryLocation": delivery_to,
                "deliver": delivery_date or '',
                "deliverDate": delivery_date or '',
                "deliveryTime": delivery_time,
                "returnDepot": return_to,
                "returnDate": return_date,
                "status": status,
                "pod": ""
            }
            transport.append(new_trip)
            ts_map[ts_no] = new_trip
            ts_new_count += 1

        # Link transport info back to job in jobs.json
        target_job_no = join_no if (join_no and join_no != ts_no) else None
        if target_job_no and target_job_no in jobs_by_no:
            tj = jobs_by_no[target_job_no]
            tj['transportTripNo'] = ts_no
            if driver: tj['driverName'] = driver
            if plate_no: tj['plateNo'] = plate_no
            if transporter: tj['transporter'] = transporter
            if delivery_date: tj['deliveryDate'] = delivery_date

    print(f"  Enriched {ts_enriched_count} existing transport trips")
    print(f"  Added {ts_new_count} brand new transport trips")

    # =========================================================================
    # 6. Save JSON Data Files
    # =========================================================================
    print(f"\n--- 6. Saving Final Data Files ---")
    print(f"Total Master Jobs: {len(jobs)} (+{shipping_new_count + fwd_sea_new_count + fwd_air_new_count})")
    print(f"Total Transport Trips: {len(transport)} (+{ts_new_count})")

    with open(JOBS_PATH, 'w', encoding='utf-8') as f:
        json.dump(jobs, f, ensure_ascii=False, indent=2)
    print(f"Successfully saved {JOBS_PATH}")

    with open(TRANSPORT_PATH, 'w', encoding='utf-8') as f:
        json.dump(transport, f, ensure_ascii=False, indent=2)
    print(f"Successfully saved {TRANSPORT_PATH}")

    # =========================================================================
    # 7. Sync SQLite Master DB & Postgres SQL
    # =========================================================================
    print(f"\n--- 7. Syncing SQLite Database ---")
    try:
        from backend.scripts import sqlite_db
    except ImportError:
        import sqlite_db

    sqlite_db.init_db()
    sqlite_db.sync_jobs(source_file="Merged Operational Reports 2026")
    sqlite_db.sync_transport()
    print("[DB SYNCED] SQLite database up to date.")

    print(f"\n--- 8. Updating PostgreSQL Migration SQL ---")
    try:
        from backend.scripts import migrate_to_postgres
    except ImportError:
        import migrate_to_postgres
    migrate_to_postgres.generate_postgres_sql()
    print("[POSTGRES SQL UPDATED] postgres_migration.sql ready.")

    print("\n[ALL UPDATES COMPLETED SUCCESSFULLY]")

if __name__ == '__main__':
    main()
