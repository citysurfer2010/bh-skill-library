'use strict';
/**
 * drive_subtree_manifest — flacher Datei-Index eines Datenraum-Ordners.
 *
 * Liefert ALLE Dateien (keine Ordner) im Subtree von rootFolderId mit
 * createdTime/modifiedTime/Pfad — Grundlage für die „Neu/Aktualisiert seit
 * letztem Besuch"-Anzeige der Datenraum-App.
 *
 * SICHERHEIT: rootFolderId ist Pflicht-Guard. Es wird ausschließlich der Subtree
 * dieses Ordners besucht (keine globale Drive-Suche) — nichts außerhalb des
 * freigegebenen Datenraums wird exponiert. Spiegelkopie in der skills-library
 * synchron halten.
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
  description: 'Flacher Datei-Index (alle Dateien, keine Ordner) eines Datenraum-Ordners im Subtree von rootFolderId, inkl. createdTime/modifiedTime/relativem Pfad. Für die „Neu/Aktualisiert seit letztem Besuch"-Anzeige. Scope-sicher via rootFolderId-Guard.',
  inputSchema: {
    type: 'object',
    properties: {
      rootFolderId: { type: 'string', description: 'Wurzel-Ordner des Datenraums (Sicherheits-Guard).' },
      maxFiles:     { type: 'number', description: 'Obergrenze Dateien (Default 4000).' },
      maxNodes:     { type: 'number', description: 'Max. besuchte Ordner (Default 4000).' },
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
