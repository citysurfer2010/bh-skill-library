'use strict';
const fs    = require('fs');
const https = require('https');
const { pipeline } = require('stream');
const { getAccessToken } = require('../../lib/auth.js');
const { ok, err }        = require('../../lib/gapi.js');
const { checkWritablePath, openWriteGuarded } = require('../../lib/local-file-guard.cjs');

module.exports = {
  name: 'drive_download_file',
  description: 'Lädt eine Datei aus Google Drive herunter. Mit savePath wird direkt auf die Platte gestreamt (keine Größengrenze, Arbeitsspeicher bleibt klein); ohne savePath nur die Größe (in-memory).',
  inputSchema: {
    type: 'object',
    properties: {
      fileId:   { type: 'string' },
      savePath: { type: 'string' },
    },
    required: ['fileId'],
  },
  handler: async ({ fileId, savePath, _blockProtectedDrives }) => {
    if (savePath) { const g0 = checkWritablePath(savePath); if (!g0.ok) return err(g0.error); } // Sicherheitspruefung 05.11.2026: vor jedem Drive-Aufruf
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }
    const token = await getAccessToken();
    const u = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
    if (savePath) {
      const guard = checkWritablePath(savePath); // Sicherheitspruefung 05.11.2026: nie in Code-/Konfig-/Schluessel-Ordner schreiben
      if (!guard.ok) return err(guard.error);
      savePath = guard.path; // ab hier nur noch der aufgeloeste Pfad
      // Streaming (Matti 09.10.2026: 3,6-GB-Bildschirmaufnahme scheiterte am Sammeln im Speicher, Grenze 2 GB): Antwort → Datei, nie im Speicher.
      const tmp = `${savePath}.part`;
      const part = openWriteGuarded(tmp); // O_NOFOLLOW + fd-Pruefung
      let fdOpen = true; // the write stream closes the fd itself once it took over
      const discard = (done) => { if (fdOpen) { try { fs.closeSync(part.fd); } catch { /* closed */ } fdOpen = false; } fs.unlink(tmp, () => done()); };
      const bytes = await new Promise((resolve, reject) => {
        const req = https.request(
          { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
          (res) => {
            if (res.statusCode >= 300) { res.resume(); discard(() => reject(new Error(`Drive antwortet mit HTTP ${res.statusCode}`))); return; }
            let n = 0; res.on('data', (c) => { n += c.length; });
            fdOpen = false;
            pipeline(res, fs.createWriteStream(null, { fd: part.fd }), (err) => {
              if (err) { fs.unlink(tmp, () => reject(err)); return; }
              try { fs.renameSync(tmp, savePath); resolve(n); } catch (e) { fs.unlink(tmp, () => reject(e)); }
            });
          },
        );
        req.on('error', (e) => discard(() => reject(e)));
        req.end();
      });
      return ok(`Datei gespeichert: ${savePath} (${bytes} Bytes)`);
    }
    const data = await new Promise((resolve, reject) => {
      const chunks = [];
      https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        (res) => { res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks))); },
      ).on('error', reject).end();
    });
    return ok(`Datei: ${data.length} Bytes (in-memory; setze 'savePath' für Disk-Persist).`);
  },
};
