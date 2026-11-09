'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Move rows to another tab — in ONE batchUpdate (atomic):
// the target tab gets them on top (below the header row, newest first), incl.
// formats, checkboxes and rich text links (copyPaste — the Values API loses
// the links from sheets.setLinks). They are then deleted in the source tab.
// keepRowCount refills as many empty rows at the bottom and copies format +
// validation of the last row: filter views and conditional formats reaching
// the last row thus keep their size.
// First user: Portfolio Hub Quick-Tasks — completed tasks to "Erledigt".
const MAX_ROWS = 200;
const EPOCH = Date.UTC(1899, 11, 30);

const colIndex = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function plan({ srcId, dstId, rows, width, rowCount, stampSerial, keepRowCount, blankValues }) {
  const n = rows.length;
  const req = [{ insertDimension: { range: { sheetId: dstId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + n }, inheritFromBefore: false } }];
  rows.forEach((r, i) => {
    const source = { sheetId: srcId, startRowIndex: r - 1, endRowIndex: r, startColumnIndex: 0, endColumnIndex: width };
    const destination = { sheetId: dstId, startRowIndex: 1 + i, endRowIndex: 2 + i, startColumnIndex: 0, endColumnIndex: width };
    req.push({ copyPaste: { source, destination, pasteType: 'PASTE_NORMAL' } });
    req.push({ copyPaste: { source, destination, pasteType: 'PASTE_DATA_VALIDATION' } });
  });
  if (stampSerial != null) {
    req.push({ updateCells: {
      range: { sheetId: dstId, startRowIndex: 1, endRowIndex: 1 + n, startColumnIndex: width, endColumnIndex: width + 1 },
      rows: rows.map(() => ({ values: [{ userEnteredValue: { numberValue: stampSerial }, userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd.mm.yyyy' } } }] })),
      fields: 'userEnteredValue,userEnteredFormat.numberFormat' } });
  }
  [...rows].sort((a, b) => b - a).forEach((r) => req.push({ deleteDimension: { range: { sheetId: srcId, dimension: 'ROWS', startIndex: r - 1, endIndex: r } } }));
  if (keepRowCount) {
    const at = rowCount - n - 1;                        // before the (old) last row → stays inside all ranges
    req.push({ insertDimension: { range: { sheetId: srcId, dimension: 'ROWS', startIndex: at, endIndex: at + n }, inheritFromBefore: true } });
    const template = { sheetId: srcId, startRowIndex: rowCount - 1, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: width };
    const fresh = { sheetId: srcId, startRowIndex: at, endRowIndex: at + n, startColumnIndex: 0, endColumnIndex: width };
    req.push({ copyPaste: { source: template, destination: fresh, pasteType: 'PASTE_FORMAT' } });
    req.push({ copyPaste: { source: template, destination: fresh, pasteType: 'PASTE_DATA_VALIDATION' } });
    if (blankValues && blankValues.length) {
      req.push({ updateCells: { range: { ...fresh, endColumnIndex: blankValues.length },
        rows: Array.from({ length: n }, () => ({ values: blankValues.map(cellValue) })), fields: 'userEnteredValue' } });
    }
  }
  return req;
}

function cellValue(v) {
  if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
  if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
  return v == null || v === '' ? {} : { userEnteredValue: { stringValue: String(v) } };
}

module.exports = {
  name: 'sheets.moveRows',
  description: 'Moves whole rows to another tab (insert on top below the header row, incl. format + rich text links, then delete in the source tab) — atomic. Creates the target tab with a header row if missing. expect first checks the cell content per row (guard against shifted rows). keepRowCount refills empty, preformatted rows in the source tab.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    fromSheet: { type: 'string', description: 'Source tab, e.g. "Aufgaben"' },
    toSheet: { type: 'string', description: 'Target tab, e.g. "Erledigt" (created if missing)' },
    rows: { type: 'array', items: { type: 'integer' }, description: 'Row numbers in the source tab (1-based, not the header row)' },
    width: { type: 'integer', description: 'Number of columns from A (default: all of the source tab)' },
    expect: { type: 'object', description: '{ column: "B", values: { "<row>": "<expected text>" } } — mismatch → nothing is changed' },
    stampDate: { type: 'string', description: 'YYYY-MM-DD — into the column right of the copied columns in the target (e.g. "Archiviert am")' },
    stampHeader: { type: 'string', description: 'Header title of this column when creating the target tab' },
    keepRowCount: { type: 'boolean' },
    blankValues: { type: 'array', description: 'Values for the refilled rows from column A, e.g. [false] for a checkbox' },
  }, required: ['spreadsheetId', 'fromSheet', 'toSheet', 'rows'] },
  plan,
  handler: async (a) => {
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${a.spreadsheetId}`;
    const rows = [...new Set((a.rows || []).map(Number))].filter((r) => Number.isInteger(r) && r >= 2).sort((x, y) => x - y);
    if (!rows.length) return ok('Keine Zeilen — nichts verschoben.');
    if (rows.length > MAX_ROWS) return apiErr('sheets.moveRows', 400, { error: `Hoechstens ${MAX_ROWS} Zeilen je Aufruf` });
    if (a.stampDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.stampDate)) return apiErr('sheets.moveRows', 400, { error: 'stampDate muss JJJJ-MM-TT sein' });

    const meta = await gapiJSON('GET', `${base}?fields=sheets.properties(sheetId,title,gridProperties)`);
    if (meta.status !== 200) return apiErr('sheets.moveRows', meta.status, meta.data);
    const tabs = (meta.data.sheets || []).map((s) => s.properties);
    const src = tabs.find((t) => t.title === a.fromSheet);
    if (!src) return apiErr('sheets.moveRows', 404, { error: `Tab nicht gefunden: ${a.fromSheet}` });
    const rowCount = src.gridProperties.rowCount;
    const width = Math.min(Number(a.width) || src.gridProperties.columnCount, src.gridProperties.columnCount);
    if (rows.at(-1) > rowCount) return apiErr('sheets.moveRows', 400, { error: `Zeile ${rows.at(-1)} liegt ausserhalb (${rowCount} Zeilen)` });
    if (a.keepRowCount && rows.includes(rowCount)) return apiErr('sheets.moveRows', 400, { error: 'Die letzte Zeile ist die Vorlage fuer keepRowCount und kann nicht verschoben werden' });

    if (a.expect && a.expect.column) {
      const col = String(a.expect.column).toUpperCase();
      const ranges = rows.map((r) => `ranges=${encodeURIComponent(`'${a.fromSheet}'!${col}${r}`)}`).join('&');
      const got = await gapiJSON('GET', `${base}/values:batchGet?${ranges}`);
      if (got.status !== 200) return apiErr('sheets.moveRows', got.status, got.data);
      const bad = rows.filter((r, i) => norm(((got.data.valueRanges[i].values || [])[0] || [])[0]) !== norm((a.expect.values || {})[r]));
      if (bad.length) return apiErr('sheets.moveRows', 409, { error: `Zeileninhalt hat sich geaendert (Zeile ${bad.join(', ')}) — nichts verschoben` });
    }

    let dst = tabs.find((t) => t.title === a.toSheet);
    if (!dst) {
      const add = await gapiJSON('POST', `${base}:batchUpdate`, { requests: [{ addSheet: { properties: { title: a.toSheet, gridProperties: { rowCount: 2, columnCount: width + 1, frozenRowCount: 1 } } } }] });
      if (add.status !== 200) return apiErr('sheets.moveRows', add.status, add.data);
      dst = add.data.replies[0].addSheet.properties;
      const head = { sheetId: src.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: width };
      const init = [{ copyPaste: { source: head, destination: { ...head, sheetId: dst.sheetId }, pasteType: 'PASTE_NORMAL' } }];
      if (a.stampHeader) init.push({ updateCells: { start: { sheetId: dst.sheetId, rowIndex: 0, columnIndex: width }, rows: [{ values: [{ userEnteredValue: { stringValue: a.stampHeader }, userEnteredFormat: { textFormat: { bold: true } } }] }], fields: 'userEnteredValue,userEnteredFormat.textFormat.bold' } });
      const r = await gapiJSON('POST', `${base}:batchUpdate`, { requests: init });
      if (r.status !== 200) return apiErr('sheets.moveRows', r.status, r.data);
    }

    const [y, m, d] = String(a.stampDate || '').split('-').map(Number);
    const stampSerial = a.stampDate ? (Date.UTC(y, m - 1, d) - EPOCH) / 86400000 : null;
    const requests = plan({ srcId: src.sheetId, dstId: dst.sheetId, rows, width, rowCount, stampSerial, keepRowCount: !!a.keepRowCount, blankValues: a.blankValues });
    const r = await gapiJSON('POST', `${base}:batchUpdate`, { requests });
    if (r.status !== 200) return apiErr('sheets.moveRows', r.status, r.data);
    return ok(JSON.stringify({ moved: rows.length, rows, toSheet: a.toSheet }));
  },
};
