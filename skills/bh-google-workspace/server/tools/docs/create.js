'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'docs.create', description: 'Creates a new Google Docs document.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title'] },
  handler: async ({ title, content }) => {
  const r = await gapiJSON('POST', 'https://docs.googleapis.com/v1/documents', { title });
  if (r.status !== 200) return apiErr('docs.create', r.status, r.data);
  const docId = r.data.documentId;
  if (content) {
    await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      requests: [{ insertText: { location: { index: 1 }, text: content } }]
    });
  }
  return ok(`Dokument erstellt: ${r.data.title}\nID: ${docId}\nLink: https://docs.google.com/document/d/${docId}`);},
};
