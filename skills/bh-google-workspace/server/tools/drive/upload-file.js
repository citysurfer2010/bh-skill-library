'use strict';
const { getAccessToken } = require('../../lib/auth.js');
const { err, ok, okJson } = require('../../lib/gapi.js');
const fs = require('fs');
const path = require('path');
const { readGuarded, checkReadablePath } = require('../../lib/local-file-guard.cjs');
const https = require('https');

// Target formats for the Google conversion. Drive converts on upload if the
// METADATA holds a Google mimeType (the media part keeps the source type).
// This turns HTML into a REAL Google Doc with headings/bold/tables — instead of
// a raw file or (the previous workaround) a letter with pasted-in
const CONVERT_TARGETS = {
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
};

module.exports = {
  name: 'drive_upload_file',
  description:
    'Uploads a file to a Google Drive folder. Source either localPath OR content (inline). ' +
    'With convertTo="document" the content is converted to a REAL Google Doc on upload — ' +
    'for formatted reports pass content as HTML (<h1>/<b>/<table>) and set mimeType="text/html". ' +
    'Without convertTo the file is stored unchanged.',
  inputSchema: {
    type: 'object',
    properties: {
      localPath: { type: 'string', description: 'Path to the local file (alternative to content)' },
      content: { type: 'string', description: 'Content directly inline (alternative to localPath) — e.g. HTML for a report' },
      contentEncoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Encoding of content. base64 for BINARY content (e.g. DOCX) — utf8 would destroy it. Default utf8.' },
      fileName: { type: 'string', description: 'Target name in Drive (required with content, else basename of localPath)' },
      parentId: { type: 'string', description: 'Drive folder ID (target folder)' },
      mimeType: { type: 'string', description: 'Source mimeType, e.g. text/html. If omitted, derived from the file extension.' },
      convertTo: { type: 'string', enum: ['document', 'spreadsheet', 'presentation'], description: 'Convert to Google format (document = Google Doc)' },
      format: { type: 'string', enum: ['text', 'json'], description: 'json returns {id,name,mimeType,webViewLink} instead of text' },
    },
    required: ['parentId'],
  },
  handler: async ({ localPath, content, contentEncoding, fileName, parentId, mimeType, convertTo, format }) => {
    if (!localPath && content == null) return err('Entweder localPath oder content angeben.');
    if (localPath && content != null) return err('localPath UND content gesetzt — bitte nur eines.');

    let fileContent, uploadName;
    if (content != null) {
      if (!fileName) return err('Bei content ist fileName Pflicht.');
      // BINARY content (DOCX etc.) MUST arrive as base64 — a utf8 round trip
      // replaces every non-UTF8 byte with U+FFFD and makes the archive unreadable.
      if (contentEncoding && !['utf8', 'base64'].includes(contentEncoding)) return err(`contentEncoding unbekannt: ${contentEncoding}`);
      fileContent = Buffer.from(String(content), contentEncoding === 'base64' ? 'base64' : 'utf8');
      uploadName = fileName;
    } else {
      // Security review 05.11.2026: only documents from the allowed folders, opened via the resolved path
      const g = checkReadablePath(localPath);
      if (!g.ok) return err(g.error);
      if (!fs.existsSync(g.path)) return err(`Datei nicht gefunden: ${localPath}`);
      try { fileContent = readGuarded(g.path); } catch (e) { return err(e.message); }
      uploadName = fileName || path.basename(localPath);
    }

    const mime = mimeType || (localPath ? ({
      '.pdf':  'application/pdf', '.png':  'image/png', '.jpg':  'image/jpeg',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt':  'text/plain', '.csv':  'text/csv', '.html': 'text/html', '.md': 'text/markdown',
    })[path.extname(localPath).toLowerCase()] : null) || 'application/octet-stream';

    if (convertTo && !CONVERT_TARGETS[convertTo]) return err(`convertTo unbekannt: ${convertTo}`);

    const token = await getAccessToken();
    const boundary = 'a1workspace314159';
    // Target mimeType ONLY in the metadata → Drive converts. Media keeps the source type.
    const meta = JSON.stringify({
      name: uploadName,
      parents: [parentId],
      ...(convertTo ? { mimeType: CONVERT_TARGETS[convertTo] } : {}),
    });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
      fileContent,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    // fields=… so the response includes webViewLink (the default fields do not).
    const uploadPath = '/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true'
      + '&fields=' + encodeURIComponent('id,name,mimeType,webViewLink,size,parents');
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'www.googleapis.com',
        path: uploadPath,
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"`, 'Content-Length': body.length },
      }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    if (result.status !== 200) return err(`Upload-Fehler ${result.status}: ${result.body.substring(0, 200)}`);
    const rb = JSON.parse(result.body);
    if (format === 'json') return okJson(rb);
    return ok(`Hochgeladen: ${rb.name}\nID: ${rb.id}${rb.webViewLink ? `\nLink: ${rb.webViewLink}` : ''}`);
  },
};
