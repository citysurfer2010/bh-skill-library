'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.appendRow', description: 'Fügt eine neue Zeile mit Werten zu einer Google Sheets Tabelle hinzu.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string', description: 'Bereich zum Anhängen der Zeile, z.B. "Sheet1!A1"' }, values: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Array von Arrays, wobei jedes innere Array eine Zeile darstellt.' } }, required: ['spreadsheetId', 'range', 'values'] },
  handler: async ({ spreadsheetId, range, values }) => {
  const r = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`,
    { values: values });
  if (r.status !== 200) return apiErr('sheets.appendRow', r.status, r.data);
  return ok(`Zeile(n) erfolgreich angehängt. Aktualisierter Bereich: ${r.data.updates.updatedRange}`);},
};
