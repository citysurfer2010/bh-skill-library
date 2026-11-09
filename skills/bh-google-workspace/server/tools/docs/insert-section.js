'use strict';
const { apiErr, err, gapiJSON, okJson } = require('../../lib/gapi.js');

/**
 * docs.insertSection — inserts paragraphs AND real tables at a text anchor,
 * optionally in a specific tab of a Google Doc.
 *
 * Why a separate tool (instead of docs.insertText):
 *   1. Tabs — docs.insertText/getText only know the first tab (legacy `body`).
 *      A BP doc has one tab per fiscal year; without tabId everything lands wrong.
 *   2. Tables — with insertTable the Docs API only creates an empty skeleton.
 *      The cells must be filled afterwards, and in DESCENDING
 *      index order, because every insert shifts all following indexes.
 *
 * Blocks are inserted in REVERSE order at the same anchor — so block 0
 * ends up on top, without indexes having to be tracked between the
 * blocks.
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

// Returns the content elements of the target tab (or the legacy body without tabId).
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

// Insert position = end of the paragraph containing the anchor.
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

// Finds the table starting at `index` (right after the insertTable call).
function findTableAt(content, index) {
  for (const el of content) {
    if (el.table && el.startIndex === index) return el;
  }
  // Fallback: first table from index onward
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

  // Fill cells: re-read positions AFTER creation, then insert in descending
  // order so earlier indexes stay valid.
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

  // Highlight the header row — filling has shifted the indexes,
  // so read again.
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
  description: 'Inserts paragraphs and real tables into a Google Doc — tab-aware (tabId from docs.listTabs) and at a text anchor (afterText) instead of a raw index. blocks: [{type:"paragraph",text,bold?} | {type:"table",header:[...],rows:[[...]]}]. skipIfContains prevents duplicate inserts on repeat runs.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string' },
      tabId: { type: 'string', description: 'Target tab (value after ?tab= in the URL). If omitted: first tab.' },
      afterText: { type: 'string', description: 'Text of the paragraph AFTER which to insert.' },
      index: { type: 'number', description: 'Alternative to afterText: explicit index.' },
      skipIfContains: { type: 'string', description: 'Idempotence guard: aborts if the tab already contains this text.' },
      blocks: { type: 'array', items: { type: 'object' }, description: 'Blocks in reading order.' },
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

    // If the anchor is the last paragraph, its endIndex points past the segment's
    // final newline — the Docs API refuses any insert there. Pull back to the
    // last valid position.
    const segmentEnd = content[content.length - 1]?.endIndex;
    if (segmentEnd != null && at >= segmentEnd) at = segmentEnd - 1;

    // Insert backwards — all blocks land at the same anchor.
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
