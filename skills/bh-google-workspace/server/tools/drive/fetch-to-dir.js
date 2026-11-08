'use strict';
/**
 * drive_fetch_to_dir — Datenraum-Download-Helfer.
 *
 * Lädt Dateien aus Drive rekursiv in ein lokales Verzeichnis (für ZIP-Bündelung
 * durch die Datenraum-App). SICHERHEIT: rootFolderId ist Pflicht und wirkt als
 * Guard — es werden NUR Dateien geladen, die im Subtree dieses Ordners liegen.
 * Dateien außerhalb (auch wenn ihre fileId übergeben wird) werden verweigert.
 * So kann über diesen Weg nichts außerhalb des freigegebenen Datenraums
 * exponiert werden, obwohl das Drive-Konto theoretisch mehr sehen könnte.
 */
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { getAccessToken } = require('../../lib/auth.js');
const { gapiJSON, okJson, err } = require('../../lib/gapi.js');
const { writeGuarded } = require('../../lib/local-file-guard.cjs');

const FOLDER = 'application/vnd.google-apps.folder';
// Parallel Drive downloads. The whole archive is only streamed to the client
// AFTER every file lands on disk, so this dead time IS the response's
// time-to-first-byte. Cloudflare cuts proxied responses at ~100s → keep it well
// under that for big rooms. Override via DATAROOM_FETCH_CONCURRENCY.
const CONCURRENCY = Math.max(1, Number(process.env.DATAROOM_FETCH_CONCURRENCY) || 12);
// Google-native MIME -> Export-Format (Bytes via /export)
const EXPORT = {
  'application/vnd.google-apps.document':     { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  'application/vnd.google-apps.spreadsheet':  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
  'application/vnd.google-apps.drawing':      { mime: 'application/pdf', ext: '.pdf' },
};

async function listChildren(parentId) {
  const out = [];
  let pageToken;
  do {
    const q = `'${parentId}' in parents and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`
      + `&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=200`
      + `&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const r = await gapiJSON('GET', url);
    if (r.status !== 200) throw new Error(`list(${parentId}) HTTP ${r.status}`);
    out.push(...(r.data.files || []));
    pageToken = r.data.nextPageToken;
  } while (pageToken);
  return out;
}

// Make a name safe as a Windows file / ZIP-entry name. Linux + `unzip` tolerate
// ':', '?', '*', '"', '<', '>', '|', control chars and trailing dots/spaces, but
// Windows Explorer rejects the ENTIRE archive ("ungültige Datei / der
// komprimierte Ordner ist ungültig") when any entry name contains them. We also
// cap each path segment so deep German folder trees stay under Windows' ~260-char
// MAX_PATH limit. Keep this in sync with the skills-library copy.
const WIN_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
function safeName(name) {
  let s = String(name)
    .replace(/[\/\\:*?"<>|]/g, '_') // path separators + Windows-reserved punctuation
    .replace(/[\x00-\x1f]/g, '_')   // control characters
    .replace(/\s+/g, ' ').trim()    // collapse + trim whitespace
    .replace(/[. ]+$/, '');         // Windows silently drops trailing dot/space → would mismatch
  if (!s) s = '_';
  if (WIN_RESERVED.test(s)) s = '_' + s; // reserved device names (CON, NUL, …)
  if (s.length > 120) {                  // cap segment length, keep a short extension
    const dot = s.lastIndexOf('.');
    const ext = dot > 0 && s.length - dot <= 6 ? s.slice(dot) : '';
    s = s.slice(0, 120 - ext.length).trimEnd() + ext;
  }
  return s;
}

// Deduped target filename within a destDir (computed sequentially during collect).
function targetName(file, destDir, usedNames) {
  const exp = EXPORT[file.mimeType];
  let base = safeName(file.name);
  if (exp && !base.toLowerCase().endsWith(exp.ext)) base += exp.ext;
  let fileName = base, n = 1;
  const key = () => destDir + '/' + fileName.toLowerCase();
  while (usedNames.has(key())) {
    const dot = base.lastIndexOf('.');
    fileName = dot > 0 ? `${base.slice(0, dot)}-${++n}${base.slice(dot)}` : `${base}-${++n}`;
  }
  usedNames.add(key());
  return fileName;
}

async function downloadOne(file, destDir, fileName) {
  const token = await getAccessToken();
  const exp = EXPORT[file.mimeType];
  const pathSeg = exp
    ? `/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exp.mime)}`
    : `/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    https.request({ hostname: 'www.googleapis.com', path: pathSeg, method: 'GET',
      headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download ${file.id} HTTP ${res.statusCode}`)); }
        res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject).end();
  });
  const abs = path.join(destDir, fileName);
  // Sicherheitspruefung 05.11.2026 — ein gesperrter Pfad landet als 'skipped' im Ergebnis
  const real = writeGuarded(abs, buf);
  return { path: real, name: fileName, bytes: buf.length };
}

module.exports = {
  name: 'drive_fetch_to_dir',
  description: 'Lädt Dateien eines Drive-Ordners rekursiv in ein lokales Verzeichnis (für ZIP-Bündelung der Datenraum-App). rootFolderId ist Pflicht-Guard: nur Dateien im Subtree dieses Ordners werden geladen. Ohne fileIds wird der gesamte Subtree geladen; mit fileIds nur diese (jede muss im Subtree liegen, sonst übersprungen). Google-Docs/Sheets/Slides werden zu PDF/xlsx/pptx exportiert.',
  inputSchema: {
    type: 'object',
    properties: {
      rootFolderId: { type: 'string', description: 'Wurzel-Ordner des Datenraums (Sicherheits-Guard).' },
      targetDir:    { type: 'string', description: 'Lokales Zielverzeichnis (wird angelegt).' },
      fileIds:      { type: 'array', items: { type: 'string' }, description: 'Optional: nur diese Datei-/Ordner-IDs (müssen im Subtree liegen). Leer = ganzer Subtree.' },
      maxFiles:     { type: 'number', description: 'Obergrenze Dateien (Default 2000).' },
    },
    required: ['rootFolderId', 'targetDir'],
  },
  handler: async ({ rootFolderId, targetDir, fileIds, maxFiles = 2000 }) => {
    if (!rootFolderId) return err('rootFolderId fehlt (Sicherheits-Guard).');
    if (!targetDir)    return err('targetDir fehlt.');
    { const g0 = require('../../lib/local-file-guard.cjs').checkWritablePath(path.join(String(targetDir), 'probe.bin')); if (!g0.ok) return err(g0.error); } // Sicherheitspruefung 05.11.2026
    const wanted = Array.isArray(fileIds) && fileIds.length ? new Set(fileIds.filter(Boolean)) : null;

    const skipped = [];
    const jobs = [];                 // { file, destDir, fileName } — collected, then downloaded in parallel
    const usedNames = new Set();

    // Collect phase (sequential walk inside rootFolderId). inWanted = we are
    // inside a selected folder's subtree → take ALL its files (incl. nested).
    async function collect(folderId, relDir, inWanted) {
      const kids = await listChildren(folderId);
      for (const k of kids) {
        const isFolder = k.mimeType === FOLDER;
        if (isFolder) {
          await collect(k.id, path.join(relDir, safeName(k.name)), inWanted || (wanted && wanted.has(k.id)));
          continue;
        }
        const take = !wanted || inWanted || wanted.has(k.id);
        if (!take) continue;
        if (jobs.length >= maxFiles) { skipped.push({ id: k.id, reason: 'maxFiles erreicht' }); continue; }
        const destDir = path.join(targetDir, relDir);
        jobs.push({ file: k, destDir, fileName: targetName(k, destDir, usedNames) });
      }
    }
    try { await collect(rootFolderId, '', false); }
    catch (e) { return err(`Fetch fehlgeschlagen: ${e.message}`); }

    // Download phase — parallel (the slow part: bytes + Google export). Cuts a
    // whole-room download from ~80s (sequential) to well under Cloudflare's limit.
    const saved = [];
    let idx = 0;
    async function worker() {
      while (idx < jobs.length) {
        const j = jobs[idx++];
        try { const r = await downloadOne(j.file, j.destDir, j.fileName); saved.push({ path: path.relative(targetDir, r.path), bytes: r.bytes }); }
        catch (e) { skipped.push({ id: j.file.id, reason: e.message }); }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const totalBytes = saved.reduce((s, f) => s + f.bytes, 0);
    return okJson({ rootFolderId, targetDir, fileCount: saved.length, totalBytes, files: saved, skipped });
  },
};
