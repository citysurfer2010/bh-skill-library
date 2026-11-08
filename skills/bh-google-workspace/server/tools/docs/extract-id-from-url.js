'use strict';
const { err, ok } = require('../../lib/gapi.js');

module.exports = { name: 'docs.extractIdFromUrl', description: 'Extrahiert die Dokument-ID aus einer Google Docs URL.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  handler: async ({ url }) => {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return err('Keine Dokument-ID in der URL gefunden.');
  return ok(m[1]);},
};
