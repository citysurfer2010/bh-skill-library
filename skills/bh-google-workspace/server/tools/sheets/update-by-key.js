'use strict';
/**
 * sheets.updateByKey — kollisionssicheres Schreiben in Google Sheets.
 *
 * Statt in FESTE Zellbereiche zu schreiben (riskant: verschiebt jemand parallel
 * Zeilen, trifft der Range die falsche Zeile → Bestand überschrieben), matcht
 * dieses Tool jede Eingabe-Zeile per eindeutigem Schlüssel (z.B. Vorgangsnummer)
 * gegen eine Schlüsselspalte, die UNMITTELBAR vor dem Schreiben frisch gelesen
 * wird. Geschrieben wird dann zeilengenau per values:batchUpdate.
 *
 * Vorfall-Referenz 2026-06-30: fester A2:M18-Write überschrieb PM-C0601/0600,
 * nachdem parallel 2 Zeilen gelöscht wurden. Dieses Tool verhindert das.
 */
const { apiErr, gapiJSON, okJson } = require('../../lib/gapi.js');

function colToNum(col) {
  let n = 0;
  for (const ch of String(col).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function numToCol(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function quoteSheet(title) { return `'${String(title).replace(/'/g, "''")}'`; }
const norm = (v) => String(v == null ? '' : v).replace(/\r/g, '').trim();

module.exports = {
  name: 'sheets.updateByKey',
  description: 'Kollisionssicheres Schreiben: matcht jede Zeile per Schlüssel (z.B. Vorgangsnummer) gegen eine frisch gelesene Schlüsselspalte und schreibt zeilengenau (values:batchUpdate) — robust gegen parallel verschobene Zeilen. rows=[{key, values:[...]}]; values beginnen bei startColumn. dryRun=true gibt nur die Zeilen-Zuordnung zurück (kein Schreiben). createIfMissing hängt unbekannte Schlüssel unten an.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId:  { type: 'string' },
      sheet:          { type: 'string', description: 'Tab-Titel, z.B. "Übersicht"' },
      keyColumn:      { type: 'string', description: 'Spalte mit dem eindeutigen Schlüssel (Default "A")' },
      startColumn:    { type: 'string', description: 'Spalte, ab der values geschrieben werden (Default "A")' },
      rows:           { type: 'array', description: '[{key, values:[...]}] — values ab startColumn', items: { type: 'object', properties: { key: { type: 'string' }, values: { type: 'array' } }, required: ['key', 'values'] } },
      createIfMissing:{ type: 'boolean', description: 'Unbekannte Schlüssel unten anhängen (Default false → übersprungen)' },
      dryRun:         { type: 'boolean', description: 'Nur Zuordnung zurückgeben, nicht schreiben (Default false)' },
      valueInputOption:{ type: 'string', description: 'RAW (Default) oder USER_ENTERED' },
    },
    required: ['spreadsheetId', 'sheet', 'rows'],
  },
  handler: async ({ spreadsheetId, sheet, keyColumn = 'A', startColumn = 'A', rows, createIfMissing = false, dryRun = false, valueInputOption = 'RAW' }) => {
    if (!Array.isArray(rows) || !rows.length) return apiErr('sheets.updateByKey', 400, { error: { message: 'rows leer' } });
    const qSheet = quoteSheet(sheet);

    // 1. Schlüsselspalte FRISCH lesen → key → erste Zeilennummer.
    const keyRange = `${qSheet}!${keyColumn}1:${keyColumn}`;
    const kr = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(keyRange)}`);
    if (kr.status !== 200) return apiErr('sheets.updateByKey(read keys)', kr.status, kr.data);
    const keyCells = kr.data.values || [];
    const rowOf = new Map();           // key → 1-based row
    const dupes = new Set();
    let lastRow = 0;
    keyCells.forEach((cell, i) => {
      const k = norm(cell[0]);
      lastRow = i + 1;
      if (!k) return;
      if (rowOf.has(k)) dupes.add(k); else rowOf.set(k, i + 1);
    });

    const startNum = colToNum(startColumn);
    const data = [];                   // batchUpdate ranges
    const updated = [], notFound = [], appendRows = [];
    for (const r of rows) {
      const k = norm(r.key);
      const vals = Array.isArray(r.values) ? r.values : [];
      if (rowOf.has(k)) {
        const row = rowOf.get(k);
        const endCol = numToCol(startNum + Math.max(1, vals.length) - 1);
        data.push({ range: `${qSheet}!${startColumn}${row}:${endCol}${row}`, majorDimension: 'ROWS', values: [vals] });
        updated.push({ key: k, row });
      } else if (createIfMissing) {
        appendRows.push({ key: k, values: vals });
      } else {
        notFound.push(k);
      }
    }

    if (dryRun) return okJson({ dryRun: true, updated, notFound, willAppend: appendRows.map((a) => a.key), duplicateKeys: [...dupes] });

    // 2. Gematchte Zeilen in EINEM batchUpdate schreiben.
    if (data.length) {
      const br = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { valueInputOption, data });
      if (br.status !== 200) return apiErr('sheets.updateByKey(batchUpdate)', br.status, br.data);
    }
    // 3. Unbekannte Schlüssel unten anhängen (optional).
    const appended = [];
    if (appendRows.length) {
      const startCol = numToCol(Math.min(startNum, colToNum(keyColumn)));
      const appendRange = `${qSheet}!${startCol}${lastRow + 1}`;
      const ar = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(appendRange)}:append?valueInputOption=${valueInputOption}&insertDataOption=INSERT_ROWS`,
        { majorDimension: 'ROWS', values: appendRows.map((a) => a.values) });
      if (ar.status !== 200) return apiErr('sheets.updateByKey(append)', ar.status, ar.data);
      appendRows.forEach((a) => appended.push(a.key));
    }
    return okJson({ updatedCount: updated.length, updated, appended, notFound, duplicateKeys: [...dupes] });
  },
};
