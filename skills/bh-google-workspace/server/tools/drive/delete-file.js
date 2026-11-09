'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');

// Deletes a file or folder in Google Drive.
//   - Default (permanent unset/false): trash (PATCH trashed=true) —
//     reversible (~30 days). Safe default.
//   - permanent:true: hard delete (DELETE). Hard delete fails on
//     Shared Drives with 404/403 if the account is only "Contributor"
//     (Drive masks missing rights as notFound). Fallback: trash.
//     Incident 2026-06-05: >1000 leftover _test_* folders because the test cleanup
//     swallowed the silent 404.
module.exports = { name: 'drive_delete_file', description: 'Deletes a file or folder in Google Drive. Default: trash (trashed=true, reversible). permanent:true = hard delete (files.delete) with trash fallback if hard delete is not allowed on Shared Drives.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, permanent: { type: 'boolean', description: 'true = delete permanently (files.delete). Default false = trash (reversible).' } }, required: ['fileId'] },
  handler: async ({ fileId, permanent }) => {
  const trash = async (note) => {
    const t = await gapiJSON('PATCH', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, { trashed: true });
    if (t.status === 200) return ok(JSON.stringify({ fileId, state: 'trashed', ...(note ? { note } : {}) }));
    return apiErr('drive_delete_file', t.status, t.data);
  };
  // Safe default: trash.
  if (!permanent) return trash();
  // Hard delete with trash fallback.
  const r = await gapiJSON('DELETE', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`);
  if (r.status === 204 || r.status === 200) return ok(JSON.stringify({ fileId, state: 'deleted' }));
  if (r.status === 404 || r.status === 403) return trash('hartes Löschen nicht erlaubt (Shared-Drive-Contributor) — stattdessen Papierkorb');
  return apiErr('drive_delete_file', r.status, r.data);},
};
