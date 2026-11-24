'use strict';
const { apiErr, gapiJSON, ok } = require('../../lib/gapi.js');
const fs = require('fs');
const { encodeEmail, encodeEmailWithAttachments } = require('../../lib/gmail-helpers.js');

module.exports = { name: 'gmail.send', description: 'Sends an email. Set html:true to render the body as text/html (otherwise plain text).', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, replyTo: { type: 'string' }, threadId: { type: 'string', description: 'Reply in this thread; In-Reply-To/References are set from its last message.' }, attachments: { type: 'array', description: 'Files to attach: [{ filename, mimeType, content (base64) | localPath }]', items: { type: 'object', properties: { filename: { type: 'string' }, mimeType: { type: 'string' }, content: { type: 'string' }, localPath: { type: 'string' } } } }, html: { type: 'boolean', description: 'If true, Content-Type is set to text/html; otherwise text/plain.' } }, required: ['to', 'subject', 'body'] },
  handler: async ({ to, subject, body, cc, bcc, replyTo, threadId, html, attachments }) => {
  const contentType = html ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  const hdrs = { To: to, Subject: subject, 'Content-Type': contentType, 'MIME-Version': '1.0' };
  if (cc) hdrs.Cc = cc;
  if (bcc) hdrs.Bcc = bcc;
  if (replyTo) hdrs['Reply-To'] = replyTo;
  if (threadId) { // threading for the recipient needs the Message-ID of the mail answered
    const th = await gapiJSON('GET', `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Message-Id`);
    const last = th.status === 200 ? (th.data.messages || []).at(-1) : null;
    const mid = (last?.payload?.headers || []).find((h) => /^message-id$/i.test(h.name))?.value;
    if (mid) { hdrs['In-Reply-To'] = mid; hdrs.References = mid; }
  }
  const files = (attachments || []).map((a) => ({ filename: a.filename || (a.localPath || '').split('/').pop(), mimeType: a.mimeType, content: a.content || (a.localPath ? fs.readFileSync(a.localPath).toString('base64') : '') }));
  if (files.some((f) => !f.content)) return apiErr('gmail.send', 400, { error: 'Anhang ohne Inhalt' });
  const raw = files.length ? encodeEmailWithAttachments({ To: hdrs.To, Subject: hdrs.Subject, ...(hdrs.Cc ? { Cc: hdrs.Cc } : {}), ...(hdrs.Bcc ? { Bcc: hdrs.Bcc } : {}), ...(hdrs['Reply-To'] ? { 'Reply-To': hdrs['Reply-To'] } : {}), ...(hdrs['In-Reply-To'] ? { 'In-Reply-To': hdrs['In-Reply-To'], References: hdrs.References } : {}) }, body, files, contentType) : encodeEmail(hdrs, body);
  const payload = { raw };
  if (threadId) payload.threadId = threadId;
  const r = await gapiJSON('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', payload);
  if (r.status !== 200) return apiErr('gmail.send', r.status, r.data);
  return ok(`E-Mail gesendet. ID: ${r.data.id}, Thread: ${r.data.threadId}`);},
};
