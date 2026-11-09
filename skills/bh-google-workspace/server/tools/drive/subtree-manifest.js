'use strict';
/**
 * drive_subtree_manifest — flat file index of a data room folder.
 *
 * Returns ALL files (no folders) in the subtree of rootFolderId with
 * createdTime/modifiedTime/path — basis for the data room app's "Neu/Aktualisiert seit
 * letztem Besuch" display.
 *
 * SECURITY: rootFolderId is a mandatory guard. Only the subtree of this
 * folder is visited (no global Drive search) — nothing outside the
 * shared data room is exposed. Keep the mirror copy in the skills-library
 * in sync.
 */
const { gapiJSON, okJson, err } = require('../../lib/gapi.js');

const FOLDER = 'application/vnd.google-apps.folder';

async function listChildren(parentId) {
  const out = [];
  let pageToken;
  do {
    const q = `'${parentId}' in parents and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`
      + `&fields=nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,lastModifyingUser(displayName))&pageSize=200`
      + `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const r = await gapiJSON('GET', url);
    if (r.status !== 200) throw new Error(`list(${parentId}) HTTP ${r.status}`);
    out.push(...(r.data.files || []));
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return out;
}

module.exports = {
  name: 'drive_subtree_manifest',
  description: 'Flat file index (all files, no folders) of a data room folder in the subtree of rootFolderId, incl. createdTime/modifiedTime/relative path. For the "Neu/Aktualisiert seit letztem Besuch" display. Scope-safe via rootFolderId guard.',
  inputSchema: {
    type: 'object',
    properties: {
      rootFolderId: { type: 'string', description: 'Root folder of the data room (security guard).' },
      maxFiles:     { type: 'number', description: 'File limit (default 4000).' },
      maxNodes:     { type: 'number', description: 'Max. visited folders (default 4000).' },
    },
    required: ['rootFolderId'],
  },
  handler: async ({ rootFolderId, maxFiles = 4000, maxNodes = 4000, _blockProtectedDrives }) => {
    if (!rootFolderId) return err('rootFolderId fehlt (Sicherheits-Guard).');
    { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(rootFolderId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }

    const files = [];
    // Bounded-parallel BFS over folders (same shape as drive_search_subtree).
    const CONC = 8;
    const queue = [{ id: rootFolderId, path: '' }];
    let idx = 0, active = 0, truncated = false;
    await new Promise((resolve) => {
      function pump() {
        if (idx >= queue.length && active === 0) return resolve();
        while (active < CONC && idx < queue.length) {
          const node = queue[idx++]; active++;
          listChildren(node.id).then((kids) => {
            for (const k of kids) {
              if (k.mimeType === FOLDER) {
                if (queue.length < maxNodes) queue.push({ id: k.id, path: node.path ? node.path + ' / ' + k.name : k.name });
                continue;
              }
              if (files.length >= maxFiles) { truncated = true; continue; }
              files.push({
                id: k.id, name: k.name, mimeType: k.mimeType,
                size: k.size ? Number(k.size) : null,
                createdTime: k.createdTime || null,
                modifiedTime: k.modifiedTime || null,
                modifiedBy: (k.lastModifyingUser && k.lastModifyingUser.displayName) || null,
                path: node.path,
              });
            }
          }).catch(() => {}).finally(() => { active--; pump(); });
        }
      }
      pump();
    });
    return okJson({ rootFolderId, fileCount: files.length, truncated, files });
  },
};
