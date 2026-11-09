'use strict';
/**
 * drive_fetch_file — fetches a SINGLE file from a data room (bytes as
 * base64) for the data room app's modal preview or single download.
 *
 * SECURITY: rootFolderId is a mandatory guard. The file is only returned if
 * its parent chain reaches rootFolderId (else refused) — so nothing outside
 * the shared data room can be exposed this way.
 *
 * format:
 *   'download' (default) → Office formats (Docs→docx, Sheets→xlsx, Slides→pptx),
 *                          native files unchanged.
 *   'pdf'                → Google-native + Drawings as PDF (for inline preview);
 *                          native PDFs/images unchanged.
 */
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { getAccessToken } = require('../../lib/auth.js');
const { gapiJSON, okJson, err } = require('../../lib/gapi.js');

const FOLDER = 'application/vnd.google-apps.folder';
const NATIVE = 'application/vnd.google-apps.';
const DL = {
  'application/vnd.google-apps.document':     { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  'application/vnd.google-apps.spreadsheet':  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
  'application/vnd.google-apps.drawing':      { mime: 'application/pdf', ext: '.pdf' },
};
const PDF = { mime: 'application/pdf', ext: '.pdf' };

// Transient Google errors (rate limit 403/429, 5xx, network resets) occur
// sporadically under data room bursts and until 2026-09-01 were passed through
// to the viewer as 502 — retry briefly instead of failing at once.
const TRANSIENT = /HTTP (403|429|5\d\d)|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i;
async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!TRANSIENT.test(String(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function get(id, fields) {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`;
  return withRetry(async () => {
    const r = await gapiJSON('GET', url);
    if (r.status !== 200) throw new Error(`get(${id}) HTTP ${r.status}`);
    return r.data;
  });
}

// Verify the file's parent chain reaches rootFolderId (bounded walk).
async function withinRoot(fileId, rootFolderId) {
  if (fileId === rootFolderId) return true;
  let frontier = [fileId];
  for (let depth = 0; depth < 25 && frontier.length; depth++) {
    const next = [];
    for (const id of frontier) {
      const meta = await get(id, 'id,parents');
      for (const p of meta.parents || []) {
        if (p === rootFolderId) return true;
        next.push(p);
      }
    }
    frontier = next;
  }
  return false;
}

function fetchBytes(pathSeg, token) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.request({ hostname: 'www.googleapis.com', path: pathSeg, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download HTTP ${res.statusCode}`)); }
        res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject).end();
  });
}

module.exports = {
  name: 'drive_fetch_file',
  description: 'Fetches ONE file of a data room as base64 (modal preview / single download). rootFolderId is a mandatory guard (file must be in the subtree). format: "download" (Office: Docs→docx/Sheets→xlsx/Slides→pptx, native unchanged) | "pdf" (Google-native as PDF for inline preview).',
  inputSchema: {
    type: 'object',
    properties: {
      rootFolderId: { type: 'string', description: 'Root folder of the data room (security guard).' },
      fileId:       { type: 'string', description: 'File ID (must be in the subtree of rootFolderId).' },
      format:       { type: 'string', enum: ['download', 'pdf'], description: 'download (Office) or pdf (preview).' },
      targetDir:    { type: 'string', description: 'Optional: write the bytes to a file under this directory; the response then carries "path" instead of "base64". Recommended for large files.' },
    },
    required: ['rootFolderId', 'fileId'],
  },
  handler: async ({ rootFolderId, fileId, format = 'download', targetDir, _blockProtectedDrives }) => {
    if (targetDir) { // Security review 05.11.2026: check the target folder before every Drive call
      const g = require('../../lib/local-file-guard.cjs').checkWritablePath(path.join(String(targetDir), 'probe.bin'));
      if (!g.ok) return err(g.error);
    }
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _b = toBlockSet(_blockProtectedDrives); const _ref = (await refuseProtectedFile(fileId, _b)) || (await refuseProtectedFile(rootFolderId, _b)); if (_ref) return _ref; }
    if (!rootFolderId || !fileId) return err('rootFolderId und fileId sind Pflicht.');
    try {
      if (!(await withinRoot(fileId, rootFolderId))) return err('Datei liegt außerhalb des Datenraums (verweigert).');
      const meta = await get(fileId, 'id,name,mimeType');
      if (meta.mimeType === FOLDER) return err('fileId ist ein Ordner.');

      const isNative = meta.mimeType.startsWith(NATIVE);
      let outMime = meta.mimeType, outName = String(meta.name), pathSeg;
      if (isNative) {
        const exp = format === 'pdf' ? PDF : (DL[meta.mimeType] || PDF);
        outMime = exp.mime;
        if (!outName.toLowerCase().endsWith(exp.ext)) outName += exp.ext;
        pathSeg = `/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exp.mime)}`;
      } else {
        pathSeg = `/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      }
      const buf = await withRetry(async () => fetchBytes(pathSeg, await getAccessToken()));
      if (targetDir) {
        const want = path.join(targetDir, crypto.randomBytes(8).toString('hex') + (path.extname(outName) || '.bin'));
        let outPath; // Security review 05.11.2026: allowed folders only, no code files
        try { outPath = require('../../lib/local-file-guard.cjs').writeGuarded(want, buf); } catch (e) { return err(e.message); }
        return okJson({ fileId, name: outName, mimeType: outMime, bytes: buf.length, path: outPath });
      }
      return okJson({ fileId, name: outName, mimeType: outMime, bytes: buf.length, base64: buf.toString('base64') });
    } catch (e) {
      return err(`fetch_file fehlgeschlagen: ${e.message}`);
    }
  },
};
