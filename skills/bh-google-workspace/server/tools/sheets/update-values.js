'use strict';
const { apiErr, gapiJSON, ok, err } = require('../../lib/gapi.js');

// Updates an EXISTING Google Sheets spreadsheet IN PLACE (no new file —
// prevents piling up duplicates for recurring reports).
//
// Two modes:
//   1) { spreadsheetId, range, values }  → values.update (valueInputOption=RAW)
//      Overwrites exactly the given A1 range.
//   2) { spreadsheetId, csv, sheetName? } → values.clear of the whole tab,
//      then values.update from A1 with the parsed CSV. Replaces the ENTIRE
//      tab content (convenience for reporting sheets: one file, always fresh).
//      omit sheetName ⇒ first tab of the spreadsheet.

// Minimal RFC4180 CSV parser: quoted fields, embedded commas/line
// breaks, "" as escape. No external dependency.
function parseCsv(text) {
  const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], field = '', inQ = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  row.push(field); rows.push(row);
  // Remove the trailing empty line (file ends in \n)
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

async function firstSheetTitle(spreadsheetId) {
  const r = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title))`);
  if (r.status !== 200) return { errRes: apiErr('sheets.updateValues (metadata)', r.status, r.data) };
  const first = (r.data.sheets || [])[0];
  const title = first && first.properties && first.properties.title;
  if (!title) return { errRes: err('Konnte den ersten Tab-Namen nicht ermitteln (spreadsheetId gültig / geteilt?).') };
  return { title };
}

module.exports = {
  name: 'sheets.updateValues',
  description: 'Updates an existing Google Sheets spreadsheet IN PLACE (no new file). Mode A: {spreadsheetId, range, values} overwrites an A1 range (RAW). Mode B: {spreadsheetId, csv, sheetName?} clears the whole tab and rewrites the CSV from A1 (convenience for reporting sheets).',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'ID of the existing spreadsheet.' },
      range:         { type: 'string', description: 'Mode A: A1 range, e.g. "Sheet1!A1:D10".' },
      values:        { type: 'array', items: { type: 'array' }, description: 'Mode A: 2D array of the new values.' },
      csv:           { type: 'string', description: 'Mode B: entire tab content as CSV (tab is cleared and rewritten).' },
      sheetName:     { type: 'string', description: 'Mode B: target tab name. Omit ⇒ first tab.' },
    },
    required: ['spreadsheetId'],
  },
  handler: async ({ spreadsheetId, range, values, csv, sheetName } = {}) => {
    if (!spreadsheetId) return err('spreadsheetId ist Pflicht.');

    // Mode B — CSV replace (replace the whole tab)
    if (csv != null) {
      let tab = sheetName;
      if (!tab) {
        const t = await firstSheetTitle(spreadsheetId);
        if (t.errRes) return t.errRes;
        tab = t.title;
      }
      const rows = parseCsv(csv);
      const clr = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}:clear`, {});
      if (clr.status !== 200) return apiErr('sheets.updateValues (clear)', clr.status, clr.data);
      const wr = await gapiJSON('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab + '!A1')}?valueInputOption=RAW`,
        { range: `${tab}!A1`, majorDimension: 'ROWS', values: rows });
      if (wr.status !== 200) return apiErr('sheets.updateValues (write)', wr.status, wr.data);
      return ok(`Tab "${tab}" ersetzt (CSV): ${wr.data.updatedRows || 0} Zeilen × ${wr.data.updatedColumns || 0} Spalten. Bereich: ${wr.data.updatedRange}`);
    }

    // Mode A — range + values
    if (!range || !Array.isArray(values)) {
      return err('Entweder {range, values} (2D-Array) ODER {csv, sheetName?} angeben.');
    }
    const r = await gapiJSON('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { range, majorDimension: 'ROWS', values });
    if (r.status !== 200) return apiErr('sheets.updateValues', r.status, r.data);
    return ok(`Bereich aktualisiert: ${r.data.updatedRange}, Zeilen: ${r.data.updatedRows}`);
  },
};
