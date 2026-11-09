'use strict';
/**
 * sheets.updateByKey — collision-safe writing to Google Sheets.
 *
 * Instead of writing to FIXED cell ranges (risky: if someone moves rows in parallel,
 * the range hits the wrong row → existing data overwritten), this tool
 * matches each input row by unique key (e.g. case number)
 * against a key column that is freshly read IMMEDIATELY before
 * writing. It then writes row-exact via values:batchUpdate.
 *
 * Incident reference 2026-06-30: a fixed A2:M18 write overwrote PM-C0601/0600
 * after 2 rows were deleted in parallel. This tool prevents that.
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
  description: 'Collision-safe writing: matches each row by key (e.g. case number) against a freshly read key column and writes row-exact (values:batchUpdate) — robust against rows moved in parallel. rows=[{key, values:[...]}]; values start at startColumn. dryRun=true only returns the row mapping (no writing). createIfMissing appends unknown keys at the bottom.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId:  { type: 'string' },
      sheet:          { type: 'string', description: 'Tab title, e.g. "Übersicht"' },
      keyColumn:      { type: 'string', description: 'Column with the unique key (default "A")' },
      startColumn:    { type: 'string', description: 'Column from which values are written (default "A")' },
      rows:           { type: 'array', description: '[{key, values:[...]}] — values from startColumn', items: { type: 'object', properties: { key: { type: 'string' }, values: { type: 'array' } }, required: ['key', 'values'] } },
      createIfMissing:{ type: 'boolean', description: 'Append unknown keys at the bottom (default false → skipped)' },
      dryRun:         { type: 'boolean', description: 'Only return the mapping, do not write (default false)' },
      valueInputOption:{ type: 'string', description: 'RAW (default) or USER_ENTERED' },
    },
    required: ['spreadsheetId', 'sheet', 'rows'],
  },
  handler: async ({ spreadsheetId, sheet, keyColumn = 'A', startColumn = 'A', rows, createIfMissing = false, dryRun = false, valueInputOption = 'RAW' }) => {
    if (!Array.isArray(rows) || !rows.length) return apiErr('sheets.updateByKey', 400, { error: { message: 'rows leer' } });
    const qSheet = quoteSheet(sheet);

    // 1. Read the key column FRESH → key → first row number.
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

    // 2. Write matched rows in ONE batchUpdate.
    if (data.length) {
      const br = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { valueInputOption, data });
      if (br.status !== 200) return apiErr('sheets.updateByKey(batchUpdate)', br.status, br.data);
    }
    // 3. Append unknown keys at the bottom (optional).
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
