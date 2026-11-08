'use strict';
const { apiErr, err, okJson } = require('../../lib/gapi.js');
const {
  fetchDoc, batchUpdate, loc, range, resolveSegment, resolveTabId, findTabByTitle,
  contentText, cellText, hexToRgb, norm, resolveTable, resolveRow, insertedTextStyleRequests,
} = require('../../lib/docs-tabs.js');

/**
 * docs.setTableCell — ersetzt den Inhalt EINER Tabellenzelle (Zell-Reset).
 *
 * Gegenstueck zu docs.appendToTableCell (haengt nur an) und docs.replaceText
 * (dokumentweit, kann keine Absatzumbrueche einfuegen). Der BP-Doc-Fall ist der
 * Re-Write der Antwortspalte aus der DB: answer_text ist fast immer mehrabsaetzig,
 * mit replaceText entsteht daraus eine Textwand (Uebertrag 300095/2025).
 *
 * Ablauf in EINEM batchUpdate (Requests wirken sequenziell):
 *   1. deleteContentRange [Start erster Absatz, Ende letzter Absatz - 1) — der
 *      letzte Absatzmarker einer Zelle ist nicht loeschbar, die API lehnt sonst ab.
 *   2. insertText am Zellanfang; "\n" im Text erzeugt echte Absaetze.
 *   3. Farbe/Link/Unterstreichung auf dem neuen Text zuruecksetzen — Docs erbt
 *      sonst den Stil des geloeschten Inhalts (z. B. AI-Pink auf Kollegentext).
 *   4. optional color + linkify wie bei appendToTableCell.
 *
 * Schutz vor fremder Arbeit: expectContains bricht ab, wenn die Zelle den
 * erwarteten Alt-Stand nicht (mehr) enthaelt. skipIfEquals macht den Aufruf
 * idempotent. previousText in der Antwort haelt den ueberschriebenen Stand fest.
 */

module.exports = {
  name: 'docs.setTableCell',
  description: 'Ersetzt den gesamten Inhalt einer bestehenden Tabellenzelle (Zelle leeren + neu setzen) — tab-faehig. "\\n" im Text erzeugt echte Absaetze. Zeile per rowIndex oder inhaltsbasiert per rowMatchColumn/rowMatchValue, Tabelle per tableIndex, tableStartIndex oder tableWithHeader. expectContains schuetzt vor dem Ueberschreiben fremder Aenderungen, skipIfEquals macht den Aufruf idempotent. Optional color und linkify. Antwort enthaelt previousText.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Ziel-Tab (s. docs.listTabs). Ohne Angabe: erster Tab.' },
      tabTitle: { type: 'string', description: 'Alternative zu tabId: Tab-Titel exakt.' },
      tableIndex: { type: 'number', description: '0-basierter Index der Tabelle im Tab (default 0).' },
      tableStartIndex: { type: 'number', description: 'Alternative zu tableIndex: startIndex der Tabelle aus documents.get.' },
      tableWithHeader: { type: 'string', description: 'Alternative zu tableIndex: Text in der Kopfzeile.' },
      rowIndex: { type: 'number', description: '0-basierte Zeile (0 = Kopfzeile).' },
      rowMatchColumn: { type: 'number', description: 'Statt rowIndex: Spalte, in der gesucht wird (default 3 = Thema).' },
      rowMatchValue: { type: 'string', description: 'Gesuchter Zellinhalt in rowMatchColumn (exakt, whitespace-tolerant).' },
      columnIndex: { type: 'number', description: '0-basierte Zielspalte, z. B. 7 = Antwort.' },
      text: { type: 'string', description: 'Neuer Zellinhalt. "\\n" = neuer Absatz. Leerer String leert die Zelle. Abschliessende Zeilenumbrueche werden entfernt.' },
      expectContains: { type: 'string', description: 'Schutz: nur schreiben, wenn die Zelle diesen Text enthaelt (whitespace-tolerant) — sonst Abbruch ohne Schreibzugriff.' },
      skipIfEquals: { type: 'boolean', description: 'Idempotenz: nichts tun, wenn die Zelle bereits genau diesen Text enthaelt (whitespace-tolerant).' },
      color: { type: 'string', description: 'Hex-Farbe fuer den neuen Text, z. B. "#D63384". Ohne Angabe: Standardfarbe.' },
      linkify: { type: 'boolean', description: 'URLs im neuen Text klickbar machen.' },
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
    // Letzter Absatzmarker der Zelle bleibt stehen (end - 1).
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
