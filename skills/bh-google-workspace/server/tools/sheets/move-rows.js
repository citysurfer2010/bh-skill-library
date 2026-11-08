'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Zeilen in einen anderen Tab verschieben — in EINEM batchUpdate (atomar):
// Ziel-Tab bekommt sie oben (unter der Kopfzeile, neueste zuerst), inkl.
// Formaten, Checkboxen und Rich-Text-Links (copyPaste — die Values-API verliert
// die Links aus sheets.setLinks). Danach werden sie im Quell-Tab geloescht.
// keepRowCount fuellt unten gleich viele leere Zeilen nach und kopiert Format +
// Validierung der letzten Zeile: Filteransichten und bedingte Formate, die bis
// zur letzten Zeile reichen, behalten so ihre Groesse.
// Erster Nutzer: Portfolio-Hub Quick-Tasks — erledigte Aufgaben nach „Erledigt".
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
  description: 'Verschiebt ganze Zeilen in einen anderen Tab (oben unter der Kopfzeile einfuegen, inkl. Format + Rich-Text-Links, dann im Quell-Tab loeschen) — atomar. Legt den Ziel-Tab mit Kopfzeile an, falls er fehlt. expect prueft vorher je Zeile den Zellinhalt (Schutz gegen verschobene Zeilen). keepRowCount fuellt im Quell-Tab leere, vorformatierte Zeilen nach.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    fromSheet: { type: 'string', description: 'Quell-Tab, z. B. "Aufgaben"' },
    toSheet: { type: 'string', description: 'Ziel-Tab, z. B. "Erledigt" (wird angelegt, falls fehlend)' },
    rows: { type: 'array', items: { type: 'integer' }, description: 'Zeilennummern im Quell-Tab (1-basiert, nicht die Kopfzeile)' },
    width: { type: 'integer', description: 'Anzahl Spalten ab A (Default: alle des Quell-Tabs)' },
    expect: { type: 'object', description: '{ column: "B", values: { "<zeile>": "<erwarteter Text>" } } — Abweichung → nichts wird veraendert' },
    stampDate: { type: 'string', description: 'JJJJ-MM-TT — in die Spalte rechts neben den kopierten Spalten des Ziels (z. B. "Archiviert am")' },
    stampHeader: { type: 'string', description: 'Kopfzeilen-Titel dieser Spalte beim Anlegen des Ziel-Tabs' },
    keepRowCount: { type: 'boolean' },
    blankValues: { type: 'array', description: 'Werte fuer die nachgefuellten Zeilen ab Spalte A, z. B. [false] fuer eine Checkbox' },
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
