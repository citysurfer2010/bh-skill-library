'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.getText', description: 'Reads the entire text content of a Google Sheets spreadsheet.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetName: { type: 'string', description: 'Name of the sheet (optional)' } }, required: ['spreadsheetId'] },
  handler: async ({ spreadsheetId, sheetName }) => {
  const range = sheetName ? `${sheetName}!A1:Z1000` : 'A1:Z1000';
  const r = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  if (r.status !== 200) return apiErr('sheets.getText', r.status, r.data);
  const rows = r.data.values || [];
  if (!rows.length) return ok('Tabelle ist leer.');
  return ok(rows.map(row => row.join('\t')).join('\n').substring(0, 8000));},
};
