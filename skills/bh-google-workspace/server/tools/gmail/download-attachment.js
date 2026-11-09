'use strict';
const { apiErr, gapiJSON, ok, err } = require('../../lib/gapi.js');
const fs = require('fs');

/**
 * gmail.downloadAttachment — downloads an email attachment BINARY-SAFE.
 * Gmail returns the attachment as base64url JSON ({data,size}); we decode into
 * a buffer and write/return the RAW bytes. (Earlier bug:
 * .toString('utf8') destroyed PDF/XLSX/images — it only worked for text.)
 * Without savePath base64 is returned (binary-safe), which the caller decodes.
 */
module.exports = {
  name: 'gmail.downloadAttachment',
  description: 'Downloads an email attachment (binary-safe: PDF/XLSX/images). messageId + attachmentId from gmail.get/getThread. With savePath the file is saved, otherwise base64 is returned.',
  inputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: 'Gmail message id' },
      attachmentId: { type: 'string', description: 'attachment id from the message' },
      savePath: { type: 'string', description: 'Optional save path; without savePath base64 is returned' },
    },
    required: ['messageId', 'attachmentId'],
  },
  handler: async ({ messageId, attachmentId, savePath }) => {
    if (savePath) { // Security review 05.11.2026: check before the Gmail call
      const g = require('../../lib/local-file-guard.cjs').checkWritablePath(savePath);
      if (!g.ok) return err(g.error);
    }
    const r = await gapiJSON('GET', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`);
    if (r.status !== 200) return apiErr('gmail.downloadAttachment', r.status, r.data);
    if (!r.data || !r.data.data) return apiErr('gmail.downloadAttachment', r.status, r.data);
    const buf = Buffer.from(r.data.data, 'base64url'); // binary-safe (no toString)
    if (savePath) {
      let saved; // Security review 05.11.2026: never write into code/config/key folders
      try { saved = require('../../lib/local-file-guard.cjs').writeGuarded(savePath, buf); } catch (e) { return err(e.message); }
      return ok(JSON.stringify({ saved, bytes: buf.length }));
    }
    return ok(JSON.stringify({ bytes: buf.length, base64: buf.toString('base64') }));
  },
};
