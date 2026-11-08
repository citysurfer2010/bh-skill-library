'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Erste Zeile, deren Zelle in `column` leer ist — strukturiert ueber die
// Values-API (JSON), nicht ueber den Text von sheets.getRange: dort zerlegt ein
// Zeilenumbruch IN einer Zelle die Ausgabe in zwei Zeilen und verschiebt jede
// Zaehlung (Vorfall 29.09.2026, Quick-Tasks: "Keine freie Zeile gefunden").
// Nuetzlich fuer Sheets mit vorformatierten Leerzeilen, in die appendRow nicht passt.
module.exports = {
  name: 'sheets.findFirstEmptyRow',
  description: 'Liefert die Nummer der ersten Zeile im Bereich fromRow..toRow, deren Zelle in der angegebenen Spalte leer ist (Zeilenumbrueche in Zellen zaehlen korrekt). Antwort: {"row": <Nummer>} oder {"row": null}, wenn alle belegt sind.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    sheetName: { type: 'string', description: 'Tab-Name, z. B. "Aufgaben"' },
    column: { type: 'string', description: 'Spaltenbuchstabe, z. B. "B"' },
    fromRow: { type: 'number', description: 'Erste zu pruefende Zeile (z. B. 2 hinter der Kopfzeile)' },
    toRow: { type: 'number', description: 'Letzte zu pruefende Zeile' },
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
