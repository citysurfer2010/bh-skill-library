'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'docs.replaceText', description: 'Replaces text in a Google Docs document.', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' } }, required: ['documentId', 'find', 'replace'] },
  handler: async ({ documentId, find, replace }) => {
  const r = await gapiJSON('POST', `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    requests: [{ replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace } }]
  });
  if (r.status !== 200) return apiErr('docs.replaceText', r.status, r.data);
  const count = r.data.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
  return ok(`${count} Vorkommen von "${find}" ersetzt.`);},
};
