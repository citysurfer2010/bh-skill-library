'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.keepTableRowsTogether — prevents table rows from being split at a page
 * break (TableRowStyle.preventOverflow).
 *
 * framed sub-items (`section_box`) are technically single-row tables. Without
 * preventOverflow Google Docs splits such a box mid-frame — the
 * caption lands alone and without the frame's bottom edge on the next page.
 * In multi-row tables each row stays whole, the table may still
 * break between rows.
 *
 * Only body-level tables: nested tables sit inside a cell anyway,
 * which already breaks as a whole.
 */
module.exports = {
  name: 'docs.keepTableRowsTogether',
  description:
    'Sets preventOverflow on all table rows of a Google Doc so boxes and rows ' +
    'are not split at page breaks. Call after the HTML import if the document ' +
    'contains framed boxes. prevent=false reverts it.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Doc ID' },
      prevent: { type: 'boolean', description: 'true (default) = keep rows together' },
    },
    required: ['documentId'],
  },
  handler: async ({ documentId, prevent }) => {
    if (!documentId) return err('documentId fehlt.');
    const value = prevent === undefined ? true : !!prevent;

    const doc = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}`);
    if (doc.status !== 200) return err(`Dokument nicht lesbar (${doc.status}).`);

    const requests = [];
    for (const el of (doc.data.body?.content || [])) {
      if (!el.table) continue;
      const rows = (el.table.tableRows || []).length;
      if (!rows) continue;
      requests.push({ updateTableRowStyle: {
        tableStartLocation: { index: el.startIndex },
        rowIndices: Array.from({ length: rows }, (_, i) => i),
        tableRowStyle: { preventOverflow: value },
        fields: 'preventOverflow',
      } });
    }
    if (!requests.length) return ok('Keine Tabellen gefunden — nichts geändert.');

    const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, { requests });
    if (r.status !== 200) return err(`updateTableRowStyle fehlgeschlagen (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`);

    return ok(`${requests.length} Tabelle(n) auf preventOverflow=${value} gesetzt.`);
  },
};
