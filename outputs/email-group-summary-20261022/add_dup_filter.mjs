import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const inputPath = 'C:/Users/User/Downloads/email_group_summary1.xlsx';
const outputDir = 'C:/Users/User/Desktop/n8n/outputs/duplicate-filter-20261027';
const outputPath = `${outputDir}/email_group_summary1_filtered.xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const dup = workbook.worksheets.getItem('Dup');
const filterRanges = [
  ['E2:F1082', 'DupSenderFilterAccount'],
  ['H2:J1082', 'DupSenderFilterShipping'],
  ['M2:O1082', 'DupSenderFilterOversea'],
  ['R2:S1082', 'DupSenderFilterSales'],
];

// Only the yellow review groups get filter dropdowns and duplicate highlighting.
for (const [range, name] of filterRanges) {
  const filterTable = dup.tables.add(range, true, name);
  filterTable.showFilterButton = true;
}
for (const range of ['E3:F1082', 'H3:J1082', 'M3:O1082', 'R3:S1082']) {
  dup.getRange(range).conditionalFormats.add('duplicateValues', {
  format: { fill: '#C6EFCE', font: { color: '#006100' } },
  });
}

workbook.recalculate();
const check = await workbook.inspect({
  kind: 'table', range: 'Dup!E1:V12', include: 'values,formulas',
  tableMaxRows: 12, tableMaxCols: 18, maxChars: 6000,
});
const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
  options: { useRegex: true, maxResults: 50 }, summary: 'formula error scan',
});
const preview = await workbook.render({ sheetName: 'Dup', range: 'D1:V30', scale: 1, format: 'png' });
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/dup_filter_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(check.ndjson);
console.log(errors.ndjson);
console.log(JSON.stringify({ outputPath, filterRanges: filterRanges.map(([range]) => `Dup!${range}`) }));
