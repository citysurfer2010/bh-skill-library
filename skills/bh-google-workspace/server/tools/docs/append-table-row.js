'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, resolveSegment, resolveTabId,
  findTabByTitle, tablesIn, rowTexts, hexToRgb, rowStyleRequests,
} = require('../../lib/docs-tabs.js');

/**
 * docs.appendTableRow — haengt EINE Zeile an eine bestehende Tabelle an.
 *
 * Gebaut fuer den BP-Doc-Uebertrag: pro Belegpruefungs-Frage eine Tabellenzeile
 * im Tab des Wirtschaftsjahres. Drei Dinge, an denen der naive Weg scheitert:
 *
 *   1. TABS — `documents.get` liefert `tabs[]` nur mit includeTabsContent=true
 *      (s. lib/docs-tabs.js). Ohne das landet man im ersten Tab und schreibt
 *      ins falsche Wirtschaftsjahr, ohne dass die API meckert.
 *
 *   2. ZELLEN VON HINTEN — insertTableRow legt nur ein leeres Geruest an. Jeder
 *      insertText verschiebt ALLE nachfolgenden Indizes, also muessen die Zellen
 *      in ABSTEIGENDER Index-Reihenfolge befuellt werden. Vorwaerts befuellt
 *      landet Zelle 2 mitten in Zelle 1.
 *
 *   3. IDEMPOTENZ — an einem BP-Doc arbeiten mehrere Personen parallel und
 *      Uebertraege werden wiederholt. Vor dem Schreiben wird geprueft, ob es die
 *      Zeile schon gibt (per dedupeColumn, sonst ueber die ganze Zeile).
 *      `force: true` hebt den Schutz auf.
 */

// Whitespace-tolerant vergleichen: Docs normalisiert Umbrueche/NBSP in Zellen.
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

// Findet die Tabelle nach dem insertTableRow erneut: Indizes haben sich verschoben,
// die Position in der Tabellen-Reihenfolge des Tabs aber nicht.
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
  description: 'Haengt eine Zeile an eine bestehende Tabelle in einem Google Doc an — tab-faehig (tabId aus docs.listTabs, sonst erster Tab). Tabelle per tableIndex (0-basiert im Tab) oder tableWithHeader (Text in der Kopfzeile). Zellen werden intern von hinten nach vorne befuellt, damit die Indizes stimmen. Idempotent: eine bereits vorhandene Zeile wird uebersprungen (dedupeColumn = Spaltenindex fuer den Vergleich, sonst ganze Zeile; force:true schreibt trotzdem).',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Ziel-Tab (Wert hinter ?tab= in der URL, s. docs.listTabs). Ohne Angabe: erster Tab.' },
      tabTitle: { type: 'string', description: 'Alternative zu tabId: Tab-Titel exakt, z. B. "2025er Belegpruefung".' },
      tableIndex: { type: 'number', description: '0-basierter Index der Tabelle innerhalb des Tabs (default 0).' },
      tableWithHeader: { type: 'string', description: 'Alternative zu tableIndex: Tabelle, deren Kopfzeile diesen Text enthaelt.' },
      cells: { type: 'array', items: { type: 'string' }, description: 'Zellinhalte der neuen Zeile, in Spaltenreihenfolge.' },
      dedupeColumn: { type: 'number', description: 'Spaltenindex fuer die Doppel-Pruefung (z. B. 3 = Thema). Ohne Angabe wird die ganze Zeile verglichen.' },
      force: { type: 'boolean', description: 'Idempotenz-Schutz abschalten und in jedem Fall anhaengen.' },
      color: { type: 'string', description: 'Hex-Farbe fuer den eingefuegten Text, z. B. "#D63384" (Pink = AI-Eintrag im BP-Doc).' },
      linkify: { type: 'boolean', description: 'URLs im eingefuegten Text klickbar machen. Per API eingefuegter Text wird sonst NICHT verlinkt.' },
    },
    required: ['documentId', 'cells'],
  },

  handler: async ({ documentId, tabId, tabTitle, tableIndex, tableWithHeader, cells, dedupeColumn, force, color, linkify }) => {
    if (!Array.isArray(cells) || !cells.length) return err('docs.appendTableRow: cells ist leer.');

    const doc = await fetchDoc(documentId);
    if (doc.status !== 200) return apiErr('docs.appendTableRow (get)', doc.status, doc.data);

    // Tab aufloesen — tabTitle ist nur Komfort ueber der tabId.
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

    // 1) Leere Zeile unter der letzten Zeile anlegen.
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

    // 2) Positionen der neuen Zellen frisch lesen — der Insert hat alle Indizes verschoben.
    const doc2 = await fetchDoc(documentId);
    if (doc2.status !== 200) return apiErr('docs.appendTableRow (reget)', doc2.status, doc2.data);
    const table2 = tableAtPosition(resolveSegment(doc2.data, targetTabId) || [], position);
    if (!table2) return err('docs.appendTableRow: Tabelle nach insertTableRow nicht wiedergefunden.');

    const newRow = (table2.table.tableRows || [])[lastRow + 1];
    if (!newRow) return err('docs.appendTableRow: neue Zeile nach insertTableRow nicht gefunden.');

    // 3) Zellen ABSTEIGEND nach Index befuellen — sonst verschiebt jeder Insert die
    //    Startposition der jeweils folgenden Zelle.
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

    // 4) Farbe + Links — braucht die Indizes NACH dem Befuellen, also neu lesen.
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
