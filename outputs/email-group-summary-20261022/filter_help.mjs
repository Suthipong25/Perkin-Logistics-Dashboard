import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('C:/Users/User/Downloads/email_group_summary1.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
console.log(workbook.help('worksheet autofilter', { include: 'index,examples,notes', maxChars: 5000 }).ndjson);