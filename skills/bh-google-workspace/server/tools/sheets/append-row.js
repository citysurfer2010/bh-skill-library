'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.appendRow', description: 'Adds a new row of values to a Google Sheets spreadsheet.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'Range for appending the row, e.g. "Sheet1!A1"' }, values: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Array of arrays, where each inner array represents a row.' } }, required: ['spreadsheetId', 'range', 'values'] },
  handler: async ({ spreadsheetId, range, values }) => {
  const r = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
    { values: values });
  if (r.status !== 200) return apiErr('sheets.appendRow', r.status, r.data);
  return ok(`Zeile(n) erfolgreich angehängt. Aktualisierter Bereich: ${r.data.updates.updatedRange}`);},
};
