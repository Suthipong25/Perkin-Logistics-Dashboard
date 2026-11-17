import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const inputPath = 'C:/Users/User/Downloads/email_group_summary.xlsx';
const outputDir = 'C:/Users/User/Desktop/n8n/outputs/dup-duplicate-only-20261027';
const outputPath = `${outputDir}/email_group_summary_dup_duplicate_only.xlsx`;
const groups = [
  { range: 'E', names: ['Account PKL', 'Accounting'], table: 'DupOnlyAccount' },
  { range: 'H', names: ['CS Shipping 1', 'CS Shipping 2', 'CS Shipping Perkin'], table: 'DupOnlyShipping' },
  { range: 'M', names: ['oversea', 'Oversea Export', 'Oversea Import'], table: 'DupOnlyOversea' },
  { range: 'R', names: ['Sale Co Perkin', 'Sales Perkin'], table: 'DupOnlySales' },
];
const colNumber = column => [...column].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
const colName = number => {
  let value = number;
  let output = '';
  while (value) { value--; output = String.fromCharCode(65 + value % 26) + output; value = Math.floor(value / 26); }
  return output;
};

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem('Dup');
for (const table of sheet.tables.items) table.delete();
const headers = sheet.getRange('E2:V2').values[0];
const rows = sheet.getRange('E3:V1082').values;
const senders = new Map(headers.map((group, column) => [group, new Set(
  rows.map(row => String(row[column] ?? '').trim().toLowerCase()).filter(Boolean),
)]));

const results = groups.map(block => {
  const lists = block.names.map(group => {
    const otherGroups = block.names.filter(name => name !== group);
    return [...senders.get(group)].filter(email => otherGroups.some(other => senders.get(other).has(email))).sort();
  });
  const expected = block.names.map((group, index) => lists[index].length);
  const maxRows = Math.max(...expected);
  return { ...block, lists, expected, maxRows };
});

// The output copy retains only selected duplicate sender addresses; the source file is unchanged.
sheet.getRange('A1:V1082').clear({ applyTo: 'contents' });
sheet.getRange('A1:S250').format = { font: { name: 'Arial', size: 10 }, fill: '#FFFFFF', verticalAlignment: 'center' };
sheet.getRange('A1').values = [['Dup: อีเมลผู้ส่งที่ซ้ำกันเท่านั้น']];
sheet.getRange('A2').values = [['แสดงเฉพาะอีเมลที่พบในอย่างน้อย 2 กลุ่มของแต่ละชุดเปรียบเทียบ']];
sheet.getRange('A1').format = { font: { name: 'Arial', size: 14, bold: true, color: '#FFFFFF' }, fill: '#1F4E78', verticalAlignment: 'center' };
sheet.getRange('A2').format = { font: { name: 'Arial', size: 10, italic: true, color: '#404040' }, verticalAlignment: 'center' };

for (const result of results) {
  const start = colNumber(result.range);
  const end = start + result.names.length - 1;
  const endColumn = colName(end);
  sheet.getRange(`${result.range}1:${endColumn}1`).values = [result.expected];
  sheet.getRange(`${result.range}2:${endColumn}2`).values = [result.names];
  const values = Array.from({ length: result.maxRows }, (_, row) => result.lists.map(list => list[row] ?? null));
  sheet.getRange(`${result.range}3:${endColumn}${result.maxRows + 2}`).values = values;
  sheet.getRange(`${result.range}1:${endColumn}1`).format = { fill: '#FFF2CC', font: { name: 'Arial', bold: true }, horizontalAlignment: 'center', verticalAlignment: 'center' };
  sheet.getRange(`${result.range}2:${endColumn}2`).format = { fill: '#1F4E78', font: { name: 'Arial', bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center' };
  sheet.getRange(`${result.range}3:${endColumn}${result.maxRows + 2}`).format.fill = '#C6EFCE';
  sheet.getRange(`${result.range}2:${endColumn}${result.maxRows + 2}`).format.borders = { preset: 'all', style: 'thin', color: '#D9E2F3' };
  const table = sheet.tables.add(`${result.range}2:${endColumn}${result.maxRows + 2}`, true, result.table);
  table.showFilterButton = true;
}

sheet.getRange('A1:A250').format.columnWidth = 46;
for (const column of ['E', 'F', 'H', 'I', 'J', 'M', 'N', 'O', 'R', 'S']) sheet.getRange(`${column}1:${column}250`).format.columnWidth = 32;
sheet.freezePanes.freezeRows(2);
workbook.recalculate();

const check = await workbook.inspect({ kind: 'table', range: 'Dup!A1:S25', include: 'values,formulas', tableMaxRows: 25, tableMaxCols: 19, maxChars: 12000 });
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 50 }, summary: 'formula error scan' });
const preview = await workbook.render({ sheetName: 'Dup', range: 'A1:S25', scale: 1, format: 'png' });
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/dup_duplicate_only_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(check.ndjson);
console.log(errors.ndjson);
console.log(JSON.stringify({ outputPath, counts: Object.fromEntries(results.flatMap(result => result.names.map((group, index) => [group, result.lists[index].length]))) }));
