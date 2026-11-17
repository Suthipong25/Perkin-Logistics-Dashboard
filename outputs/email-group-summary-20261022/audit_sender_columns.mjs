import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const input = await FileBlob.load('C:/Users/User/Downloads/email_group_summary.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem('Dup');
const headers = sheet.getRange('E2:V2').values[0];
const expected = sheet.getRange('E1:V1').values[0];
const rows = sheet.getRange('E3:V1082').values;
const results = headers.map((group, column) => {
  const entries = rows.map(row => String(row[column] ?? '').trim()).filter(Boolean);
  const unique = new Set(entries.map(email => email.toLowerCase()));
  const lastRow = rows.reduce((last, row, index) => String(row[column] ?? '').trim() ? index : last, -1);
  const gaps = lastRow < 0 ? 0 : rows.slice(0, lastRow + 1).filter(row => !String(row[column] ?? '').trim()).length;
  return {
    group,
    expected: Number(expected[column] ?? 0),
    listed: entries.length,
    unique: unique.size,
    duplicatesWithinColumn: entries.length - unique.size,
    gapsBeforeLastEntry: gaps,
    matchesExpected: entries.length === Number(expected[column] ?? 0),
  };
});
console.log(JSON.stringify({ allComplete: results.every(item => item.matchesExpected && !item.duplicatesWithinColumn && !item.gapsBeforeLastEntry), results }, null, 2));
