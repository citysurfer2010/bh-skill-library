'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.getRange', description: 'Reads values from a given range of a Google Sheets spreadsheet.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'e.g. "Sheet1!A1:D10"' } }, required: ['spreadsheetId', 'range'] },
  handler: async ({ spreadsheetId, range }) => {
  const r = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  if (r.status !== 200) return apiErr('sheets.getRange', r.status, r.data);
  const rows = r.data.values || [];
  if (!rows.length) return ok('Keine Daten in diesem Bereich.');
  return ok(rows.map(row => row.join('\t')).join('\n'));},
};
