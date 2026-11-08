'use strict';
const { getAccessToken } = require('../../lib/auth.js');
const { err, ok, okJson } = require('../../lib/gapi.js');
const fs = require('fs');
const { readGuarded, checkReadablePath } = require('../../lib/local-file-guard.cjs');
const https = require('https');

/**
 * Ersetzt den INHALT einer bestehenden Drive-Datei — Datei-ID, Link und
 * Freigaben bleiben erhalten.
 *
 * Warum nicht drive_upload_file: das legt IMMER eine neue Datei an. Wer einen
 * bereits geteilten Beleg korrigiert (Kontoblatt, Report, Beschlussvorlage),
 * macht damit den herumgereichten Link tot und hat zwei Fassungen im Ordner.
 * Drive versioniert den alten Stand automatisch — mit keepRevisionForever
 * bleibt er dauerhaft abrufbar statt nach 30 Tagen zu verfallen.
 */
module.exports = {
  name: 'drive_update_file_content',
  description:
    'Ersetzt den Inhalt einer VORHANDENEN Drive-Datei (fileId bleibt, Link und Freigaben bleiben gueltig). '
    + 'Quelle: localPath ODER content (+contentEncoding base64 fuer Binaerdaten). '
    + 'Der bisherige Stand bleibt als Drive-Revision erhalten. Zum Anlegen einer NEUEN Datei drive_upload_file nehmen.',
  inputSchema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'ID der zu aktualisierenden Datei' },
      localPath: { type: 'string', description: 'Pfad zur lokalen Datei (Alternative zu content)' },
      content: { type: 'string', description: 'Inhalt inline (Alternative zu localPath)' },
      contentEncoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Kodierung von content — base64 fuer BINAERE Inhalte. Default utf8.' },
      mimeType: { type: 'string', description: 'Content-Type des neuen Inhalts. Ohne Angabe aus der Dateiendung, sonst application/octet-stream.' },
      newName: { type: 'string', description: 'Datei zusaetzlich umbenennen (optional).' },
      keepRevisionForever: { type: 'boolean', description: 'Vorherige Fassung dauerhaft als Revision behalten (default true).' },
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
      // Sicherheitspruefung 05.11.2026: nur Dokumente aus den erlaubten Ordnern, geoeffnet ueber den aufgeloesten Pfad
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

    // Umbenennen ist ein Metadaten-Update und laeuft ueber die normale API, nicht
    // ueber den Upload-Endpunkt — sonst kollidiert es mit uploadType=media.
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
