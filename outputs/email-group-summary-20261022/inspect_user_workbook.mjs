import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const input = await FileBlob.load('C:/Users/User/Downloads/email_group_summary.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
const overview = await workbook.inspect({ kind: 'workbook,sheet,table', maxChars: 10000, tableMaxRows: 12, tableMaxCols: 16 });
const dup = await workbook.inspect({ kind: 'table,region', range: 'Dup!A1:Z80', include: 'values,formulas', maxChars: 18000, tableMaxRows: 80, tableMaxCols: 26 });
console.log(overview.ndjson);
console.log(dup.ndjson);
const preview = await workbook.render({ sheetName: 'Dup', range: 'A1:V28', scale: 1, format: 'png' });
await fs.writeFile('C:/Users/User/Desktop/n8n/outputs/email-group-summary-20261022/dup_before.png', new Uint8Array(await preview.arrayBuffer()));
