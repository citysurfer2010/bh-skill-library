'use strict';
const { apiErr, gapiJSON, ok, err } = require('../../lib/gapi.js');

// Aktualisiert eine BESTEHENDE Google-Sheets-Tabelle IN PLACE (kein neues File —
// verhindert das Aufhäufen von Duplikaten bei wiederkehrenden Reports).
//
// Zwei Modi:
//   1) { spreadsheetId, range, values }  → values.update (valueInputOption=RAW)
//      Überschreibt genau den angegebenen A1-Bereich.
//   2) { spreadsheetId, csv, sheetName? } → values.clear des ganzen Tabs,
//      danach values.update ab A1 mit dem geparsten CSV. Ersetzt den KOMPLETTEN
//      Tab-Inhalt (Convenience für Reporting-Sheets: eine Datei, immer frisch).
//      sheetName weglassen ⇒ erster Tab der Tabelle.

// Minimaler RFC4180-CSV-Parser: quotierte Felder, eingebettete Kommas/Zeilen-
// umbrüche, "" als Escape. Kein externer Dep.
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
  // Abschließende Leerzeile entfernen (Datei endet auf \n)
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
  description: 'Aktualisiert eine bestehende Google-Sheets-Tabelle IN PLACE (kein neues File). Modus A: {spreadsheetId, range, values} überschreibt einen A1-Bereich (RAW). Modus B: {spreadsheetId, csv, sheetName?} leert den ganzen Tab und schreibt das CSV ab A1 neu (Convenience für Reporting-Sheets).',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheetId: { type: 'string', description: 'ID der bestehenden Tabelle.' },
      range:         { type: 'string', description: 'Modus A: A1-Bereich, z.B. "Sheet1!A1:D10".' },
      values:        { type: 'array', items: { type: 'array' }, description: 'Modus A: 2D-Array der neuen Werte.' },
      csv:           { type: 'string', description: 'Modus B: kompletter Tab-Inhalt als CSV (Tab wird geleert und neu geschrieben).' },
      sheetName:     { type: 'string', description: 'Modus B: Ziel-Tab-Name. Weglassen ⇒ erster Tab.' },
    },
    required: ['spreadsheetId'],
  },
  handler: async ({ spreadsheetId, range, values, csv, sheetName } = {}) => {
    if (!spreadsheetId) return err('spreadsheetId ist Pflicht.');

    // Modus B — CSV-Replace (ganzen Tab ersetzen)
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

    // Modus A — range + values
    if (!range || !Array.isArray(values)) {
      return err('Entweder {range, values} (2D-Array) ODER {csv, sheetName?} angeben.');
    }
    const r = await gapiJSON('PUT', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { range, majorDimension: 'ROWS', values });
    if (r.status !== 200) return apiErr('sheets.updateValues', r.status, r.data);
    return ok(`Bereich aktualisiert: ${r.data.updatedRange}, Zeilen: ${r.data.updatedRows}`);
  },
};
