'use strict';
const { driveNotFoundMessage } = require('../../lib/drive-helpers.js');
const { apiErr, err, gapi, gapiJSON, ok } = require('../../lib/gapi.js');
const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js');

// Incident 2026-08-13: a Google Sheet export ("NKA Abrechnungen") came back as 1,333,920
// chars in ONE tool result — the chat context thereby jumped in a
// single step from ~11k to ~857k tokens and crashed shortly after at the model limit
// (1,048,576 tokens on Gemini), the actual task stayed undone. No
// existing tool had a size cap — unlike drive.getPdfText (page range).
const MAX_CHARS_DEFAULT = 100000;

// Cuts at a line boundary (not in the middle of a CSV/JSON line)
// so the returned subset itself stays meaningfully interpretable.
function truncateWithNote(text, offset, maxChars) {
  const total = text.length;
  const from = Math.max(0, offset);
  if (from >= total) {
    return `[Ende erreicht — Datei hat ${total} Zeichen, offset=${from} liegt dahinter.]`;
  }
  const rawEnd = Math.min(from + maxChars, total);
  let end = rawEnd;
  if (rawEnd < total) {
    const lastNewline = text.lastIndexOf('\n', rawEnd);
    if (lastNewline > from) end = lastNewline + 1;
  }
  const slice = text.slice(from, end);
  if (end >= total) return slice;
  return (
    `${slice}\n\n[⚠ Gekürzt — Datei hat ${total} Zeichen, dies sind Zeichen ${from}–${end}. ` +
    `Für den Rest: gleiche fileId erneut mit offset:${end} aufrufen.]`
  );
}

const tool = { name: 'drive.getFileContent', description: 'Retrieves the text content of a file from Google Drive. Works for Google Docs/Sheets/Slides (export as text/CSV) and text/JSON/XML files. PDFs are rejected — use drive.getPdfText for PDFs. Images and Office binary files are rejected as well. Large files are truncated at a line boundary (default 100,000 chars) — paginate with offset+maxChars.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, maxChars: { type: 'integer', description: `Max. chars per call (default ${MAX_CHARS_DEFAULT}).` }, offset: { type: 'integer', description: 'Character offset for the next page (from the truncation note of the previous call).' } }, required: ['fileId'] },
  handler: async ({ fileId, maxChars, offset, _blockProtectedDrives }) => {
  const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives));
  if (_ref) return _ref;
  const maxC = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : MAX_CHARS_DEFAULT;
  const off  = Number.isFinite(offset) && offset > 0 ? offset : 0;
  // Fetch metadata first to check the mimeType. For binary files (PDF,
  // images, Office) `alt=media` returns raw bytes — those are unreadable for the LLM
  // and inflate past the 413 limit via context/truncate. We therefore
  // reject this early instead of passing it through.
  const meta = await gapiJSON('GET',
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,name,mimeType,size')}&supportsAllDrives=true`);
  if (meta.status === 404) return err(driveNotFoundMessage(fileId));
  if (meta.status !== 200) return apiErr('drive.getFileContent', meta.status, meta.data);

  const mt = meta.data.mimeType || '';
  // Google Workspace formats → export as plain text / markdown.
  const GOOGLE_EXPORTS = {
    'application/vnd.google-apps.document':     'text/plain',
    'application/vnd.google-apps.spreadsheet':  'text/csv',
    'application/vnd.google-apps.presentation': 'text/plain',
  };
  if (GOOGLE_EXPORTS[mt]) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(GOOGLE_EXPORTS[mt])}&supportsAllDrives=true`;
    const r = await gapi('GET', exportUrl);
    if (r.status !== 200) return apiErr('drive.getFileContent', r.status, r.body);
    return ok(truncateWithNote(r.body, off, maxC));
  }
  // Plain text MIME types: pass through.
  if (/^text\//.test(mt) || mt === 'application/json' || mt === 'application/xml') {
    const r = await gapi('GET',
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    if (r.status !== 200) return apiErr('drive.getFileContent', r.status, r.body);
    return ok(truncateWithNote(r.body, off, maxC));
  }
  // Binary files (PDF, images, Office binary) — do NOT pass through.
  const size = meta.data.size ? `${meta.data.size} Bytes` : 'unbekannt';
  return err(
    `drive.getFileContent: Datei "${meta.data.name}" ist vom Typ ${mt} (${size}) — ` +
    `Binärinhalt kann nicht als Text ausgeliefert werden.\n` +
    `Für PDFs: drive.getPdfText({fileId}) nutzen. Für Bilder/Office aktuell keine Text-Extraktion.`
  );},
};

module.exports = tool;
module.exports.truncateWithNote = truncateWithNote; // for unit tests
