'use strict';
const { apiErr, gapiJSON, ok, okJson } = require('../../lib/gapi.js');
const { toBlockSet, dropBlockedDrives } = require('../../lib/protected-drives.js');

module.exports = { name: 'drive_list_shared_drives', description: 'Listet alle Shared Drives auf, auf die der Account Zugriff hat (mit IDs).', inputSchema: { type: 'object', properties: { pageSize: { type: 'number' }, format: { type: 'string', enum: ['text', 'json'], description: 'json liefert {drives:[{id,name}]} statt Text' } } },
  handler: async ({ pageSize = 50, format, _blockProtectedDrives }) => {
  const r = await gapiJSON('GET', `https://www.googleapis.com/drive/v3/drives?pageSize=${pageSize}`);
  if (r.status !== 200) return apiErr('drive_list_shared_drives', r.status, r.data);
  const drives = dropBlockedDrives(r.data.drives || [], toBlockSet(_blockProtectedDrives));
  if (format === 'json') return okJson({ drives });
  const lines = drives.map(d => `${d.name}: ${d.id}`).join('\n');
  return ok(lines || 'Keine Shared Drives.');},
};
