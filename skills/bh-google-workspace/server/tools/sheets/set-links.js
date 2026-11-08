'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Mehrere klickbare Links in EINER Zelle. Per Values-API (updateRange) geht das
// nicht: =HYPERLINK() traegt nur einen Link, und Text mit mehreren URLs wird von
// Sheets NICHT verlinkt (gemessen 29.09.2026). Deshalb Rich-Text: jede Zeile der
// Zelle ist ein Titel, der als eigener textFormatRun auf seine URL zeigt.
const MAX_LINKS = 20;

function build(links) {
  let text = '';
  const runs = [];
  links.forEach((l, i) => {
    if (i) { runs.push({ startIndex: text.length, format: {} }); text += '\n'; }
    const label = String(l.label || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120) || l.url;
    runs.push({ startIndex: text.length, format: { link: { uri: l.url } } });
    text += label;
  });
  return { text, runs };
}

module.exports = {
  name: 'sheets.setLinks',
  description: 'Schreibt eine oder mehrere klickbare Links in EINE Zelle (Rich-Text, je Link eine Zeile mit Titel). Ersetzt den bisherigen Zellinhalt; leere Liste leert die Zelle. Nur http(s)-URLs.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    sheetName: { type: 'string', description: 'Tab-Name, z. B. "Aufgaben"' },
    cell: { type: 'string', description: 'A1-Zelle ohne Tab, z. B. "I7"' },
    links: { type: 'array', description: '[{ url, label? }] — label = angezeigter Titel (Default: URL)', items: { type: 'object' } },
  }, required: ['spreadsheetId', 'sheetName', 'cell', 'links'] },
  build,
  handler: async ({ spreadsheetId, sheetName, cell, links }) => {
    const m = /^([A-Z]{1,3})(\d+)$/.exec(String(cell || '').toUpperCase());
    if (!m) return apiErr('sheets.setLinks', 400, { error: `Ungueltige Zelle: ${cell}` });
    const list = (Array.isArray(links) ? links : []).filter(l => l && /^https?:\/\/\S+$/.test(String(l.url || ''))).slice(0, MAX_LINKS);
    const meta = await gapiJSON('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
    if (meta.status !== 200) return apiErr('sheets.setLinks', meta.status, meta.data);
    const tab = (meta.data.sheets || []).find(s => s.properties.title === sheetName);
    if (!tab) return apiErr('sheets.setLinks', 404, { error: `Tab nicht gefunden: ${sheetName}` });
    const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const { text, runs } = build(list);
    const value = list.length ? { userEnteredValue: { stringValue: text }, textFormatRuns: runs } : {};
    const r = await gapiJSON('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { requests: [{ updateCells: {
      start: { sheetId: tab.properties.sheetId, rowIndex: Number(m[2]) - 1, columnIndex: col },
      rows: [{ values: [value] }], fields: 'userEnteredValue,textFormatRuns' } }] });
    if (r.status !== 200) return apiErr('sheets.setLinks', r.status, r.data);
    return ok(`${list.length} Link(s) in ${sheetName}!${m[0]} geschrieben.`);
  },
};
