import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const sourcePath = 'C:/Users/User/Desktop/n8n/outputs/duplicate-comparison-20261027/email_group_summary_duplicate_comparison.xlsx';
const outputDir = 'C:/Users/User/Desktop/n8n/outputs/email-group-overlap-summary-20261027';
const outputPath = `${outputDir}/email_group_overlap_summary.xlsx`;

const sourceWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sourceSheet = sourceWorkbook.worksheets.getItem('Duplicate Summary');
const sourceRows = sourceSheet.getRange('A15:D331').values.filter(row => row[1]);

const comparisons = [
  { label: 'Account PKL / Accounting', groups: ['Account PKL', 'Accounting'] },
  { label: 'CS Shipping 1 / CS Shipping 2 / CS Shipping Perkin', groups: ['CS Shipping 1', 'CS Shipping 2', 'CS Shipping Perkin'] },
  { label: 'oversea / Oversea Export / Oversea Import', groups: ['oversea', 'Oversea Export', 'Oversea Import'] },
  { label: 'Sale Co Perkin / Sales Perkin', groups: ['Sale Co Perkin', 'Sales Perkin'] },
];

const details = [];
const summaryRows = [];
for (const comparison of comparisons) {
  const sourceLabel = `${comparisons.indexOf(comparison) + 1}. ${comparison.label}`;
  const rows = sourceRows
    .filter(row => row[0] === sourceLabel)
    .map(row => ({ email: String(row[1]), groupsFound: String(row[2]).split(', ') }));
  const allGroups = rows.filter(row => row.groupsFound.length === comparison.groups.length).length;
  summaryRows.push([
    comparison.label,
    rows.length,
    allGroups,
    rows.length - allGroups,
  ]);
  for (const row of rows) {
    details.push([
      comparison.label,
      row.email,
      row.groupsFound.join(', '),
      row.groupsFound.length,
      row.groupsFound.length === comparison.groups.length ? 'พบครบทุกกลุ่ม' : 'พบเฉพาะบางกลุ่ม',
    ]);
  }
}

if (details.length !== 317) throw new Error(`Expected 317 duplicate senders, found ${details.length}.`);
if (summaryRows.reduce((sum, row) => sum + row[1], 0) !== details.length) throw new Error('Summary count reconciliation failed.');

const workbook = Workbook.create();
const summary = workbook.worksheets.add('สรุป');
const detail = workbook.worksheets.add('รายชื่อผู้ส่งซ้ำ');
const font = { name: 'Arial', size: 10, color: '#1F1F1F' };
const titleFont = { name: 'Arial', size: 14, bold: true, color: '#1F1F1F' };
const headerFormat = {
  fill: '#1F4E78',
  font: { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' },
  horizontalAlignment: 'center',
  verticalAlignment: 'center',
};

summary.showGridLines = false;
summary.getRange('A2:D2').merge();
summary.getRange('A2').values = [['สรุปผู้ส่งอีเมลที่ซ้ำระหว่างกลุ่ม']];
summary.getRange('A2').format.font = titleFont;
summary.getRange('A3:D3').merge();
summary.getRange('A3').values = [['ข้อมูล Message Trace ช่วง 23 ก.ค. – 21 ต.ค. 2026 | นับผู้ส่ง Incoming ที่ไม่ซ้ำกัน']];
summary.getRange('A3').format = { font: { name: 'Arial', size: 9, italic: true, color: '#595959' } };
summary.getRange('A4:D4').format.borders = { bottom: { style: 'thin', color: '#1F4E78' } };
summary.getRange('A6:D6').values = [['ชุดกลุ่มที่เปรียบเทียบ', 'ผู้ส่งซ้ำทั้งหมด', 'พบครบทุกกลุ่ม', 'พบเฉพาะบางกลุ่ม']];
summary.getRange('A7:D10').values = summaryRows;
summary.getRange('A6:D6').format = headerFormat;
summary.getRange('A7:D10').format.font = font;
summary.getRange('B7:D10').format.numberFormat = '#,##0';
summary.getRange('A6:D10').format.borders = { preset: 'all', style: 'thin', color: '#D9E2F3' };
summary.getRange('A12:D12').merge();
summary.getRange('A12').values = [['ดูรายชื่ออีเมลครบทุกคน และกลุ่มที่พบซ้ำได้ที่ชีต “รายชื่อผู้ส่งซ้ำ”']];
summary.getRange('A12').format = { font: { name: 'Arial', size: 9, italic: true, color: '#595959' } };
summary.getRange('A:A').format.columnWidth = 52;
summary.getRange('B:D').format.columnWidth = 19;
summary.getRange('A2:D12').format.verticalAlignment = 'center';
summary.tables.add('A6:D10', true, 'OverlapSummaryTable').style = 'TableStyleMedium2';

detail.showGridLines = false;
detail.getRange('A2:E2').merge();
detail.getRange('A2').values = [['รายชื่อผู้ส่งอีเมลที่ซ้ำระหว่างกลุ่ม']];
detail.getRange('A2').format.font = titleFont;
detail.getRange('A3:E3').merge();
detail.getRange('A3').values = [['หนึ่งแถวต่อหนึ่งอีเมล ผู้ส่งที่พบใน 2 กลุ่มขึ้นไปเท่านั้น']];
detail.getRange('A3').format = { font: { name: 'Arial', size: 9, italic: true, color: '#595959' } };
detail.getRange('A4:E4').format.borders = { bottom: { style: 'thin', color: '#1F4E78' } };
detail.getRange('A6:E6').values = [['ชุดกลุ่มที่เปรียบเทียบ', 'อีเมลผู้ส่ง', 'พบในกลุ่ม', 'จำนวนกลุ่ม', 'ประเภทการซ้ำ']];
detail.getRange(`A7:E${6 + details.length}`).values = details;
detail.getRange('A6:E6').format = headerFormat;
detail.getRange(`A7:E${6 + details.length}`).format.font = font;
detail.getRange(`D7:D${6 + details.length}`).format.numberFormat = '#,##0';
detail.getRange(`A6:E${6 + details.length}`).format.borders = { preset: 'all', style: 'thin', color: '#E7EEF8' };
detail.getRange('A:A').format.columnWidth = 52;
detail.getRange('B:B').format.columnWidth = 42;
detail.getRange('C:C').format.columnWidth = 54;
detail.getRange('D:D').format.columnWidth = 14;
detail.getRange('E:E').format.columnWidth = 20;
detail.getRange(`A6:E${6 + details.length}`).format.verticalAlignment = 'center';
detail.tables.add(`A6:E${6 + details.length}`, true, 'DuplicateSenderDetailsTable').style = 'TableStyleMedium2';
detail.freezePanes.freezeRows(6);

workbook.recalculate();
const summaryCheck = await workbook.inspect({
  kind: 'table', range: 'สรุป!A2:D12', include: 'values,formulas', tableMaxRows: 15, tableMaxCols: 6,
});
const detailCheck = await workbook.inspect({
  kind: 'table', range: 'รายชื่อผู้ส่งซ้ำ!A2:E14', include: 'values,formulas', tableMaxRows: 14, tableMaxCols: 6,
});
const errors = await workbook.inspect({
  kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 }, summary: 'formula errors',
});
await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: 'สรุป', range: 'A1:D13', scale: 1.5, format: 'png' });
await fs.writeFile(`${outputDir}/summary_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(summaryCheck.ndjson);
console.log(detailCheck.ndjson);
console.log(errors.ndjson);
console.log(JSON.stringify({ outputPath, detailRows: details.length, summaryRows }));
