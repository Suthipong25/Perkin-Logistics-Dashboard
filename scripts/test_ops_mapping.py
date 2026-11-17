import zipfile, re, json
import xml.etree.ElementTree as ET

NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def inspect_daily_jobs(path):
    zf = zipfile.ZipFile(path)
    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels_xml = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels_xml}
    
    sst = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        sst_xml = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in sst_xml.findall('.//ns:si', NS):
            sst.append(''.join(si.itertext()))
            
    sheets = ['AIR Import', 'Air Export', 'SEA Import', 'SEA Export']
    ops_by_job = {}
    
    for s in wb_xml.findall('.//ns:sheet', NS):
        name = s.attrib['name'].strip()
        if name not in sheets:
            continue
        rId = s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rel_map[rId]
        ws_xml = ET.fromstring(zf.read('xl/' + target))
        rows = ws_xml.findall('.//ns:sheetData/ns:row', NS)
        
        # Determine column letters from header row (row 3 or 4)
        header_map = {}
        for r in rows[:5]:
            r_idx = int(r.attrib.get('r', 0))
            if r_idx in (3, 4):
                for c in r.findall('ns:c', NS):
                    t = c.attrib.get('t')
                    v = c.find('ns:v', NS)
                    val = ''
                    if v is not None and v.text is not None:
                        val = sst[int(v.text)] if t == 's' else v.text
                    col = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
                    val_low = val.lower().strip()
                    if 'job' in val_low and ('no' in val_low or 'create' in val_low):
                        header_map['job_no'] = col
                    elif 'draft' in val_low or 'ใบขน' in val_low:
                        header_map['draft'] = col
                    elif '0209' in val_low or '02' in val_low:
                        header_map['0209'] = col
                    elif '0309' in val_low or '03' in val_low:
                        header_map['0309'] = col
                    elif '0409' in val_low or '04' in val_low:
                        header_map['0409'] = col
                    elif 'เบิกเงิน' in val_low or 'advance' in val_low:
                        header_map['advance'] = col
                    elif 'transport' in val_low or 'ts' in val_low:
                        header_map['transport'] = col
                        
        print(f"Sheet {name}: header mapping = {header_map}")
        
        # Read data rows
        for r in rows:
            r_idx = int(r.attrib.get('r', 0))
            if r_idx <= 3:
                continue
            row_dict = {}
            for c in r.findall('ns:c', NS):
                t = c.attrib.get('t')
                v = c.find('ns:v', NS)
                val = ''
                if v is not None and v.text is not None:
                    val = sst[int(v.text)] if t == 's' else v.text
                col = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
                row_dict[col] = val.strip()
                
            job_col = header_map.get('job_no')
            if not job_col or not row_dict.get(job_col):
                continue
            jno = row_dict[job_col]
            if len(jno) < 4:
                continue
            ops_by_job[jno] = {
                'sheet': name,
                'draft': row_dict.get(header_map.get('draft', '')),
                '0209': row_dict.get(header_map.get('0209', '')),
                '0309': row_dict.get(header_map.get('0309', '')),
                '0409': row_dict.get(header_map.get('0409', '')),
                'advance': row_dict.get(header_map.get('advance', '')),
                'transport': row_dict.get(header_map.get('transport', ''))
            }
            
    print(f"\nTotal daily ops records extracted: {len(ops_by_job)}")
    sample_keys = list(ops_by_job.keys())[:5]
    for k in sample_keys:
        print(f"  {k}: {ops_by_job[k]}")

inspect_daily_jobs('JOB_Daily_2026 STATUS_Dashboard.xlsx')
