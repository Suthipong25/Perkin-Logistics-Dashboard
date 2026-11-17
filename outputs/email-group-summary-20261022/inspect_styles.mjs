import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('C:/Users/User/Downloads/email_group_summary1.xlsx');
const workbook = await SpreadsheetFile.importXlsx(input);
console.log((await workbook.inspect({kind:'computedStyle', sheetId:'Dup', range:'E1:V3', maxChars:9000})).ndjson);