'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, resolveSegment, resolveTabId,
  findTabByTitle, tablesIn, rowTexts, hexToRgb, rowStyleRequests,
} = require('../../lib/docs-tabs.js');

/**
 * docs.appendTableRow — appends ONE row to an existing table.
 *
 * Built for the BP doc transfer: one table row per audit question
 * in the fiscal year's tab. Three things the naive approach fails on:
 *
 *   1. TABS — `documents.get` returns `tabs[]` only with includeTabsContent=true
 *      (see lib/docs-tabs.js). Without it you land in the first tab and write
 *      into the wrong fiscal year without the API complaining.
 *
 *   2. CELLS FROM THE BACK — insertTableRow only creates an empty skeleton. Every
 *      insertText shifts ALL following indexes, so the cells must be
 *      filled in DESCENDING index order. Filled forwards,
 *      cell 2 ends up in the middle of cell 1.
 *
 *   3. IDEMPOTENCE — several people work on a BP doc in parallel and
 *      transfers get repeated. Before writing we check whether the
 *      row already exists (via dedupeColumn, else across the whole row).
 *      `force: true` disables the guard.
 */

// Compare whitespace-tolerantly: Docs normalizes line breaks/NBSP in cells.
function norm(s) {
  return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolveTable(content, tableIndex, tableWithHeader) {
  const tables = tablesIn(content);
  if (!tables.length) return { error: 'Im Ziel-Tab gibt es keine Tabelle.' };

  if (tableWithHeader) {
    const want = norm(tableWithHeader);
    const hit = tables.findIndex((t) => rowTexts(t.table.tableRows?.[0] || {}).some((c) => norm(c).includes(want)));
    if (hit === -1) {
      const heads = tables.map((t, i) => `#${i}: ${rowTexts(t.table.tableRows?.[0] || {}).join(' | ').substring(0, 80)}`);
      return { error: `Keine Tabelle mit Kopfzeile "${tableWithHeader}". Vorhanden:\n${heads.join('\n')}` };
    }
    return { table: tables[hit], tableIndex: hit, count: tables.length };
  }

  const idx = tableIndex == null ? 0 : tableIndex;
  if (idx < 0 || idx >= tables.length) {
    return { error: `tableIndex ${idx} ausserhalb des Bereichs — der Tab hat ${tables.length} Tabelle(n) (0..${tables.length - 1}).` };
  }
  return { table: tables[idx], tableIndex: idx, count: tables.length };
}

// Finds the table again after insertTableRow: indexes have shifted,
// but its position in the tab's table order has not.
function tableAtPosition(content, position) {
  return tablesIn(content)[position] || null;
}


function duplicateRow(table, cells, dedupeColumn) {
  const rows = table.table.tableRows || [];
  for (let i = 0; i < rows.length; i++) {
    const texts = rowTexts(rows[i]);
    if (dedupeColumn != null) {
      const want = norm(cells[dedupeColumn]);
      if (want && norm(texts[dedupeColumn]) === want) return { rowIndex: i, matchedOn: `Spalte ${dedupeColumn}` };
    } else {
      const want = cells.map(norm).filter(Boolean).join(' | ');
      if (want && texts.map(norm).filter(Boolean).join(' | ') === want) return { rowIndex: i, matchedOn: 'gesamte Zeile' };
    }
  }
  return null;
}

module.exports = {
  name: 'docs.appendTableRow',
  description: 'Appends a row to an existing table in a Google Doc — tab-aware (tabId from docs.listTabs, else first tab). Table via tableIndex (0-based within the tab) or tableWithHeader (text in the header row). Cells are filled internally from back to front so the indexes stay correct. Idempotent: an existing row is skipped (dedupeColumn = column index for the comparison, else whole row; force:true writes anyway).',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Target tab (value after ?tab= in the URL, see docs.listTabs). If omitted: first tab.' },
      tabTitle: { type: 'string', description: 'Alternative to tabId: exact tab title, e.g. "2025er Belegpruefung".' },
      tableIndex: { type: 'number', description: '0-based index of the table within the tab (default 0).' },
      tableWithHeader: { type: 'string', description: 'Alternative to tableIndex: table whose header row contains this text.' },
      cells: { type: 'array', items: { type: 'string' }, description: 'Cell contents of the new row, in column order.' },
      dedupeColumn: { type: 'number', description: 'Column index for the duplicate check (e.g. 3 = topic). If omitted, the whole row is compared.' },
      force: { type: 'boolean', description: 'Disable the idempotence guard and append in any case.' },
      color: { type: 'string', description: 'Hex color for the inserted text, e.g. "#D63384" (pink = AI entry in the BP doc).' },
      linkify: { type: 'boolean', description: 'Make URLs in the inserted text clickable. Text inserted via the API is otherwise NOT linked.' },
    },
    required: ['documentId', 'cells'],
  },

  handler: async ({ documentId, tabId, tabTitle, tableIndex, tableWithHeader, cells, dedupeColumn, force, color, linkify }) => {
    if (!Array.isArray(cells) || !cells.length) return err('docs.appendTableRow: cells ist leer.');

    const doc = await fetchDoc(documentId);
    if (doc.status !== 200) return apiErr('docs.appendTableRow (get)', doc.status, doc.data);

    // Resolve the tab — tabTitle is only a convenience on top of tabId.
    let targetTabId = tabId;
    if (!targetTabId && tabTitle) {
      const t = findTabByTitle(doc.data.tabs, tabTitle);
      if (!t) return err(`docs.appendTableRow: Tab "${tabTitle}" nicht gefunden.`);
      targetTabId = t.tabProperties.tabId;
    }
    targetTabId = resolveTabId(doc.data, targetTabId);

    const content = resolveSegment(doc.data, targetTabId);
    if (!content) return err(`docs.appendTableRow: Tab ${targetTabId || '(erster)'} nicht gefunden.`);

    const found = resolveTable(content, tableIndex, tableWithHeader);
    if (found.error) return err(`docs.appendTableRow: ${found.error}`);
    const { table, tableIndex: position } = found;

    const columns = (table.table.tableRows?.[0]?.tableCells || []).length;
    if (cells.length > columns) {
      return err(`docs.appendTableRow: ${cells.length} Zellen uebergeben, die Tabelle hat aber nur ${columns} Spalten.`);
    }

    if (!force) {
      const dup = duplicateRow(table, cells, dedupeColumn);
      if (dup) {
        return okJson({
          skipped: true, reason: 'Zeile existiert bereits', matchedOn: dup.matchedOn,
          existingRowIndex: dup.rowIndex, documentId, tabId: targetTabId, tableIndex: position,
        });
      }
    }

    // 1) Create an empty row below the last row.
    const lastRow = (table.table.tableRows || []).length - 1;
    if (lastRow < 0) return err('docs.appendTableRow: Tabelle hat keine Zeilen.');
    const ins = await batchUpdate(documentId, [{
      insertTableRow: {
        tableCellLocation: {
          tableStartLocation: loc(table.startIndex, targetTabId),
          rowIndex: lastRow,
          columnIndex: 0,
        },
        insertBelow: true,
      },
    }]);
    if (ins.status !== 200) return apiErr('docs.appendTableRow (insertTableRow)', ins.status, ins.data);

    // 2) Re-read the new cells' positions — the insert has shifted all indexes.
    const doc2 = await fetchDoc(documentId);
    if (doc2.status !== 200) return apiErr('docs.appendTableRow (reget)', doc2.status, doc2.data);
    const table2 = tableAtPosition(resolveSegment(doc2.data, targetTabId) || [], position);
    if (!table2) return err('docs.appendTableRow: Tabelle nach insertTableRow nicht wiedergefunden.');

    const newRow = (table2.table.tableRows || [])[lastRow + 1];
    if (!newRow) return err('docs.appendTableRow: neue Zeile nach insertTableRow nicht gefunden.');

    // 3) Fill cells in DESCENDING index order — otherwise every insert shifts the
    //    start position of the next cell.
    const writes = [];
    (newRow.tableCells || []).forEach((cell, ci) => {
      const start = cell.content?.[0]?.startIndex;
      const text = cells[ci];
      if (start != null && text != null && String(text).length) {
        writes.push({ start, text: String(text) });
      }
    });
    writes.sort((a, b) => b.start - a.start);

    if (writes.length) {
      const fill = await batchUpdate(documentId, writes.map((w) => ({
        insertText: { location: loc(w.start, targetTabId), text: w.text },
      })));
      if (fill.status !== 200) return apiErr('docs.appendTableRow (insertText)', fill.status, fill.data);
    }

    // 4) Color + links — need the indexes AFTER filling, so read again.
    const rgb = hexToRgb(color);
    let styled = 0;
    if ((rgb || linkify) && writes.length) {
      const doc3 = await fetchDoc(documentId);
      if (doc3.status !== 200) return apiErr('docs.appendTableRow (style-get)', doc3.status, doc3.data);
      const t3 = tableAtPosition(resolveSegment(doc3.data, targetTabId) || [], position);
      const row3 = (t3?.table?.tableRows || [])[lastRow + 1];
      if (row3) {
        const reqs = rowStyleRequests(row3, targetTabId, rgb, linkify);
        if (reqs.length) {
          const st = await batchUpdate(documentId, reqs);
          if (st.status !== 200) return apiErr('docs.appendTableRow (style)', st.status, st.data);
          styled = reqs.length;
        }
      }
    }

    return okJson({
      documentId,
      tabId: targetTabId,
      tableIndex: position,
      rowIndex: lastRow + 1,
      cellsWritten: writes.length,
      columns,
      styleRequests: styled,
    });
  },
};
