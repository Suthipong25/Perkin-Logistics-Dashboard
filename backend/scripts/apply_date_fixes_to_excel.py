import json
import datetime
import openpyxl
import os

def apply_fixes(source_xlsx, output_xlsx, alerts_json):
    if not os.path.exists(alerts_json):
        print(f"Alerts file not found: {alerts_json}")
        return
        
    with open(alerts_json, 'r', encoding='utf-8') as f:
        alerts = json.load(f)
        
    date_swaps = alerts.get('dateSwaps', [])
    print(f"Loaded {len(date_swaps)} date swap fixes.")
    
    col_map = {
        'SEA Import': {'ETD': 'A', 'ETA': 'B'},
        'AIR Import': {'ETD': 'A', 'ETA': 'B'},
        'Air Export': {'ETD': 'C', 'ETA': 'D'},
        'SEA Export': {'ETD': 'D', 'ETA': 'E'},
        'Freight': {'ETD': 'C', 'ETA': 'D'}
    }
    
    print(f"Loading {source_xlsx}...")
    wb = openpyxl.load_workbook(source_xlsx)
    
    # Build sheet mapping supporting whitespace in tab names (e.g. ' Freight ')
    sheet_name_map = {}
    for actual_name in wb.sheetnames:
        sheet_name_map[actual_name.strip()] = actual_name
        sheet_name_map[actual_name] = actual_name
    
    fixed_count = 0
    errors = []
    
    for item in date_swaps:
        sname = item.get('sheet', '').strip()
        rnum = item.get('row')
        field = item.get('field')
        corr_date = item.get('correctedDate')
        
        actual_sheet = sheet_name_map.get(sname)
        if not actual_sheet:
            errors.append(f"Sheet {sname} not found")
            continue
            
        col_letter = col_map.get(sname, {}).get(field)
        if not col_letter:
            errors.append(f"No col mapping for {sname} - {field}")
            continue
            
        cell_ref = f"{col_letter}{rnum}"
        ws = wb[actual_sheet]
        
        try:
            # Parse correctedDate (YYYY-MM-DD)
            y, m, d = [int(p) for p in corr_date.split('-')]
            dt = datetime.date(y, m, d)
            ws[cell_ref].value = dt
            ws[cell_ref].number_format = 'yyyy-mm-dd'
            fixed_count += 1
        except Exception as e:
            errors.append(f"Failed cell {cell_ref} on {sname}: {e}")
            
    print(f"Successfully modified {fixed_count} cells.")
    if errors:
        print(f"Encountered {len(errors)} warnings: {errors[:5]}")
        
    os.makedirs(os.path.dirname(output_xlsx), exist_ok=True)
    wb.save(output_xlsx)
    print(f"Saved corrected Excel file to {output_xlsx}")
    
    # Also save back to source file if different
    if os.path.abspath(source_xlsx) != os.path.abspath(output_xlsx):
        wb.save(source_xlsx)
        print(f"Updated live file {source_xlsx} with corrected dates.")

if __name__ == '__main__':
    src = 'tmp/live_sharepoint_test.xlsx'
    out = 'outputs/2026_Booking_Report_Corrected.xlsx'
    alerts = 'dashboard/data/quality_alerts.json'
    apply_fixes(src, out, alerts)
