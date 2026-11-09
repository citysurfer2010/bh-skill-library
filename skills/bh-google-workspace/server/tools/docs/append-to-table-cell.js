'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, resolveSegment, resolveTabId, findTabByTitle,
  cellText, hexToRgb, norm, resolveTable, resolveRow, insertedTextStyleRequests,
} = require('../../lib/docs-tabs.js');

/**
 * docs.appendToTableCell — appends text to the end of ONE table cell.
 *
 * Counterpart to docs.appendTableRow: there a new row, here an addition to
 * an existing one. The BP doc case is the "Verlauf/To" column — a running
 * log to which coordinator decisions and evidence are added,
 * without overwriting colleagues' entries.
 *
 * Three details that otherwise go wrong:
 *   1. TABS — without includeTabsContent=true (lib/docs-tabs.js) you silently write
 *      to the first tab, i.e. into the wrong fiscal year.
 *   2. INSERTION POINT — at the cell end the insert belongs at endIndex-1 of the
 *      last paragraph: endIndex itself already holds the paragraph marker of the
 *      next cell, and the API refuses the insert there.
 *   3. FIND THE ROW BY CONTENT — rowIndex shifts as soon as someone inserts a
 *      row. rowMatchColumn/rowMatchValue hits the row by its content.
 */

module.exports = {
  name: 'docs.appendToTableCell',
  description: 'Appends text to the end of an existing table cell (without overwriting the existing content) — tab-aware. Row via rowIndex or content-based via rowMatchColumn/rowMatchValue. Optional color (color, e.g. "#D63384" for AI entries) and linkify for clickable URLs. Idempotent via skipIfContains.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Target tab (see docs.listTabs). If omitted: first tab.' },
      tabTitle: { type: 'string', description: 'Alternative to tabId: exact tab title.' },
      tableIndex: { type: 'number', description: '0-based index of the table in the tab (default 0).' },
      tableWithHeader: { type: 'string', description: 'Alternative to tableIndex: text in the header row.' },
      rowIndex: { type: 'number', description: '0-based row (0 = header row).' },
      rowMatchColumn: { type: 'number', description: 'Instead of rowIndex: column to search in (e.g. 3 = topic).' },
      rowMatchValue: { type: 'string', description: 'Cell content to look for in rowMatchColumn (exact, whitespace-tolerant).' },
      columnIndex: { type: 'number', description: 'Target column, e.g. 6 = Verlauf/To.' },
      text: { type: 'string', description: 'Text to append. Add a leading blank line yourself if desired.' },
      color: { type: 'string', description: 'Hex color for the appended text, e.g. "#D63384".' },
      linkify: { type: 'boolean', description: 'Make URLs in the appended text clickable.' },
      skipIfContains: { type: 'string', description: 'Idempotence: do nothing if the cell already contains this text.' },
    },
    required: ['documentId', 'columnIndex', 'text'],
  },

  handler: async ({
    documentId, tabId, tabTitle, tableIndex, tableWithHeader,
    rowIndex, rowMatchColumn, rowMatchValue, columnIndex, text, color, linkify, skipIfContains,
  }) => {
    if (!text || !String(text).length) return err('docs.appendToTableCell: text ist leer.');

    const doc = await fetchDoc(documentId);
    if (doc.status !== 200) return apiErr('docs.appendToTableCell (get)', doc.status, doc.data);

    let targetTabId = tabId;
    if (!targetTabId && tabTitle) {
      const t = findTabByTitle(doc.data.tabs, tabTitle);
      if (!t) return err(`docs.appendToTableCell: Tab "${tabTitle}" nicht gefunden.`);
      targetTabId = t.tabProperties.tabId;
    }
    targetTabId = resolveTabId(doc.data, targetTabId);

    const content = resolveSegment(doc.data, targetTabId);
    if (!content) return err(`docs.appendToTableCell: Tab ${targetTabId || '(erster)'} nicht gefunden.`);

    const found = resolveTable(content, { tableIndex, tableWithHeader });
    if (found.error) return err(`docs.appendToTableCell: ${found.error}`);
    const rows = found.table.table.tableRows || [];

    const row = resolveRow(rows, { rowIndex, rowMatchColumn, rowMatchValue });
    if (row.error) return err(`docs.appendToTableCell: ${row.error}`);
    const ri = row.rowIndex;

    const cell = (rows[ri].tableCells || [])[columnIndex];
    if (!cell) return err(`docs.appendToTableCell: Spalte ${columnIndex} existiert in Zeile ${ri} nicht.`);

    if (skipIfContains && norm(cellText(cell)).includes(norm(skipIfContains))) {
      return okJson({ skipped: true, reason: 'Zelle enthaelt den Text bereits', documentId, tabId: targetTabId, rowIndex: ri, columnIndex });
    }

    // To the cell end: endIndex of the last paragraph minus 1.
    const last = (cell.content || [])[(cell.content || []).length - 1];
    const at = last?.endIndex != null ? last.endIndex - 1 : cell.content?.[0]?.startIndex;
    if (at == null) return err('docs.appendToTableCell: Einfuegeposition nicht bestimmbar.');

    // Insert + styles in ONE batchUpdate — the requests apply sequentially,
    // so the style ranges refer to the already inserted text.
    const reqs = [{ insertText: { location: loc(at, targetTabId), text: String(text) } }];
    const len = String(text).length;
    reqs.push(...insertedTextStyleRequests(at, text, targetTabId, hexToRgb(color), linkify));

    const r = await batchUpdate(documentId, reqs);
    if (r.status !== 200) return apiErr('docs.appendToTableCell', r.status, r.data);

    return okJson({
      documentId, tabId: targetTabId, tableIndex: found.position,
      rowIndex: ri, columnIndex, insertedAt: at, chars: len, requests: reqs.length,
    });
  },
};
