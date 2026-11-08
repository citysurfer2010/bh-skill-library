'use strict';
const { gapiJSON, ok, err } = require('../../lib/gapi.js');

/**
 * docs.insertPageBreaks — Marker-Absätze in echte Seitenumbrüche verwandeln.
 *
 * Warum als eigenes Primitiv: Der HTML→Doc-Import von Drive ignoriert
 * `page-break-before:always` vollständig (gemessen 21.09.2026) — ein HTML mit
 * drei erzwungenen Umbrüchen landet als einseitiges Doc. Echte Umbrüche gibt es
 * nur über den insertPageBreak-Request der Docs-API.
 *
 * Ablauf: Das HTML enthält an jeder Bruchstelle einen Absatz, der NUR aus dem
 * Marker besteht. Dieses Tool sucht diese Absätze, löscht den Markertext und
 * setzt an derselben Stelle einen Seitenumbruch.
 *
 * Verarbeitet wird von HINTEN nach VORN: jede Änderung verschiebt alle
 * nachfolgenden Indizes, vorangehende bleiben gültig.
 */

const DEFAULT_MARKER = '%%BH_PAGEBREAK%%';

// Absätze im Body (nicht in Tabellen — ein Seitenumbruch in einer Zelle ist nicht erlaubt),
// deren Text exakt dem Marker entspricht.
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
    'Ersetzt Marker-Absätze in einem Google Doc durch echte Seitenumbrüche (Default-Marker %%BH_PAGEBREAK%%). ' +
    'Nötig, weil der HTML→Doc-Import von Drive page-break-before komplett ignoriert. ' +
    'Der Marker muss als eigener Absatz im Fließtext stehen, nicht in einer Tabellenzelle.',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Google-Doc-ID' },
      marker: { type: 'string', description: `Markertext, Default ${DEFAULT_MARKER}` },
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
      // Markertext entfernen, den Absatzumbruch selbst stehen lassen …
      if (h.endIndex - 1 > h.startIndex) {
        requests.push({ deleteContentRange: { range: { startIndex: h.startIndex, endIndex: h.endIndex - 1 } } });
      }
      // … und an dieselbe Stelle den Seitenumbruch setzen.
      requests.push({ insertPageBreak: { location: { index: h.startIndex } } });
    }

    const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, { requests });
    if (r.status !== 200) return err(`insertPageBreak fehlgeschlagen (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`);

    return ok(`${hits.length} Seitenumbruch/-brüche gesetzt (${documentId}).`);
  },
};
