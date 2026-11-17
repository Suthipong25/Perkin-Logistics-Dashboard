import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const root = 'C:/Users/User/Desktop/n8n';
const inputPath = 'C:/Users/User/Downloads/email_group_summary (1).xlsx';
const tracePath = 'C:/Users/User/Downloads/MTSummary_Message trace report - _2026-10-21T062925.370Z__87a1613b-7dfb-49ef-a878-864cc283a66c.csv';
const outputPath = `${root}/outputs/group-redundancy-review-20261026/email_group_summary_with_senders.xlsx`;
const out = `${root}/outputs/group-redundancy-review-20261026`;
const parseCsv = text => {
  const rows = [], row = [], value = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value.push('"'); i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value.join('')); value.length = 0; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value.join('')); value.length = 0;
      if (row.some(cell => cell.length)) rows.push([...row]);
      row.length = 0;
    } else value.push(char);
  }
  if (value.length || row.length) { row.push(value.join('')); rows.push(row); }
  return rows;
};
const input = await FileBlob.load(inputPath);
await fs.mkdir(out, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(input);
const dup = workbook.worksheets.getItem('Dup');
const groupNames = [
  'CS Shipping 1', 'CS Shipping 2', 'CS Shipping Perkin', 'Info Perkin Logistics', 'Info Save Logistics',
  'oversea', 'Oversea Export', 'Oversea Import', 'Perkin All Staffs', 'Perkin Transport Group',
  'Sale Co Perkin', 'Sales Perkin', 'Save & Perkin', 'Save Account', 'Save TH'
];
const groupEmails = [
  'cs.shipping1@perkin-logistics.com', 'cs.shipping2@perkin-logistics.com', 'cs.shipping@perkin-logistics.com',
  'info@perkin-logistics.com', 'info@save-logistics.co.th', 'oversea@perkin-logistics.com', 'cs.exp@perkin-logistics.com',
  'cs.imp@perkin-logistics.com', 'allstaff@perkin-logistics.com', 'transport@perkin-logistics.com',
  'sale-co@perkin-logistics.com', 'sales@perkin-logistics.com', 'save@perkin-logistics.com',
  'account@save-logistics.co.th', 'save.th@save-logistics.co.th'
];
const headers = dup.getRange('H2:V2').values[0];
if (headers.some((value, index) => value !== groupNames[index])) throw new Error('Dup sheet headers H2:V2 do not match the expected group names.');
const rows = parseCsv((await fs.readFile(tracePath)).toString('utf16le'));
const columns = Object.fromEntries(rows[0].map((name, index) => [name, index]));
const senders = groupEmails.map(() => new Set());
const seen = groupEmails.map(() => new Set());
for (const row of rows.slice(1)) {
  if (row[columns.directionality] !== 'Incoming') continue;
  const sender = String(row[columns.sender_address] || '').trim().toLowerCase();
  const messageId = String(row[columns.network_message_id] || '').trim();
  if (!sender || !messageId) continue;
  for (const entry of String(row[columns.recipient_status] || '').split(';')) {
    const [address, status] = entry.split('##');
    const index = groupEmails.indexOf(String(address || '').trim().toLowerCase());
    if (index < 0 || !/(Expand|Deliver|Receive)/i.test(status || '') || seen[index].has(messageId)) continue;
    seen[index].add(messageId);
    senders[index].add(sender);
  }
}
const lists = senders.map(set => [...set].sort());
const expectedCounts = dup.getRange('H1:V1').values[0];
if (lists.some((list, index) => list.length !== expectedCounts[index])) throw new Error('Sender counts do not match the existing Dup sheet summary.');
const maxRows = Math.max(...lists.map(list => list.length));
const matrix = Array.from({ length: maxRows }, (_, row) => lists.map(list => list[row] || null));
dup.getRange('H3:V3038').clear({ applyTo: 'contents' });
dup.getRange(`H3:V${maxRows + 2}`).values = matrix;
dup.getRange('H1:V1').values = [lists.map(list => list.length)];
workbook.recalculate();
const check = await workbook.inspect({ kind: 'table', range: 'Dup!A1:V30', include: 'values,formulas', tableMaxRows: 30, tableMaxCols: 22, maxChars: 10000 });
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options: { useRegex: true, maxResults: 50 }, summary: 'formula error scan' });
await fs.writeFile(`${out}/dup_sender_fill_checks.txt`, `${check.ndjson}\n${errors.ndjson}`);
const image = await workbook.render({ sheetName: 'Dup', range: 'A1:V28', scale: 1, format: 'png' });
await fs.writeFile(`${out}/dup_sender_fill_preview.png`, new Uint8Array(await image.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, groups: groupNames.length, maxRows, counts: Object.fromEntries(groupNames.map((name, index) => [name, lists[index].length])) }));
