'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.create', description: 'Creates a new Google Sheets spreadsheet.', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  handler: async ({ title }) => {
  const r = await gapiJSON('POST', 'https://sheets.googleapis.com/v4/spreadsheets', { properties: { title } });
  if (r.status !== 200) return apiErr('sheets.create', r.status, r.data);
  return ok(`Tabelle erstellt: ${r.data.properties.title}\nID: ${r.data.spreadsheetId}\nLink: ${r.data.spreadsheetUrl}`);},
};
