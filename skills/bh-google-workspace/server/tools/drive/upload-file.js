'use strict';
const { getAccessToken } = require('../../lib/auth.js');
const { err, ok, okJson } = require('../../lib/gapi.js');
const fs = require('fs');
const path = require('path');
const { readGuarded, checkReadablePath } = require('../../lib/local-file-guard.cjs');
const https = require('https');

// Ziel-Formate für die Google-Konvertierung. Drive wandelt beim Upload um, wenn in den
// METADATEN ein Google-mimeType steht (der Media-Teil behält den Quell-Typ).
// Damit wird aus HTML ein ECHTES Google Doc mit Überschriften/Fett/Tabellen — statt
// einer rohen Datei oder (bisheriger Workaround) einem Brief mit hineinkopiertem
const CONVERT_TARGETS = {
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
};

module.exports = {
  name: 'drive_upload_file',
  description:
    'Lädt eine Datei in einen Google Drive Ordner hoch. Quelle entweder localPath ODER content (inline). ' +
    'Mit convertTo="document" wird der Inhalt beim Upload in ein ECHTES Google Doc konvertiert — ' +
    'für formatierte Reports content als HTML (<h1>/<b>/<table>) übergeben und mimeType="text/html" setzen. ' +
    'Ohne convertTo wird die Datei unverändert abgelegt.',
  inputSchema: {
    type: 'object',
    properties: {
      localPath: { type: 'string', description: 'Pfad zur lokalen Datei (Alternative zu content)' },
      content: { type: 'string', description: 'Inhalt direkt inline (Alternative zu localPath) — z.B. HTML für einen Report' },
      contentEncoding: { type: 'string', enum: ['utf8', 'base64'], description: 'Kodierung von content. base64 für BINÄRE Inhalte (z.B. DOCX) — utf8 würde sie zerstören. Default utf8.' },
      fileName: { type: 'string', description: 'Zielname in Drive (bei content Pflicht, sonst Basename von localPath)' },
      parentId: { type: 'string', description: 'Drive-Ordner-ID (Zielordner)' },
      mimeType: { type: 'string', description: 'Quell-mimeType, z.B. text/html. Ohne Angabe aus der Dateiendung abgeleitet.' },
      convertTo: { type: 'string', enum: ['document', 'spreadsheet', 'presentation'], description: 'In Google-Format konvertieren (document = Google Doc)' },
      format: { type: 'string', enum: ['text', 'json'], description: 'json liefert {id,name,mimeType,webViewLink} statt Text' },
    },
    required: ['parentId'],
  },
  handler: async ({ localPath, content, contentEncoding, fileName, parentId, mimeType, convertTo, format }) => {
    if (!localPath && content == null) return err('Entweder localPath oder content angeben.');
    if (localPath && content != null) return err('localPath UND content gesetzt — bitte nur eines.');

    let fileContent, uploadName;
    if (content != null) {
      if (!fileName) return err('Bei content ist fileName Pflicht.');
      // BINÄRE Inhalte (DOCX o.Ä.) MÜSSEN als base64 kommen — ein utf8-Roundtrip
      // ersetzt jedes Nicht-UTF8-Byte durch U+FFFD und macht das Archiv unlesbar.
      if (contentEncoding && !['utf8', 'base64'].includes(contentEncoding)) return err(`contentEncoding unbekannt: ${contentEncoding}`);
      fileContent = Buffer.from(String(content), contentEncoding === 'base64' ? 'base64' : 'utf8');
      uploadName = fileName;
    } else {
      // Sicherheitspruefung 05.11.2026: nur Dokumente aus den erlaubten Ordnern, geoeffnet ueber den aufgeloesten Pfad
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
    // Ziel-mimeType NUR in den Metadaten → Drive konvertiert. Media behält den Quell-Typ.
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
    // fields=… damit die Response webViewLink mitliefert (Default-Fields enthalten ihn nicht).
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
