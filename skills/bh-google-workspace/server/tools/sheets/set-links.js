'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Several clickable links in ONE cell. The Values API (updateRange) cannot do
// this: =HYPERLINK() carries only one link, and text with several URLs is
// NOT linked by Sheets (measured 29.09.2026). Hence rich text: each line of the
// cell is a title that points to its URL as its own textFormatRun.
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
  description: 'Writes one or more clickable links into ONE cell (rich text, one titled line per link). Replaces the existing cell content; an empty list clears the cell. Only http(s) URLs.',
  inputSchema: { type: 'object', properties: {
    spreadsheetId: { type: 'string' },
    sheetName: { type: 'string', description: 'Tab name, e.g. "Aufgaben"' },
    cell: { type: 'string', description: 'A1 cell without tab, e.g. "I7"' },
    links: { type: 'array', description: '[{ url, label? }] — label = displayed title (default: URL)', items: { type: 'object' } },
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
