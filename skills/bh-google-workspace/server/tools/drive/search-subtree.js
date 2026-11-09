'use strict';
/**
 * drive_search_subtree — global name search WITHIN a data room folder.
 *
 * SECURITY: rootFolderId is a mandatory guard. Only the subtree of this
 * folder is searched recursively (no global Drive search) — so nothing
 * outside the shared data room can be found/exposed.
 *
 * Returns hits (files + folders) whose name contains the query (case-insensitive),
 * incl. the relative folder path for display.
 */
const { gapiJSON, okJson, err } = require('../../lib/gapi.js');

const FOLDER = 'application/vnd.google-apps.folder';

async function listChildren(parentId) {
  const out = [];
  let pageToken;
  do {
    const q = `'${parentId}' in parents and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`
      + `&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,lastModifyingUser(displayName))&pageSize=200`
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
  name: 'drive_search_subtree',
  description: 'Global name search WITHIN a data room folder (recursive, scope-safe via rootFolderId guard). Returns hits (files+folders) with relative path. For the data room app search.',
  inputSchema: {
    type: 'object',
    properties: {
      rootFolderId: { type: 'string', description: 'Root folder of the data room (security guard).' },
      query:        { type: 'string', description: 'Search term (name substring, case-insensitive).' },
      maxResults:   { type: 'number', description: 'Max. hits (default 100).' },
      maxNodes:     { type: 'number', description: 'Max. visited nodes (default 4000).' },
    },
    required: ['rootFolderId', 'query'],
  },
  handler: async ({ rootFolderId, query, maxResults = 100, maxNodes = 4000, _blockProtectedDrives }) => {
    if (!rootFolderId) return err('rootFolderId fehlt (Sicherheits-Guard).');
    { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(rootFolderId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return okJson({ rootFolderId, query, items: [] });

    const items = [];
    // Bounded-parallel BFS — folders are listed concurrently (Concurrency CONC),
    // so traversal is ~depth*latency instead of totalFolders*latency (was ~20s).
    const CONC = 8;
    const queue = [{ id: rootFolderId, path: '' }];
    let idx = 0, active = 0;
    await new Promise((resolve) => {
      function pump() {
        if (idx >= queue.length && active === 0) return resolve();
        while (active < CONC && idx < queue.length) {
          const node = queue[idx++]; active++;
          listChildren(node.id).then((kids) => {
            for (const k of kids) {
              const isFolder = k.mimeType === FOLDER;
              if (items.length < maxResults && k.name && k.name.toLowerCase().includes(q)) {
                items.push({ id: k.id, name: k.name, mimeType: k.mimeType, isFolder,
                  size: k.size ? Number(k.size) : null, modifiedTime: k.modifiedTime || null,
                  modifiedBy: (k.lastModifyingUser && k.lastModifyingUser.displayName) || null, path: node.path });
              }
              if (isFolder && queue.length < maxNodes) queue.push({ id: k.id, path: node.path ? node.path + ' / ' + k.name : k.name });
            }
          }).catch(() => {}).finally(() => { active--; pump(); });
        }
      }
      pump();
    });
    items.sort((a, b) => (Number(b.isFolder) - Number(a.isFolder)) || a.name.localeCompare(b.name, 'de'));
    return okJson({ rootFolderId, query, count: items.length, items });
  },
};
