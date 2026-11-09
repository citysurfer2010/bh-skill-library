'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'sheets.duplicateSheet', description: 'Duplicates an existing tab (sheet) within the same Google spreadsheet, incl. content/format. Returns the new sheetId.', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sourceSheetId: { type: 'number', description: 'gid of the source tab (from sheets.getMetadata)' }, newSheetName: { type: 'string', description: 'Name of the new tab' }, insertSheetIndex: { type: 'number', description: 'Position (0-based, optional)' } }, required: ['spreadsheetId', 'sourceSheetId', 'newSheetName'] },
  handler: async ({ spreadsheetId, sourceSheetId, newSheetName, insertSheetIndex }) => {
  const duplicateSheet = { sourceSheetId, newSheetName };
  if (insertSheetIndex !== undefined) duplicateSheet.insertSheetIndex = insertSheetIndex;
  const r = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    { requests: [{ duplicateSheet }] });
  if (r.status !== 200) return apiErr('sheets.duplicateSheet', r.status, r.data);
  const props = r.data?.replies?.[0]?.duplicateSheet?.properties || {};
  return ok(`Tab dupliziert: "${props.title}" (sheetId ${props.sheetId}).`);},
};
