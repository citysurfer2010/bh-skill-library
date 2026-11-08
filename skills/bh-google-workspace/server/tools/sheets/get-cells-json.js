'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Zellen strukturiert lesen: echter Wert (Bool/Zahl/Datum-Seriennummer/Text),
// angezeigter Text und ALLE Links der Zelle. sheets.getRange liefert nur Text —
// Zeilenumbrueche in Zellen zerlegen dort die Zeilen, und Link-Ziele (HYPERLINK,
// Rich-Text-Links aus sheets.setLinks) gehen ganz verloren.

function cellLinks(c) {
  const text = c.formattedValue || '';
  const runs = c.textFormatRuns || [];
  const out = [];
  runs.forEach((r, i) => {
    const uri = r.format && r.format.link && r.format.link.uri;
    if (!uri) return;
    const start = r.startIndex || 0;
    const end = i + 1 < runs.length ? runs[i + 1].startIndex : text.length;
    out.push({ url: uri, label: text.slice(start, end).trim() || uri });
  });
  if (!out.length && c.hyperlink) out.push({ url: c.hyperlink, label: text || c.hyperlink });
  return out;
}

function cellValue(c) {
  const e = c.effectiveValue || {};
  if ('boolValue' in e) return e.boolValue;
  if ('numberValue' in e) return e.numberValue;
  if ('stringValue' in e) return e.stringValue;
  return null;
}

module.exports = {
  name: 'sheets.getCellsJson',
  description: 'Liest einen Bereich strukturiert als JSON: {"rows":[[{"v":Wert,"f":"angezeigter Text","links":[{"url","label"}]}]]}. v = echter Wert (true/false, Zahl, Datum als Seriennummer seit 30.12.1899, Text); links enthaelt HYPERLINK- und Rich-Text-Links. Zeilenumbrueche in Zellen bleiben erhalten.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    range: { type: 'string', description: 'z. B. "Aufgaben!A2:I501"' },
  }, required: ['spreadsheetId', 'range'] },
  cellLinks,
  handler: async ({ spreadsheetId, range }) => {
    const fields = 'sheets.data(startRow,rowData.values(effectiveValue,formattedValue,hyperlink,textFormatRuns(startIndex,format.link)))';
    const r = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=${encodeURIComponent(fields)}`);
    if (r.status !== 200) return apiErr('sheets.getCellsJson', r.status, r.data);
    const data = ((r.data.sheets || [])[0] || {}).data || [];
    const rowData = (data[0] && data[0].rowData) || [];
    const rows = rowData.map(row => (row.values || []).map(c => {
      const cell = { v: cellValue(c), f: c.formattedValue || '' };
      const links = cellLinks(c);
      if (links.length) cell.links = links;
      return cell;
    }));
    return ok(JSON.stringify({ rows }));
  },
};
