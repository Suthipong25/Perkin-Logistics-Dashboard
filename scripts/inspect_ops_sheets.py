import zipfile
import xml.etree.ElementTree as ET

NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def inspect_sheet_headers(path, sheet_names):
    zf = zipfile.ZipFile(path)
    wb_xml = ET.fromstring(zf.read('xl/workbook.xml'))
    rels_xml = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {r.attrib['Id']: r.attrib['Target'] for r in rels_xml}
    
    sheet_targets = {}
    for s in wb_xml.findall('.//ns:sheet', NS):
        name = s.attrib['name'].strip()
        if name in sheet_names:
            rId = s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            sheet_targets[name] = rel_map[rId]
            
    sst = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        sst_xml = ET.fromstring(zf.read('xl/sharedStrings.xml'))
        for si in sst_xml.findall('.//ns:si', NS):
            t = ''.join(si.itertext())
            sst.append(t)
            
    for name, target in sheet_targets.items():
        ws_xml = ET.fromstring(zf.read('xl/' + target))
        rows = ws_xml.findall('.//ns:sheetData/ns:row', NS)
        print(f"\n================ SHEET: {name} (total rows: {len(rows)}) ================")
        for r in rows[:5]:
            r_idx = r.attrib.get('r')
            cells = []
            for c in r.findall('ns:c', NS):
                t = c.attrib.get('t')
                v = c.find('ns:v', NS)
                val = ''
                if v is not None and v.text is not None:
                    if t == 's':
                        val = sst[int(v.text)]
                    else:
                        val = v.text
                col = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
                if val.strip():
                    cells.append(f"{col}: {val.strip()[:35]}")
            if cells:
                print(f"Row {r_idx}: {cells[:15]}")

inspect_sheet_headers('JOB_Daily_2026 STATUS_Dashboard.xlsx', ['SEA Import', 'SEA Export', 'AIR Import', 'Air Export', 'clearing', 'Transport'])
