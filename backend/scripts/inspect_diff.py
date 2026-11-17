import zipfile
import xml.etree.ElementTree as ET

NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def inspect_sheet_rows(path, sheet_name, max_rows=3):
    zf = zipfile.ZipFile(path)
    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels_xml = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels_xml}
    
    target = None
    for s in wb_xml.findall('.//ns:sheet', NS):
        if s.attrib['name'].strip() == sheet_name:
            rId = s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            target = rel_map[rId]
            break
            
    if not target:
        return 'Sheet not found'
        
    sst = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        sst_xml = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in sst_xml.findall('.//ns:si', NS):
            t = ''.join(si.itertext())
            sst.append(t)
            
    ws_xml = ET.fromstring(zf.read('xl/' + target))
    rows = ws_xml.findall('.//ns:sheetData/ns:row', NS)
    
    result = []
    for row in rows[:max_rows]:
        row_idx = row.attrib.get('r')
        cells = {}
        for c in row.findall('ns:c', NS):
            t = c.attrib.get('t')
            v = c.find('ns:v', NS)
            val = ''
            if v is not None and v.text is not None:
                if t == 's':
                    val = sst[int(v.text)]
                else:
                    val = v.text
            col_letter = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
            cells[col_letter] = val
        result.append((row_idx, cells))
    return result

print("=== 2026 Booking Report.xlsx (Jan, row 2) ===")
rows = inspect_sheet_rows('2026 Booking Report.xlsx', 'Jan', 3)
for r_idx, c_dict in rows:
    print(f"Row {r_idx}: {list(c_dict.items())[:12]}")

print("\n=== JOB_Daily_2026 STATUS_Dashboard.xlsx (SEA Import, row 2) ===")
rows = inspect_sheet_rows('JOB_Daily_2026 STATUS_Dashboard.xlsx', 'SEA Import', 3)
for r_idx, c_dict in rows:
    print(f"Row {r_idx}: {list(c_dict.items())[:12]}")

print("\n=== JOB_Daily_2026 STATUS_Dashboard.xlsx (Transport, row 2) ===")
rows = inspect_sheet_rows('JOB_Daily_2026 STATUS_Dashboard.xlsx', 'Transport', 3)
for r_idx, c_dict in rows:
    print(f"Row {r_idx}: {list(c_dict.items())[:12]}")
