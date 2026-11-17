import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('C:/Users/User/Desktop/n8n/outputs/dup-duplicate-only-20261027/email_group_summary_dup_duplicate_only.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
const dup = workbook.worksheets.getItem('Dup');
console.log(JSON.stringify(dup.tables.items.map(t => ({name:t.name, style:t.style, showHeaders:t.showHeaders, showFilterButton:t.showFilterButton, header:t.getHeaderRowRange().values})), null, 2));
