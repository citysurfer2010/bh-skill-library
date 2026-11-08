'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.duplicateSheet', description: 'Dupliziert einen vorhandenen Tab (Sheet) innerhalb derselben Google-Tabelle, inkl. Inhalt/Format. Gibt die neue sheetId zurück.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sourceSheetId: { type: 'number', description: 'gid des Quell-Tabs (aus sheets.getMetadata)' }, newSheetName: { type: 'string', description: 'Name des neuen Tabs' }, insertSheetIndex: { type: 'number', description: 'Position (0-basiert, optional)' } }, required: ['spreadsheetId', 'sourceSheetId', 'newSheetName'] },
  handler: async ({ spreadsheetId, sourceSheetId, newSheetName, insertSheetIndex }) => {
  const duplicateSheet = { sourceSheetId, newSheetName };
  if (insertSheetIndex !== undefined) duplicateSheet.insertSheetIndex = insertSheetIndex;
  const r = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { requests: [{ duplicateSheet }] });
  if (r.status !== 200) return apiErr('sheets.duplicateSheet', r.status, r.data);
  const props = r.data?.replies?.[0]?.duplicateSheet?.properties || {};
  return ok(`Tab dupliziert: "${props.title}" (sheetId ${props.sheetId}).`);},
};
