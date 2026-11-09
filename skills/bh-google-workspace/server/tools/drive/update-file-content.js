'use strict';
const { getAccessToken } = require('../../lib/auth.js');
const { err, ok, okJson } = require('../../lib/gapi.js');
const fs = require('fs');
const { readGuarded, checkReadablePath } = require('../../lib/local-file-guard.cjs');
const https = require('https');

/**
 * Replaces the CONTENT of an existing Drive file — file ID, link and
 * shares are preserved.
 *
 * Why not drive_upload_file: it ALWAYS creates a new file. Anyone correcting an
 * already shared record (account sheet, report, resolution draft)
 * thereby kills the circulated link and has two versions in the folder.
 * Drive versions the old state automatically — with keepRevisionForever
 * it stays retrievable permanently instead of expiring after 30 days.
 */
module.exports = {
  name: 'drive_update_file_content',
  description:
    'Replaces the content of an EXISTING Drive file (fileId stays, link and shares stay valid). '
    + 'Source: localPath OR content (+contentEncoding base64 for binary data). '
    + 'The previous state is kept as a Drive revision. To create a NEW file use drive_upload_file.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'ID of the file to update' },
      localPath: { type: 'string', description: 'Path to the local file (alternative to content)' },
      content: { type: 'string', description: 'Content inline (alternative to localPath)' },
      contentEncoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Encoding of content — base64 for BINARY content. Default utf8.' },
      mimeType: { type: 'string', description: 'Content type of the new content. If omitted, from the file extension, else application/octet-stream.' },
      newName: { type: 'string', description: 'Also rename the file (optional).' },
      keepRevisionForever: { type: 'boolean', description: 'Keep the previous version permanently as a revision (default true).' },
      format: { type: 'string', enum: ['text', 'json'] },
    },
    required: ['fileId'],
  },
  handler: async ({ fileId, localPath, content, contentEncoding, mimeType, newName, keepRevisionForever = true, format }) => {
    if (!fileId) return err('fileId fehlt.');
    if (!localPath && content == null) return err('Entweder localPath oder content angeben.');
    if (localPath && content != null) return err('localPath UND content gesetzt — bitte nur eines.');

    let fileContent;
    if (content != null) {
      if (contentEncoding && !['utf8', 'base64'].includes(contentEncoding)) return err(`contentEncoding unbekannt: ${contentEncoding}`);
      fileContent = Buffer.from(String(content), contentEncoding === 'base64' ? 'base64' : 'utf8');
    } else {
      // Security review 05.11.2026: only documents from the allowed folders, opened via the resolved path
      const g = checkReadablePath(localPath);
      if (!g.ok) return err(g.error);
      if (!fs.existsSync(g.path)) return err(`Datei nicht gefunden: ${localPath}`);
      try { fileContent = readGuarded(g.path); } catch (e) { return err(e.message); }
    }

    const ext = localPath ? String(localPath).toLowerCase().slice(String(localPath).lastIndexOf('.')) : '';
    const mime = mimeType || ({
      '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.txt': 'text/plain', '.csv': 'text/csv', '.html': 'text/html', '.md': 'text/markdown',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })[ext] || 'application/octet-stream';

    const token = await getAccessToken();

    // Renaming is a metadata update and goes through the normal API, not
    // the upload endpoint — otherwise it collides with uploadType=media.
    if (newName) {
      const metaBody = JSON.stringify({ name: newName });
      const metaRes = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'www.googleapis.com',
          path: `/drive/v3/files/${fileId}?supportsAllDrives=true`,
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(metaBody) },
        }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
        req.on('error', reject);
        req.write(metaBody);
        req.end();
      });
      if (metaRes.status !== 200) return err(`Umbenennen fehlgeschlagen ${metaRes.status}: ${metaRes.body.substring(0, 200)}`);
    }

    const uploadPath = `/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`
      + `&keepRevisionForever=${keepRevisionForever ? 'true' : 'false'}`
      + '&fields=' + encodeURIComponent('id,name,mimeType,webViewLink,size,modifiedTime,version');
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'www.googleapis.com',
        path: uploadPath,
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime, 'Content-Length': fileContent.length },
      }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
      req.on('error', reject);
      req.write(fileContent);
      req.end();
    });
    if (result.status !== 200) return err(`Update-Fehler ${result.status}: ${result.body.substring(0, 200)}`);
    const rb = JSON.parse(result.body);
    if (format === 'json') return okJson(rb);
    return ok(`Inhalt ersetzt: ${rb.name}\nID: ${rb.id}\nGroesse: ${rb.size} B${rb.webViewLink ? `\nLink: ${rb.webViewLink}` : ''}`);
  },
};
