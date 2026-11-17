import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const inputPath = 'C:/Users/User/Desktop/n8n/outputs/duplicate-comparison-20261027/source_clean.xlsx';
const outputDir = 'C:/Users/User/Desktop/n8n/outputs/duplicate-comparison-20261027';
const outputPath = `${outputDir}/email_group_summary_duplicate_comparison.xlsx`;
const comparisons = [
  ['Account PKL', 'Accounting'],
  ['CS Shipping 1', 'CS Shipping 2', 'CS Shipping Perkin'],
  ['oversea', 'Oversea Export', 'Oversea Import'],
  ['Sale Co Perkin', 'Sales Perkin'],
];

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const dup = workbook.worksheets.getItem('Dup');
const headers = dup.getRange('E2:V2').values[0];
const senderRows = dup.getRange('E3:V1082').values;
const senderSets = new Map(headers.map((group, col) => [
  group,
  new Set(senderRows.map(row => String(row[col] ?? '').trim().toLowerCase()).filter(Boolean)),
]));

for (const group of comparisons.flat()) {
  if (!senderSets.has(group)) throw new Error(`Missing group column in Dup sheet: ${group}`);
}

const comparisonResults = comparisons.map((groups, index) => {
  const memberships = new Map();
  for (const group of groups) {
    for (const email of senderSets.get(group)) {
      if (!memberships.has(email)) memberships.set(email, []);
      memberships.get(email).push(group);
    }
  }
  const duplicates = [...memberships.entries()]
    .filter(([, groupsFound]) => groupsFound.length >= 2)
    .map(([email, groupsFound]) => ({ email, groupsFound: groupsFound.sort() }))
    .sort((a, b) => b.groupsFound.length - a.groupsFound.length || a.email.localeCompare(b.email));
  const pairCounts = [];
  for (let left = 0; left < groups.length; left++) {
    for (let right = left + 1; right < groups.length; right++) {
      const count = [...senderSets.get(groups[left])].filter(email => senderSets.get(groups[right]).has(email)).length;
      pairCounts.push({ pair: `${groups[left]} ↔ ${groups[right]}`, count });
    }
  }
  return {
    label: `${index + 1}. ${groups.join(' / ')}`,
    groups,
    duplicates,
    pairCounts,
    allGroups: duplicates.filter(item => item.groupsFound.length === groups.length).length,
    someGroups: duplicates.filter(item => item.groupsFound.length < groups.length).length,
  };
});

for (const result of comparisonResults) {
  if (result.duplicates.length !== result.allGroups + result.someGroups) throw new Error(`Duplicate count check failed: ${result.label}`);
}

const sheet = workbook.worksheets.add('Duplicate Summary');
const pairHeaderRow = 3;
const pairDataStart = pairHeaderRow + 1;
sheet.getRange(`A${pairHeaderRow}:C${pairHeaderRow}`).values = [['รายละเอียดรายคู่', 'คู่กลุ่ม', 'จำนวนอีเมลซ้ำ']];
const pairRows = comparisonResults.flatMap(result => result.pairCounts.map(item => [result.label, item.pair, item.count]));
sheet.getRange(`A${pairDataStart}:C${pairDataStart + pairRows.length - 1}`).values = pairRows;

const detailStart = pairDataStart + pairRows.length + 2;
sheet.getRange(`A${detailStart}:D${detailStart}`).values = [['ชุดเปรียบเทียบ', 'อีเมลผู้ส่งที่ซ้ำ', 'พบในกลุ่ม', 'จำนวนกลุ่มที่พบ']];
const detailRows = comparisonResults.flatMap(result => result.duplicates.map(item => [
  result.label, item.email, item.groupsFound.join(', '), item.groupsFound.length,
]));
sheet.getRange(`A${detailStart + 1}:D${detailStart + detailRows.length}`).values = detailRows;

sheet.getRange(`A${pairHeaderRow}:C${pairHeaderRow}`).format = { fill: '#5B9BD5', font: { name: 'Arial', bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center' };
sheet.getRange(`A${detailStart}:D${detailStart}`).format = { fill: '#5B9BD5', font: { name: 'Arial', bold: true, color: '#FFFFFF' }, horizontalAlignment: 'center', verticalAlignment: 'center' };
sheet.getRange(`A${pairHeaderRow}:C${pairDataStart + pairRows.length - 1}`).format.borders = { preset: 'all', style: 'thin', color: '#D9E2F3' };
sheet.getRange(`A${detailStart}:D${detailStart + detailRows.length}`).format.borders = { preset: 'all', style: 'thin', color: '#D9E2F3' };
sheet.getRange(`C${pairDataStart}:C${pairDataStart + pairRows.length - 1}`).format.numberFormat = '#,##0';
sheet.getRange(`D${detailStart + 1}:D${detailStart + detailRows.length}`).format.numberFormat = '#,##0';
sheet.getRange('A:A').format.columnWidth = 46;
sheet.getRange('B:B').format.columnWidth = 38;
sheet.getRange('C:C').format.columnWidth = 52;
sheet.getRange('D:D').format.columnWidth = 18;
sheet.getRange(`A${detailStart + 1}:D${detailStart + detailRows.length}`).format.verticalAlignment = 'center';
sheet.freezePanes.freezeRows(detailStart);

workbook.recalculate();
const check = await workbook.inspect({
  kind: 'table', range: `Duplicate Summary!A1:D${Math.min(detailStart + 12, detailStart + detailRows.length)}`,
  include: 'values,formulas', tableMaxRows: 30, tableMaxCols: 6, maxChars: 10000,
});
const errors = await workbook.inspect({
  kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 }, summary: 'formula error scan',
});
await fs.mkdir(outputDir, { recursive: true });
const preview = await workbook.render({ sheetName: 'Duplicate Summary', range: `A1:D${Math.min(detailStart + 22, detailStart + detailRows.length)}`, scale: 1.5, format: 'png' });
await fs.writeFile(`${outputDir}/duplicate_summary_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(check.ndjson);
console.log(errors.ndjson);
console.log(JSON.stringify({
  outputPath,
  summary: comparisonResults.map(result => ({ label: result.label, duplicateEmails: result.duplicates.length, allGroups: result.allGroups, someGroups: result.someGroups, pairCounts: result.pairCounts })),
  details: comparisonResults.map(result => ({ label: result.label, emails: result.duplicates })),
}));
