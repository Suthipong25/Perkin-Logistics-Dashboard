import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('C:/Users/User/Desktop/n8n/outputs/duplicate-comparison-20261027/email_group_summary_duplicate_comparison.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
console.log(workbook.help('range.delete', { include: 'index,examples,notes', maxChars: 4000 }).ndjson);