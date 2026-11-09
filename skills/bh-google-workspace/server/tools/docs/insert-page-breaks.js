'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.insertPageBreaks — turns marker paragraphs into real page breaks.
 *
 * Why a separate primitive: Drive's HTML→Doc import ignores
 * `page-break-before:always` completely (measured 21.09.2026) — an HTML with
 * three forced breaks ends up as a one-page doc. Real breaks exist
 * only via the Docs API's insertPageBreak request.
 *
 * Flow: at each break point the HTML contains a paragraph consisting ONLY of the
 * marker. This tool finds these paragraphs, deletes the marker text and
 * inserts a page break at the same position.
 *
 * Processing runs from BACK to FRONT: every change shifts all
 * following indexes, preceding ones stay valid.
 */

const DEFAULT_MARKER = '%%BH_PAGEBREAK%%';

// Paragraphs in the body (not in tables — a page break inside a cell is not allowed)
// whose text exactly equals the marker.
function findMarkerParagraphs(doc, marker) {
  const hits = [];
  for (const el of (doc.body?.content || [])) {
    if (!el.paragraph) continue;
    const text = (el.paragraph.elements || []).map(p => p.textRun?.content || '').join('');
    if (text.replace(/\n$/, '').trim() !== marker) continue;
    hits.push({ startIndex: el.startIndex, endIndex: el.endIndex });
  }
  return hits;
}

module.exports = {
  name: 'docs.insertPageBreaks',
  description:
    'Replaces marker paragraphs in a Google Doc with real page breaks (default marker %%BH_PAGEBREAK%%). ' +
    'Needed because the Drive HTML→Doc import ignores page-break-before completely. ' +
    'The marker must be its own paragraph in the body text, not in a table cell.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google Doc ID' },
      marker: { type: 'string', description: `Marker text, default ${DEFAULT_MARKER}` },
    },
    required: ['documentId'],
  },
  handler: async ({ documentId, marker }) => {
    if (!documentId) return err('documentId fehlt.');
    const mark = marker || DEFAULT_MARKER;

    const doc = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}`);
    if (doc.status !== 200) return err(`Dokument nicht lesbar (${doc.status}).`);

    const hits = findMarkerParagraphs(doc.data, mark);
    if (!hits.length) return ok(`Keine Marker "${mark}" gefunden — nichts geändert.`);

    const requests = [];
    for (const h of hits.slice().reverse()) {
      // Remove the marker text, keep the paragraph break itself …
      if (h.endIndex - 1 > h.startIndex) {
        requests.push({ deleteContentRange: { range: { startIndex: h.startIndex, endIndex: h.endIndex - 1 } } });
      }
      // … and put the page break at the same position.
      requests.push({ insertPageBreak: { location: { index: h.startIndex } } });
    }

    const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, { requests });
    if (r.status !== 200) return err(`insertPageBreak fehlgeschlagen (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`);

    return ok(`${hits.length} Seitenumbruch/-brüche gesetzt (${documentId}).`);
  },
};
