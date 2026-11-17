import zipfile, re, json, datetime
import xml.etree.ElementTree as ET

NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def clean_text(v):
    return re.sub(r'\s+', ' ', str(v or '').replace('\xa0', ' ')).strip()

def excel_date_to_iso(val):
    s = clean_text(val)
    if not s:
        return None
    try:
        f = float(s)
        if 25000 < f < 80000:
            return (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=int(f))).strftime('%Y-%m-%d')
    except ValueError:
        pass
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return m.group(0)
    m = re.match(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', s)
    if m:
        y = int(m.group(3))
        y = y + 2000 if y < 100 else (y - 543 if y > 2400 else y)
        return f"{y:04d}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    return None

def test_enrichment():
    daily_path = 'JOB_Daily_2026 STATUS_Dashboard.xlsx'
    zf = zipfile.ZipFile(daily_path)
    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels_xml = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels_xml}
    
    sst = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        sst_xml = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in sst_xml.findall('.//ns:si', NS):
            sst.append(''.join(si.itertext()))
            
    # Sheet configs: (job_col, draft_col, o2_col, o3_col, o4_col, adv_col, do_col, file_col, clear_col, ts_col, rmk_col)
    SHEET_CFG = {
        'AIR Import':  {'job': 'D', 'draft': 'H', 'o2': 'I', 'o3': '',  'o4': 'I', 'adv': 'J', 'do': 'L', 'filed': 'M', 'clear': 'N', 'ts': 'Q', 'rmk': 'W'},
        'Air Export':  {'job': 'F', 'draft': 'J', 'o2': 'K', 'o3': 'L', 'o4': 'M', 'adv': 'N', 'do': 'P', 'filed': 'Q', 'clear': 'R', 'ts': 'U', 'rmk': 'AA'},
        'SEA Import':  {'job': 'D', 'draft': 'H', 'o2': 'I', 'o3': 'J', 'o4': 'K', 'adv': 'L', 'do': 'N', 'filed': 'O', 'clear': 'P', 'ts': 'S', 'rmk': 'Y'},
        'SEA Export':  {'job': 'G', 'draft': 'K', 'o2': 'L', 'o3': 'M', 'o4': 'N', 'adv': 'O', 'do': 'T', 'filed': 'Q', 'clear': 'S', 'ts': 'X', 'rmk': 'AE'}
    }
    
    daily_ops = {}
    for s in wb_xml.findall('.//ns:sheet', NS):
        name = s.attrib['name'].strip()
        if name not in SHEET_CFG:
            continue
        cfg = SHEET_CFG[name]
        rId = s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rel_map[rId]
        ws_xml = ET.fromstring(zf.read('xl/' + target))
        for r in ws_xml.findall('.//ns:sheetData/ns:row', NS):
            r_idx = int(r.attrib.get('r', 0))
            if r_idx <= 3:
                continue
            cells = {}
            for c in r.findall('ns:c', NS):
                t = c.attrib.get('t')
                v = c.find('ns:v', NS)
                val = sst[int(v.text)] if (v is not None and v.text is not None and t == 's') else (v.text if v is not None else '')
                col = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
                cells[col] = clean_text(val)
                
            jno = cells.get(cfg['job'], '')
            if not jno or len(jno) < 4:
                continue
                
            def is_done(v):
                if not v:
                    return False
                vl = v.lower()
                return vl not in ('no', 'none', '-', '', 'รอ', 'false')
                
            draft_val = cells.get(cfg['draft'], '')
            o2_val = cells.get(cfg['o2'], '')
            o3_val = cells.get(cfg['o3'], '')
            o4_val = cells.get(cfg['o4'], '')
            adv_val = cells.get(cfg['adv'], '')
            do_val = cells.get(cfg['do'], '')
            filed_val = cells.get(cfg['filed'], '')
            clear_val = cells.get(cfg['clear'], '')
            ts_val = cells.get(cfg['ts'], '')
            rmk_val = cells.get(cfg['rmk'], '')
            
            daily_ops[jno.upper()] = {
                'sheet': name,
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
                'remark': rmk_val or None
            }
            
    print(f"Extracted {len(daily_ops)} unique daily ops jobs")
    # Check match against jobs.json
    with open('dashboard/data/jobs.json', 'r', encoding='utf-8') as f:
        master_jobs = json.load(f)
    matches = sum(1 for j in master_jobs if j.get('jobNo', '').upper() in daily_ops)
    print(f"Matched {matches} of {len(master_jobs)} master jobs with daily ops details!")

test_enrichment()
