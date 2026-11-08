'use strict';
const { apiErr, err, gapiJSON, okJson } = require('../../lib/gapi.js');

/**
 * docs.insertSection — fuegt Absaetze UND echte Tabellen an einem Text-Anker ein,
 * optional in einem bestimmten Tab eines Google Docs.
 *
 * Warum ein eigenes Tool (statt docs.insertText):
 *   1. Tabs — docs.insertText/getText kennen nur den ersten Tab (legacy `body`).
 *      Ein BP-Doc hat pro Wirtschaftsjahr einen Tab; ohne tabId landet alles falsch.
 *   2. Tabellen — die Docs-API legt mit insertTable nur ein leeres Geruest an.
 *      Die Zellen muessen danach befuellt werden, und zwar in ABSTEIGENDER
 *      Index-Reihenfolge, weil jeder Insert alle nachfolgenden Indizes verschiebt.
 *
 * Bloecke werden in UMGEKEHRTER Reihenfolge am selben Anker eingefuegt — dadurch
 * steht am Ende Block 0 oben, ohne dass Indizes zwischen den Bloecken nachgefuehrt
 * werden muessen.
 */

const HEADER_BG = { red: 0.945, green: 0.953, blue: 0.961 }; // #F1F3F4

const DOC_URL = (id, q) => `https://docs.googleapis.com/v1/documents/${id}${q || ''}`;

async function fetchDoc(documentId) {
  return gapiJSON('GET', DOC_URL(documentId, '?includeTabsContent=true'));
}

function findTab(tabs, tabId) {
  for (const t of tabs || []) {
    if (t.tabProperties?.tabId === tabId) return t;
    const hit = findTab(t.childTabs, tabId);
    if (hit) return hit;
  }
  return null;
}

// Liefert die Content-Elemente des Ziel-Tabs (oder des Legacy-Body ohne tabId).
function resolveSegment(doc, tabId) {
  if (!tabId) {
    if (doc.body?.content) return doc.body.content;
    const first = (doc.tabs || [])[0];
    return first?.documentTab?.body?.content || null;
  }
  const tab = findTab(doc.tabs, tabId);
  return tab?.documentTab?.body?.content || null;
}

function paragraphText(el) {
  return (el.paragraph?.elements || []).map((pe) => pe.textRun?.content || '').join('');
}

function segmentText(content) {
  return (content || []).map(paragraphText).join('');
}

// Einfuegeposition = Ende des Absatzes, der den Anker enthaelt.
function anchorIndex(content, afterText) {
  const needle = afterText.trim();
  for (const el of content) {
    if (!el.paragraph) continue;
    if (paragraphText(el).replace(/\s+/g, ' ').includes(needle.replace(/\s+/g, ' '))) {
      return el.endIndex;
    }
  }
  return null;
}

function batchUpdate(documentId, requests) {
  return gapiJSON('POST', DOC_URL(documentId, ':batchUpdate'), { requests });
}

function loc(index, tabId) {
  return tabId ? { index, tabId } : { index };
}

function range(startIndex, endIndex, tabId) {
  return tabId ? { startIndex, endIndex, tabId } : { startIndex, endIndex };
}

// Sucht die Tabelle, die an `index` beginnt (direkt nach dem insertTable-Call).
function findTableAt(content, index) {
  for (const el of content) {
    if (el.table && el.startIndex === index) return el;
  }
  // Fallback: erste Tabelle ab index
  for (const el of content) {
    if (el.table && el.startIndex >= index) return el;
  }
  return null;
}

async function insertParagraph(documentId, tabId, index, block) {
  const text = `${block.text}\n`;
  const reqs = [{ insertText: { location: loc(index, tabId), text } }];
  if (block.bold) {
    reqs.push({
      updateTextStyle: {
        range: range(index, index + block.text.length, tabId),
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
  }
  return batchUpdate(documentId, reqs);
}

async function insertTable(documentId, tabId, index, block) {
  const rows = [];
  if (block.header) rows.push(block.header);
  for (const r of block.rows || []) rows.push(r);
  if (!rows.length) return { status: 200, data: {} };
  const columns = Math.max(...rows.map((r) => r.length));

  const created = await batchUpdate(documentId, [
    { insertTable: { location: loc(index, tabId), rows: rows.length, columns } },
  ]);
  if (created.status !== 200) return created;

  // Zellen befuellen: Positionen NACH dem Anlegen frisch lesen, dann absteigend
  // einfuegen, damit fruehere Indizes gueltig bleiben.
  const doc = await fetchDoc(documentId);
  if (doc.status !== 200) return doc;
  const table = findTableAt(resolveSegment(doc.data, tabId) || [], index);
  if (!table) return { status: 500, data: { error: { message: 'Tabelle nach insertTable nicht gefunden' } } };

  const cells = [];
  (table.table.tableRows || []).forEach((row, ri) => {
    (row.tableCells || []).forEach((cell, ci) => {
      const start = cell.content?.[0]?.startIndex;
      const text = (rows[ri] || [])[ci];
      if (start != null && text) cells.push({ start, text: String(text), ri });
    });
  });
  cells.sort((a, b) => b.start - a.start);

  const fill = cells.map((c) => ({ insertText: { location: loc(c.start, tabId), text: c.text } }));
  if (fill.length) {
    const r = await batchUpdate(documentId, fill);
    if (r.status !== 200) return r;
  }

  // Kopfzeile hervorheben — Indizes haben sich durch das Befuellen verschoben,
  // deshalb erneut lesen.
  if (block.header) {
    const doc2 = await fetchDoc(documentId);
    const t2 = findTableAt(resolveSegment(doc2.data, tabId) || [], index);
    const styleReqs = [];
    const headRow = t2?.table?.tableRows?.[0];
    (headRow?.tableCells || []).forEach((cell) => {
      const c0 = cell.content?.[0];
      const s = c0?.startIndex;
      const e = c0?.endIndex;
      if (s != null && e != null && e > s + 1) {
        styleReqs.push({
          updateTextStyle: { range: range(s, e - 1, tabId), textStyle: { bold: true }, fields: 'bold' },
        });
      }
    });
    if (t2) {
      styleReqs.push({
        updateTableCellStyle: {
          tableRange: {
            tableCellLocation: { tableStartLocation: loc(t2.startIndex, tabId), rowIndex: 0, columnIndex: 0 },
            rowSpan: 1,
            columnSpan: (headRow?.tableCells || []).length,
          },
          tableCellStyle: { backgroundColor: { color: { rgbColor: HEADER_BG } } },
          fields: 'backgroundColor',
        },
      });
    }
    if (styleReqs.length) await batchUpdate(documentId, styleReqs);
  }
  return { status: 200, data: {} };
}

module.exports = {
  name: 'docs.insertSection',
  description: 'Fuegt Absaetze und echte Tabellen in ein Google Doc ein — tab-faehig (tabId aus docs.listTabs) und an einem Text-Anker (afterText) statt an einem rohen Index. blocks: [{type:"paragraph",text,bold?} | {type:"table",header:[...],rows:[[...]]}]. skipIfContains verhindert Doppel-Einfuegungen bei Wiederholungslaeufen.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Ziel-Tab (Wert hinter ?tab= in der URL). Ohne Angabe: erster Tab.' },
      afterText: { type: 'string', description: 'Text des Absatzes, NACH dem eingefuegt wird.' },
      index: { type: 'number', description: 'Alternative zu afterText: expliziter Index.' },
      skipIfContains: { type: 'string', description: 'Idempotenz-Guard: bricht ab, wenn der Tab diesen Text schon enthaelt.' },
      blocks: { type: 'array', items: { type: 'object' }, description: 'Bloecke in Lesereihenfolge.' },
    },
    required: ['documentId', 'blocks'],
  },
  handler: async ({ documentId, tabId, afterText, index, skipIfContains, blocks }) => {
    if (!Array.isArray(blocks) || !blocks.length) return err('docs.insertSection: blocks ist leer.');

    const doc = await fetchDoc(documentId);
    if (doc.status !== 200) return apiErr('docs.insertSection', doc.status, doc.data);

    const content = resolveSegment(doc.data, tabId);
    if (!content) return err(`docs.insertSection: Tab ${tabId || '(erster)'} nicht gefunden.`);

    if (skipIfContains && segmentText(content).includes(skipIfContains)) {
      return okJson({ skipped: true, reason: `Tab enthaelt bereits "${skipIfContains}" — nichts eingefuegt.` });
    }

    let at = index;
    if (at == null) {
      if (!afterText) return err('docs.insertSection: afterText oder index noetig.');
      at = anchorIndex(content, afterText);
      if (at == null) return err(`docs.insertSection: Anker "${afterText}" im Tab nicht gefunden.`);
    }

    // Ist der Anker der letzte Absatz, zeigt sein endIndex hinter das abschliessende
    // Newline des Segments — dort verweigert die Docs-API jedes Insert. Auf die
    // letzte gueltige Position zurueckziehen.
    const segmentEnd = content[content.length - 1]?.endIndex;
    if (segmentEnd != null && at >= segmentEnd) at = segmentEnd - 1;

    // Rueckwaerts einfuegen — alle Bloecke landen am selben Anker.
    const done = [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const r = b.type === 'table'
        ? await insertTable(documentId, tabId, at, b)
        : await insertParagraph(documentId, tabId, at, b);
      if (r.status !== 200) return apiErr(`docs.insertSection (Block ${i}, ${b.type})`, r.status, r.data);
      done.unshift(b.type);
    }

    return okJson({ documentId, tabId: tabId || null, anchorIndex: at, inserted: done });
  },
};
