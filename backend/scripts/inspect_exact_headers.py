import zipfile
import xml.etree.ElementTree as ET

NS = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def inspect_exact_headers(path):
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
    for s in wb_xml.findall('.//ns:sheet', NS):
        name = s.attrib['name'].strip()
        if name not in sheets:
            continue
        rId = s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rel_map[rId]
        ws_xml = ET.fromstring(zf.read('xl/' + target))
        for r in ws_xml.findall('.//ns:sheetData/ns:row', NS):
            if int(r.attrib.get('r', 0)) == 3:
                cells = []
                for c in r.findall('ns:c', NS):
                    t = c.attrib.get('t')
                    v = c.find('ns:v', NS)
                    val = sst[int(v.text)] if (v is not None and v.text is not None and t == 's') else (v.text if v is not None else '')
                    col = ''.join(filter(str.isalpha, c.attrib.get('r', '')))
                    if val and val.strip():
                        cells.append(f"{col}: {val.strip()}")
                print(f"\n--- {name} Row 3 ---")
                print(" | ".join(cells))
                break

inspect_exact_headers('JOB_Daily_2026 STATUS_Dashboard.xlsx')
