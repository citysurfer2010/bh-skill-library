'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, range, resolveSegment, resolveTabId, findTabByTitle,
  contentText, cellText, hexToRgb, norm, resolveTable, resolveRow, insertedTextStyleRequests,
} = require('../../lib/docs-tabs.js');

/**
 * docs.setTableCell — replaces the content of ONE table cell (cell reset).
 *
 * Counterpart to docs.appendToTableCell (only appends) and docs.replaceText
 * (document-wide, cannot insert paragraph breaks). The BP doc case is the
 * rewrite of the answer column from the DB: answer_text is nearly always multi-paragraph,
 * and replaceText turns it into a wall of text (transfer 300095/2025).
 *
 * Flow in ONE batchUpdate (requests apply sequentially):
 *   1. deleteContentRange [start of first paragraph, end of last paragraph - 1) — the
 *      last paragraph marker of a cell cannot be deleted, the API rejects it otherwise.
 *   2. insertText at the cell start; "\n" in the text creates real paragraphs.
 *   3. Reset color/link/underline on the new text — otherwise Docs inherits
 *      the style of the deleted content (e.g. AI pink on a colleague's text).
 *   4. optional color + linkify as in appendToTableCell.
 *
 * Protects others' work: expectContains aborts if the cell no longer contains
 * the expected old state. skipIfEquals makes the call
 * idempotent. previousText in the response records the overwritten state.
 */

module.exports = {
  name: 'docs.setTableCell',
  description: 'Replaces the entire content of an existing table cell (clear cell + set anew) — tab-aware. "\\n" in the text creates real paragraphs. Row via rowIndex or content-based via rowMatchColumn/rowMatchValue, table via tableIndex, tableStartIndex or tableWithHeader. expectContains protects against overwriting changes by others, skipIfEquals makes the call idempotent. Optional color and linkify. Response contains previousText.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Target tab (see docs.listTabs). If omitted: first tab.' },
      tabTitle: { type: 'string', description: 'Alternative to tabId: exact tab title.' },
      tableIndex: { type: 'number', description: '0-based index of the table in the tab (default 0).' },
      tableStartIndex: { type: 'number', description: 'Alternative to tableIndex: startIndex of the table from documents.get.' },
      tableWithHeader: { type: 'string', description: 'Alternative to tableIndex: text in the header row.' },
      rowIndex: { type: 'number', description: '0-based row (0 = header row).' },
      rowMatchColumn: { type: 'number', description: 'Instead of rowIndex: column to search in (default 3 = topic).' },
      rowMatchValue: { type: 'string', description: 'Cell content to look for in rowMatchColumn (exact, whitespace-tolerant).' },
      columnIndex: { type: 'number', description: '0-based target column, e.g. 7 = answer.' },
      text: { type: 'string', description: 'New cell content. "\\n" = new paragraph. Empty string clears the cell. Trailing line breaks are removed.' },
      expectContains: { type: 'string', description: 'Guard: write only if the cell contains this text (whitespace-tolerant) — otherwise abort without writing.' },
      skipIfEquals: { type: 'boolean', description: 'Idempotence: do nothing if the cell already contains exactly this text (whitespace-tolerant).' },
      color: { type: 'string', description: 'Hex color for the new text, e.g. "#D63384". If omitted: default color.' },
      linkify: { type: 'boolean', description: 'Make URLs in the new text clickable.' },
    },
    required: ['documentId', 'columnIndex', 'text'],
  },

  handler: async ({
    documentId, tabId, tabTitle, tableIndex, tableStartIndex, tableWithHeader,
    rowIndex, rowMatchColumn, rowMatchValue, columnIndex, text,
    expectContains, skipIfEquals, color, linkify,
  }) => {
    if (text == null) return err('docs.setTableCell: text fehlt (leerer String leert die Zelle).');
    const newText = String(text).replace(/\r\n?/g, '\n').replace(/\n+$/, '');

    const doc = await fetchDoc(documentId);
    if (doc.status !== 200) return apiErr('docs.setTableCell (get)', doc.status, doc.data);

    let targetTabId = tabId;
    if (!targetTabId && tabTitle) {
      const t = findTabByTitle(doc.data.tabs, tabTitle);
      if (!t) return err(`docs.setTableCell: Tab "${tabTitle}" nicht gefunden.`);
      targetTabId = t.tabProperties.tabId;
    }
    targetTabId = resolveTabId(doc.data, targetTabId);

    const content = resolveSegment(doc.data, targetTabId);
    if (!content) return err(`docs.setTableCell: Tab ${targetTabId || '(erster)'} nicht gefunden.`);

    const found = resolveTable(content, { tableIndex, tableWithHeader, tableStartIndex });
    if (found.error) return err(`docs.setTableCell: ${found.error}`);
    const rows = found.table.table.tableRows || [];

    const row = resolveRow(rows, { rowIndex, rowMatchColumn, rowMatchValue });
    if (row.error) return err(`docs.setTableCell: ${row.error}`);
    const ri = row.rowIndex;

    const cell = (rows[ri].tableCells || [])[columnIndex];
    if (!cell) return err(`docs.setTableCell: Spalte ${columnIndex} existiert in Zeile ${ri} nicht.`);

    const els = cell.content || [];
    if (els.some((el) => el.table)) {
      return err('docs.setTableCell: Zelle enthaelt eine verschachtelte Tabelle — Zell-Reset nicht unterstuetzt.');
    }
    const start = els[0]?.startIndex;
    const end = els[els.length - 1]?.endIndex;
    if (start == null || end == null) return err('docs.setTableCell: Zellbereich nicht bestimmbar.');

    const current = cellText(cell);
    const previousText = contentText(els).replace(/\n+$/, '');
    const base = { documentId, tabId: targetTabId, tableIndex: found.position, rowIndex: ri, columnIndex };

    if (skipIfEquals && norm(current) === norm(newText)) {
      return okJson({ skipped: true, reason: 'Zelle enthaelt bereits diesen Text', ...base });
    }
    if (expectContains != null && expectContains !== '' && !norm(current).includes(norm(expectContains))) {
      return err(`docs.setTableCell: Zelle (Zeile ${ri}, Spalte ${columnIndex}) enthaelt "${expectContains}" nicht — `
        + `vermutlich zwischenzeitlich bearbeitet, nichts geschrieben. Aktueller Inhalt: ${current.slice(0, 300)}`);
    }

    const reqs = [];
    // The cell's last paragraph marker stays (end - 1).
    if (end - 1 > start) {
      reqs.push({ deleteContentRange: { range: range(start, end - 1, targetTabId) } });
    }
    if (newText.length) {
      reqs.push({ insertText: { location: loc(start, targetTabId), text: newText } });
      reqs.push({
        updateTextStyle: {
          range: range(start, start + newText.length, targetTabId),
          textStyle: {},
          fields: 'foregroundColor,link,underline',
        },
      });
      reqs.push(...insertedTextStyleRequests(start, newText, targetTabId, hexToRgb(color), linkify));
    }
    if (!reqs.length) return okJson({ skipped: true, reason: 'Zelle ist bereits leer', ...base });

    const r = await batchUpdate(documentId, reqs);
    if (r.status !== 200) return apiErr('docs.setTableCell', r.status, r.data);

    return okJson({
      ...base, cellStartIndex: start, deletedChars: Math.max(0, end - 1 - start),
      chars: newText.length, requests: reqs.length, previousText,
    });
  },
};
