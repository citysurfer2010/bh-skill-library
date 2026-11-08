'use strict';
const { driveNotFoundMessage } = require('../../lib/drive-helpers.js');
const { apiErr, err, gapi, gapiJSON, ok } = require('../../lib/gapi.js');
const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js');

// Vorfall 2026-08-13: ein Google-Sheet-Export ("NKA Abrechnungen") kam als 1.333.920
// Zeichen in EINEM Tool-Result zurück — der Chat-Kontext sprang dadurch in einem
// einzigen Schritt von ~11k auf ~857k Tokens und crashte kurz danach am Modell-Limit
// (1.048.576 Tokens bei Gemini), die eigentliche Aufgabe blieb unerledigt. Kein
// bestehendes Tool hatte einen Size-Cap — anders als drive.getPdfText (Seitenrange).
const MAX_CHARS_DEFAULT = 100000;

// Schneidet an einer Zeilengrenze (nicht mitten in einer CSV-Zeile/JSON-Zeile) ab,
// damit die zurückgegebene Teilmenge selbst noch sinnvoll interpretierbar bleibt.
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

const tool = { name: 'drive.getFileContent', description: 'Ruft den Text-Inhalt einer Datei aus Google Drive ab. Funktioniert für Google Docs/Sheets/Slides (Export als Text/CSV) und Text/JSON/XML-Dateien. PDFs werden abgelehnt — für PDFs drive.getPdfText nutzen. Bilder und Office-Binärdateien werden ebenfalls abgelehnt. Große Dateien werden an einer Zeilengrenze gekürzt (Default 100.000 Zeichen) — mit offset+maxChars paginieren.', inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, maxChars: { type: 'integer', description: `Max. Zeichen pro Aufruf (Default ${MAX_CHARS_DEFAULT}).` }, offset: { type: 'integer', description: 'Zeichen-Offset für die nächste Seite (aus der Kürzungs-Notiz des vorherigen Aufrufs).' } }, required: ['fileId'] },
  handler: async ({ fileId, maxChars, offset, _blockProtectedDrives }) => {
  const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives));
  if (_ref) return _ref;
  const maxC = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : MAX_CHARS_DEFAULT;
  const off  = Number.isFinite(offset) && offset > 0 ? offset : 0;
  // Metadaten vorab holen, um mimeType zu prüfen. `alt=media` liefert bei
  // Binärdateien (PDF, Bilder, Office) Rohbytes — die sind für den LLM nicht
  // lesbar und blähen über Context/Truncate das 413-Limit. Wir lehnen das
  // deshalb früh ab, anstatt es durchzureichen.
  const meta = await gapiJSON('GET',
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent('id,name,mimeType,size')}&supportsAllDrives=true`);
  if (meta.status === 404) return err(driveNotFoundMessage(fileId));
  if (meta.status !== 200) return apiErr('drive.getFileContent', meta.status, meta.data);

  const mt = meta.data.mimeType || '';
  // Google-Workspace-Formate → export als plain text / markdown.
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
  // Plain-Text-MIME-Types: durchreichen.
  if (/^text\//.test(mt) || mt === 'application/json' || mt === 'application/xml') {
    const r = await gapi('GET',
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
    if (r.status !== 200) return apiErr('drive.getFileContent', r.status, r.body);
    return ok(truncateWithNote(r.body, off, maxC));
  }
  // Binärdateien (PDF, Bilder, Office-Binary) — NICHT durchreichen.
  const size = meta.data.size ? `${meta.data.size} Bytes` : 'unbekannt';
  return err(
    `drive.getFileContent: Datei "${meta.data.name}" ist vom Typ ${mt} (${size}) — ` +
    `Binärinhalt kann nicht als Text ausgeliefert werden.\n` +
    `Für PDFs: drive.getPdfText({fileId}) nutzen. Für Bilder/Office aktuell keine Text-Extraktion.`
  );},
};

module.exports = tool;
module.exports.truncateWithNote = truncateWithNote; // fuer Unit-Tests
