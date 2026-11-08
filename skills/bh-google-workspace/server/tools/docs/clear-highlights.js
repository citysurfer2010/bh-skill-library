'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

/**
 * Entfernt alle Text-Hintergrundfarben (gelbe Vorlagen-Markierungen) aus
 * einem Google Doc — genutzt vom Property-OS-Writer nach dem Befüllen der
 * Briefvorlage. (Vorher Direkt-Call in der Web-App — Architektur-Regel
 * 2026-06-07: Web-Apps gehen IMMER über die MCP-Server.)
 */
module.exports = { name: 'docs.clearHighlights', description: 'Entfernt alle Text-Hintergrundfarben (Markierungen) aus einem Google Docs Dokument.', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] },
  handler: async ({ documentId }) => {
    const doc = await gapiJSON('GET', `https://docs.googleapis.com/v1/documents/${documentId}`);
    if (doc.status !== 200) return apiErr('docs.clearHighlights', doc.status, doc.data);
    const body = doc.data.body && doc.data.body.content;
    const endIndex = (body && body.length && body[body.length - 1].endIndex) || 1;
    if (endIndex <= 2) return ok('Dokument leer — keine Markierungen zu entfernen.');
    const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      requests: [{ updateTextStyle: { range: { startIndex: 1, endIndex: endIndex - 1 }, textStyle: { backgroundColor: {} }, fields: 'backgroundColor' } }],
    });
    if (r.status !== 200) return apiErr('docs.clearHighlights', r.status, r.data);
    return ok(`Markierungen entfernt (Index 1–${endIndex - 1}).`);
  },
};
