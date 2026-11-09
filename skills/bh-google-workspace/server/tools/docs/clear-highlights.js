'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

/**
 * Removes all text background colors (yellow template highlights) from
 * a Google Doc — used by the Property OS writer after filling the
 * letter template. (Previously a direct call in the web app — architecture rule
 * 2026-06-07: web apps ALWAYS go through the MCP servers.)
 */
module.exports = { name: 'docs.clearHighlights', description: 'Removes all text background colors (highlights) from a Google Docs document.', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] },
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
