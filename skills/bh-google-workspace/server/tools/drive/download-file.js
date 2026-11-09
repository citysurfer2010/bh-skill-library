'use strict';
const fs    = require('fs');
const https = require('https');
const { pipeline } = require('stream');
const { getAccessToken } = require('../../lib/auth.js');
const { ok, err }        = require('../../lib/gapi.js');
const { checkWritablePath, openWriteGuarded } = require('../../lib/local-file-guard.cjs');

module.exports = {
  name: 'drive_download_file',
  description: 'Downloads a file from Google Drive. With savePath it streams directly to disk (no size limit, memory stays small); without savePath only the size (in memory).',
  inputSchema: {
    type: 'object',
    properties: {
      fileId:   { type: 'string' },
      savePath: { type: 'string' },
    },
    required: ['fileId'],
  },
  handler: async ({ fileId, savePath, _blockProtectedDrives }) => {
    if (savePath) { const g0 = checkWritablePath(savePath); if (!g0.ok) return err(g0.error); } // Security review 05.11.2026: before every Drive call
  { const { toBlockSet, refuseProtectedFile } = require('../../lib/protected-drives.js'); const _ref = await refuseProtectedFile(fileId, toBlockSet(_blockProtectedDrives)); if (_ref) return _ref; }
    const token = await getAccessToken();
    const u = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
    if (savePath) {
      const guard = checkWritablePath(savePath); // Security review 05.11.2026: never write into code/config/key folders
      if (!guard.ok) return err(guard.error);
      savePath = guard.path; // from here on only the resolved path
      // Streaming (Matti 09.10.2026: a 3.6 GB screen recording failed when buffered in memory, limit 2 GB): response → file, never in memory.
      const tmp = `${savePath}.part`;
      const part = openWriteGuarded(tmp); // O_NOFOLLOW + fd check
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
