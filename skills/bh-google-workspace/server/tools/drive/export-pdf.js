'use strict';
const { getAccessToken } = require('../../lib/auth.js');
const { ok, err } = require('../../lib/gapi.js');
const { checkWritablePath, writeGuarded } = require('../../lib/local-file-guard.cjs');
const fs = require('fs');
const path = require('path');
const https = require('https');

module.exports = { name: 'drive.exportPdf', description: 'Exportiert ein Google Docs/Sheets/Slides als PDF. Speichert lokal wenn savePath angegeben.', inputSchema: { type: 'object', properties: { fileId: { type: 'string', description: 'ID des Google-Dokuments' }, savePath: { type: 'string', description: 'Lokaler Speicherpfad (optional)' } }, required: ['fileId'] },
  handler: async ({ fileId, savePath, _blockProtectedDrives }) => {
  if (savePath) { const guard = checkWritablePath(savePath); if (!guard.ok) return err(guard.error); } // Sicherheitspruefung 05.11.2026
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
  const data = await new Promise((resolve, reject) => {
    const chunks = [];
    https.request({ hostname: 'www.googleapis.com', path: `/drive/v3/files/${fileId}/export?mimeType=application/pdf`, method: 'GET', headers: { Authorization: `Bearer ${token}` } }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject).end();
  });
  if (savePath) {
    const saved = writeGuarded(savePath, data);
    return ok(`PDF exportiert: ${saved} (${data.length} Bytes)`);
  }
  return ok(`PDF: ${data.length} Bytes`);},
};
