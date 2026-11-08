'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'docs.move', description: 'Verschiebt ein Google Docs Dokument in einen anderen Ordner.', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, newParentId: { type: 'string' }, oldParentId: { type: 'string' } }, required: ['documentId', 'newParentId'] },
  handler: async ({ documentId, newParentId, oldParentId }) => {
  let url = `https://www.googleapis.com/drive/v3/files/${documentId}?supportsAllDrives=true&addParents=${newParentId}`;
  if (oldParentId) url += `&removeParents=${oldParentId}`;
  const r = await gapiJSON('PATCH', url, {});
  if (r.status !== 200) return apiErr('docs.move', r.status, r.data);
  return ok(`Dokument ${documentId} verschoben nach ${newParentId}.`);},
};
