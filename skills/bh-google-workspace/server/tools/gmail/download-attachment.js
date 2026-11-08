'use strict';
const { apiErr, gapiJSON, ok, err } = require('../../lib/gapi.js');
const fs = require('fs');

/**
 * gmail.downloadAttachment — lädt einen E-Mail-Anhang BINÄR-SICHER herunter.
 * Gmail liefert den Anhang als base64url-JSON ({data,size}); wir dekodieren in
 * einen Buffer und schreiben/zurückgeben die ROHEN Bytes. (Früherer Bug:
 * .toString('utf8') zerstörte PDF/XLSX/Bilder — funktionierte nur für Text.)
 * Ohne savePath kommt base64 zurück (binär-sicher), das der Aufrufer dekodiert.
 */
module.exports = {
  name: 'gmail.downloadAttachment',
  description: 'Lädt einen E-Mail-Anhang herunter (binär-sicher: PDF/XLSX/Bilder). messageId + attachmentId aus gmail.get/getThread. Mit savePath wird die Datei gespeichert, sonst kommt base64 zurück.',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message id' },
      attachmentId: { type: 'string', description: 'attachment id aus der Nachricht' },
      savePath: { type: 'string', description: 'Optionaler Speicherpfad; ohne savePath kommt base64 zurück' },
    },
    required: ['messageId', 'attachmentId'],
  },
  handler: async ({ messageId, attachmentId, savePath }) => {
    if (savePath) { // Sicherheitspruefung 05.11.2026: vor dem Gmail-Aufruf pruefen
      const g = require('../../lib/local-file-guard.cjs').checkWritablePath(savePath);
      if (!g.ok) return err(g.error);
    }
    const r = await gapiJSON('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`);
    if (r.status !== 200) return apiErr('gmail.downloadAttachment', r.status, r.data);
    if (!r.data || !r.data.data) return apiErr('gmail.downloadAttachment', r.status, r.data);
    const buf = Buffer.from(r.data.data, 'base64url'); // binär-sicher (kein toString)
    if (savePath) {
      let saved; // Sicherheitspruefung 05.11.2026: nie in Code-/Konfig-/Schluessel-Ordner schreiben
      try { saved = require('../../lib/local-file-guard.cjs').writeGuarded(savePath, buf); } catch (e) { return err(e.message); }
      return ok(JSON.stringify({ saved, bytes: buf.length }));
    }
    return ok(JSON.stringify({ bytes: buf.length, base64: buf.toString('base64') }));
  },
};
