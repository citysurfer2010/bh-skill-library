'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, resolveSegment, resolveTabId, findTabByTitle,
  cellText, hexToRgb, norm, resolveTable, resolveRow, insertedTextStyleRequests,
} = require('../../lib/docs-tabs.js');

/**
 * docs.appendToTableCell — haengt Text ans Ende EINER Tabellenzelle an.
 *
 * Gegenstueck zu docs.appendTableRow: dort eine neue Zeile, hier ein Nachtrag in
 * eine bestehende. Der BP-Doc-Fall ist die Spalte "Verlauf/To" — ein laufendes
 * Protokoll, in das Coordinator-Entscheide und Nachweise nachgetragen werden,
 * ohne den Eintrag der Kollegen zu ueberschreiben.
 *
 * Drei Details, die sonst schiefgehen:
 *   1. TABS — ohne includeTabsContent=true (lib/docs-tabs.js) schreibt man still
 *      in den ersten Tab, also ins falsche Wirtschaftsjahr.
 *   2. EINFUEGEPUNKT — ans Zellenende gehoert der Insert auf endIndex-1 des
 *      letzten Absatzes: auf endIndex selbst liegt schon der Absatzmarker der
 *      naechsten Zelle, dort verweigert die API den Insert.
 *   3. ZEILE UEBER INHALT FINDEN — rowIndex verschiebt sich, sobald jemand eine
 *      Zeile einfuegt. rowMatchColumn/rowMatchValue trifft die Zeile am Inhalt.
 */

module.exports = {
  name: 'docs.appendToTableCell',
  description: 'Haengt Text ans Ende einer bestehenden Tabellenzelle an (ohne den vorhandenen Inhalt zu ueberschreiben) — tab-faehig. Zeile per rowIndex oder inhaltsbasiert per rowMatchColumn/rowMatchValue. Optional Farbe (color, z. B. "#D63384" fuer AI-Eintraege) und linkify fuer klickbare URLs. Idempotent ueber skipIfContains.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Ziel-Tab (s. docs.listTabs). Ohne Angabe: erster Tab.' },
      tabTitle: { type: 'string', description: 'Alternative zu tabId: Tab-Titel exakt.' },
      tableIndex: { type: 'number', description: '0-basierter Index der Tabelle im Tab (default 0).' },
      tableWithHeader: { type: 'string', description: 'Alternative zu tableIndex: Text in der Kopfzeile.' },
      rowIndex: { type: 'number', description: '0-basierte Zeile (0 = Kopfzeile).' },
      rowMatchColumn: { type: 'number', description: 'Statt rowIndex: Spalte, in der gesucht wird (z. B. 3 = Thema).' },
      rowMatchValue: { type: 'string', description: 'Gesuchter Zellinhalt in rowMatchColumn (exakt, whitespace-tolerant).' },
      columnIndex: { type: 'number', description: 'Zielspalte, z. B. 6 = Verlauf/To.' },
      text: { type: 'string', description: 'Anzuhaengender Text. Fuehrende Leerzeile selbst setzen, wenn gewuenscht.' },
      color: { type: 'string', description: 'Hex-Farbe fuer den angehaengten Text, z. B. "#D63384".' },
      linkify: { type: 'boolean', description: 'URLs im angehaengten Text klickbar machen.' },
      skipIfContains: { type: 'string', description: 'Idempotenz: nichts tun, wenn die Zelle diesen Text schon enthaelt.' },
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

    // Ans Zellenende: endIndex des letzten Absatzes minus 1.
    const last = (cell.content || [])[(cell.content || []).length - 1];
    const at = last?.endIndex != null ? last.endIndex - 1 : cell.content?.[0]?.startIndex;
    if (at == null) return err('docs.appendToTableCell: Einfuegeposition nicht bestimmbar.');

    // Insert + Styles in EINEM batchUpdate — die Requests wirken sequenziell,
    // die Style-Ranges gelten also fuer den bereits eingefuegten Text.
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
