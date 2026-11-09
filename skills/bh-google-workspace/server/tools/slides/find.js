'use strict';
const { DRIVE_FIELDS } = require('../../lib/drive-helpers.js');
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

module.exports = { name: 'slides.find', description: 'Finds Google Slides presentations by name.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, driveId: { type: 'string' } } },
  handler: async ({ query, driveId }) => {
  let q = `mimeType='application/vnd.google-apps.presentation' and trashed=false`;
  if (query) q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
  let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  if (driveId) url += `&corpora=drive&driveId=${driveId}`;
  const r = await gapiJSON('GET', url);
  if (r.status !== 200) return apiErr('slides.find', r.status, r.data);
  const files = r.data.files || [];
  if (!files.length) return ok('Keine Präsentationen gefunden.');
  const lines = files.map(f => `${f.name} (${f.id})`).join('\n');
  return ok(`${files.length} Präsentation(en):\n\n${lines}`);},
};
