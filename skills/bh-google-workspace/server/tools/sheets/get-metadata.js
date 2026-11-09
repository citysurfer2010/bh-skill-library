'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.getMetadata', description: 'Returns metadata of a Google Sheets spreadsheet (sheets, columns, rows).', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' } }, required: ['spreadsheetId'] },
  handler: async ({ spreadsheetId }) => {
  const r = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`);
  if (r.status !== 200) return apiErr('sheets.getMetadata', r.status, r.data);
  const sheets = (r.data.sheets || []).map(s => `  ${s.properties.title} (${s.properties.sheetId}) — ${s.properties.gridProperties?.rowCount}x${s.properties.gridProperties?.columnCount}`).join('\n');
  return ok(`Titel: ${r.data.properties?.title}\nID: ${r.data.spreadsheetId}\nSheets:\n${sheets}`);},
};
