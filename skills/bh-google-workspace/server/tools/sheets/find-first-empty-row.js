'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// First row whose cell in `column` is empty — structured via the
// Values API (JSON), not via the text of sheets.getRange: there a line break
// INSIDE a cell splits the output into two lines and shifts every
// count (incident 29.09.2026, Quick-Tasks: "Keine freie Zeile gefunden").
// Useful for sheets with preformatted empty rows where appendRow does not fit.
module.exports = {
  name: 'sheets.findFirstEmptyRow',
  description: 'Returns the number of the first row in fromRow..toRow whose cell in the given column is empty (line breaks in cells count correctly). Response: {"row": <number>} or {"row": null} if all are filled.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    sheetName: { type: 'string', description: 'Tab name, e.g. "Aufgaben"' },
    column: { type: 'string', description: 'Column letter, e.g. "B"' },
    fromRow: { type: 'number', description: 'First row to check (e.g. 2 after the header row)' },
    toRow: { type: 'number', description: 'Last row to check' },
  }, required: ['spreadsheetId', 'sheetName', 'column', 'fromRow', 'toRow'] },
  handler: async ({ spreadsheetId, sheetName, column, fromRow, toRow }) => {
    const col = String(column || '').toUpperCase();
    const from = Number(fromRow), to = Number(toRow);
    if (!/^[A-Z]{1,3}$/.test(col) || !(from >= 1) || !(to >= from)) return apiErr('sheets.findFirstEmptyRow', 400, { error: 'column/fromRow/toRow ungueltig' });
    const range = `'${String(sheetName).replace(/'/g, "''")}'!${col}${from}:${col}${to}`;
    const r = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
    if (r.status !== 200) return apiErr('sheets.findFirstEmptyRow', r.status, r.data);
    const rows = r.data.values || [];
    for (let i = 0; i <= to - from; i++) {
      const v = rows[i] && rows[i][0];
      if (v == null || String(v).trim() === '') return ok(JSON.stringify({ row: from + i }));
    }
    return ok(JSON.stringify({ row: null }));
  },
};
