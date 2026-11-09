'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const { encodeEmail } = require('../../lib/gmail-helpers.js');

module.exports = { name: 'gmail.createDraft', description: 'Creates an email draft. Set html:true to render the body as text/html (otherwise plain text).', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, cc: { type: 'string' }, html: { type: 'boolean', description: 'If true, Content-Type is set to text/html; otherwise text/plain.' } }, required: ['to', 'subject', 'body'] },
  handler: async ({ to, subject, body, cc, html }) => {
  const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  const hdrs = { To: to, Subject: subject, 'Content-Type': contentType, 'MIME-Version': '1.0' };
  if (cc) hdrs.Cc = cc;
  const raw = encodeEmail(hdrs, body);
  const r = await gapiJSON('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', { message: { raw } });
  if (r.status !== 200) return apiErr('gmail.createDraft', r.status, r.data);
  return ok(`Entwurf erstellt. ID: ${r.data.id}`);},
};
