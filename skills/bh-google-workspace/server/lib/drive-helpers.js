/**
 * Drive helpers: listing and folder lookup.
 *
 * IDs in tool output sit on their own line so LLMs copy them verbatim —
 * Drive IDs are 28-44 chars and often get mangled when cited inline.
 */
'use strict';

const { gapiJSON } = require('./gapi.js');

const DRIVE_FIELDS = 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents,driveId)';

// Without corpora the Drive API defaults to "user" (My Drive); Shared Drive
// items are then missing despite includeItemsFromAllDrives=true. For a specific
// Shared Drive → corpora=drive+driveId, else allDrives (= My Drive + all
// Shared Drives the SA can see).
function driveCorpora(driveId) {
  return driveId ? `&corpora=drive&driveId=${driveId}` : '&corpora=allDrives';
}

function formatDriveFile(f) {
  const mime = f.mimeType || '';
  const date = f.modifiedTime ? ` — ${f.modifiedTime}` : '';
  return `• ${f.name}\n  id: ${f.id}\n  ${mime}${date}`;
}

// Clear error message on a 404 from Drive. Most common cause in the agent loop:
// the LLM did not copy the fileId verbatim from the previous tool result
// (trace ax-nk8w75w7: "14wFFQPiKxpccHrW2Q TjMWhQDzLcmWD_9" → "2Q" dropped).
function driveNotFoundMessage(fileId) {
  const id  = String(fileId || '');
  const len = id.length;
  const bad = id.match(/[^A-Za-z0-9_-]/g);
  const hints = [];
  if (!id) hints.push('fileId ist leer');
  if (bad?.length) hints.push(`ungültige Zeichen: ${[...new Set(bad)].join(' ')}`);
  if (len > 0 && (len < 20 || len > 60)) hints.push(`Länge ${len} ist ungewöhnlich (Drive-IDs sind ~28–44 Zeichen)`);
  return (
    `Datei nicht gefunden. fileId='${id}' (${len} Zeichen).\n` +
    (hints.length ? `⚠ ${hints.join(' · ')}\n` : '') +
    'Häufigste Ursache: die ID wurde nicht exakt aus dem letzten drive.search / drive.fullTextSearch übernommen ' +
    '(ein Zeichen vergessen oder vertauscht). Drive-IDs sind lange alphanumerische Strings — unbedingt 1:1 kopieren.\n' +
    'Fix: drive.search auf den Parent-Folder erneut aufrufen und die ID zeichengenau übertragen.'
  );
}

async function listChildren(parentId, { foldersOnly = false } = {}) {
  let q = `'${parentId}' in parents and trashed=false`;
  if (foldersOnly) q += ` and mimeType='application/vnd.google-apps.folder'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${driveCorpora()}`;
  const r   = await gapiJSON('GET', url);
  if (r.status !== 200) throw new Error(`drive list children failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.files || [];
}

async function findNamedChildFolder(parentId, childName) {
  const q   = `'${parentId}' in parents and name='${childName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(DRIVE_FIELDS)}&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true${driveCorpora()}`;
  const r   = await gapiJSON('GET', url);
  if (r.status !== 200) throw new Error(`drive findNamedChildFolder failed: ${r.status} ${JSON.stringify(r.data)}`);
  return (r.data.files || [])[0] || null;
}

async function getDriveFileMeta(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,name,mimeType,webViewLink,parents,driveId')}&supportsAllDrives=true`;
  const r   = await gapiJSON('GET', url);
  if (r.status !== 200) throw new Error(`drive get metadata failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

module.exports = {
  DRIVE_FIELDS,
  driveCorpora,
  formatDriveFile,
  driveNotFoundMessage,
  listChildren,
  findNamedChildFolder,
  getDriveFileMeta,
};
